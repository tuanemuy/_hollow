# PR Review #002 — Dialog 共通化（focus trap / Esc / Portal）

**PR:** #87
**Date:** 2026-05-20
**Round:** 2回目

---

## Summary

- Blockers: 1 (新規 B-Round2-001)
- Warnings: 3 (新規)
- Notes: 多数
- Verdict: **BLOCKED**

Round 1 Blocker (B-001, B-002, B-003) はすべて解消確認。新規 Blocker は alertdialog 初期 panel フォーカス時の Shift+Tab 脱出問題で、対称な穴の検出漏れだった。

---

## Frontend / A11y

### Blockers

- **[B-Round2-001]** alertdialog の初期 panel フォーカス状態で Shift+Tab を押すと焦点がダイアログ外へ脱出する
  - 場所: `app/components/common/Dialog.tsx:128-140`
  - 理由: `role="alertdialog"` のとき初期 focus は panel 自身（`tabIndex=-1`）。`Node.contains(self)` は `true` を返すため `panel.contains(active) === true` → `activeIsOutside === false`。`active === first` も false なので preventDefault されず、ブラウザのデフォルト Shift+Tab で portal 直前の DOM 要素 = 下層ページの最後の tabbable に焦点が漏れる。Round 1 で forward 側の穴を塞いだが、対称な backward 側で同じ穴が残った
  - 提案: `activeIsOutside = !panel.contains(active) || active === panel;` として、panel 自身も「外側」扱いする

### Warnings

- **[W-Round2-001]** IME composition ガードが Tab/Shift+Tab にも適用される（handler 冒頭にあるため）
  - 場所: `Dialog.tsx:108-110`
  - 理由: IME 変換中の Tab で focus trap が一時的に効かない論理的な穴。実害は限定的（IME が Tab を消費するブラウザが多い）だが、論理的には不要な副作用
  - 提案: IME ガードを Esc 分岐内に閉じる

### Notes
- B-001 解消確認: 初期 focus effect の `[mounted, role]` 依存と `if (!mounted) return;` ガードで意図通り動作
- B-002 解消確認: Tab forward 分岐に `activeIsOutside` を追加
- B-003 解消確認: IME composition ガード追加

---

## Frontend / Architecture

### Blockers
なし

### Warnings

- **[W-Arch-cont]** Round 1 で別 Issue 候補とした項目（cross-domain import、MergeTagDialog インライン直書き、ariaLabel/h2 二重ラベリング、primary ボタン API 不一致）が progress.md に未トラッキングだった
  - 場所: `.issue/54/progress.md`
  - 理由: フォローアップ Issue 候補として整理したのに、Phase 4 で起票判定するためのリストが progress.md に書かれていない
  - 提案: progress.md に「レビューで別 Issue に切り出した項目」セクションを追加し、Phase 4 起票判定の入力にする

### Notes
- W-Arch-003 解消確認: `Omit<DialogProps, "open">` で `DialogInner` の型から `open` を排除
- ADR-013 / ADR-014 は理由・実装ともに妥当

---

## Robustness / Edge Cases

### Blockers
なし（Round 1 の B-001/002/003 はすべて解消確認）

### Warnings

- **[W-Rob-cont-1]** scroll lock の module-scope mutable state が SSR / HMR 観点で説明されていない
  - 場所: `Dialog.tsx:25-29`
  - 理由: クライアント専用なので SSR では touch されないが、コード読者が読み解くのに時間がかかる。HMR 時に counter がリセットされる dev only の地雷もある
  - 提案: `let bodyScrollLockCount` の上に「クライアント専用、useEffect 内でのみ操作される」「HMR 時にカウンタがリセットされうる」旨のコメントを 1〜2 行追加

### Notes
- 残りの継続課題（AT 隔離、iOS Safari、Safari `activeElement === body`、z-index/Portal）は別 Issue 候補として既に明示

---

## このラウンドで対応する項目

1. **B-Round2-001**: `activeIsOutside = !panel.contains(active) || active === panel;` に修正
2. **W-Round2-001 / W-Rob-cont-1（IME ガードの Tab 副作用）**: IME ガードを Esc 分岐内に閉じる
3. **W-Rob-cont-1（scroll lock の SSR/HMR 説明コメント）**: モジュール変数の上にコメント追加
4. **W-Arch-cont**: progress.md に Round 1/2 で別 Issue 候補とした項目をトラッキング追加

---

## Design Decisions
特になし。すべて bug fix / clarification の範囲。
