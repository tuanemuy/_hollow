# PR Review #008 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 8回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 23
- Verdict: **BLOCKED**（修正対象 Warning 2 — いずれも小粒）

## レイヤー別ファイル

- Domain: review-008-domain.md（B: 0 / W: 1）
- Use Case: review-008-usecase.md（B: 0 / W: 1）
- Infrastructure: review-008-infrastructure.md（B: 0 / W: 0）
- Test: review-008-test.md（B: 0 / W: 0）

## 指摘一覧

- [W-001] `isAbandonedSourceIntake` の型述語 `asset is PendingMedia` が false 分岐で不健全なナローイングを生む潜在トラップ — `service.ts`（Domain）→ このPRで修正（JSDoc 明記 or boolean 化）
- [W-001] VO 構築（DirectoryId/NoteTitle/FrontMatter/overwrite NoteId）が stage (a) の後に残っており、malformed 入力ごとに回収待ち pending 行 + blob を無駄に作る — `commitIngestionPreview.ts`（Use Case）→ このPRで修正（純粋な VO 構築を stage (a) 前へ hoist）
- 参考: [N-004]（Domain）spec/domains/media.md の `decrementRef` シグネチャ乖離は既存ドリフト（PR 起因でない）→ spec-sync 時に対応、本PRでは触らない
