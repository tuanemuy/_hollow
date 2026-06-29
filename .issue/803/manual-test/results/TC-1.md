# TC-1: 画面下部での縦クランプ（AC-1）

結果: PASS

## 概要
小さい viewport で `/notes/new` のタグ欄に "t" を入力し、候補パネル（5件）が viewport 下端をはみ出す状況を作って縦クランプを検証。

## 環境メモ
- タグ入力欄（`[role=combobox][aria-label="新規タグ"]`）は sticky ヘッダ直下に固定配置され、スクロール最上部でも input top ≈ 274px が下限。スクロールダウンすると逆に上へ移動するため、はみ出しを起こすには viewport 高さを縮める方式を採用した（viewport 1280x440）。
- クランプは「パネルを開く / typing で候補が変わる」タイミングで再計算される。viewport を後から縮めただけでは再計算されない（パネルは開いた状態のまま）。そのため小さい viewport でパネルを開き直して検証した。

## 実行ログ
| 手順 | 操作 | 結果 |
|---|---|---|
| 1 | viewport 1280x440, `/notes/new` reload | innerH=440 |
| 2 | combobox click → keyboard type "t" | 候補 5件, listbox 表示 |
| 3 | eval でパネル計測 | 下記 |

計測値（viewport 440 で開き直し後）:
```
inputTop=274 inputBottom=301
panelTop=225 panelBottom=432 panelH=207
transform=matrix(1, 0, 0, 1, 0, -88.2969)   // translateY -88px
innerH=440  fits(bottom<=innerH-8=432)=true
```

## 判定
- パネル下端 432 <= 440-8=432 に収まる（はみ出しなし）。PASS
- 下方向にはみ出すケースで transform が translateY 負値（-88px）。none でない。PASS
- パネル全体が viewport 内（top 225>=0, bottom 432<=432）。PASS

参考: viewport 560 では同パネル bottom=520 <= 552 で元々収まるため transform=none（不要な shift が当たらないことも確認）。
