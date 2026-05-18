# PR Review #002 — feat(note): P11 detail link to referencing-note filter + chip title resolver (#32)

**PR:** #62
**Date:** 2026-05-19
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## Round 1 Warning 解消状況

| ID | 内容 | 検証 | 解消 |
|----|------|------|------|
| W-F1 | `.meta-panel-referencing` CSS 未定義 | `app/styles/app.css:636-643` に `.meta-panel-referencing { flex-basis: 100%; margin-top: var(--space-1); }` + `.meta-panel-referencing a { color: var(--color-accent); font-size: 12px; }` 追加。`.meta-panel-backlinks` 流儀と整合 | ✅ |
| W-F2 | `<Link search>` で HOME_SEARCH 未使用 | `NoteMetaPanel.tsx:2` で import 追加、line 118 で `search={{ ...HOME_SEARCH, referencingNoteId: noteIdStr }}` | ✅ |
| W-F3 | `as unknown as string` キャスト散発 | 関数本体冒頭で `const noteIdStr = noteId as unknown as string;` を抽出、参照箇所で使い回し | ✅ |
| W-S1 | docs の挙動説明が誤り | `testing.md` 項目 6 / `TC-06.md` / `plan.md` Step 2 で「`NoteId.create` は trim/length チェックのみで UUID 形式は検証しない → `findById` が 0 件 → `null` フォールバック」へ修正 | ✅ |

---

## 新規 Blockers / Warnings

- 新規 Blockers: なし
- 新規 Warnings: なし

---

## Notes

- **[N-R2-1]** `noteIdStr` 抽出パターンが `NoteActions.tsx:43` と一致。backlink リスト内の per-element cast はループスコープで意味的に妥当な散在
- **[N-R2-2]** CSS 追加 2 ルールは `.meta-panel-backlinks` 系と完全に対称。`margin-top: var(--space-1)` は補助リンクとして妥当なリズム
- **[N-R2-3]** server-side（`loaders.ts` / `routes/index.tsx`）は無変更で、W-S1 の指摘どおり「docs を直すだけ」の修正範囲に閉じた
- **[N-R2-4]** typecheck / lint / format / test:unit すべて pass。新規回帰なし

---

## 結論

Round 1 で指摘した 4 件の Warning すべて期待どおり修正。新規問題なし。マージ可。
