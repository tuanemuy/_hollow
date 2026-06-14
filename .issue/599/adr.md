# ADR — Issue #599: 公開ノート詳細ルートが NotFound を汎用500として描画する

## ADR-001: RSC 内 notFound はルートの notFoundComponent に届かない — 橋渡し方式の選定

### Status
Proposed

### Context

公開系ルート（`/notes/public/$noteId`・`/u/$username/$noteSlug`・`/u/$username`）は、loader が `renderPublicNoteById` などの server function を呼び、その server function が `renderServerComponent(<PublicNoteDetail .../>)` / `renderServerComponent(<UserPublicTop .../>)` を返す二段構成。各ルートは `notFoundComponent`（`<ErrorPage kind="gone"|"notFound" />`）を配線済みだが、存在しない／非公開のノート・ユーザーを開くと `notFoundComponent` ではなく汎用 `errorComponent`（`<ErrorPage kind="system" />` = 500 相当）が表示される。

ソース・実機両面で確認した根本原因（`@tanstack/react-start-rsc`、`renderServerComponent.js` / `createServerComponentFromStream.js`）:

- `renderServerComponent` は `renderToReadableStream(node)` でサーバーコンポーネントを Flight ストリームとしてレンダリングし、その戻り値（renderable proxy）を**同期 return** する。コンポーネントの async render は server function の `.handler` 本体の await 経路の**外側**で行われる。
- そのため `PublicNoteDetail` / `UserPublicTop` 内で `throw notFound()`（や `NotFoundError`）しても、`.handler` の try/catch にも `errorResponseMiddleware` の catch にも届かない。`errorResponseMiddleware` の `if (isNotFound(error)) throw error;` 分岐は発火しない。
- 投げられたエラーはストリームに取り込まれ、クライアント（または SSR デコード）側の React レンダリング中（`getTree()` → `use(promise)`）で再throwされ、近傍の React error boundary = ルートの `errorComponent` に捕捉される。さらに `AppServerError` ラップも `serialized` プロパティも持たない素のエラーのため `extractSerializedError` は `kind: "unknown"` に倒れ、`ErrorPage kind="system"`（500）になる。

この制約は `.issue/12/adr.md` ADR-004 に既に明文化され、認証系ルート（`NoteDetail.tsx` 他）の JSDoc でも参照されている。

検討した橋渡し方式:

- **(a) server function handler で RSC レンダリングの notFound を検出して `notFound()` を投げ直す。** RSC レンダリングは handler の外側で非同期に進むため、handler 戻り時点では notFound はまだ表面化していない。検出するには Flight ストリームを handler 内で消費・デコードして検査する必要があり、`renderServerComponent` の戻り値（opaque な renderable proxy）の二度読みになる。確実性・保守性が低い。
- **(b) loader が server fn の結果（renderable proxy）を受けてから notFound を判定する。** 同様に proxy は不透明で、ストリームをデコードしないと中身の notFound を判定できない。loader 段でのデコードは二重レンダリング相当で非現実的。
- **(c) `renderServerComponent` の notFound 伝播の仕組みに乗る正攻法。** 現バージョンの TanStack Start にはその仕組みが存在しない（RSC 内 throw notFound → route notFoundComponent の導線が無い）ことが ADR-004 と本調査で確定済み。
- **(d) RSC コンポーネント内で notFound を捕捉し、ルートが意図する `ErrorPage` を JSX として直接 return する。** プロジェクトで既に確立済み（ADR-004）の回避パターン。notFound JSX は throw ではなく通常の戻り値なので Suspense 境界内でも安全。公開系では返す JSX を「インライン小フラグメント」ではなく「フルページ `ErrorPage`」にするだけ。

### Decision

**(d) を採用する。** `PublicNoteDetail` / `UserPublicTop` の内側で取得処理を try/catch し、`isNotFoundError(error)` のとき `throw notFound()` をやめて、ルートが配線済みの `ErrorPage`（`PublicNoteDetail` → `kind="gone"`、`UserPublicTop` → `kind="notFound"`）をそのまま return する。

理由:

- フレームワーク制約（RSC レンダリングが middleware/handler の外側）に逆らわず、エラーが `isNotFoundError` 型ガードで確実に識別できる位置（= RSC コンポーネントの内側）でハンドルする。serialize/`kind` 復元のラウンドトリップを経由しないため `kind: "unknown"` 落ちが原理的に起きない。
- プロジェクトの既存パターン（ADR-004、認証系ルート群）と一貫し、新たな抽象や橋渡し機構を導入しない。
- `ErrorPage` は `PublicLayout` を内包するフルページコンポーネントで、正常系も `PublicLayout` で包んでいるため、notFound 時に丸ごと `ErrorPage` へ差し替えれば二重レイアウトにならず、ルートの `notFoundComponent` と同じ見た目を出せる。

ルート側の `notFoundComponent` 配線は**残す**（loader 段・`__root.tsx` グローバル経路の保険）。一次防御はコンポーネント側 `ErrorPage` 返却に置く。

### Consequences

- 良い点:
  - 存在しない／非公開ノート・ユーザーで正しく 410（gone）/ 404（notFound）画面が出る（system/500 退行の解消）。
  - 列挙耐性を維持（`getPublicNote` / `getPublicProfile` の「一律 NotFound」挙動はそのまま、存在/非公開を画面で区別しない）。
  - 既存の確立済みパターンに沿い、`errorResponseMiddleware` / シリアライズ契約に手を入れない。
- トレードオフ:
  - HTTP レスポンスは 200 のまま（画面のみ 404 系）。SEO 上の厳密な 404 ステータス付与は本方式では実現しない（ADR-004 と同じ割り切り）。要件化された場合は別アプローチ・別 Issue。
  - RSC ストリーム経由の実挙動はユニットテストで完全再現できず、検証点を「コンポーネントが throw せず正しい `ErrorPage` を return する／NotFoundError 以外は re-throw する」ことに置く（`notFound` import 削除後は `not.toHaveBeenCalled()` 検証は vacuous になるため採らない。既存 `PublicNoteDetail.test.tsx` / `NoteDetail.test.tsx` の `renderToStaticMarkup` 直呼び方式に揃える）。最終確認は手動/ブラウザ検証に依存する。

---

## ADR-002: try/catch を本体トップに置き、内側コンテンツコンポーネントへ分割しない

### Status
Accepted

### Context

`NoteDetail.tsx`（先行事例 Issue #385）は sync シェル + async `NoteDetailContent` の2段構成で、`notFound` 捕捉は内側の async セクションに置かれていた。本 Issue の `PublicNoteDetail` / `UserPublicTop` は元から単一の async server component で、シェル分割は無い。

### Decision

既存構造を保ち、取得処理（`PublicNoteDetail` は `loadPublicNote(args)`、`UserPublicTop` は `Promise.all([...])`）を `let loaded; try { loaded = await ... } catch { ... } ` で囲み、`isNotFoundError(error)` のとき `ErrorPage` を return、それ以外は re-throw する形にした。内側コンテンツコンポーネントへの分割は行わない。

理由:
- 公開系コンポーネントは元々 Suspense シェルを持たず、`renderServerComponent(<PublicNoteDetail/>)` がそのまま async render される。分割しても捕捉位置（async render 内＝`isNotFoundError` が効く範囲）は変わらず、余計な抽象だけ増える。
- `loadPublicBacklinks` / `loadRelatedPublicNotes`（`PublicNoteDetail`）は本体取得成功後にのみ走るため try/catch の外で良い（noteId 実在が保証され NotFound は基本出ない）。`UserPublicTop` は3ローダーが同一 username を引き NotFound 源が `loadProfile` のユーザー不在に集約されるため、`Promise.all` 全体を1つの try/catch でまとめる（AC-4 の論拠どおり安全）。

### Consequences

- 変更が各コンポーネント本体の冒頭数行に閉じ、正常系 JSX は無改変。
- `loaded` を `let` + 後続 destructure にしたぶん行は増えるが、捕捉対象を取得処理だけに限定でき、レンダリング中の想定外エラーを握り潰さない。

---
