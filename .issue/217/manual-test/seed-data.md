# Issue #217 Manual Test — Seed Data

## Environment

- Branch: `issue/217/ui-fixes-batch`
- DB: local D1 (baseline seed from `0000_initial.sql` etc., 既存ローカル状態を再利用)
- Date: 2026-05-29

## Test accounts (baseline seed)

| Purpose | Username | Email | Password | Role |
|---|---|---|---|---|
| Member 動線確認 | `existing-user` | `existing@example.com` | `Password123!` | `member` |
| 管理画面確認 | `admin-user` | `admin@example.com` | `Password123!` | `admin` |

## Server

- Command: `pnpm dev --port 3001`
- Port: 3001
- URL: http://localhost:3001/
- PID file: `/tmp/manual-test-217-server.pid`
- Log: `/tmp/manual-test-217-server.log`
- Health check: `GET /` returned `307`（未ログイン時のリダイレクト、想定通り）

## Notes

- 破壊的な操作なし。シードの再投入は不要。
- アップロード機能の実体（ファイル変換キュー）は管理ジョブが要るため、本Issueでは「動線・見た目」確認のみ。
