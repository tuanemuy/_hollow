# サーバー起動情報

- PID: `/tmp/manual-test-server.pid` 参照
- ポート: 3000
- URL: http://localhost:3000/
- ログ: `/tmp/manual-test-server.log`
- 起動コマンド: `pnpm dev`（Vite + Cloudflare 開発モード、`vite.config.cloudflare.ts`）
- ヘルスチェック: HTTP 307（ログイン未認証時のリダイレクト）→ OK
