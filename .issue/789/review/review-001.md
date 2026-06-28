# PR Review #001 — feat(note): #789 タグ入力を combobox 化し見た目と入力方法を刷新

**PR:** #802
**Date:** 2026-06-28
**Round:** 1回目

## Summary

- Blockers: 3
- Warnings: 7
- Notes: 14
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 3 / W: 5）
- Architecture・規約: review-001-arch.md（B: 0 / W: 0）

## 指摘一覧

### Blockers（すべてこの PR で直す）
- [B-001] 候補 option クリック確定（onMouseDown preventDefault による blur 防止）のテスト欠落 — `TagsInput.test.tsx`（Test）
- [B-002] 候補なし時の ArrowUp 無視がテストされていない — `TagsInput.test.tsx`（Test）
- [B-003] disabled=true 時に候補パネルが open しないことのテスト欠落 — `TagsInput.test.tsx`（Test）

### Warnings（Test: この PR で直す / Frontend: 見送り記録）
- [W-001] draft 変化後の activeIndex=-1 保持の明示テストなし — `TagsInput.test.tsx`（Test, 直す）
- [W-002] aria-expanded=true 時に panelOpen div が DOM 描画されるか未検証 — `TagsInput.test.tsx`（Test, 直す）
- [W-003] エラーメッセージの aria-live="polite" 未アサート — `TagsInput.test.tsx`（Test, 直す）
- [W-004] 空白のみ draft のエラー非表示がコンポーネントレベルで未テスト — `TagsInput.test.tsx`（Test, 直す）
- [W-005] aria-describedby が error present 時のみ付与されることの未テスト — `TagsInput.test.tsx`（Test, 直す）
- [Frontend-W-001] 候補パネルの viewport クランプ未実装 — ADR-004 で受容済みのトレードオフ（見送り）
- [Frontend-W-002] aria-selected="false" の冗長付与 — ADR-005 で受容済みの手本準拠（見送り）

### Notes
- Frontend 10件・Test 4件（良い点・任意の追加カバレッジ提案）。対応任意。
