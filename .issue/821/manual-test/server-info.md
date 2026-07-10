## サーバー情報
- 起動コマンド: pnpm dev（vite dev --config vite.config.cloudflare.ts）
- ポート: 3000 想定 → 3000/3001 競合回避で **3001** に自動割当（3000 は別プロジェクト open-desk が使用中）
- URL: http://localhost:3001
- 認証: `agent-browser cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:3001 --path / --secure --sameSite Lax`（seed した dev-admin）
- 検出ソース: .issue/821/testing.md ＋ 実起動ログ
