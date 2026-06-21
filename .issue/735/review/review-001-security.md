# PR #768 レビュー — Security / 列挙耐性（review-001）

対象: Issue #735「公開系エラーページの HTTP ステータスが 200 のまま」
変更コミット: `c25d2374`（PR にはブランチ由来の他コミットも含まれるが、#735 のスコープはこの 1 コミット）
レビュー観点: 列挙耐性 / 情報漏洩 / 非 NotFound 例外の扱い / 入力バリデーション

## Security

#### Blockers

なし

#### Warnings

- **[W-001]** TOCTOU 競合時のみステータスが 404 ではなく 200 になり、列挙耐性に微小な穴が開く
  - 場所: `app/routes/notes/public/$noteId.tsx:35-44` / `app/routes/u/$username/$noteSlug.tsx:36-47` / `app/routes/u/$username/index.tsx:75-92`（前段チェック → `renderServerComponent` の間）
  - 理由: 前段の `ensurePublicResourceExists` が公開と判定した直後、RSC 本体取得（`PublicNoteDetail`/`UserPublicTop` 内）までの間にリソースが非公開化されると、本体側 #599 方式(d) が `ErrorPage` を return するため画面は 404/410 だが HTTP ステータスは **200** になる。一方「最初から非公開」は 404。つまり「ちょうど今非公開化された」リソースだけステータスが他と異なり、原理上は列挙のオラクルになりうる。
  - 評価: これは plan AC-5 / ADR-003・ADR-004 で「設計上の帰結・極稀」として**意図的に許容済み**であり、二重防御を温存する根拠も明文化されている。競合窓は read-only な単一行取得の前段と本体取得の間（ミリ秒オーダー）で、攻撃者が任意タイミングで非公開化を起こせる立場にない（owner 自身の操作に依存）ため実害はほぼない。よって Blocker ではなく Warning として記録するに留める。新規に作り込んだ穴ではなく、二重取得構造の不可避な帰結。**対応不要だが既知リスクとして残す。**
  - 提案: 受容で問題ない。将来フレームワークが RSC 内 notFound 伝播をサポートしたら前段チェック自体を撤去でき、この窓も消える（ADR-001 (D) フォローアップ）。

#### Notes

- **[N-001]** 列挙耐性（ステータス）は 3 ルートとも一律化されており設計どおり
  - `getPublicNote`（`getPublicNote.ts:48-154`）と `getPublicProfile`（`getPublicProfile.ts:26-48`）は「存在しない」「非公開」「note 非 active」「owner deleted/suspended」をすべて `NotFoundError` に潰しており、`ensurePublicResourceExists`（`publicStatusBridge.ts:34-43`）はこれを一律 `throw notFound()`（→ 404）へ変換する。同一ルート内で存在状態によりステータス・画面が分岐しないことを確認。usecase は無改変で、列挙耐性の不変条件をステータス経路で破っていない。

- **[N-002]** NotFoundError の生メッセージ（noteId/username 等）はクライアントへ漏れない
  - `ensurePublicResourceExists` は `throw notFound()` を**引数なし**で呼んでおり（`publicStatusBridge.ts:40`）、`getPublicNote` が積む `Note not found: ${input.noteId}` 等の識別子入りメッセージ（`getPublicNote.ts:65,86,94` ほか / `getPublicProfile.ts:35,38`）は前段で完全に捨てられる。router の `notFound()` payload には noteId/username が一切載らない。ルートの `notFoundComponent` は `() => <ErrorPage kind="gone" />` / `<ErrorPage kind="notFound" />`（`$noteId.tsx:113`, `$noteSlug.tsx:121`, `index.tsx:186`）で `message` prop を渡さず、`ErrorPage` は中立コピー（`ErrorPage.tsx:54-82,95`）を表示する。`.issue/12/adr.md` ADR-004/ADR-005 の生メッセージ露出懸念は再発していない。

- **[N-003]** 非 NotFound 例外は握り潰されず 500/system へ正しく向かう
  - `ensurePublicResourceExists` の `catch` は `isNotFoundError` 以外を `throw error`（`publicStatusBridge.ts:41`）でそのまま再送出。これは server fn の `errorResponseMiddleware`（`errorResponseMiddleware.ts:28-48`）に捕捉され、`isRedirect || isNotFound` でない DB エラー等は `serializeError` → system/unknown は `redactForClient` で中立化 → `setResponseStatus(500)` → `AppServerError` 再throw となる。DB エラーが誤って notFound に分類されることも、200 で握り潰されることもない。ユニットテスト `publicStatusBridge.test.ts:27-34` が「非 NotFound はそのまま re-throw」を検証済み。

- **[N-004]** errorComponent の文言も中立で識別子を出さない
  - 3 ルートの `errorComponent` は `<ErrorPage kind="system" message={sanitizeRouteError(error)} />`（`$noteId.tsx:114-116` ほか）。`sanitizeRouteError`（`errorDisplay.ts:257-264`）は `renderErrorMessage(extractSerializedError(error))` を返し、system kind は固定文言「システムエラーが発生しました」（`errorDisplay.ts:228-229`）になる。クライアント到達前に middleware が system/unknown を `redactForClient` 済みのため、二重で生メッセージが画面に出ない。なお `console.error` は本番ではメッセージ本体を出さず（`errorDisplay.ts:258-262`）DEV のみ詳細を出す配慮も妥当。

- **[N-005]** 入力バリデーションは前段チェック追加で回避されていない
  - `ensurePublicResourceExists` の呼び出しは `.handler` 内（`$noteId.tsx:35`, `$noteSlug.tsx:36`, `index.tsx:75`）にあり、`inputValidator(validateInput(renderInputSchema))`（noteId `max(64)` / username `max(64)` / noteSlug `max(160)`）は `.handler` より**前**に走る。よって長さ制限を素通りした生入力が usecase に渡る経路は生じない。`getPublicProfile` 前段は profile 1 本のみで存在判定が完結し（一覧・タグの 0 件は NotFound を投げない）、列挙経路を増やしていない（`index.tsx:71-81` のコメントどおり）。

- **[N-006]** ノート 404（gone 画面）/ ユーザー 404（notFound 画面）の画面差はルート単位の固定差であり、存在状態を漏らさない
  - 同一 URL に対して「存在する非公開ノート」と「存在しないノート」は同じ gone 画面・同じ 404 ステータスで応答する。画面文言がノート系（gone/410 表記）とユーザー系（notFound/404 表記）で異なるのは #599 既存の設計判断で、リソース種別による差であって存在有無による差ではないため列挙には使えない。`ErrorPage` の `gone` variant は本文に `Error code: 410 Gone` を表示するが、これは画面コピーのみで実 HTTP ステータスは 404（plan ADR-004 で確認済み）。HTTP ステータスとボディ文言コードに乖離がある点はクローラ判定上はステータス（404）が支配的であり、列挙耐性の観点では無害（ステータスは一律 404）。

## 結論

本変更は presentation 層の前段存在チェックに閉じ、列挙耐性・情報漏洩・例外分類のいずれもセキュリティ後退はない。むしろ従来 200 だった「存在しない/非公開」レスポンスを 404 へ正すことで、ステータス経由の「正常ページ扱い」を解消している（クローラへの誤シグナル除去）。Blocker なし。唯一の穴は設計上明示的に受容済みの TOCTOU 200（W-001）で、実害はほぼなく対応不要。
