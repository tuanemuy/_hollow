# TC-5: footer の適用ボタン/リセットのタップ高（AC-7,15）

結果: PASS

検証環境: モバイル幅 viewport 375x812。winW=375 < 640 を確認済み。
対象URL: http://localhost:3000/search?q=hollow671 （ドロワーを開いた状態）

## ログ

| ステップ | コマンド/操作 | 結果 |
| --- | --- | --- |
| 1 | フィルターボタンでドロワーを開く | OK |
| 2 | aside 内の button/a の rect・flexGrow・minHeight を eval | OK |

## eval 取得値

`aside` 内ボタン一覧:
```
[
  { t:"",            h:33, w:33,  flexGrow:0, minHeight:auto }  // header の閉じる(×)。footer 対象外
  { t:"すべてリセット", h:44, w:98,  flexGrow:0, minHeight:44px } // reset-link
  { t:"10 件を表示",   h:48, w:225, flexGrow:1, minHeight:48px } // apply-btn
]
```

footer 幅の内訳: 375 − padding(20+20) − reset(98) − gap(12) = 225 → 適用ボタンが残り全幅を占有。

## 判定根拠

- 「10 件を表示」(適用ボタン): height=48px、minHeight=48px、flexGrow=1。footer の残り幅 225px を flex-1 でフル占有。height >= 44（48目標）を満たす。
- 「すべてリセット」(リセット): height=44px、minHeight=44px。height >= 40（44目標）を満たす。
- 33x33 は drawer-header の閉じる(×)ボタンであり footer 対象外。

mock の `.apply-btn { flex:1; min-height:48px }` / `.reset-link { min-height:44px }` に一致。
