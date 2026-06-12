# PR Review #001 — fix(#616): ランディングページの公開検索リンクを /search へ繋ぐ

**PR:** #632
**Date:** 2026-06-10
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## General Review

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** `search={{ q: "", limit: 20 }}` は `searchSchema`（`app/routes/search.tsx:43-50`）と整合。型エラーにならず、既存パターン（`ErrorPage.tsx:32`、`PublicSearch.tsx:240`）と一致。typecheck クリーン。
- **[N-002]** `HOME_SEARCH` import はヘッダー（`LandingPage.tsx:122`）で引き続き使用、未使用にならない。
- **[N-003]** footer「エクスポート」`<li>` 削除後の JSX 構造は健全。プロダクト列は「機能 / 公開検索」の2項目。
- **[N-004]** デザインモック（desktop / mobile）の変更がコンポーネント実装と一致。feature カードの「いつでもエクスポート」説明は保持。
- **[N-005]** スコープ外の変更なし。計画の「含まれないもの」を厳守。
- **[N-006]** 計画 `.issue/616/plan.md` の4ステップを過不足なく実装。manual-test 全4 TC PASS。

---

## Design Decisions

特になし（計画時に確定済みの設計判断のみ）。
