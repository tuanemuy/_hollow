# PR Review #001 — fix: 公開検索(P32)フィルターUIの改善

**PR:** #682
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 27
- Verdict: **BLOCKED**（Warning 2件を修正してから再レビュー）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 0 / N: 13）
- Styling: review-001-styling.md（B: 0 / W: 0 / N: 8）
- Test: review-001-test.md（B: 0 / W: 2 / N: 6）

## 指摘一覧

- [W-001] AC-11 の兄弟性アサートが文書順のみで非ネスト（包含関係）を証明していない — `app/components/public/__tests__/SearchFilterDrawer.test.tsx:138-156`（Test）
- [W-002] AC-5（7d/30d/1y）のリグレッション保証が `30d` のみに偏っている — `app/components/public/__tests__/SearchFilterDrawer.test.tsx:83-116`（Test）

## 仕分け

- W-001: **このPRで直す**（同じテストファイル内・AC-11 の保証強化。包含関係＝チップ行が FILTER_BAR_RIGHT の子孫でないことをアサート）
- W-002: **このPRで直す**（同じテストファイル内・AC-5 を 7d/1y にも広げる）
