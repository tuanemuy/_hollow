# PR Review #001 — feat(ui): #626 確定デザインの実装反映

**PR:** #659
**Date:** 2026-06-12
**Round:** 1回目

## Summary

- Blockers: 1
- Warnings: 8
- Notes: 14
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- A11y: review-001-a11y.md（B: 1 / W: 3）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧

- [B-001] 検索中トリガーの aria-label が可視テキスト不包含（WCAG 2.5.3）— `listSelectors.ts`（A11y、= Frontend W-002）→ 修正
- [W-001] skeleton role="status" のモック乖離・テスト未追加 — `skeletons.tsx`（Frontend）→ 修正
- [W-001] エラー時に `<h1>` が消える — `HomePage.tsx`（A11y）→ 修正
- [W-002] tablist の APG パターン不完全（矢印キー・aria-controls）—（A11y）→ 既存問題のため別Issueへ
- [W-003] disabled ビュー保存の理由が title のみ —（A11y）→ 修正
- [W-001] ViewSwitcher キーボード契約テスト未検証 —（Test）→ 修正
- [W-002] 不明 viewId の aria-selected 不整合テスト —（Test）→ 修正
- [W-003] listbox onMouseDown ガード未テスト —（Test）→ 修正
