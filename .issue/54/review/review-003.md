# PR Review #003 — Dialog 共通化（focus trap / Esc / Portal）

**PR:** #87
**Date:** 2026-05-20
**Round:** 3回目

---

## Summary

- Blockers: 0
- Warnings (新規): 4
- Verdict: **WARNINGS REMAIN** (Architecture は APPROVED)

Round 2 Blocker (B-Round2-001) と Warning (W-Round2-001 / W-Rob-cont-1 SSR部分) は解消確認。

---

## Frontend / A11y

### Blockers
なし

### Warnings

- **[W-A11y-Round3-001]** 複数ダイアログ同時表示時の Tab トラップ協調
  - 場所: `Dialog.tsx:108-159`
  - 内容: `document` レベルの keydown listener が各 Dialog ごとに独立しており、外側 Dialog のリスナが内側 Dialog の active を「自分の panel 外」と判定して focus を奪う可能性
  - 評価: cosmetic / フォローアップ候補。現状の callsite は mutually exclusive state、scroll lock counter が cosmetic な protection を持つので実害なし。本 Issue で対応せず progress.md にフォローアップとして記載

- **[W-A11y-Round3-002]** keydown listener が `closable`/`onClose` の変化で毎レンダ re-attach（既出 W-Rob-009）

### Notes
- B-Round2-001 解消確認（panel 自身を outside 扱い）
- W-Round2-001 解消確認（IME ガードを Esc 分岐内に閉じた）

---

## Frontend / Architecture

### Blockers
なし

### Warnings
なし

Verdict: **APPROVED**

### Notes
- W-Arch-cont 解消確認: progress.md に「レビューで別 Issue に切り出した項目」セクションが追加され、6 項目（cross-domain import / MergeTag インライン / aria-labelledby 化 / primary ボタン API / AT 隔離 / iOS Safari / Dialog 単体テスト / 複数 Dialog Tab トラップ）がトラッキング済み
- 新規 architecture regression なし

---

## Robustness / Edge Cases

### Blockers
なし

### Warnings

- **[W-Rob-Round3-001]** scroll lock コメントに HMR 言及が反映されていない
- **[W-Rob-Round3-002]** keydown listener が毎レンダ re-attach（A11y-Round3-002 と同じ）
- **[W-Rob-Round3-003]** `closable === false` 時に Escape が upstream に通る

### Notes
- W-Round2-001 解消確認
- W-Rob-cont-1 部分反映（SSR 観点のみ）

---

## このラウンドで対応する項目

すべて修正適用:

1. **W-Rob-Round3-001**: scroll lock コメントに HMR 観点を追加
2. **W-Rob-Round3-003**: `event.key === "Escape"` 分岐で `event.preventDefault()` + `event.stopPropagation()` を呼ぶ（`closable` 値に関わらず常に消費）
3. **W-A11y-Round3-002 / W-Rob-Round3-002**: `closable` / `onClose` を ref 経由で参照し、keydown listener の依存配列を `[]` にする（attach 1 回のみ）
4. **W-A11y-Round3-001**: 複数ダイアログ Tab トラップ協調は本 Issue スコープ外として progress.md にトラッキング項目追加

---

## Design Decisions

特になし。すべて bug fix / 細かい改善。
