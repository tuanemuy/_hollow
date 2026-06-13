# TC-6: raw router.invalidate() でも復元が効く (AC-5 / 発生源非依存)

- セッション: verify-tc-6
- 対象: /views inline rename `<input>`（id `_R_36bdb6_`）

## 操作

1. /views で 1件目ビューの rename を開始（autoFocus, caret=49）
2. ArrowLeft x10 で caret を 39 に移動
3. before 観測
4. フィルタ無しの raw 発火: `window.__TSR_ROUTER__.invalidate()` → networkidle + 800ms
5. after 観測

## 期待

after で rename input に focus が戻り caret が保持（本命フィルタ経路と同じ復元結果）。

## 実際

- before: `{tag:INPUT, id:_R_36bdb6_, start:39, end:39, dir:none}`
- after : `{tag:INPUT, isBody:false, id:_R_36bdb6_, start:39, end:39, dir:none}`

## 判定: PASS

raw invalidate でも focus 復帰・caret 39/39 一致。復元は invalidate 発生源に依存しない。
