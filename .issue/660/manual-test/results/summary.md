# テスト実行サマリー — Issue #660

**実行日時**: 2026-06-25
**テストソース**: .issue/660/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | 公開トップ radiogroup/radio/aria-checked/tabindex 属性 | 正常系 | PASS | - |
| TC-002 | 公開トップ 矢印キーナビ・両端ラップ・URL更新 | 正常系 | PASS | - |
| TC-003 | ホーム radiogroup 属性（認証） | 正常系 | PASS | - |
| TC-004 | ホーム 矢印キーナビ・replace:true 履歴不変 | 正常系 | PASS | - |
| TC-005 | エッジ（Tab素通し/Space/localStorage永続）+ menuItem focus-visible | 異常系/影響 | PASS | - |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 所見
- radiogroup/radio/aria-checked への置換が両ページで完全に反映（旧 tablist/tab/aria-selected は 0 件）。
- roving tabindex（選択中のみ 0）・矢印キー即時切り替え・両端ラップ・Home/End が実機で機能。
- ホームは replace:true で history.length 不変、localStorage 永続（#650）維持。
- menuItem（danger 含む）に accent inset outline クラス付与を確認。
- computed outlineStyle=none は agent-browser の :focus-visible paint 偽陰性（`.matches(':focus-visible')=true` で実装担保）。実害なし。
