# TC-2: /views inline rename の focus・caret 保持 (AC-2)

- セッション: verify-tc-2
- 対象: 保存ビュー「TestLongViewName649…」の inline rename `<input>`（id `_R_36bdb6_`）
- 前提: 既存保存ビュー3件あり。kebab メニュー「名前変更」で rename 開始（autoFocus で input に focus）。

## 操作

1. /views を open → 1件目ビューの「その他の操作」メニュー →「名前変更」
2. autoFocus 後 caret=49（末尾）。ArrowLeft x10 で caret を 39 に移動
3. before 観測
4. `invalidate({ filter: m => m.routeId !== '/_app' })` → networkidle + 800ms
5. after 観測

## 期待

after で同じ rename input に focus が戻り caret 一致。

## 実際

- before: `{tag:INPUT, id:_R_36bdb6_, start:39, end:39, dir:none, val:"TestLongViewName649A…"}`
- after : `{tag:INPUT, isBody:false, id:_R_36bdb6_, start:39, end:39, dir:none, val:"TestLongViewName649A…"}`

## 判定: PASS

focus 復帰、caret 39/39 一致（末尾49へ飛んでいない）、value 保持。
