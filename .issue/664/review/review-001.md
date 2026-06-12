# PR Review #001 — fix: P10 FilterBar タグ連続トグルの lost update を解消

**PR:** #666
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 5
- Verdict: **BLOCKED**（W-001 修正のため再レビューへ）

## レイヤー別ファイル

- General: review-001-general.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] トグルロジックが reducer と updater に重複（乖離リスク） — `app/components/note/list/FilterBar.tsx:88-93,186-196`（General）→ このPRで修正（toggleInSet 抽出）
