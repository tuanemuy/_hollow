# PR Review #001 — feat(a11y): #660 表示モード segmented を APG Radio Group 化

**PR:** #774
**Date:** 2026-06-25
**Round:** 1回目

## Summary
- Blockers: 0
- Warnings: 2
- Notes: 25
- Verdict: **BLOCKED**（Warning を直して再レビュー）

## レイヤー別ファイル
- A11y: review-001-a11y.md（B: 0 / W: 0 / N: 6）
- Frontend: review-001-frontend.md（B: 0 / W: 0 / N: 12）
- Test: review-001-test.md（B: 0 / W: 2 / N: 7）

## 指摘一覧（対応方針）
- [W-001] 矢印 roving の .focus() 移動が未アサート（Test）→ **直す**（ユニットで document.activeElement を検証）
- [W-002] ArrowUp/Down 分岐・orientation vertical が未検証（Test）→ **直す**（Up/Down 回帰追加）
- [N-001] radiogroup に aria-orientation 未指定（A11y）→ **直す**（aria-orientation="horizontal" 追加、N-002 も同時解消）
- [N-005/Test] PublicTopControls 静的アサートが aria-checked 1本のみで薄い → **直す**（radiogroup/role=radio/tabindex/旧role不在を追加）
- その他 Notes（良好確認・任意）→ 見送り（記録のみ）
