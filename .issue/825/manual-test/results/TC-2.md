# TC-2: スクロール時のツールバー追従（AC-1/AC-2 sticky回帰）モバイル
**結果**: PASS
## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | 本文(textbox)に30行の長文を type + Enter で入力 | ページがスクロール可能になる | docHeight=2064 > winHeight=844。スクロール可能 | PASS |
| 1b | 入力直後のツールバー位置を eval で測定 | ヘッダー直下に sticky | scrollY=581 時点で toolbarTop=72（ヘッダー高さ直下）、toolbarBottom=126、visible=true | PASS |
| 2 | scroll down 800 で下方向スクロール | - | scrollY=581 → 1220 へスクロール | PASS |
| 3 | スクロール後の toolbar 位置・可視性を確認 | ツールバーがヘッダー直下に留まり流れて消えない | scrollY=1220 でも toolbarTop=72 / toolbarBottom=126 で固定。追従を確認 | PASS |
| 3b | is visible でツールバー内ボタンの可視性確認 | 主要ボタン・⋯ が可視 | 太字(e19)=true、その他の書式(e25)=true。先頭ボタン 太字 の bounding rect も可視 | PASS |

## 備考
- getBoundingClientRect による数値計測で sticky 追従を定量確認できた（スクロール量に関わらず toolbarTop が 72px で一定）。視覚的スクリーンショットではなく座標計測での確認だが、AC-2 の「1行に閉じ込められて即消える回帰」が起きていないことは明確に確認できた。
