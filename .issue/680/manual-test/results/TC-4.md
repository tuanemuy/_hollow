# TC-4: /admin/prompts variables input の focus・caret 保持 (AC-3 / variables)

- セッション: verify-tc-4
- 対象: 1枚目 prompt カードの variables `<input type="text">` (id `_R_bnb6H1_`)

## 操作

1. /admin/prompts を open
2. variables input を focus → `keyboard type "content, dirs"`（caret 末尾 13）
3. ArrowLeft x5 で caret を 8 に移動（"content," の直後）
4. before 観測
5. `invalidate({ filter: m => m.routeId !== '/_app' })` → networkidle + 800ms
6. after 観測

## 期待

after で同じ variables input に focus が戻り caret 一致。

## 実際

- before: `{tag:INPUT, id:_R_bnb6H1_, start:8, end:8, dir:none, val:"content, dirs"}`
- after : `{tag:INPUT, isBody:false, id:_R_bnb6H1_, start:8, end:8, dir:none, val:"content, dirs"}`

## 判定: PASS

focus 復帰、caret 8/8 一致（末尾13へ飛んでいない）、value 保持。text/variables 両フィールド個別に成立を確認。
