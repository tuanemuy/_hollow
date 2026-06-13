# PR Review #001 — fix(ui): フォーカス表現を caret-only 化 + グローバルリングを 2px に細線化

**PR:** #719
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2（いずれも見送り記録済み）
- Notes: 18
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1 / N: 7）
- Accessibility & Design tokens: review-001-a11y.md（B: 0 / W: 1 / N: 3）
- Mock / Spec 整合性: review-001-mock.md（B: 0 / W: 0 / N: 8）

## 指摘一覧

- [W-001/frontend] draft-color-4-neutral.html の旧4px取り残し — `spec/design/drafts/draft-color-4-neutral.html:117,181`（→ 見送り: スコープ外の配色探索アーカイブ・設計判断、ADR-006）
- [W-001/a11y] caret-only 書く面の空状態フォーカス可視性 — `app/components/note/editor/styles.ts`（→ 見送り: ADR-001 許容済み + TC-001/002 で実機検証済み）

## 仕分け結果

- Blocker: 0 件
- 修正対象 Warning: 0 件（2件とも見送り記録済み）
- → このラウンドで「直す」と仕分けた指摘ゼロ。**APPROVED**（1ラウンドでクリーン収束）

## レビューの確認事項（合格）

- AC-1〜AC-9 すべて実装で充足（3レイヤーが独立に確認）
- スコープ遵守: #689 の領分（border-hairline/rounded-md/p-4/transition）に未接触、削除は `focus-within:*` 2クラスのみ
- WCAG 2.4.11: 新値の実効コントラスト 白 ~10.4:1 / surface ~9.5:1（独自検算）で 3:1 を大幅超過、2px で最小領域も維持
- モック単体での `var(--color-accent)` 解決を全105ファイルで確認（退行なし）、旧4px残存ゼロ、連結行（admin系11件）非破壊
