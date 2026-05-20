# PR Review #002 — feat(issue-63): add FilterBar note picker UI for referencingNoteId filter

**PR:** #103
**Date:** 2026-05-21
**Round:** 2 回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 36
- Verdict: **APPROVED**

review-001 で挙げた Warning 14 件（F-W-001/003/004/005/006、A-W-001/002/003/004/005、T-W-001/002/004/005）はすべて適切に解消。修正に伴う新規 regression は検出されず。F-W-002 / T-W-003 は計画通り見送り（合意済み）。

---

## Frontend / UX / Performance

### Blockers
なし

### Warnings
なし

### Notes
- **[F-N-001]** F-W-001: `aria-busy` は live region 側に移動、SR の都度読み上げ回避
- **[F-N-002]** F-W-002: 見送り（合意）、テスト境界 pin で代替の回帰検知強化
- **[F-N-003]** F-W-003: option map 内で `const id = item.noteId as unknown as string;` に集約
- **[F-N-004]** F-W-004: `hasListbox = status === "ready" && items.length > 0` で `aria-expanded` / `aria-controls` / `aria-activedescendant` を一括ゲート
- **[F-N-005]** F-W-005: `useEffect` リセットの意図を JSDoc で明記
- **[F-N-006]** F-W-006: `Dialog` に `closable={!isPending}` + `commit()` の `isPending` ガード → ダブル Enter で navigate 二重発火を遮断
- **[F-N-007]** Props シグネチャは `isPending?` 追加のみで FilterBar 内に閉じる（HomePage / NoteList 無改修）

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- **[T-N-001]** T-W-001: debounce 境界 99/+1 pin で 100ms ちょうど依存を排除
- **[T-N-002]** T-W-002: `vi.runAllTimersAsync()` で rejected promise を確実に排出
- **[T-N-003]** T-W-003: 見送り（合意）。`searchRef` で identity 揺れを吸収済み
- **[T-N-004]** T-W-004: `@tanstack/react-start` Proxy で `then` 除外、thenable hang 予防
- **[T-N-005]** T-W-005: ↑↓ テストで `getInput().focus()` を明示
- **[T-N-006]** 8 ケース網羅維持、密度向上
- **[T-N-007]** fake timers の順序・act ラップ・mockReset いずれも正

---

## Accessibility

### Blockers
なし

### Warnings
なし

### Notes
- **[A-N-001]** A-W-001: `SR_ONLY` クラスで visually-hidden label を結合、SC 1.3.1 違反解消
- **[A-N-002]** A-W-002: idle 中 hint は静的、loading/ready/error のみ `aria-live="polite"`、`role="alert"` は error 時のみ
- **[A-N-003]** A-W-003: listbox dangling ref 解消（hasListbox 連動）
- **[A-N-004]** A-W-004: onMouseDown (focus 維持) + onClick (commit) 分離、タッチ / Pointer Events 安全
- **[A-N-005]** A-W-005: `useEffect([hasListbox, selectedIndex])` で `scrollIntoView({block: "nearest"})`、ジャンプ抑制も両立
- **[A-N-006]** Dialog focus 復元 + `closable={!isPending}` の組み合わせで navigate 中の Esc 抑止
- **[A-N-007]** `inputMode="search"` + IME-safe Enter で Android / iOS の commit UX 一貫

---

## Design Decisions

特になし（Warning 修正で完結）。
