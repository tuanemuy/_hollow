# サーバー情報 — Issue #181

- **起動コマンド:** `pnpm dev`（`vite dev --config vite.config.cloudflare.ts`）
- **ポート:** 3000
- **URL:** http://localhost:3000
- **ビルド:** 不要（開発サーバー）
- **D1 マイグレーション:** `pnpm db:migrate`（"No migrations to apply" = 適用済み。ただし vite 側 D1 とは別系統。report.md 参照）
- **検出ソース:** `.issue/181/testing.md`「確認環境」セクション + `vite.config.cloudflare.ts`（`server.port: 3000`）
- **ヘルスチェック:** `GET /` → 200 確認済み
