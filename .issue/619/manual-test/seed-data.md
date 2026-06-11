# シードデータ

- 検証用 username: test-public-user（表示名「公開テストユーザー」、bio あり、アバターはイニシャル）
- 公開ノート: 8件（active + public + published_at セット）
- 公開日分散（今日=2026-06-12 基準）: 2026-06-12（今日）/ 06-09 / 06-05 / 05-22 / 05-12 / 04-12 / 01-12 / 2025-09-12（年跨ぎ）
- タグ: TypeScript / 設計 / 日記（各ノートに分散付与）
- 非公開コントロール: visibility=private のノート1件（公開一覧に出ないことの確認用）
- シードスクリプト: scripts/seed-public-user.mjs（冪等）
