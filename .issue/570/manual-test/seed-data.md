# シードデータ整備記録 — Issue #570

## 実行コマンド
- `pnpm db:migrate`（適用済み・差分なし）
- `pnpm seed:dev-admin`（dev-admin ユーザー + セッション）
- `pnpm db:execute:local .issue/544/manual-test/seed.sql`（dev-admin 所有ノート + 共有リンク）

## 認証
- セッション cookie: `__Host-session` = `dev-admin-session-token`（CDP で注入）
- ユーザー: dev-admin（USER_ID `01950000-0000-7000-8000-000000000001`）

## 対象データ
- ノート: `01950000-0000-7000-8000-000000000020`（"Issue 544 検証用 公開ノート（本文長め）", public）
  - パス: `/notes/01950000-0000-7000-8000-000000000020`
- 共有リンク（同ノート）:
  - `...030` status=active（QR 表示対象）
  - `...031` status=revoked（QR 非表示）
  - `...032` status=revoked（QR 非表示）

## サーバー
- `pnpm dev` → http://localhost:3000/
