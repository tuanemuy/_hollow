# TC-5: /settings/prompts text textarea の focus・caret 保持 (AC-4)

- セッション: verify-tc-5
- 対象: loader 由来 text `<textarea>`（placeholder「あなたの分析の意図を記入…」, id `_R_ubdb6_`）
- 注: URL は `/settings/prompts`（`_app` はパスレス layout なので URL セグメント無し）。PreviewPanel.sample（placeholder 空の textarea）はスコープ外として除外。

## 操作

1. /settings/prompts を open（DEV / staleTime:0）
2. loader text textarea[0] を focus → `keyboard type "My analysis intent here"`（caret 末尾 23）
3. ArrowLeft x5 で caret を 18 に移動
4. before 観測
5. `invalidate({ filter: m => m.routeId !== '/_app' })` → networkidle + 800ms
6. after 観測

## 期待

after で同じ text textarea に focus が戻り caret 一致。

## 実際

- before: `{tag:TEXTAREA, id:_R_ubdb6_, start:18, end:18, dir:none, val:"My analysis intent here"}`
- after : `{tag:TEXTAREA, isBody:false, id:_R_ubdb6_, start:18, end:18, dir:none, val:"My analysis intent here"}`

## 判定: PASS

focus 復帰、caret 18/18 一致（末尾23へ飛んでいない）、value 保持。
