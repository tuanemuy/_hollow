# シードデータ — Issue #321 ブラウザ検証

## 認証フローの要点
- 認証は独自 identity usecase（better-auth 互換テーブル `users`/`accounts`）。
- email verify 必須。dev では確認メールが届かないため UI signup は詰まる。setup フローは `ADMIN_SETUP_TOKEN` 空のため 404。
- → ローカル D1 に verified ユーザーを直接投入（scrypt ハッシュ照合済み）。

## テストアカウント
- **email**: `test321@example.com`
- **password**: `Test321Pass!`
- active / member / email_verified=1。root ディレクトリ投入済み。

## ログイン手順（agent-browser）
1. `http://localhost:3000/login` を開く
2. email 欄（placeholder `you@example.com`）に `test321@example.com`
3. password 欄（placeholder `パスワード`）に `Test321Pass!`
4. 「ログイン」ボタン押下 → `/` に遷移

## 投入内容
- `users`: id `01999321-0000-7000-8000-000000000001`
- `accounts`: provider `credential`, scrypt パスワードハッシュ
- `directories`: ルート（parent_id NULL, depth 0）

## ローカルD1 SQL
```bash
pnpm exec wrangler d1 execute hollow-local-d1 --local --json --command "<SQL>"
```
（インライン `--command` がシェルで失敗する場合は `--file <path>` を使う）

## 注意
- 既存ユーザー（`linktest@example.com` 等、#127 検証の残り）には触れていない。SQL 確認時は owner_id でスコープすること。
