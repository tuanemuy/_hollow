# 実装計画 — Issue #599: 公開ノート詳細ルートが NotFound を汎用500として描画する（RSC 内 notFound が notFoundComponent に届かない）

**Issue:** #599
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

公開系ルートで、存在しない／非公開のノート・ユーザーを開いたときに「予期しないエラー（system / 500）」ではなく適切な 404 系エラーページ（`ErrorPage kind="gone"` / `kind="notFound"`）を表示する。原因は RSC（`renderServerComponent` 経由のサーバーコンポーネント）内で `throw notFound()` した notFound シグナルが TanStack Router の `notFoundComponent` に伝播しないこと。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `/notes/public/$noteId` に存在しない／非公開の noteId を開くと `ErrorPage kind="gone"`（410「このノートは公開されていません」）相当の画面が表示される（system/500 ではない） | Issue 本文 | 1, 4 |
| AC-2 | `/u/$username/$noteSlug` に存在しない／非公開のノートを開くと `ErrorPage kind="gone"` 相当の画面が表示される（同一 `PublicNoteDetail` 経由のため同根本原因） | 調査で判明（本文「同パターンの他ルート」） | 1, 4 |
| AC-3 | `/u/$username` に存在しないユーザーを開くと `ErrorPage kind="notFound"`（404）相当の画面が表示される（system/500 ではない） | オーナーコメント（波及確認・両ルートまとめ対応に合意） | 2, 4 |
| AC-4 | 存在・非公開の区別が画面・挙動から漏れない（列挙耐性を維持）。`getPublicNote` / `getPublicProfile` が一律 `NotFoundError` に潰している現状の振る舞いを変えない。**実在ユーザーでノート0件のときは誤って404にならない**（`listUserPublicNotes` / `listUserPublicTags` はユーザー実在時に `NotFoundError` を投げず空リストを返すため、`UserPublicTop` の `Promise.all` 全体まとめ try/catch は安全。下記「あるべきアーキテクチャ」参照） | Issue 本文（「存在・内容の露出は無く」） | 1, 2 |
| AC-5 | 正常系（公開ノート・実在ユーザー）の表示・`head`（meta / JSON-LD）が回帰しない | 既存挙動の維持 | 1, 2 |
| AC-6 | NotFoundError 捕捉時にコンポーネントが throw せず正しい `ErrorPage`（`gone` / `notFound`）を return することを検証する回帰テストが存在する（または手動検証手順が文書化されている）。RSC ストリーム経由の実挙動はユニットでは再現困難なため、検証点は「return 値」に置く | やること6 / テスト方針 | 5 |

## スコープ

### 含まれないもの

- **HTTP ステータスコードを 404 にすること自体は本 Issue の主目的にしない。** Issue は「表示が 404 でなく 500 になる UX 退行」に問題を限定しており、採用方式（RSC 内で notFound 用 JSX を直接返す）では HTTP レスポンスは 200 のまま画面だけ 404 系になる。これは既存の認証系ルート（`_app/notes/$noteId` 等、ADR-004 で確立済み）と同一の割り切りで、プロジェクトの確立済み方針に沿う。SEO 上の厳密な 404 ステータス付与は別 Issue 相当（「未解決事項」参照）。
- `getPublicNote` / `getPublicProfile` などユースケース・ドメイン層の変更（NotFound を一律に潰す現挙動は列挙耐性のため意図的に維持する）。
- `errorResponseMiddleware` / `errorResponse.ts` / `sanitizeRouteError` のロジック変更（RSC 内エラーはそもそもこの経路を通らないため、ここを触っても直らない。挙動は調査で確認済み）。
- 認証系ルート（`_app/...`）の表示文言の変更。これらは既に同根本原因を回避済みで、本 Issue のスコープ外。

## 調査結果

### 根本原因（実機・ソース両面で確定）

`renderServerComponent(<Component />)`（`@tanstack/react-start-rsc`）の挙動：

- `renderServerComponent` は `renderToReadableStream(node)` で**サーバーコンポーネントを Flight ストリームとしてレンダリングする**。`PublicNoteDetail` / `UserPublicTop` の async render は、server function の `.handler` 本体の await 経路の**外側**（Flight ストリームのレンダリング中）で実行される。
- したがって、コンポーネント内で `throw notFound()`（や `NotFoundError`）を投げても、`createServerFn(...).handler` の try/catch にも `errorResponseMiddleware` の catch にも届かない。`errorResponseMiddleware` の `if (isNotFound(error)) throw error;`（notFound 再throw 分岐）は**そもそも発火しない**。
- 投げられた notFound はストリームに取り込まれ、クライアント側（`createServerComponentFromStream` の `getTree()` → `use(promise)`）で**React のレンダリング中に再throw**される。これは TanStack Router の notFound シグナル経路ではなく、近傍の React error boundary = ルートの `errorComponent` に捕捉される。
- 加えて、クライアントに届く時点でこのエラーは `AppServerError` ラップも `serialized` プロパティも持たない素のエラーで、`extractSerializedError` は `kind: "unknown"` に倒れ、`ErrorPage kind="system"`（500 相当）として描画される。

この分析は `.issue/12/adr.md` ADR-004 に既に明文化されており、`app/components/note/detail/NoteDetail.tsx` / `app/components/note/history/{NoteHistoryList,NoteRevisionDetail}.tsx` の JSDoc でも「RSC 経由 notFound() は notFoundComponent に届かない既知制約」として参照されている。

### 確立済みの回避パターン（プロジェクトの「あるべき」挙動）

認証系の同種ルートでは既に解決済み：**RSC コンポーネントの内側（`instanceof`/`isNotFoundError` チェックが効く範囲）で notFound を捕捉し、`throw notFound()` ではなく notFound 用の JSX を通常の戻り値として返す。** notFound JSX は throw ではないので Suspense 境界の中でも安全（ADR-004）。

- 例: `NoteDetail.tsx` は `isNotFoundError(e)` のとき `<div role="alert">…</div>` を return。

本 Issue の公開ルートは、認証系の「インライン小フラグメント」と異なり、**ルートが本来出したかったフルページの `ErrorPage`（gone / notFound）を出す**のが要件。よって同パターンを「return する JSX を `<ErrorPage kind="gone|notFound" />` にする」形で適用するのが最も自然。

### 関連ファイル

- `app/routes/notes/public/$noteId.tsx` — 修正対象ルート（byId）。`notFoundComponent: () => <ErrorPage kind="gone" />` を配線済みだが届いていない。
- `app/routes/u/$username/$noteSlug.tsx` — **同根本原因の追加波及先**（bySlug、同じ `PublicNoteDetail` を使う）。`notFoundComponent: () => <ErrorPage kind="gone" />` 配線済み。Issue 本文・コメントには明記されていないが調査で判明。
- `app/routes/u/$username/index.tsx` — 同根本原因（`UserPublicTop`）。`notFoundComponent: () => <ErrorPage kind="notFound" />` 配線済み。
- `app/components/public/PublicNoteDetail.tsx` — `loadPublicNote` の catch で `throw notFound()`（42行目）。byId / bySlug 両方の入口。
- `app/components/public/UserPublicTop.tsx` — `loadProfile` / `loadNotes` / `loadPublicTags` の catch で `throw notFound()`（46, 75, 96行目）。
- `app/components/public/ErrorPage.tsx` — `kind` = `notFound`(404) / `forbidden`(403) / `gone`(410) / `system`(500)。`PublicLayout` でフルページ描画。
- `app/core/presentation/errorResponseMiddleware.ts` — `isNotFound` 再throw を持つが RSC 内 throw は通らない（確認済み・変更不要）。
- `app/core/presentation/errorResponse.ts` / `errorDisplay.ts` — シリアライズ／表示。RSC 内エラーには関与しない（変更不要）。
- `app/core/presentation/publicNoteMeta.ts` — `head` 用メタ取得。既に `isNotFoundError` を catch して `null` を返し、`head` 側は `.catch(() => null)` でフォールバック済み（notFound 時も head は壊れない）。本修正と独立して既に正しい。
- `.issue/12/adr.md` ADR-004 — 根本原因と確立済み回避パターンの一次情報源。

### あるべきアーキテクチャ

- これは presentation / RSC 境界の問題。ドメイン・ユースケースは正しく `NotFoundError` を投げており変更不要。
- TanStack Start の現バージョンでは「RSC 内 throw notFound → route の notFoundComponent」という導線が成立しない、という**フレームワーク制約**が既に判明・文書化済み。これに逆らわず、確立済みパターン（RSC 内で捕捉して notFound 用 JSX を返す）に沿わせるのが正。
- エラー表示は `kind`-tagged の serialized error 契約を尊重するが、本件は RSC 内で `isNotFoundError`（型ガード）が効く範囲で扱うため serialize を経由せず、確実に分岐できる。
- **`UserPublicTop` の `Promise.all` 全体まとめ try/catch が安全な論拠（AC-4）:** ソース確認の結果、`getPublicProfile` / `listUserPublicNotes` / `listUserPublicTags` の3ユースケースはいずれも冒頭で `userRepository.findByUsername` → `null` / `status === "deleted"` / `status === "suspended"` のときだけ `NotFoundError` を投げる構造で一致している（`getPublicProfile.ts`:34-38、`listUserPublicNotes.ts`:102-111、`listUserPublicTags.ts`:34-38）。実在ユーザーでノート0件のとき `listUserPublicNotes` は `{ notes: [], total: 0 }`、`listUserPublicTags` は `{ tagNames: [] }` を返し `NotFoundError` を投げない。したがって `Promise.all([loadProfile, loadNotes, loadPublicTags])` をまとめて try/catch しても **NotFound 源はユーザー不在（または deleted/suspended）のみ**で、0件ユーザーが誤って notFound 画面になることはない。

### 既存実装の状態

- ルート3本（`notes/public/$noteId`・`u/$username/$noteSlug`・`u/$username`）は `notFoundComponent` を正しく配線済みだが、RSC 内 notFound が届かず機能していない。
- `PublicNoteDetail` / `UserPublicTop` は `throw notFound()` を使っており、これが汎用 errorComponent（system/500）落ちの原因。
- 認証系ルートは既に回避済み。公開系だけが未対応。

### 依存関係

- `PublicNoteDetail` は `notes/public/$noteId`（byId）と `u/$username/$noteSlug`（bySlug）の**両方**から使われる。`PublicNoteDetail` を直すと両ルートが同時に直る。
- `UserPublicTop` は `u/$username` 専用。

## 設計

### ドメインモデルへの影響

なし。`getPublicNote` / `getPublicProfile` / `listUserPublicNotes` / `listUserPublicTags` の `NotFoundError` 投出は正しく、列挙耐性のため一律 NotFound に潰す挙動も維持する。

### ユースケース / アプリケーションロジック

なし。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

修正の中心。`renderServerComponent` 経由でレンダリングされる public RSC コンポーネントの内側で notFound を捕捉し、`throw notFound()` をやめて**ルートが意図する `ErrorPage` をそのまま return** する。

- `PublicNoteDetail`（gone）と `UserPublicTop`（notFound）で出す `ErrorPage` の `kind` が異なる（既存の `notFoundComponent` 配線に合わせる）ので、コンポーネント側で固定する。
  - `PublicNoteDetail` → `<ErrorPage kind="gone" />`（byId / bySlug ともルートの `notFoundComponent` が gone のため一致）
  - `UserPublicTop` → `<ErrorPage kind="notFound" />`（ルートの `notFoundComponent` が notFound のため一致）
- `ErrorPage` は `PublicLayout` を内包するフルページコンポーネント。`PublicNoteDetail` / `UserPublicTop` の正常系も `PublicLayout` で包んでいるため、notFound 時に `ErrorPage` を return しても二重レイアウトにはならない（`ErrorPage` 自身が `PublicLayout` を持つので、正常系の `PublicLayout` の代わりに丸ごと差し替わる）。

注: ルート側の `notFoundComponent` 配線は**残す**。`__root.tsx` のグローバル notFound 経路や将来 loader 段で notFound を投げ得るケース（メタ取得側など）への保険として有効であり、外す積極的理由がない。コンポーネント側で `ErrorPage` を返すことが一次の防御線になる。

## 実装ステップ

### 1. `PublicNoteDetail` の notFound を `ErrorPage kind="gone"` 返却に変更

- **対象ファイル:** `app/components/public/PublicNoteDetail.tsx`
- **変更内容:**
  - `loadPublicNote` の catch で `isNotFoundError(error)` のとき `throw notFound()` していた箇所をやめる。代わりに、`PublicNoteDetail` 本体（async コンポーネント）で `loadPublicNote(args)` を try/catch し、`isNotFoundError(error)` のとき `<ErrorPage kind="gone" />` を return する。`loadPublicNote` の cache ラッパーは「`getPublicNote` の結果をそのまま返す（NotFoundError はそのまま投げる）」形に戻す（`notFound()` 変換を除去）。
  - `notFound`（`@tanstack/react-router`）の import を削除。`ErrorPage` を import。
  - `loadPublicBacklinks` / `loadRelatedPublicNotes` は本体取得（`loadPublicNote`）成功後にのみ実行されるため、これらの notFound は基本発生しない（noteId は実在）。現状どおりでよい。
  - WHY コメントを 1 行付す（「RSC 内 notFound() は notFoundComponent に届かないため、ルート意図の ErrorPage を直接返す。ADR-004 / Issue #599」）。
- **理由:** byId（`/notes/public/$noteId`）と bySlug（`/u/$username/$noteSlug`）の両入口を同時に修正でき、AC-1 / AC-2 を満たす。

### 2. `UserPublicTop` の notFound を `ErrorPage kind="notFound"` 返却に変更

- **対象ファイル:** `app/components/public/UserPublicTop.tsx`
- **変更内容:**
  - `loadProfile` / `loadNotes` / `loadPublicTags` の各 catch で `throw notFound()` していた箇所をやめ、`NotFoundError` はそのまま投げる形に戻す。
  - `UserPublicTop` 本体の `Promise.all([...])` を try/catch し、`isNotFoundError(error)` のとき `<ErrorPage kind="notFound" />` を return する。`Promise.all` 内のいずれか（実質 `loadProfile` のユーザー不在）が NotFound を投げたケースを一括で受ける。
  - `notFound` の import を削除、`ErrorPage` を import。
  - WHY コメントを 1 行付す（同上）。
- **理由:** `/u/$username` の system/500 落ちを解消し、AC-3 を満たす。ユーザー不在は `loadProfile` 由来だが、`loadNotes` / `loadPublicTags` も同じ username を引くため、まとめて try/catch で受けるのが堅実。

### 3. ルート側 `notFoundComponent` 配線の確認（変更なし方針の明文化）

- **対象ファイル:** `app/routes/notes/public/$noteId.tsx`, `app/routes/u/$username/$noteSlug.tsx`, `app/routes/u/$username/index.tsx`
- **変更内容:** いずれも変更しない。`notFoundComponent` / `errorComponent` 配線はそのまま残す（loader 段・グローバル経路の保険）。`head` 側のメタ取得は既に `.catch(() => null)` でフォールバック済みのため変更不要であることを確認するのみ。
- **理由:** 一次防御はコンポーネント側 `ErrorPage` 返却に移すが、ルート配線は無害かつ将来の保険として有効。

### 4. typecheck / lint / format

- **対象:** 全変更ファイル
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。未使用 import（`notFound`）の除去漏れ・型エラーがないことを確認。
- **理由:** CLAUDE.md の必須後処理。

### 5. 回帰テストの追加

テスト方式・モックポイントは**実ファイルを確認した事実**に基づく（推測でなく既存構成に揃える）:

- `app/components/public/__tests__/PublicNoteDetail.test.tsx` は**既存ファイル**（backlink / related セクションの3ケースを持つ）。テスト方式は **node 環境 + `renderToStaticMarkup(await PublicNoteDetail(props))`**（async server component を直接呼んで文字列描画を検査）。モックは `@/core/presentation/serverAction` の **`serverData` 自体を `vi.mock`** して、返り値関数が引数の形（`LookupArgs` / `noteId` 文字列 / `{ ownerId, … }`）で分岐してデータを返す構成。**`getPublicNote` モジュールを直接モックしてはいない**。`@tanstack/react-router` モックは現状 `notFound: () => new Error("notFound")` を返す（`vi.fn()` ではない）。
- `app/components/public/__tests__/UserPublicTop.test.tsx` は**未存在（新規作成）**。
- 確立済み参照パターンは `app/components/note/detail/__tests__/NoteDetail.test.tsx`（Issue #385 で同根本原因に対応した先行事例）。`renderToStaticMarkup(await NoteDetailContent(props))` 直呼びで、(1) NotFound 時に notFound JSX が描画される、(2) NotFoundError 以外は `rejects.toThrow` で**そのまま re-throw される**、の2点を検証している。

**対象ファイル:** `app/components/public/__tests__/PublicNoteDetail.test.tsx`（**既存への追記**）, `app/components/public/__tests__/UserPublicTop.test.tsx`（**新規**）。

**`PublicNoteDetail.test.tsx`（既存への追記）:**

- 既存の `serverData` モックを、**`getPublicNote` 相当の呼び出し（引数が `LookupArgs` = `kind` を持つオブジェクト）のとき `NotFoundError` を reject する**よう分岐させる（backlink / related の他分岐は既存どおりデータを返す。テストケースごとに切り替えられるようフラグ化する）。方式(d)採用後は `loadPublicNote` の cache ラッパーが「`getPublicNote` の結果をそのまま返す／`NotFoundError` はそのまま throw」に戻るため（ステップ1）、この reject は `PublicNoteDetail` 本体の try/catch に届く。
  - **検証点1（NotFound → ErrorPage gone）:** `renderToStaticMarkup(await PublicNoteDetail({ args: { kind: "byId", noteId } }))` の出力 HTML に「このノートは公開されていません」「Error code: 410 Gone」が含まれること。`await PublicNoteDetail(...)` が reject せず（= throw しない）正常に解決することを assert。
  - **検証点2（非 NotFound は re-throw）:** `serverData` の `getPublicNote` 分岐が素の `new Error("boom")` を reject するケースで、`await expect(PublicNoteDetail({ args: { kind: "byId", noteId } })).rejects.toThrow("boom")`。NotFoundError 以外を握り潰さず system/500 に落とすこと（列挙耐性・既存挙動維持）を固定する（`NoteDetail.test.tsx` の (2) に倣う）。
  - **既存3ケース（正常系本文・backlink・related）は変更せず温存**（AC-5 の正常系本文描画の回帰カバレッジを壊さない）。
  - `not.toHaveBeenCalled()` ベースの検証は**入れない**。方式(d)では `PublicNoteDetail` から `notFound` の import を削除する（ステップ1）ため、「notFound が呼ばれない」assert は常に真で何も保証しない（vacuous）。検証は上記「throw せず ErrorPage を return する／非 NotFound は re-throw する」に置く。

**`UserPublicTop.test.tsx`（新規）:**

- `NoteDetail.test.tsx` / 既存 `PublicNoteDetail.test.tsx` に倣い **`renderToStaticMarkup(await UserPublicTop(props))` 直呼び方式**で書く（happy-dom + `createRoot` は使わない）。モックは既存 `PublicNoteDetail.test.tsx` と同様 `serverData` を `vi.mock` し、`loadProfile`（`username` 文字列）/ `loadNotes`（`{ username, page, … }`）/ `loadPublicTags`（`username` 文字列）の各呼び出しを引数の形で分岐させる。`PublicLayout` 等の重い依存は同様にスタブ化。
  - **検証点1（NotFound → ErrorPage notFound）:** `loadProfile` 相当（ユーザー不在）が `NotFoundError` を reject するケースで、出力 HTML に「ページが見つかりません」「Error code: 404 Not Found」が含まれ、`await UserPublicTop(...)` が reject しないこと。
  - **検証点2（非 NotFound は re-throw）:** `loadProfile`（または `loadNotes`）が素の `new Error("boom")` を reject するケースで `rejects.toThrow("boom")`。`Promise.all` 全体まとめ try/catch が NotFoundError 以外を再 throw すること（S-001 / 列挙耐性）を固定する。
  - **検証点3（任意・実在ユーザー0件で誤404にならない）:** `loadProfile` が解決し `loadNotes` が `{ notes: [], total: 0 }`・`loadPublicTags` が `{ tagNames: [] }` を返すケースで、`ErrorPage` 文言（「ページが見つかりません」）が**含まれない**こと（AC-4 の論拠の実証）。

- **理由:** AC-6。検証点を「コンポーネントが throw せず正しい `ErrorPage`（gone / notFound）を return し、NotFoundError 以外は re-throw する」ことに置く（RSC ストリーム経由の挙動はユニットでは再現困難なため return 値で担保。最終確認は手動検証）。

### 6. 手動検証（任意・PR 前）

- **内容:** `pnpm dev` で以下を確認。
  - `/notes/public/01956000-0000-7000-8000-00000000ffff`（存在しない id）→ 410「このノートは公開されていません」。
  - 非公開ノートの id でも同様に 410。
  - `/u/nonexistent-user-xyz` → 404「ページが見つかりません」。
  - `/u/<実在ユーザー>/<存在しない slug>` → 410。
  - 正常系（実在の公開ノート・実在ユーザー）が回帰していない。
- **理由:** RSC ストリーム経由の実挙動は実機が最終確認。`.issue/556/manual-test/report.md` TC-002 / `.issue/619/manual-test/report.md` EDGE-3 の再検証に相当。

## 設計判断

橋渡し方式として「(a) server fn handler で notFound を検出して投げ直す」「(b) loader が結果を見て判定」「(c) RSC の notFound 伝播の正攻法」の3案を検討したが、いずれも**RSC レンダリングが middleware/handler の外側で行われる**というフレームワーク制約により成立しないか、確実性に欠ける（詳細は adr.md ADR-001）。

採用方式は **(d) RSC コンポーネント内で notFound を捕捉し、ルートが意図する `ErrorPage` を JSX として直接 return する**。これはプロジェクトで既に確立済みの回避パターン（ADR-004、認証系ルート群）の自然な拡張で、公開系では「インライン小フラグメント」ではなく「フルページ `ErrorPage`」を返す点だけが異なる。

## リスクと注意点

- HTTP ステータスは 200 のまま（画面のみ 404 系）。SEO 厳密性が必要なら別 Issue。本 Issue のスコープ・既存方針（ADR-004）とは整合。
- `ErrorPage` が `PublicLayout` を内包するため、二重 `PublicLayout` にならないよう「正常系の `PublicLayout` を返す代わりに `ErrorPage` を return」する（部分的に差し込まない）。
- `UserPublicTop` の `Promise.all` で `loadProfile` 以外（`loadNotes` / `loadPublicTags`）も notFound を投げ得るため、個別 catch ではなく `Promise.all` 全体を try/catch して取りこぼさない。
- 既存の `notFoundComponent` 配線を残すことで、万一 loader 段で notFound が出ても正しいページに落ちる（後退しない）。
- ユニットテストは RSC ストリーム挙動そのものは再現できない。検証点を「コンポーネントが throw せず正しい ErrorPage を返す／NotFoundError 以外は re-throw する」に置く割り切りを明記する（最終確認は手動検証）。`notFound` の `not.toHaveBeenCalled()` 検証は方式(d)で import を削除するため vacuous になり採らない。

## テスト方針

- **ユニット（node 環境 + `renderToStaticMarkup` 直呼び。既存 `PublicNoteDetail.test.tsx` / `NoteDetail.test.tsx` パターン踏襲。`ErrorPage.test.tsx` の createRoot 系には倣わない）:**
  - `PublicNoteDetail`（既存ファイルへ追記）: NotFound 時に `ErrorPage kind="gone"`（「このノートは公開されていません」/「Error code: 410 Gone」）を return し throw しない／非 NotFoundError は `rejects.toThrow` で re-throw される／既存3ケース（正常系本文・backlink・related）を温存。モックは `serverData` を `vi.mock`（`getPublicNote` モジュール直接モックではない）。
  - `UserPublicTop`（新規）: NotFound 時に `ErrorPage kind="notFound"`（「ページが見つかりません」/「Error code: 404 Not Found」）を return し throw しない／非 NotFoundError は re-throw／実在ユーザー0件で誤って notFound 画面にならない。`renderToStaticMarkup` 直呼び・`serverData` モック分岐方式。
  - **`not.toHaveBeenCalled()` ベースの検証は採らない**（方式(d)で `notFound` import を削除するため vacuous）。
- **既存テストの非回帰:** `ErrorPage.test.tsx` は変更不要（`ErrorPage` 自体は無変更）。`PublicNoteDetail.test.tsx` の既存3ケースは温存。
- **手動/ブラウザ検証:** 上記ステップ6の URL で system/500 落ちが解消し 404/410 が出ること、正常系が回帰しないことを確認。
- コマンド: `pnpm test:unit`（追記・新規テスト）、必要に応じ `pnpm test`。

## 未解決事項

- **[P-NONE]** 厳密な HTTP 404 ステータス付与は本方式では実現しない（200 + 404系画面）。これは ADR-004 で確立済みの割り切りに沿うが、SEO/クローラ向けに正しいステータスが要件化された場合は、`renderServerComponent` の戻り値を loader 段で notFound 判定して `setResponseStatus`/`notFound()` を投げ直す別アプローチが必要になり、別 Issue 相当。本 Issue の受け入れ基準（表示の UX 退行解消）には影響しない。

## レビュー履歴

- **1周目（2026-06-14）:** coverage（要件カバレッジ・スコープ整合性）/ arch-risk（アーキテクチャ整合性・実現可能性・リスク）の両視点でレビュー。テスト方針（ステップ5）の事実誤認を中心に計6指摘を反映:
  - [両者 P] `PublicNoteDetail.test.tsx` は新規でなく**既存**。テスト方式は happy-dom + createRoot ではなく **node + `renderToStaticMarkup` 直呼び**。モックポイントは `getPublicNote` モジュールではなく **`serverData`**（実ファイルを読んで確認し、ステップ5を実態に書き直し）。
  - [arch P-003 / coverage P-001] `notFound` の `not.toHaveBeenCalled()` 検証は方式(d)で import 削除のため vacuous。検証点を「throw せず正しい `ErrorPage`（gone「このノートは公開されていません」/410、notFound「ページが見つかりません」/404）を return する」に置換。
  - [arch S-001] NotFoundError 以外は re-throw されることを固定するテストケースをステップ5に明記。
  - [arch S-002] `UserPublicTop.test.tsx`（新規）も `renderToStaticMarkup` 直呼び方式に統一。
  - [coverage S-001] AC-4 に「実在ユーザー0件で誤404にならない」論拠を明記（usecase 3者のユーザー存在チェック一致をソースで裏取り）。
  - [coverage S-002] AC-6 文言を方式(d)の実態（「届く」→「throw せず正しい ErrorPage を return する」）に整合。
  - 実装本体の設計（ステップ1〜4の方式(d)）への指摘はなく変更なし。両視点とも実装設計は妥当と評価。
