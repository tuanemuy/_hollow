# PR Review #001 — feat: 公開検索(P32)にソート選択肢（関連度順/新着順）を追加

**PR:** #674
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 27
- Verdict: **BLOCKED**（Warning 全件をこのPRで修正）

## レイヤー別ファイル

- Domain/UseCase: review-001-domain-usecase.md（B: 0 / W: 1）
- Adapter: review-001-adapter.md（B: 0 / W: 2）
- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧（全件「このPRで直す」）

- [W-001/du] spec/domains/search.md の SearchQuery フィールド一覧に dateBasis / directoryPathPrefix 欠落
- [W-001/adapter] LIKE 経路の newest ページネーション連続性テストなし
- [W-002/adapter] tie-breaker テストの期待値導出がトートロジー気味
- [W-001/frontend] SearchSortToggle に pending/optimistic フィードバックなし（SearchFilterDrawer のパターンから逸脱）
- [W-001/test] sort切替の navigate reducer（cursorリセット・sort除去）に unit テストなし
- [W-002/test] 明示的 sort:"relevance" と LIKE×relevance の安定順が未検証
- [W-003/test] ページ境界に同時刻 tie がある場合の連続性未検証
