# PR Review #001 — feat(layout): add logout dropdown menu to header avatar

**PR:** #341
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 5
- Notes: 16
- Verdict: **BLOCKED** (Server Function層のエラーハンドリング不足のため再修正が必要)

---

## Frontend

### Blockers
なし

### Warnings

**[W-001]** User info section に明示的なセマンティック role がない
- 場所: `app/components/layout/UserMenu.tsx:181`
- 理由: `<div className={USER_MENU_INFO}>` がロール属性なし。視覚的なグループ化のみで機能的には問題ないが、`role="presentation"` で明示的にする方がベター
- 提案: `<div className={USER_MENU_INFO} role="presentation">` に変更（低優先度）

**[W-002]〜[W-005]** [その他4件のWarning - 優先度低・実装OK]

### Notes

**[N-001]** 完璧な WAI-ARIA 実装
- trigger: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, `aria-label` ✓
- menu: `role="menu"`, menuitems: `role="menuitem"` + roving tabindex ✓
- キーボード: Arrow/Home/End/Escape すべて実装 ✓

**[N-002]** JSDoc が充実
**[N-003]** `useTransition` の優れた活用
**[N-004]** DirectoryActionsMenu パターンの再利用
**[N-005]〜[N-010]** [その他6件の良い点記録]

---

## Server Function & Presentation

### Blockers

**[B-001]** ログアウト server function でエラーハンドリングが不足している
- 場所: `app/components/layout/UserMenu.tsx:75-86`（ロジック）
- 理由: `logOutFn` の呼び出しが try/catch でラップされていない。LoginForm など類似フォームはエラーハンドリング実装済み
- 提案: try/catch + error state + UI display を追加する

### Warnings
なし

### Notes
**[N-001]〜[N-006]** server function 実装・RSC 設計など正しい

---

## 修正が必要な項目

1. **B-001**: エラーハンドリングを追加
