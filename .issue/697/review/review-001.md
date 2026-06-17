# PR Review #001 — feat(editor): #697 FrontMatterモードを廃止しメタデータを下部に常設

**PR:** #722
**Date:** 2026-06-13
**Round:** 1回目

## Summary
- Blockers: 0
- Warnings: 1
- Notes: 11
- Verdict: **BLOCKED**（Warning を修正対象とするため）

## レイヤー別ファイル
- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 0）

## 指摘一覧
- [W-001] 常設化した FrontMatter 領域に programmatic ラベルが無い — `app/components/note/editor/FrontMatterEditor.tsx:281`（Frontend）

## 対応方針
- W-001: 同一ファイル内の安価な a11y 改善でスコープ内 → このPRで修正（`<section aria-label="メタデータ">` 化）。
