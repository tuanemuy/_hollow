# TC-3: /admin/prompts text textarea の focus・caret 保持 (AC-3 / text)

- セッション: verify-tc-3
- 対象: 1枚目 prompt カードの text `<textarea>` (id `_R_bnb6_`)

## 操作

1. /admin/prompts を open（cookie 注入済み admin セッション）
2. textarea を focus し `keyboard type "Hello World Test"` で入力（value 末尾 caret=16）
3. ArrowLeft x5 で caret を文中 11 に移動（"Hello World" の直後）
4. before 観測
5. `invalidate({ filter: m => m.routeId !== '/_app' })` 発火 → networkidle + 800ms 待機
6. after 観測

## 期待

after で同じ textarea に focus が戻り、caret start/end/direction が before と一致。

## 実際

- before: `{tag:TEXTAREA, isBody:false, id:_R_bnb6_, start:11, end:11, dir:none, val:"Hello World Test"}`
- after : `{tag:TEXTAREA, isBody:false, id:_R_bnb6_, start:11, end:11, dir:none, val:"Hello World Test"}`

## 判定: PASS

focus は同一 textarea に復帰、caret 11/11 一致（末尾16へ飛んでいない）、value 保持。
