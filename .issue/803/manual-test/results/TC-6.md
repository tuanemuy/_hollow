# TC-6（エッジ）: 画面上部では shift なし

結果: PASS

## 概要
viewport 1280x900（下方向に十分な余裕）でパネルを開き、shift が当たらず input 直下に開くことを検証。

## 実行ログ
| 手順 | 操作 | 結果 |
|---|---|---|
| 1 | viewport 1280x900, `/notes/new` | innerH=900 |
| 2 | combobox click → type "t" | 候補5件 |
| 3 | eval 計測 | inputBottom=301, panelTop=313, gap=12, panelBottom=520, transform=none, fits=true |

## 判定
- transform=none（不要な押し上げが当たらない）。PASS
- パネルは input 直下（gap 12px）に開く。PASS
- viewport 内に収まる（520<=892）。PASS
