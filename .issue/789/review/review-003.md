# PR Review #003 — feat(note): #789 タグ入力を combobox 化し見た目と入力方法を刷新

**PR:** #802
**Date:** 2026-06-28
**Round:** 3回目

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 17
- Verdict: **BLOCKED**（軽微 Warning を直して収束させるため）

## レイヤー別ファイル

- Frontend: review-003-frontend.md（B: 0 / W: 2）
- Test: review-003-test.md（B: 0 / W: 2）
- Architecture・規約: review-003-arch.md（B: 0 / W: 2）

## 指摘一覧

### Warnings（すべてこの PR で直す）
- [Frontend-W-001] 新規作成行 aria-hidden の設計意図を JSDoc 言語化 — `TagsInput.tsx`
- [Frontend-W-002] disabled 時 keydown 先頭に `if (disabled) return;` の防御追加 — `TagsInput.tsx`
- [Test-W-001] aria-controls と listbox id の実一致テスト — `TagsInput.test.tsx`
- [Test-W-002] 非選択時に data-active 属性が削除されることの explicit テスト — `TagsInput.test.tsx`
- [Arch-W-001] panelOpen が aria-expanded を反映する理由の comment 補足 — `TagsInput.tsx`
- [Arch-W-002] filterTagSuggestions の「空 draft が全件マッチを避ける」技術理由を JSDoc 1行 — `tagSuggestModel.ts`

### Notes
- Frontend 12 / Test 3 / Arch 2。良い点の確認が大半。WHY 補足系の Note は上記 Warning の JSDoc 対応に集約。残りは対応任意。
