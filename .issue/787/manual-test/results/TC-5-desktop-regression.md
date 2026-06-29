# TC-5: デスクトップ非回帰 + 公開ノート確認

## デスクトップ非回帰（800px）

結果: PASS

対象: 非公開ノート詳細を viewport 800x800（`max-sm` 非発火）で計測。

| レバー | デスクトップ期待値 | 実測値(800px) | 判定 |
| --- | --- | --- | --- |
| gap | 8px | 8px | PASS |
| margin-top | 16px | 16px | PASS |
| margin-bottom | 24px | 24px | PASS |
| icon-only グリフ svg | 20px | 20px | PASS |
| ピル box | 40x40 | 40x40（ラベル付き 105x40） | PASS |

備考: viewport=1280 の初回計測でも同値（gap 8 / mt 16 / mb 24 / svg 20 / 40x40）を確認済み。`max-sm` 未満の幅では据え置き。

## 公開ノート（390px, 任意確認）

結果: PASS

対象: 公開ノート `http://localhost:3000/notes/01950010-0000-7000-8000-000000000202`、viewport 390px。

| レバー | 期待値 | 実測値 | 判定 |
| --- | --- | --- | --- |
| gap | 4px | 4px | PASS |
| margin-top | 12px | 12px | PASS |
| margin-bottom | 16px | 16px | PASS |
| icon-only グリフ svg | 18px | 18px | PASS |
| ピル box | 44x44 以上 | 44x44（ラベル付き 91x44） | PASS |

公開ノートでもモバイル幅でツールバーが同様に縮小表示されることを確認。
