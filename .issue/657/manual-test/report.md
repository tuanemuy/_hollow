# テスト実行サマリー

**実行日時**: 2026-06-13
**テストソース**: .issue/657/testing.md
**サーバー**: http://localhost:8787（`pnpm build && pnpm start -- --port 8787`、`localhost` 表記でアクセス）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-1 | presigned アップロードフロー E2E（AC-1/AC-2/AC-3） | 正常系 | PASS | - |
| TC-2 | determinate 進捗バー再検証（AC-6 / #655 確認項目1） | 正常系 | PASS | - |
| TC-3 | 127.0.0.1 アクセス時の失敗挙動 | 異常系 | PASS | - |
| TC-4 | 1MiB 超ファイルの拒否 | 異常系 | PASS | - |
| TC-5 | 既存機能への影響確認（sitemap / 通常ページ / 再試行 / export） | 回帰 | PASS（(c) ジョブ型 export のみ SKIP: relay/consumer Worker が `pnpm start` で動かない既知のローカル制約） | - |

**合計**: 5 件（PASS: 5 / FAIL: 0）

補足:
- TC-1: PUT 先は `http://localhost:8787/dev/r2/hollow-local-objects/...`（same-origin）、リモート R2 へのリクエスト 0 件。finalize 成功、`/media/<id>` 表示確認。
- TC-2: CDP で upload 帯域 60KB/s に制限し、10%→…→96%→100% の determinate 進捗を 105 サンプルで観測。
- AC-4 / AC-5 はユニットテスト（`pnpm test:unit` 全PASS）+ wrangler 設定レビューで充足（testing.md の注記どおり手動対象外）。
