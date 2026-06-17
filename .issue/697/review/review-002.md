# PR Review #002 — feat(editor): #697 FrontMatterモードを廃止しメタデータを下部に常設

**PR:** #722
**Date:** 2026-06-13
**Round:** 2回目

## Summary
- Blockers: 1
- Warnings: 1
- Notes: 10
- Verdict: **BLOCKED**

## レイヤー別ファイル
- Frontend: review-002-frontend.md（B: 1 / W: 1）
- Test: review-002-test.md（B: 0 / W: 0）

## 指摘一覧
- [B-001] W-001 の section 修正が作業ツリーに留まり未コミット（PR diff 未反映）— `app/components/note/editor/FrontMatterEditor.tsx:284`（Frontend）
- [W-001] landmark 化の回帰を pin するテストが無い — `app/components/note/editor/FrontMatterEditor.tsx:284-287`（Frontend）

## 対応方針
- B-001: section 修正をコミット・push（commit 05d95954）。
- W-001: `FrontMatterEditor.test.tsx` に landmark を pin するテストを追加。
