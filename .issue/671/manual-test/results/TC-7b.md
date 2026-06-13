# TC-7b: チップ行がフィルターバーの兄弟＝独立全幅行（AC-11、PC幅）

結果: **PASS**

## 環境
- viewport: 1280x900 (PC幅)
- URL: `http://localhost:3000/search?q=hollow671&period=30d&username=p671-alice&tags=%5B%22p671-tech%22%5D`

## DOM 構造（eval 出力）

共通親（コンテナ）の直下に「フィルターバーブロック」と「チップ行」が並ぶ。

```
chipParentCls: "w-full max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]"
filterBlockCls: "flex items-center justify-between gap-3 flex-wrap py-2 pb-1 mb-2"  (index 1)
chipRowCls:     "flex flex-wrap gap-1.5 pb-3 border-b border-hairline mb-1 ..."     (index 2)

chipRowIsSiblingOfFilterBlock: true
chipAfterFilter: true   (filterBlockIndex=1 < chipRowIndex=2)
filterRowContainsChip: false       (フィルターバーはチップを内包しない)
chipRowContainsFilterBtn: false    (チップ行はフィルターボタンを内包しない)
sameElement: false
```

## レイアウト矩形
- フィルターバー内側 flex 行: top=310, bottom=346
- チップ行: top=358, left=32, width=1216, bottom=399（フィルターバーの下、全幅）

→ チップ行はフィルターバーの**下の独立した全幅行**。フィルターボタン/ソートトグルと同一 flex 行に挟まれていない。

## チップの垂直整列
3チップすべて top=358 / h=28 で揃う（ずれなし）。

```
[ {txt:"P6@p671-alice", top:358, h:28},
  {txt:"#p671-tech",    top:358, h:28},
  {txt:"過去 30 日",     top:358, h:28} ]
topsAligned: true
```

## 判定
- チップ行はフィルターバーブロックの**兄弟**（共通親直下、フィルターバーの直後）= PASS
- フィルターバーはチップを内包せず、同一 flex 行に挟まれていない = PASS
- チップ（期間・タグ・@ユーザー）に上下ずれなし = PASS
