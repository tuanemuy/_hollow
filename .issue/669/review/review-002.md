# PR Review #002 — fix: エディター画面（P12）のモック準拠と編集中フォーカス喪失の解消

**PR:** #676
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 9
- Verdict: **BLOCKED**（W 1件＋JSDoc 文言 N をこのPRで修正）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 0）
- State/Router: review-002-state.md（B: 0 / W: 0）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001/test] rebuild 内の debounce timer clear が未テスト（3行削除でも green）— `InlineEditor.tsx:585-587` の故障モード pin テスト追加
- [N-001/frontend, N-001/state] `routerInvalidate.ts` JSDoc「RSC tree swap remounts」が TC-009 実測補正と不整合 — 文言を弱める（修正に含める）
