# テスト実行サマリー — Issue #94

**実行日時**: 2026-05-22
**テストソース**: `.issue/94/testing.md`
**サーバー**: http://localhost:3000
**ブランチ**: `issue/94/saved-view-tag-resolver`

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | SavedView 適用でノート一覧が tag フィルタで絞り込まれる | 正常系（修正対象） | PASS | 10 件 → 1 件（Weekly planning, `#work #todo`） |
| TC-002 | URL から viewId を外すと全件表示に戻る | 正常系 | PASS | 1 件 → 10 件、combobox もリセット |
| TC-003 | URL の `q` が SavedView より優先される | 正常系（回帰） | PASS | tag フィルタ + `q` の AND が成立 |
| TC-004 | SavedView が存在しない viewId でも 500 にならない | 異常系 | PASS | view=null フォールバックで全 10 件表示 |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## 結論

Issue #94 の修正（home loader で `viewQueryToSearch` に tag 名解決 resolver を渡す）は期待通りに機能している。SavedView の tagIds がノート一覧クエリの tag フィルタに反映され、修正前の「全 10 件表示のまま」というバグは解消された。
