# シードデータ — Issue #824 ブラウザ検証

**日時:** 2026-07-10

## 認証
- admin: dev-admin@example.com / username dev-admin / role admin
- session token: `dev-admin-session-token`（cookie `__Host-session`、CDP注入）

## テスト用ノート
- 既存タイトル編集(AC-1 edit / AC-2 truncation)用に長いタイトルのノートを投入:
  - id: `019f8240-0824-7000-8000-000000000824`
  - title: `Q2 計画 — プロダクトレビューに向けての長いタイトル検証ノート #824`
  - edit URL: `/notes/019f8240-0824-7000-8000-000000000824/edit`
- directory: Research (`01950000-0672-7000-8000-000000000010`)

## サーバー
- http://localhost:3000 (PID $(cat /tmp/manual-test-server.pid))
