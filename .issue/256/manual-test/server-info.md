# Dev Server Info — Issue #256

- 起動コマンド: `pnpm dev`
- ポート: 3000（5173 / 5174 は他 worktree が占有していたため自動で次の空きが採用された）
- URL: http://localhost:3000/
- ヘルスチェック: 307 リダイレクト（未ログイン → /login）応答を確認
- PID ファイル: `/tmp/manual-test-256-server.pid`
- ログ: `/tmp/manual-test-256-server.log`
- 起動時刻: 2026-05-28

Phase 6 のクリーンアップで停止する。
