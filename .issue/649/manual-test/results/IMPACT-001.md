# IMPACT-001 表示モード切り替えの URL 反映・履歴 replace（#219 契約）

結果: PASS

## 実行ログ

| # | 操作 | 期待 | 実際 |
| --- | --- | --- | --- |
| 1 | `/`（リスト表示）を開く | 200 | OK |
| 2 | タブ「タイル」をクリック | URL に `?display=tile` | `?display=tile` |
| 3 | タブ「カレンダー」をクリック | URL に `?display=calendar` | `?display=calendar` |
| 4 | `history.length` を確認 | モード切替で履歴が増えない（replace） | `2`（初期遷移分のみ。tile→calendar で増加なし） |
| 5 | `history.back()` | 直前のモードではなく前ページへ戻る | `about:blank` へ戻った（replace 挙動どおり） |

備考: モード切替 2 回後も history.length=2 のままで、back がモード間を遡らないことを確認。#219 の URL 反映 + history replace 契約は維持されている。
