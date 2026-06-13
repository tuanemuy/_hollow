# TC-7: 文中 caret での invalidate（末尾に飛ばない・S-002）

- 対応AC: AC-2 / AC-3 / AC-4（caret 整合の横断確認）
- セッション: TC-2〜TC-6 の観測を流用（独立操作不要 — testing.md「1ケースで足りる」）

## 目的

caret を文中（末尾以外）に置いた状態で invalidate しても、caret が打鍵位置に留まり末尾へ飛ばない。

## 実測（各 TC で caret を value 長より手前に置いて検証）

| TC | フィールド | val長 | before caret | after caret | 末尾値 | 結果 |
|----|-----------|------|------------|-----------|------|------|
| TC-2 | /views rename input | 49 | 39 | 39 | 49 | 文中保持 |
| TC-3 | admin text textarea | 16 | 11 | 11 | 16 | 文中保持 |
| TC-4 | admin variables input | 13 | 8 | 8 | 13 | 文中保持 |
| TC-5 | settings text textarea | 23 | 18 | 18 | 23 | 文中保持 |
| TC-6 | /views rename (raw) | 49 | 39 | 39 | 49 | 文中保持 |

## 判定: PASS

全ケースで after caret が before の文中位置と一致し、value.length（末尾）になっていない。
`setSelectionRange` の clamp が最新 value と整合し、caret が末尾へ飛んでいないことを確認。
