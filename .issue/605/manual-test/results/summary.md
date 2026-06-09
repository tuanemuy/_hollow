# テスト実行サマリー — Issue #605

**実行日時**: 2026-06-09
**テストソース**: `.issue/605/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev` / vite dev + workerd）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-01 | P30 ソート切替（公開日順=publishedAt ⇄ 更新日順=updatedAt） | 正常系 | PASS | - |
| TC-02 | total が published_at listing で整合 | 正常系 | PASS | - |
| TC-03 | タグ絞り込み × 公開日順 | 正常系 | PASS | - |
| TC-04 | P32 期間ファセット/検索が published_at 基準 | 正常系 | PASS | - |
| TC-05 | trashed-but-public / published_at NULL の listing 除外 | 異常系 | PASS | - |
| TC-06 | username prefix サジェスト（case-insensitive / index / escape） | 正常系 | PASS | - |
| TC-07 | 既存機能の回帰（タイトル/更新日ソート・カレンダー・検索・詳細） | 回帰 | PASS | - |

**合計**: 7 件（PASS: 7 / FAIL: 0）
