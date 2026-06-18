# PR Review #001 — fix: ノート詳細パンくずの起点「すべてのノート」を廃止

**PR:** #709
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 0 / N: 5）

## 指摘一覧

- [N-001] 区切りロジックの先頭抑止/末尾ガードが独立し取りこぼし・二重区切りなし — `NoteBreadcrumb.tsx:49,60`
- [N-002] テストの区切りカウント（`span[aria-hidden]`）が Separator のみ該当し正確 — `__tests__/NoteBreadcrumb.test.tsx`
- [N-003] a11y 整合（nav/aria-current/aria-hidden 維持） — `NoteBreadcrumb.tsx:37,61`
- [N-004] スタイル規約準拠（utility-first・新規CSSなし・HOME_SEARCH 継続使用） — `NoteBreadcrumb.tsx:3,24`
- [N-005] スコープ逸脱なし、ルート直下=タイトルのみが #356 ADR-002 と整合 — `.issue/356/adr.md`

## 判定

1ラウンド目で両Blocker・Warning ともゼロ。AC-1〜AC-6 すべて実装・テストの両面で充足。修正対象の指摘なしのため完了。
