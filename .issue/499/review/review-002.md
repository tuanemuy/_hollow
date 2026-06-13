# PR Review #002 — fix(ui): ノート一覧（ListView / CalendarView）のクリック領域を行全体に拡張

**PR:** #508
**Date:** 2026-06-06
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings
なし（1周目 W-001 解消。`NoteListRowBody` 上の JSDoc は1ブロックに統合され、両方の WHY を簡潔に保持）

### Notes
- 重複 JSDoc 完全解消。CLAUDE.md のコメント方針に沿う。
- grid 構造一貫（非選択=Link が `[1fr_auto]` コンテナ、選択=`<li>` `[auto_1fr]`＋button `[1fr_auto]`、checkbox は button 外でネスト回避）。
- アクセシビリティ良好（aria-label=title、stopPropagation＋テストで二重発火防御を実証）。
- スタイル規約準拠（data-* falsy 消去、utility-first、padding を Link/button 側でクリック領域=hover一致）。
- typecheck パス / 対象3ファイル lint クリーン / 新規テスト5件パス。

## Test

### Blockers
なし

### Warnings
なし（1周目 W-001/W-002 解消。構造不変条件 `rowButton.contains(checkbox) === false` を直接アサート、テスト名/コメントを実態に整合）

### Notes
- 構造アサートにより「checkbox を button 内にネストする」回帰を検出可能になった（因果の行使という本質的改善）。
- ListView/CalendarView 双方で「非選択→単一 anchor」「選択→toggle button」を網羅、ListView は aria-label=title・excerpt 内包までアサート。
- 既存テストパターン踏襲で保守性高い。
- 補足（指摘ではない）: CalendarView 側に `contains` アサートは無いが、元々二重発火問題のない構造＋title button の textContent 厳密一致で間接保証されており実害なし。

---

## Design Decisions

特になし。
