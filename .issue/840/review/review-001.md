# PR Review #001 — fix(editor): #840 inline rollback の道連れ消失を防止

**PR:** #845
**Date:** 2026-07-19
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1（Frontend / Test で同一指摘）
- Notes: 15
- Verdict: **BLOCKED**（Warning を修正するため再レビューへ）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] 4-T8(AC-7) の onChange assert が reconcile 経路を pin できず false green — `app/components/note/editor/__tests__/inlineEditor.test.tsx`（Frontend / Test 共通）
