# TC-4: ドロワーがボトムシート（AC-6）

結果: PASS

検証環境: モバイル幅 viewport 375x812（`agent-browser --session verify-tc-group-b set viewport 375 812`）。winW=375 < 640 を eval で確認済み。
対象URL: http://localhost:3000/search?q=hollow671 （networkidle 待ち）

## ログ

| ステップ | コマンド/操作 | 結果 |
| --- | --- | --- |
| 1 | viewport 375x812 設定 → search を open → networkidle | OK（winW=375） |
| 2 | ドロワー閉状態の computed style/rect を eval | OK |
| 3 | 「フィルター」ボタン click → 600ms wait → 開状態を eval | OK |
| 4 | 「閉じる」(×) click → 600ms wait → 閉状態を eval | OK（下へスライドして消える） |

## eval 取得値

閉状態（初期）:
```
position=fixed, bottom=0px, left=0px, right=0px
borderTopLeftRadius=12px, borderTopRightRadius=12px
maxHeight=714.56px  (= 88vh of 812 ✓)
rectTop=812, rectBottom=1402  → 画面下に隠れている
winH=812, winW=375, width=375
```

開状態（フィルター click 後）:
```
position=fixed, bottom=0px
borderTopLeftRadius=12px, borderTopRightRadius=12px
maxHeight=714.56px
rectTop=222, rectBottom=812  → rectBottom == winH（画面下端に固定）
width=375  → 画面いっぱい（== winW）
```

backdrop（暗い背景オーバーレイ）:
```
class="fixed inset-0 bg-black/[0.32] ..."
backgroundColor=oklab(0 0 0 / 0.32)  (黒32%)
position=fixed, inset=0, zIndex=90 （ドロワー z=100 の直下）
開: opacity=1, pointerEvents=auto
閉: opacity=0, pointerEvents=none
```

開閉トランジション:
```
open  → rectTop=222 / backdrop opacity=1, pointerEvents=auto
close → rectTop=812（下へスライドして画面外） / backdrop opacity=0, pointerEvents=none
```

## 判定根拠

- position=fixed + bottom=0 + width==winW で画面下端に固定された全幅ボトムシート。
- 上角丸 borderTopLeft/Right=12px > 0、下角は 0（mock の radius-lg lg 0 0 に一致）。
- maxHeight=714.56px = 88vh（mock の max-height:88vh に一致）、画面内に収まる。
- 開状態は rectBottom==winH(812) で下端固定、閉状態は rectTop=812 で画面下へ退避。下から せり上がる挙動を満たす。
- 暗い backdrop が開時に出現（opacity 0→1, pointerEvents none→auto）し、閉時に消える。

mock（spec/design/pages/mobile/P32-public-search.html の `.drawer` / `.drawer-backdrop`）の質的特徴をすべて満たす。
