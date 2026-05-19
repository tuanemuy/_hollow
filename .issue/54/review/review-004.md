# PR Review #004 — Dialog 共通化（focus trap / Esc / Portal）

**PR:** #87
**Date:** 2026-05-20
**Round:** 4回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Verdict: **APPROVED**

レビュー完了。1 ラウンドで Blocker / Warning ともにゼロを達成。

---

## Frontend / A11y

### Blockers
なし

### Warnings
なし

### Notes
- W-Rob-Round3-001 (HMR コメント) 解消確認
- W-Rob-Round3-003 (Esc consume) 解消確認
- W-A11y-Round3-002 / W-Rob-Round3-002 (listener ref 化) 解消確認
- W-A11y-Round3-001 (複数 Dialog Tab トラップ協調) は progress.md にフォローアップ Issue 候補としてトラッキング済み

**Verdict: APPROVED**

---

## Frontend / Architecture

(Round 3 で APPROVED)

---

## Robustness / Edge Cases

### Blockers
なし

### Warnings
なし

### Notes
- ref-in-render パターン (`closableRef.current = closable;`) は event 駆動の handler からのみ読まれるため Concurrent rendering でも問題なし
- `closable === false` で Esc default action（`<select>` のドロップダウン閉じ等）が抑制される副作用は `isPending` 中の他操作も block される前提で許容範囲
- 既知の継続課題（複数 Dialog、AT 隔離、Safari quirk、HMR）はすべて progress.md にトラッキング済み

**Verdict: APPROVED**

---

## 完了判定

実装ガイド「Step 7: 完了判定」に従い、Round 4 で Blocker 0件 + Warning 0件を達成 → レビュー完了。

ラウンド推移:
| Round | Blockers | Warnings | Verdict |
|-------|----------|----------|---------|
| 1     | 3        | 17       | BLOCKED |
| 2     | 1        | 3        | BLOCKED |
| 3     | 0        | 4        | WARNINGS REMAIN |
| 4     | **0**    | **0**    | **APPROVED** |

主要修正:
- Round 1: 初期 focus bug (mounted 依存)、Tab トラップ両方向救済、IME composition ガード、body scroll lock counter、focusable selector に contenteditable、DialogInner の open prop 排除
- Round 2: alertdialog 初期 panel focus 時の Shift+Tab 脱出防御 (panel 自身を outside 扱い)、IME ガードを Esc 分岐内に閉じる、scroll lock SSR コメント、progress.md にフォローアップ候補追加
- Round 3: scroll lock HMR コメント、Esc consume 常時化、listener ref 化（attach 1 回のみ）

## Design Decisions
特になし。
