# Issue #468 動作確認 — シードデータ整備記録

作成日: 2026-07-11

## 実行した準備作業

1. `pnpm db:migrate` — ローカル D1 へのマイグレーション適用（結果: `No migrations to apply!`、適用済み）
2. `pnpm seed:dev-admin` — dev admin ユーザー + セッションの upsert（冪等、既存データ非破壊）
3. `node scripts/seed-dev-login.mjs` — パスワードログイン可能なユーザーの upsert（testing.md 確認項目1 は `/login` からのログインが前提のため）
4. テスト用 PDF を生成（下記）
5. `.dev.vars` の `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` が空でない値で設定済みであることを確認（testing.md の pruner 前提条件）

## テストアカウント

### パスワードログイン用（確認項目1 の UI ログインに使用）

- ログイン URL: http://localhost:3000/login
- email: `dev-login@example.com`
- password: `DevPassw0rd!2024`
- role: member (active)
- user id: `01950000-0000-7000-8000-000000000010`

### admin（セッション cookie 注入方式、/admin 系が必要な場合）

- email: `dev-admin@example.com`（パスワードなし。cookie 注入でのみ認証可能）
- session token: `dev-admin-session-token`（cookie 名 `__Host-session`、Secure 属性必須のため CDP 経由で注入する）
- user id: `01950000-0000-7000-8000-000000000001`

```bash
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
```

## dev サーバー

- 実ポート: **3000**（`manual-test-server.log` で確認: `Local: http://localhost:3000/`）

## テスト用 PDF

- パス: `/private/tmp/claude-501/-Users-hikaru-github-com-tuanemuy-hollow3/2589e7c4-4866-407a-af6a-d2fe2a72e88f/scratchpad/test-468.pdf`
- 内容: 1ページ、598 bytes の最小有効 PDF（`file` コマンドで `PDF document, version 1.4, 1 page(s)` を確認）

## D1 users テーブル確認

```
SELECT id, email, username, role, email_verified, banned FROM users
WHERE email IN ('dev-admin@example.com','dev-login@example.com');
```

| id | email | username | role | email_verified | banned |
|---|---|---|---|---|---|
| 01950000-0000-7000-8000-000000000001 | dev-admin@example.com | dev-admin | admin | 1 | 0 |
| 01950000-0000-7000-8000-000000000010 | dev-login@example.com | dev-login | member | 1 | 0 |

他にも既存レコード（`admin@example.com`, `tc-rename-*` 等）が存在するが、上書き・削除はしていない。

## 未投入のデータ（意図的）

- testing.md 確認項目2以降の SQL seed（`test-468-abandoned` / `test-468-fresh` / `test-468-image` 等の `media_assets` 行）は、各テストケース実行時に投入する方針のためここでは投入していない。

## 補足・注意事項

- pruner Worker は `pnpm dev` では起動しない。cron tick の確認は別途 `pnpm wrangler dev --config wrangler.toml --env pruner --test-scheduled` を起動して `/__scheduled` を手動発火する（testing.md 参照）。
- seed スクリプトはいずれも冪等で再実行可能。
