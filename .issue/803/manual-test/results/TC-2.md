# TC-2: 動的高さ再クランプ（AC-3）

結果: PASS

## 概要
TC-1 の clamp 済み状態（viewport 440, translateY -88）から候補件数を増減させ、パネル高さ変化に追従して再クランプされ、古い shift が残らないことを検証。

## 実行ログ
| 手順 | 操作 | 候補 | panelH | panelBottom | transform | fits |
|---|---|---|---|---|---|---|
| 1 | "t"（5候補, clamp 済み） | 5 | 207 | 432 | translateY -88 | true |
| 2 | "tag-a" まで入力（絞り込み） | 1 | 81 | 394 | none | true |
| 3 | Backspace×4 で "t" に戻す（増加） | 5 | 207 | 432 | translateY -88 | true |

## 判定
- 候補を絞ってパネルが低くなる（207→81）と、はみ出しが無くなり shift が none に戻る（古い -88 が残らない）。PASS
- 再び候補を増やすと（81→207）再度はみ出すため translateY -88 が再適用され bottom 432<=432 に収まる。PASS
- どの段階でも fits=true。不要な押し上げや浮きが残らない。PASS
