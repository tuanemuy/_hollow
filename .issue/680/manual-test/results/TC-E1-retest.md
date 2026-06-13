# TC-E1 再検証: autoFocus 直後・未操作のまま invalidate（focus 復元）

- セッション: verify680
- 対象: /views inline rename `<input>`（id `_R_76bdb6_`, value `テスト用ビュー designRenamedR1View`, 長さ27, autoFocus）
- 修正: `useRestoreFieldFocusOnCommit.ts` のコミット後 effect 末尾で `activeElement === 当該要素` なら held-focus フラグを arm（autoFocus は React 合成 onFocus を発火しないため）。サーバー HMR 反映済み、reload で fresh load。

## 手順

1. /views で既存ビュー「テスト用ビュー designRenamedR1View」の操作メニュー → 名前変更 で inline rename を開始（autoFocus で input に focus, caret=27=末尾）。
2. タイプ・クリック・キー操作を**一切せず**、focus を動かさない `eval` で本命相当 invalidate を発火。

```js
window.__TSR_ROUTER__.invalidate({ filter: m => m.routeId !== '/_app' })
```

3. `wait --load networkidle` + `wait 800` 後に after を観測。

## 観測値

- before: `{"tag":"INPUT","isBody":false,"id":"_R_76bdb6_","start":27,"end":27}`
- after : `{"tag":"INPUT","isBody":false,"id":"_R_76bdb6_","start":27,"end":27}`

## 判定: PASS

- 修正前（TC-E1.md verify-tc-e1）は after で `{tag:BODY, isBody:true}` に落ちていた。
- 修正後は after で focus が rename input（同 id `_R_76bdb6_`）に戻り `isBody:false`。**E-1 解消を確認**。
- caret は強制移動されない設計どおり。snapshot 未取得（未操作）のため `setSelectionRange` は呼ばれず、after の start/end=27/27 は refocus 後のブラウザ既定値（フォールバック非破壊）。
- フォールバック条件 (a)「focus が当該要素へ戻らない」非該当（focus は復元された）。(b)「caret 不一致」非該当（snapshot 未取得のため caret 復元は対象外で、末尾/先頭への強制ジャンプも起きていない）。
