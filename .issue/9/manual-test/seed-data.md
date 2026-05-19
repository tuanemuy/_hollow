# Issue #9 — manual-test 用シードデータ

Issue #1 のシードデータを再利用する（ローカル D1 に既投入済み）。

## テストアカウント

| 項目 | 値 |
|------|---|
| email | `test-user-001@example.com` |
| password | `TestPassword123!` |
| username | `test-user-001` |

## 使用するノート（Issue #9 のテスト用）

- N1 `Weekly planning ノート` (Inbox, private, work/todo) — autosave テストで利用（編集対象）
- N9 `公開デザインガイド` (Projects, public, design/ideas) — モード切替テストで利用
- 新規ノート作成 — WYSIWYG タブのメインフローで利用

## 投入確認

- `users` テーブルに `test-user-001@example.com` が存在することを確認済み（`pnpm wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT COUNT(*) FROM users WHERE email='test-user-001@example.com'"`）

詳細シード内容は `.issue/1/manual-test/seed-data.md` を参照。
