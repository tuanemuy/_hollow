# TC-2 再検証: 通常ケース（focus・caret 保持）回帰確認 — AC-2

- セッション: verify680
- 対象: /views inline rename `<input>`（id `_R_76bdb6_`）

## 目的

E-1 修正後も、文字入力済み・caret を文中（末尾以外）に置いた通常ケースで、本命相当 invalidate 後に focus と caret 位置が保持されることを確認する（caret が末尾へ飛ばないこと）。

## 手順

1. rename input にキーボードで `XYZ` を入力（value `テスト用ビュー designRenamedR1ViewXYZ`, 長さ30）。
2. `ArrowLeft` ×5 で caret を 25（末尾30より手前）に移動（onKeyUp → capture で snapshot 取得）。
3. before を観測。
4. 本命相当 invalidate を発火。
5. `wait --load networkidle` + `wait 800` 後に after を観測。

```js
window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })
```

## 観測値

- before: `{"tag":"INPUT","isBody":false,"id":"_R_76bdb6_","val":"テスト用ビュー designRenamedR1ViewXYZ","start":25,"end":25,"dir":"none"}`
- after : `{"tag":"INPUT","isBody":false,"id":"_R_76bdb6_","val":"テスト用ビュー designRenamedR1ViewXYZ","start":25,"end":25,"dir":"none"}`

## 判定: PASS（回帰なし）

- after で focus は同じ rename input（`_R_76bdb6_`）に戻り `isBody:false`。
- caret `selectionStart`/`selectionEnd` ともに 25 で before と一致。末尾（30）へ飛んでいない。
- value も保持。
- フォールバック条件 (a)(b) いずれも非該当。
