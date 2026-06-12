# PR Review #002 — feat(ui): #626 確定デザインの実装反映

**PR:** #659
**Date:** 2026-06-12
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 15
- Verdict: **BLOCKED**（W 2件をこのPRで修正 → ラウンド3へ）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 0）
- A11y: review-002-a11y.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] ViewSwitcher listbox オプションの focus-visible 視認性不足（WCAG 2.4.7）— `ViewSwitcher.tsx`（A11y）→ 修正（accent inset outline、ADR-011。共通 menuItem は共通課題扱い）
- [W-001] マニュアルテスト証跡が R1 修正前の旧 aria-label 形式を記録 —（Test）→ 修正（証跡へ注記、新形式はユニットテストで契約固定）

R1 指摘の修正はすべて3レイヤーで正修正と確認済み。
