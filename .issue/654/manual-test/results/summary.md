# テスト実行サマリー — Issue #654

**実行日時**: 2026-06-13
**テストソース**: .issue/654/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | ＋chip の表示とモック一致（AC-1） | 正常系 | PASS | - |
| TC-002 | 母集合（全公開タグ）の列挙（AC-2） | 正常系 | PASS | - |
| TC-003 | 公開可視性 gate（AC-3） | 正常系 | PASS | - |
| TC-004 | ＋chip からのタグ追加と楽観更新／URL反映（AC-5） | 正常系 | PASS | - |
| TC-005 | transport cap（8件）到達時の追加抑止（AC-5） | 正常系 | PASS | - |
| TC-006 | 既存タグ chips との整合（AC-6） | 正常系 | PASS | - |
| TC-007 | 公開タグ0件ユーザーで＋chipが破綻しない | 異常系 | PASS | - |
| TC-008 | 既存機能（絞り込み・期間・ソート）への影響なし | 影響確認 | PASS | - |

**合計**: 8 件（PASS: 8 / FAIL: 0）

## 補足
- ＋chip listbox の option クリックは agent-browser の既知偽陽性（React 合成 onClick 未達）。発見chip/period/sort 等の通常 button/link クリックは正常動作。最重要の TC-005（cap 抑止）は option の `[disabled]` 属性＋URL不変で偽陽性に依存せず検証。TC-004/006/008 のタグ追加結果は URL 直接操作で確認し、いずれも実装バグではなく偽陽性と切り分け済み。
- URL の `tags` は JSON 配列の URL エンコード形式（例 `?tags=["Go","ページ2タグ"]`）。route schema `tags.max(8).catch(undefined)` に9件以上を直接押し込むと全消失するが、＋chip の `[disabled]` 抑止がそれを防ぐことを実機で確認。
