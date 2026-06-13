# TC-6: アクティブチップ行の横スクロール（AC-8,9,14）

結果: PASS

検証環境: モバイル幅 viewport 375x812。winW=375 < 640 を確認済み。
対象URL: http://localhost:3000/search?q=hollow671&username=p671-alice&tags=["p671-tech"]&period=30d
（ドロワーで @ユーザー=p671-alice / タグ=p671-tech / 期間=過去30日 を選択して「適用」。結果としてチップ3つ + すべて解除）

備考: `tags` パラメータは **JSON 配列エンコード**（`tags=%5B%22p671-tech%22%5D` = `tags=["p671-tech"]`）。スカラー文字列 `tags=p671-tech` は zod の `z.array(...)` に弾かれて drop される。

## ログ

| ステップ | コマンド/操作 | 結果 |
| --- | --- | --- |
| 1 | ドロワーで user/tag/period を選び適用 → 3チップ生成 | OK（@p671-alice / #p671-tech / 過去30日 / すべて解除） |
| 2 | チップ行コンテナの computed style と各チップ高さを eval | OK |
| 3 | remove(×)ボタンサイズ・flex-shrink を eval | OK |

## eval 取得値

チップ行コンテナ（「すべて解除」の親要素）:
```
display=flex, flexWrap=nowrap, overflowX=auto
scrollbar-width=none （スクロールバー非表示）
scrollWidth=417, clientWidth=343  → 417 > 343：横方向にオーバーフローしスクロール
rowHeight=45, winW=375
children: [
  @p671-alice : h=32,
  #p671-tech  : h=32,
  過去 30 日   : h=32,
  すべて解除   : h=32
]
```

各チップの flex-shrink と remove ボタン:
```
flexShrink: 全チップ=0, すべて解除=0  （縮まない）
removeBtns: @p671-alice=22x22, #p671-tech=22x22, 過去30日=22x22
```

## 判定根拠

- flexWrap=nowrap + overflowX=auto → 折り返さず横スクロール。
- scrollWidth(417) > clientWidth(343) → 実際にコンテンツがあふれてスクロール可能。
- scrollbar-width=none → スクロールバー非表示。
- 全チップ・すべて解除の高さ 32px で揃い、flex-shrink:0 で縮まない。
- remove(×)ボタン 22x22px。
- 「すべて解除」も height=32, flex-shrink:0 で潰れない。

mock の `.active-chips { flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none }` / `.chip { height:32px; flex-shrink:0 }` / `.chip-remove { 22x22 }` / `.clear-all { height:32px; flex-shrink:0 }` に一致。
