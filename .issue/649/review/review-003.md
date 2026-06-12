# PR Review #003 — feat(ui): #626 確定デザインの実装反映

**PR:** #659
**Date:** 2026-06-12
**Round:** 3回目

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 14
- Verdict: **BLOCKED**（W 3件をこのPRで修正 → ラウンド4へ）

## レイヤー別ファイル

- Frontend: review-003-frontend.md（B: 0 / W: 1）
- A11y: review-003-a11y.md（B: 0 / W: 1）
- Test: review-003-test.md（B: 0 / W: 1）

## 指摘一覧

- [FE-W-001] エラーフォールバック h1 に overflow-wrap:anywhere がない — `HomePage.tsx`（Frontend）→ 修正
- [W-001] listbox パネルに max-height/overflow がない（WCAG 1.4.10）— `ViewSwitcher.tsx`（A11y）→ 修正（max-h-[min(60vh,400px)] + overflow-y-auto）
- [W-001] testing.md の期待結果が旧 aria-label / disabled 形式のまま —（Test）→ 修正（ADR-005/010 反映）

R2 指摘の修正は全レイヤーで正修正と確認済み。Notes（aria-pressed true 側、q-only 分岐、isPending、デデュープ契約テスト等）は軽微な持ち越しとして記録のみ。
