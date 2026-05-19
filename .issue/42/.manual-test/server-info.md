# サーバー情報

- **起動コマンド**: `PORT=3001 nohup pnpm dev > /tmp/manual-test-server.log 2>&1 &`
- **ポート**: 3001（3000 は別プロセス使用中）
- **URL**: http://localhost:3001
- **PID**: `$(cat /tmp/manual-test-server.pid)`（記録ファイル: `/tmp/manual-test-server.pid`）
- **ログ**: `/tmp/manual-test-server.log`
- **依存インストール**: 既存（pnpm install 不要）
- **ビルド**: 不要（開発サーバー）
- **マイグレーション**: `pnpm db:migrate`（実装時に適用済み）
- **検出ソース**: `.issue/42/testing.md` 「確認環境」セクション
