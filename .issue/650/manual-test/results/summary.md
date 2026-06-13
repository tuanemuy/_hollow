# テスト実行サマリー — Issue #650

**実行日時:** 2026-06-13
**テストソース:** .issue/650/testing.md
**サーバー:** http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-1 | segmented 選択が localStorage に永続化（AC-1） | 正常系 | PASS | - |
| TC-2 | no-query reload で永続値復元（AC-2） | 正常系 | PASS | - |
| TC-3 | `?display=tile` が永続値より優先（AC-3） | 正常系 | PASS | - |
| TC-4 | SavedView の displayMode 優先（AC-4） | 正常系 | SKIP | 前提データ未整備（displayMode 付き SavedView 0件・保存UI disabled） |
| TC-5 | 切替時データ不変・復元（AC-5） | 正常系 | PASS（簡易） | - |
| TC-6 | 不正値フォールバック・hydration警告なし（AC-6/AC-7） | 異常系 | PASS | - |

**合計:** 6 件（PASS: 4 / FAIL: 0 / SKIP: 1）

## 所見

- 主要受け入れ基準 AC-1/2/3/6 はすべて実装どおり PASS。永続化（素の文字列）、no-query 初期表示への適用、URL 明示指定の優先（URL も localStorage も改変なし）、不正値の list フォールバック（hydration mismatch 警告なし）を確認。
- AC-5 は Network 観測が agent-browser で取りにくいため、データ不変＋in-place URL 反映による間接確認（簡易 PASS）。
- AC-4 は displayMode を持つ SavedView が未整備かつ保存 UI が disabled のため SKIP。実装バグではなく前提データ・手順上の制約。
- FAIL なし → manual-test からの Issue 起票なし。
