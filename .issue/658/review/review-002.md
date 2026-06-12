# PR Review #002 — feat(home): P10 FilterBar「+ タグ」ゴーストチップとタグピッカー

**PR:** #665
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 10
- Verdict: **BLOCKED**（Warning 修正対象あり）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Shared: review-002-shared.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 2）

## 指摘一覧（仕分け: 全件このPRで修正）

- [FE W-001] popoverSheetPanel に env(safe-area-inset-bottom) 余白がない
- [SH W-001] refocus の focus() に preventScroll が必要
- [TS W-001] activeIndex クランプが未テスト（変異生存）
- [TS W-002] restoreFocusOnCommit デフォルト false が未固定（変異生存）
