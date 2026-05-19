# PR Review #002 — feat(issue-48): materialise search projection + drop ADR-013/014 guards

**PR:** #85
**Date:** 2026-05-20
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（修正品質が Round 1 提案を超える形で整理されている）
- Verdict: **APPROVED**

---

## Round 1 Warning 対応状況

| ID | Status | 内容 |
|----|--------|------|
| W-D-001 | ✅ | `searchOwnNotes.ts` から `as unknown as` キャスト全撤去、`Map<NoteId, Note>` でブランド型保持 |
| W-D-002 | ⏭️ | スコープ外（既存規約踏襲、別 Issue 候補。`view.ts` に branded → string キャスト残存だが JSDoc で意図明示済み） |
| W-D-003 | ✅ | `searchOwnNotes.ts:73-75` に ADR-001 参照、60-71 行にも short-circuit / drop 仕様コメント |
| W-A-001 | ✅ | `noteRepository.ts:307` wide cast 撤廃、`selectInChunks(ids, ...)` で brand 保持 |
| W-A-002 | ✅ | `runExportJob.ts:203-207` で throw 化（silent breakage 解消） |
| W-A-003 | ✅ | `it.each([90, 91, 181])` で 3 ケース化 |
| W-F-001 | ✅ | `showVisibilityBadge` prop 完全削除、chip 常時表示 |
| W-F-002 | ✅ | chip 行セパレータ整理（W-F-001 と統合） |
| W-F-003 | ✅ | `DisplayedNote` type alias 導入、view 3 種で統一 |
| W-T-001 | ✅ | W-A-003 と統合 |
| W-T-002 | ✅ | drop ケース assertion を `.toEqual([noteId(1), noteId(3)])` で構造的に固定（提案以上の精度） |
| W-T-003 | ✅ | `Number.parseInt(idStr.slice(-2), 16)` で hex 安全化 |

## 新たに見つかった Blockers
なし

## 新たに見つかった Warnings
なし

## 検証結果

- `pnpm typecheck`: PASS
- `pnpm test:unit`: 1433 tests PASS
- `pnpm test:integration`: 336 tests PASS（新規 `findByIds` の 6 ケース含む）

## Verdict

**APPROVED**

Round 1 指摘の 12 件は W-D-002（スコープ外）を除き全て修正完了。修正品質は提案を超え、`showVisibilityBadge` prop 撤廃と `DisplayedNote` 統一で view 層の型構造が簡素化された（`CalendarView` の `Props` から `kind` discriminator が消え、`useMemo` 依存配列も縮小）。

---

## Design Decisions

新規追加なし。Round 1 で記録した ADR-001/002/003/004 で意図は十分明示されている。
