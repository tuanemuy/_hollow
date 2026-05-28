# Edge Case 3: キーボード操作（Tab focus trap）

**結果**: PASS
**セッション**: verify-tc-003, verify-tc-005

## 実行ログ

| # | 操作 | 期待 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | editing view で Tab を 8 回押下 | dialog 内で focus 巡回（外に漏れない） | 8 回後: BUTTON "×" (close)、insideDialog=true | PASS |
| 2 | さらに Tab を 3 回押下 | 引き続き dialog 内、ループ継続 | INPUT (placeholder "新しいディレクトリ名…")、insideDialog=true | PASS |
| 3 | Shift+Tab を押下 | 前のフィールドへ巡回 | タグ入力 (id=_r_c_) → 新規ディレクトリ (id=_r_f_) | PASS |
| 4 | Tab を 10 回押下後の状態確認 | dialog 内に focus が残る | insideDialog=true | PASS |

focus trap は Tab / Shift+Tab 双方で機能している。
