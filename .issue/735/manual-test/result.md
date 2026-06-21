# 手動検証結果 — Issue #735

**検証日:** 2026-06-21
**検証者:** Claude Code（実装者）
**検証方法:** curl による HTTP ステータス確認（本 Issue の本質は HTTP レスポンスステータスのため、ブラウザクリック操作ではなく curl で直接観測）

## 検証ランタイム（両方で実施）

- **dev:** `pnpm db:migrate` → `pnpm dev`（Vite + workerd） → `http://localhost:3001`（3000 使用中のため自動採番）
- **本番相当:** `pnpm build` → `pnpm start`（wrangler dev、ビルド出力 = Cloudflare Workers ランタイムに最も近い） → `http://localhost:8787`

シードデータ: 既存ローカル D1（公開ノート `01950754-0000-7000-8000-000000000703`（owner `dev-admin`）, slug `dev-admin/n754-03`, 実在ユーザー `dev-admin`）。

## 結果

| # | ケース | URL | 期待 | dev | 本番相当 | 判定 |
|---|--------|-----|------|-----|---------|------|
| 1 | 存在しないノート(byId) | `/notes/public/nonexistent-xyz` | 404 + gone 画面 | HTTP 404・「このノートは公開され…」 | HTTP 404 | PASS |
| 2 | 存在しないノート(bySlug) | `/u/nouser123/noslug123` | 404 + gone 画面 | HTTP 404・「このノートは公開され…」 | HTTP 404 | PASS |
| 3 | 存在しないユーザー | `/u/nouser123` | 404 + notFound 画面 | HTTP 404・「ページが見つかりません」 | HTTP 404 | PASS |
| 4 | 実在の公開ノート(byId) | `/notes/public/0195...0703` | 200 | HTTP 200・実タイトル表示 | HTTP 200 | PASS |
| 5 | 実在の公開ノート(bySlug) | `/u/dev-admin/n754-03` | 200 | HTTP 200 | HTTP 200 | PASS |
| 6 | 実在ユーザー | `/u/dev-admin` | 200 | HTTP 200 | HTTP 200 | PASS |

**全 6 ケース PASS（dev・本番相当の両ランタイム）。**

## 備考（重要）

- 当初計画はノートを **410（gone）** で返す方針だったが、PoC で「現バージョンの TanStack Router は SSR ドキュメントステータスを `router.stores.statusCode`（notFound→404 / error→500 / 成功→200）で専管し、`setResponseStatus` はドキュメントに不達」と確定。カスタム 410 は原理的に出せないため、ユーザー合意のうえ **404** に確定（`throw notFound()` 経由）。詳細は `.issue/735/adr.md` ADR-004 / `.issue/735/progress.md`。
- ノート系も 404 になったが、Issue の核心（クローラ/SEO に 200 を返さない）は解消。画面（gone / notFound の ErrorPage）は #599 のまま維持。
- 起票した Issue: なし（410 の制約は #735 内の progress.md / ADR-004 に追跡。ユーザーは別 Issue 化を選択せず）。
