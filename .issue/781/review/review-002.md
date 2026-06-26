# PR Review #002 — fix(a11y): #781 データ駆動 RSC roving radiogroup の連続矢印フォーカスを復元

**PR:** #784
**Date:** 2026-06-27
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 10
- Verdict: **BLOCKED**（doc 矛盾を直すため）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 0）— 1周目 [W-001] の解消をミューテーションで確認

## 指摘一覧

- [W-001] JSDoc「Why not reuse useRovingMenu」が「segmented は focus-restore を一切必要としない」と断定し、本 PR の opt-in 復元と矛盾（doc-only） — `app/components/common/useRovingTablist.ts:16-19`（Frontend）→ round 3 直前で修正
