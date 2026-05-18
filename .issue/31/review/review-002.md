# PR Review #002 — feat(view): persist visibilityFilter on SavedView (#31)

**PR:** #61
**Date:** 2026-05-19
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 1
- Verdict: **APPROVED**

---

## Round-1 修正の検証

### [B-001] FIXED
`app/core/adapters/d1/repositories/__tests__/savedViewRepository.test.ts` を新設。以下を担保:
- Populated round-trip `["public","unlisted"]`（順序保持）
- Empty `[]` round-trip
- ADR-003 key omission → `[]`（legacy 行）
- Type confusion `42` → `DataIntegrityError`
- Mixed-type array `["public", 5]` → `DataIntegrityError`

`encodeQueryJson` / `decodeQueryJson` の export は純粋関数のみ。private state や DB ハンドルの漏出はなし。

### [W-A1] FIXED
`note/schema.ts:14` で `visibilitySchema` を export、`view/schema.ts:2` で import。既存利用箇所（`note/schema.ts:72,101`）の意味は不変。

### [W-T1 / W-T2] FIXED
`createSavedView.test.ts` / `updateSavedView.test.ts` が populated visibilityFilter のエンドツーエンド永続化と、不正値の `BusinessRuleError` 拒否パスを両方カバー。

### [N-D6] FIXED
`entity.test.ts` で `repairBrokenConditions` が tagIds をクリアしても visibilityFilter を保持することを pin。

### [N-A5] FIXED
`listSelectors.test.ts` で multi-element の `visibilityFilter` から URL `visibility` への first-wins 射影を ADR-002 コメント付きで pin。

## 品質ゲート

- `pnpm typecheck`: pass
- `pnpm test:unit`: 86 files / 1367 tests pass
- 変更ファイル単位の lint: clean（`pnpm lint` 全体は環境起因 OOM、本 PR とは無関係）
- plan / ADR-001~003 との乖離なし

## Notes

- **[N-001]** `app/components/publication/schema.ts:5` と `app/core/application/publication/eventDecoders.ts:12` で visibility enum の再宣言が残る。本 Issue のスコープ外（W-A1 の射程は SavedView 関連だけ）。完全な dedup はフォローアップ候補

---

## Design Decisions

特になし。
