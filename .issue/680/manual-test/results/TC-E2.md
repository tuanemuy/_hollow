# E-2: ユーザーが別要素へ focus 移動した場合は復元しない

- セッション: verify-tc-e2
- 対象: /views inline rename `<input>`（id `_R_36bdb6_`）→ ヘッダ検索ボックス（id `header-search`, type=search）

## 目的

invalidate と同時にユーザーが意図的に別要素へ focus を移した場合、フックが focus を奪い返さない。

## 操作

1. rename を開始し `press ArrowLeft` で focus+caret 確立（caret=48）
2. eval で検索ボックス（type=search）に `.focus()` 移動
3. before 観測（focus は検索ボックス）
4. `invalidate({ filter: m => m.routeId !== '/_app' })` → networkidle + 800ms
5. after 観測

## 期待

focus は移動先の別要素に留まり、元の rename input へ戻らない。

## 実際

- before: `{tag:INPUT, type:search, isBody:false}`（検索ボックス）
- after : `{tag:INPUT, type:search, isBody:false, id:header-search}`（検索ボックスのまま）

## 判定: PASS

focus は移動先の検索ボックスに留まり、rename input へ奪い返されなかった。
`activeElement === document.body` ガードにより、focus が body 以外（= ユーザーが別要素にいる）なら
復元が走らないことを確認。focus を意図せず奪うリスクは顕在化せず。
