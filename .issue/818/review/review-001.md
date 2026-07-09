# PR Review #001 — feat(note): #818 ノート編集画面(P12)のモバイル表示を最適化

**PR:** #822
**Date:** 2026-07-10
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 17
- Verdict: **BLOCKED**（W-001 を修正するため）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Styling: review-001-styling.md（B: 0 / W: 0）

## 指摘一覧

- [W-001] 抽出した純関数 `resolveDirectoryLabel` にユニットテストが無い — `app/components/note/editor/directoryTreeModel.ts` / `__tests__/directoryTreeModel.test.ts`（Frontend）→ このPRで直す

## 仕分け

- **このPRで直す**: W-001（純関数のユニットテスト追加。同一関心・軽微）
- Notes は情報レベル。N-009（`rounded-t-lg` が mock 直角と差分・意図的差分リスト未記載）・N-010（`overflow-wrap`+`break-words` 冗長）はいずれも「対応不要」判定。実害なし。
