# PR Review #002 — feat(note): #789 タグ入力を combobox 化し見た目と入力方法を刷新

**PR:** #802
**Date:** 2026-06-28
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 9
- Verdict: **BLOCKED**（Test Warning を直すため）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 3）
- Architecture・規約: review-002-arch.md（B: 0 / W: 0）

## 指摘一覧

### Warnings
- [W-001/Test] classifyDraft の committed 正規化ケース（#React→react の重複判定）未テスト — `tagSuggestModel.test.ts`（直す）
- [W-002/Test] filterTagSuggestions の substring（部分一致）効果が未テスト（前方一致のみ） — `tagSuggestModel.test.ts`（直す）
- [W-003/Test] nextSuggestIndex の count=1 エッジ未明示 — `tagSuggestModel.test.ts`（直す）
- [W-001/Frontend] 候補パネルの mobile viewport クランプ未実装 — ADR-004 で受容済み・AC スコープ外（見送り、Phase 4 で UX 改善 Issue を検討）

### Notes
- Frontend 4件・Test 2件・Arch 3件（コメント補足やテスト直接化の提案）。対応任意。Arch の comment 追加提案は ADR に WHY が記録済みのため、プロジェクトの最小コメント方針に従い見送り。
