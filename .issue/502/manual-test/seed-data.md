# シードデータ — Issue #502 ブラウザ検証

## サーバー
- URL: http://localhost:3001/（`PORT` は無視され vite が 3000→使用中→3001 で起動）
- 起動コマンド: `pnpm dev`

## 認証
- ユーザー: dev-admin@example.com / username: dev-admin / role: admin (active)
- user id: `01950000-0000-7000-8000-000000000001`
- セッショントークン: `dev-admin-session-token`
- cookie 名: `__Host-session`（Secure-only のため CDP 経由で注入）
  ```
  agent-browser --session <s> cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:3001 --path / --secure --sameSite Lax
  ```
- 投入: `pnpm seed:dev-admin`（冪等）

## テスト用データ（手動投入）
- ディレクトリ: id `01950000-0000-7000-8000-0000000000d1`（name: Issue502, owner: dev-admin）
- ノート: id `01950000-0000-7000-8000-0000000000a1`（title: Issue502 エクスポート検証ノート, owner: dev-admin, status: active）
  - 単一ノートエクスポート `/notes/01950000-0000-7000-8000-0000000000a1/export` の検証に使用
  - `pnpm seed:dev-admin` は admin ユーザーのみ作成しノートを作らないため、本テスト用に手動 INSERT
