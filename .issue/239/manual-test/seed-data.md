# Issue #239 — Manual Test Seed Data

## 戦略
既存のベースライン seed（`.manual-test/2026-05-17/seed.sql`、テストユーザー12名）を流用。本 Issue は UI 変更のみで追加 seed は不要。

## 実行した準備
```bash
pnpm db:apply:local                                    # → No migrations to apply!（適用済み）
pnpm wrangler d1 execute hollow-local-d1 --local \
  --file=.manual-test/2026-05-17/seed.sql              # → 成功（INSERT OR IGNORE で冪等）
```

## ログイン用テストユーザー
| 用途 | メール | パスワード | role |
|------|--------|-----------|------|
| member | `existing@example.com` | `Password123!` | member |
| admin | `admin@example.com` | `Password123!` | admin |

パスワード根拠: `.manual-test/2026-05-17/seed.sql` / `hashPassword.mjs`（全 seed アカウント共通 `Password123!`、PBKDF2-SHA256。legacy verify パスで認証可）。

## サーバー
- 起動: `pnpm dev --port 5180`
- URL: http://localhost:5180/
- PID file: /tmp/manual-test-239-server.pid
