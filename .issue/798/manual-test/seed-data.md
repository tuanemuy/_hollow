# シードデータ — Issue #798 ブラウザ検証

## 実行した準備
- `pnpm db:migrate`（ローカル D1。"No migrations to apply" = 適用済み）
- `node scripts/seed-dev-login.mjs`（冪等。パスワードログイン可能な active ユーザーを投入）

## テスト用アカウント
- email: `dev-login@example.com`（ログイン識別子）
- password: `DevPassw0rd!2024`
- role: member（active / email_verified=1）

## 補足
- ノート編集画面（P12）は root directory が無くても描画される（空ツリー可）ため、追加のディレクトリ投入は不要。
- ログインフォーム送信は password 欄で Enter（docs/test.md の手順）。ボタン click だと submit が発火しないことがある。
</content>
