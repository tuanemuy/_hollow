# PR Review #002 — feat: #689 P12エディターをデザインモックに揃える

**PR:** #712
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 4（重複あり）
- Notes: 22
- Verdict: **BLOCKED**（Warning を修正して再レビュー）

## レイヤー別ファイル

- Frontend / UX / a11y: review-002-frontend.md（B: 0 / W: 1）
- 状態管理 / ロジック: review-002-state.md（B: 0 / W: 1）
- テスト: review-002-test.md（B: 0 / W: 2）

## 指摘一覧と仕分け（すべてこのPRで修正）

- [Frontend W-001] dropdown 内 option/ボタンに `tabIndex={-1}` がなく Tab で実フォーカスが検索 input から逃げる — `DirectoryTreeSelect.tsx:270-352` → **修正**（tabIndex=-1 付与）
- [State W-001] Round 1 で `aria-selected` を確定選択に変えた結果、active option（aria-activedescendant 対象）に aria-selected が付かず矢印ハイライトが AT に伝わらない — `DirectoryTreeSelect.tsx` → **修正**（`DirectorySelectField` 規約＝ `aria-selected={isActive}`＋`data-selected={isSelected}` に統一。Round 1 の逸脱を是正）
- [Test W-001] Rename/Delete の close→open 順序が無検証（editor は `allowExistingActions` を渡す実経路） — → **テスト追加**
- [Test W-002] 候補ゼロ検索時の listbox/aria-activedescendant ゲートが無検証 — → **テスト追加**

見送り（Note）: aria-label 系の a11y 完全性向上は横断課題。本PRスコープ外。
