# PR #768 レビュー — Security / 列挙耐性（review-002 / Round 2 再レビュー）

対象: Issue #735「公開系エラーページの HTTP ステータスが 200 のまま」
スコープ: `app/core/presentation/publicStatusBridge.ts` + その test、3 ルート（`app/routes/notes/public/$noteId.tsx`・`app/routes/u/$username/$noteSlug.tsx`・`app/routes/u/$username/index.tsx`）
レビュー観点: 列挙耐性 / 情報漏洩 / 非 NotFound 例外の握り潰し / 入力バリデーション回避
前提: Round 1（review-001-security.md）= Blocker 0 / Warning 1（W-001 TOCTOU、設計上許容済み）/ Note 6

## 再レビュー判定（要旨）

Round 1 以降、本 Issue スコープの差分に変更はない（`git diff main...HEAD` の対象 4 ファイルは review-001 と同一）。Round 1 の全指摘を再検証し、いずれも妥当であることを確認した。新たな列挙耐性・情報漏洩・例外握り潰し・バリデーション回避の問題は検出されなかった。W-001（TOCTOU 時のみ HTTP 200）の見送り判断も再確認し、妥当と判断する。

## Security

#### Blockers

- **[B-001]** なし

#### Warnings

- **[W-001]** TOCTOU 競合時のみステータスが 404 ではなく 200 になり、列挙耐性に微小な穴が開く（Round 1 W-001 を再確認・据え置き）
  - 場所: `$noteId.tsx` / `$noteSlug.tsx` / `index.tsx` の各 `.handler` 内、`ensurePublicResourceExists(...)` 通過後〜`renderServerComponent(...)` の間。
  - 内容: 前段チェックが公開と判定した直後に対象が非公開化されると、本体取得は #599 方式(d) で `ErrorPage` を return するため画面は 404/410 だが HTTP ステータスは 200 になる。「最初から非公開」は 404 なので、原理上「ちょうど今非公開化された」リソースだけステータスが異なり列挙オラクルになりうる。
  - 再評価: plan AC-5 / ADR-003・ADR-004 で「設計上の帰結・極稀」として明示的に許容済み。競合窓は read-only 単一行取得の前段と本体取得の間（ミリ秒オーダー）で、攻撃者が任意タイミングで非公開化を誘発できる立場にない（owner 自身の操作に依存）ため実害はほぼない。新規に作り込んだ穴ではなく、二重取得構造の不可避な帰結。**Round 1 の見送り判断は妥当。対応不要だが既知リスクとして引き続き記録する。** 将来フレームワークが RSC 内 notFound 伝播をサポートすれば前段チェックごと撤去でき窓も消える（ADR-001 (D) フォローアップ）。

#### Notes

- **[N-001]** 列挙耐性（ステータス）は 3 ルートとも一律化されており設計どおり（再確認）
  - `getPublicNote` / `getPublicProfile` は「存在しない」「非公開」「note 非 active」「owner deleted/suspended」をすべて `NotFoundError` に潰し、`ensurePublicResourceExists` がこれを一律 `throw notFound()`（→ 404）へ変換する。同一ルート内で存在状態によりステータス・画面が分岐しない。usecase は無改変で、列挙耐性の不変条件をステータス経路で破っていない。

- **[N-002]** NotFoundError の生メッセージ（noteId/username 等）はクライアントへ漏れない（再確認）
  - `ensurePublicResourceExists` は `throw notFound()` を**引数なし**で呼ぶ（`publicStatusBridge.ts`）。`getPublicNote`/`getPublicProfile` が積む識別子入りメッセージ（`Note not found: ${noteId}` 等）は前段で完全に捨てられ、router の `notFound()` payload には載らない。3 ルートの `notFoundComponent` は `() => <ErrorPage kind="gone" />` / `<ErrorPage kind="notFound" />` で `message` prop を渡さず（`$noteId.tsx:116`, `$noteSlug.tsx:124`, `index.tsx:186`）、`ErrorPage` は中立コピーを表示する。

- **[N-003]** 非 NotFound 例外は握り潰されず 500/system へ正しく向かう（再確認）
  - `catch` は `isNotFoundError(error)` のときのみ `throw notFound()`、それ以外は `throw error` で再送出（`publicStatusBridge.ts`）。`isNotFoundError` は `instanceof NotFoundError` の厳密判定（`errors/index.ts:57-59`）で、`ConflictError`/`SystemError`/`Unauthorized`/`Forbidden` 等は notFound に誤分類されず `errorResponseMiddleware` 経由で 500/system に倒れる。200 で握り潰される経路はない。ユニットテスト `publicStatusBridge.test.ts` が (1) 存在時 resolve・`check` が 1 回呼ばれる、(2) NotFoundError → `isNotFound(thrown) === true`、(3) 非 NotFound はそのまま re-throw、の 3 ケースを検証済み。

- **[N-004]** errorComponent の文言も中立で識別子を出さない（再確認）
  - 3 ルートの `errorComponent` は `<ErrorPage kind="system" message={sanitizeRouteError(error)} />`（`$noteId.tsx:117-118` ほか）。`sanitizeRouteError` は system kind を固定文言に倒し、middleware が事前に system/unknown を redact 済みのため、二重で生メッセージが画面に出ない。

- **[N-005]** 入力バリデーションは前段チェック追加で回避されていない（再確認）
  - `ensurePublicResourceExists` の呼び出しは `.handler` 内にあり、`inputValidator(validateInput(renderInputSchema))`（noteId/username `max(64)` / noteSlug `max(160)`）は `.handler` より**前**に走る。長さ制限を素通った生入力が usecase に渡る経路は生じない。`getPublicProfile` 前段は profile 1 本のみで存在判定が完結し（一覧・タグの 0 件は NotFound を投げない）、列挙経路を増やしていない（`index.tsx:71-73` のコメントどおり）。

- **[N-006]** ルート単位の画面差（gone/notFound）は存在状態を漏らさない（再確認）
  - 同一 URL に対し「存在する非公開ノート」と「存在しないノート」は同じ gone 画面・同じ 404 で応答する。gone/notFound の差はリソース種別（ノート/ユーザー）による固定差であり存在有無による差ではないため列挙に使えない。`ErrorPage` の gone variant が本文に `410 Gone` を表示する一方で実 HTTP ステータスは 404 だが、クローラ判定上はステータス（一律 404）が支配的で列挙耐性に無害。

- **[N-007]** `Promise.all` による動的 import 並列化はセキュリティに影響しない（Round 2 追加確認）
  - 3 ルートとも従来の単発 `import(...)` が `Promise.all([containerStore, getPublicNote/Profile, Component])` に変わったが、これは server-only ハンドラ内のモジュールロード並列化に過ぎず、入力検証順序（`inputValidator` → `.handler`）や存在チェックの位置（`renderServerComponent` の前）を変えていない。バンドル境界・実行順序に影響なし。

## 結論

Round 1 の判定（Blocker なし／TOCTOU 200 のみ既知リスクとして受容）を Round 2 で再確認し、追加の問題は検出されなかった。本変更は presentation 層の前段存在チェックに閉じ、列挙耐性・情報漏洩・例外分類のいずれもセキュリティ後退はなく、従来 200 だった「存在しない/非公開」レスポンスを 404 へ正すことでステータス経由の誤シグナルを解消している。マージ可。
