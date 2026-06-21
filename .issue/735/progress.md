# 進捗 — Issue #735: 公開系エラーページの HTTP ステータス

## 完了

公開系3ルート（`/notes/public/$noteId`・`/u/$username/$noteSlug`・`/u/$username`）で、存在しない／非公開のノート・ユーザーへ直アクセスしたとき、初回 SSR ドキュメントの HTTP ステータスを **404** で返すようにした（従来は 200）。

- 新規ヘルパー `app/core/presentation/publicStatusBridge.ts` の `ensurePublicResourceExists(check)`: `check()` を実行し `isNotFoundError` なら `throw notFound()`、それ以外は re-throw。
- 3ルートの render server function ハンドラで `renderServerComponent` の前に存在チェックを実行。
- ユニットテスト `app/core/presentation/__tests__/publicStatusBridge.test.ts`（3件パス）。
- 手動検証（dev `pnpm dev` + 本番相当 `pnpm build && pnpm start` の両ランタイムで curl・全 PASS）: 存在しないノート byId/bySlug・存在しないユーザー → 404、正常系 → 200。

詳細は `adr.md`（ADR-004）/ `plan.md`（実装メモ）参照。

## 残存課題 — ノートの HTTP 410 は現フレームワークで実現不可

### 内容

Issue の当初要件は「ノートは 410（Gone）、ユーザーは 404（NotFound）」だったが、ノートも **404 で実装し、410 は見送った**。

### 理由

SSR ドキュメントの HTTP ステータスは TanStack Router が完全制御している。

- `@tanstack/router-core` 1.171.13 の `router.js` の `load()` が、ドキュメントステータスを `redirect.status / 404(notFound) / 500(error) / 200(success)` のいずれかに決定し、`renderRouterToStream.js` が `new Response(stream, { status: router.stores.statusCode.get() })` で返す。任意値を割り込ませる経路が router に無い。
- `setResponseStatus`（`@tanstack/react-start/server`）は h3 event の `res.status` を立てるだけで、SSR ドキュメントのステータスには一切マージされない（実測: loader/ハンドラで `setResponseStatus(410)` を呼んでもドキュメントは 200 のまま、または router に上書きされる）。
- `throw notFound()`（`@tanstack/react-router` 1.170.15）は確実にドキュメントを 404 にできるが、**404 固定**でカスタム 410 を出す手段が現バージョンの router に存在しない。

よって、SSR ドキュメントに任意のステータス（410）を設定する手段が現バージョンの TanStack Router には無く、達成可能な非200ステータスは 404 のみ。

### 影響範囲

- 「非公開／存在しないノート」は 410 ではなく 404 を返す。Gone（かつて存在したが今は無い）の語義は失われるが、クローラ/SEO に対して「正常なページではない（非200）」ことは 404 で伝えられるため、Issue の主眼（200 のままにしない）は満たしている。
- 列挙耐性は維持（ノート・ユーザーとも一律 404 で存在有無を区別しない）。
- 画面は #599 のまま（gone/notFound の `ErrorPage`）。

### フォローアップ（将来）

将来 TanStack Start / Router が「RSC 内 notFound の伝播」や「任意ドキュメントステータスの設定」をサポートした場合、`ensurePublicResourceExists` を拡張してノートに 410 を出せる（ADR-001 (D) / ADR-004 のフォローアップ）。現時点ではフレームワーク側のサポート待ちであり、いつ可能になるかは未定。
