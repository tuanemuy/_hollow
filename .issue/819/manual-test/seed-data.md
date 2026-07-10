# シードデータ

**実行日時:** 2026-07-10

## 準備作業

- `pnpm db:migrate` — ローカル D1 は既適用（No migrations to apply）
- `pnpm seed:dev-admin` — 決定論的な管理ユーザー＋有効セッションを投入（冪等）

## アカウント

- email: `dev-admin@example.com`
- username: `dev-admin`
- role: admin (active)
- user id: `01950000-0000-7000-8000-000000000001`
- session token: `dev-admin-session-token`（cookie 名 `__Host-session`、Secure 必須 → CDP 注入）

## テスト用ノート（既存を利用、追加投入なし）

| id | title | 用途 |
|----|-------|------|
| `01950779-0000-7000-8000-0000000000e1` | デザイン草稿メモ | 詳細→編集遷移・編集ルート正常描画 |
| `does-not-exist-819` | （存在しない） | AC-7 非存在ノート編集→インライン not-found |

## 環境

- サーバー: `pnpm dev`（vite dev, cloudflare plugin, miniflare ローカル D1 を wrangler と共有）
- ポートはログで確認（3000 起点、使用中なら自動増加）
