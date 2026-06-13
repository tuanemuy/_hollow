# E-1: スナップショット未取得（操作前 invalidate）で focus のみ復元

- セッション: verify-tc-e1（無操作）, verify-tc-e1b（実キー操作あり対照）
- 対象: /views inline rename `<input>`（id `_R_36bdb6_`, autoFocus 値長49）

## 目的（testing.md）

autoFocus で開いた直後に1文字も操作せず invalidate が重なるケースで、caret を末尾/先頭に
ジャンプさせず focus のみ復元する。

## 手順と実際

### verify-tc-e1（完全無操作）

1. rename を開始（autoFocus, caret=49=末尾）
2. タイプ・クリック・キー操作を一切せず `invalidate({ filter: m => m.routeId !== '/_app' })`
3. after 観測

- before: `{tag:INPUT, id:_R_36bdb6_, start:49, end:49}`
- after : `{tag:BODY, isBody:true, start:null, end:null}` ← focus が body に残り復元されず（rename input は DOM 上に存在し value 保持）

### verify-tc-e1b（対照: 実キー操作 `press End` を1回挟む）

1. rename 開始 → `press End`（onKeyUp → capture で hadFocus を arm、caret は末尾のまま）
2. `invalidate(...)`
3. after 観測

- before: `{tag:INPUT, id:_R_36bdb6_, start:49, end:49}`
- after : `{tag:INPUT, isBody:false, id:_R_36bdb6_, start:49, end:49}` ← focus 復帰

## 期待との差異

testing.md E-1 の期待は「focus は rename input に戻るが setSelectionRange による caret 強制移動は起きない」。
実機では **完全無操作の場合 focus は復元されず body に残った**。理由は下記。

## 原因（analysis.md 参照）

フックの restore は `hadFocusRef.current === true` をガード条件にしている（caret 強制ジャンプ防止のため）。
`hadFocusRef` は `onFocus/onKeyUp/onSelect/onMouseUp/onInput/onBlur` ハンドラ経由でのみ true になる。
**React の合成 `onFocus` は autoFocus マウント時には発火しない**（autofocus の DOM focus が
React のイベント配線より前に起きるため）。したがって「autoFocus だけで一度も操作していない」状態では
`hadFocusRef` が false のままで、restore が抑制される。

実キー/クリックを1回でも行えば（e1b）arm されて focus は正しく復元される。

## 判定: 期待と差異あり（focus は無操作時に復元されない）

- caret が末尾/先頭に強制ジャンプしない、という E-1 の主眼（フォールバック非破壊）は満たす（そもそも復元自体が走らない）。
- ただし「focus のみ復元」は完全無操作時には満たさない。実害評価は analysis.md に記載（軽微: 実運用では autoFocus 直後に必ず何らかの操作が入る）。分類: 実装の設計上の境界挙動（フォールバックガードの副作用）。フォールバック条件 (a)「focus が当該要素へ戻らない」に技術的には該当するが、これは S-001 が想定する「操作後の退避失敗」ではなく「未 arm のため意図的に抑制」されたケース。
