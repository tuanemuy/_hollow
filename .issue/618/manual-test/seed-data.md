# シードデータ — Issue #618/#627 ブラウザ検証

- シード SQL: `.issue/618/manual-test-seed.sql`（冪等、`pnpm db:execute:local` で投入済み）
- 公開 search_documents 計12件（dev-admin 2 / seeduser 7 / searchtest618 3）

## テストで使う値
- FTS 広域ヒット: `テストキーワード`（8件・3ユーザー）
- 新規のみ: `検索テスト618`（3件、更新日時 2026-06-10 / 2026-05-15 / 2025-12-01）
- LIKE フォールバック: `AI`（1件）
- ヒットゼロ: `zzz存在しないキーワードzzz`
- ユーザー: dev-admin / seeduser / searchtest618
- タグ: common, tech, reading, travel, cooking, search618, ai
- 期間: 7d / 30d / 1y / all すべてに該当データあり（published_at 基準）
