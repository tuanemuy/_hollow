# TC-7c: モバイル幅でも崩れない（補強）

結果: **PASS**

## 環境
- viewport: 375x812 (モバイル幅) → set viewport → reload → wait networkidle
- URL: `http://localhost:3000/search?q=hollow671&period=30d&username=p671-alice&tags=%5B%22p671-tech%22%5D`

## eval 出力

### @ユーザーアバター & チップ行関係
```
avTxt: "P6", avW: 16, avH: 16    (アバター 16px)
chipH: 32                         (モバイルは max-sm:h-8 = 32px チップ)
avOverflow: false                 (アバターはチップからはみ出さない)
chipRowSiblingOfFilterBlock: true
filterBlockContainsChip: false
```

### チップ垂直整列（横スクロール行内）
3チップすべて top=307 / h=32 で揃う。

```
[ {txt:"P6@p671-alice", top:307, h:32},
  {txt:"#p671-tech",    top:307, h:32},
  {txt:"過去 30 日",     top:307, h:32} ]
topsAligned: true
```

## 判定
- モバイル幅でも @ユーザーアバター = 16px（PASS）
- チップ高さ 32px に対しアバター 16px、はみ出しなし（PASS）
- チップ行はフィルターバーブロックの兄弟・独立行（PASS）
- チップに上下ずれなし（PASS）
