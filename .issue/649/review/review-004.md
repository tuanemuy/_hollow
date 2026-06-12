# PR Review #004 — feat(ui): #626 確定デザインの実装反映

**PR:** #659
**Date:** 2026-06-12
**Round:** 4回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 4
- Verdict: **BLOCKED**（W 1件を修正 → ラウンド5へ）

## レイヤー別ファイル

- Frontend: review-004-frontend.md（B: 0 / W: 0）
- A11y: review-004-a11y.md（B: 0 / W: 1）
- Test: review-004-test.md（B: 0 / W: 0）

## 指摘一覧

- [W-001] listbox パネルの onMouseDown preventDefault がスクロールバードラッグを阻害（Firefox）— `Popover.tsx`（A11y）→ 修正（target !== currentTarget のときのみ preventDefault、Popover.test をパラメタライズ拡張で契約固定）

R3 指摘の修正は全レイヤーで正修正と確認済み。Frontend / Test は承認水準。
