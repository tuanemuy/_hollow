# TC-E2 再検証: focus 奪取が増えていないこと（回帰確認）

- セッション: verify680
- 対象: /views inline rename `<input>`（id `_R_76bdb6_`）→ 別 input（ヘッダー検索 `header-search`, type=search）

## 目的

E-1 修正でコミット後 effect が held-focus フラグを arm するようになったが、これにより「ユーザーが別要素へ focus を移したあとに invalidate が来ても rename input へ focus を奪い返す」回帰が生じていないことを確認する。restore ガードは `activeElement === document.body` を要件にしているため、別要素が focus を保持している間は restore が走らないはず。

## 手順

1. rename input に focus・caret(=5) 配置。
2. focus を動かさない `eval` で別 input（`header-search`）に `.focus()`。
3. 本命相当 invalidate を発火。
4. after を観測。

## 観測値

- focus 移動直後: `{tag:INPUT, id:header-search, type:search, isBody:false}`
- before: `{"tag":"INPUT","isBody":false,"id":"header-search","type":"search","start":0,"end":0}`
- after : `{"tag":"INPUT","isBody":false,"id":"header-search","type":"search","start":0,"end":0}`

## 判定: PASS（回帰なし）

- after で focus は移動先 `header-search` に留まり、rename input（`_R_76bdb6_`）へ戻っていない。
- 修正により focus 奪取が増える回帰は発生していない（restore は `activeElement === document.body` のときだけ走るガードが機能）。
- フォールバック条件いずれも非該当。
