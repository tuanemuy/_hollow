# PR Review #002 — feat(issue/232) after review-001 fixes

**PR:** #291
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 多数（修正の妥当性確認）
- Verdict: **BLOCKED** (Warnings residue)

---

## Frontend (2 W)

- **[FE-R2-W-001]** `MoveDirectoryDialog.options` の `depth` フィールドが dead field
- **[FE-R2-W-002]** `schema.ts` のコメント "Mirrors the domain invariant" が max length と乖離（schema=100 / domain=80）

## Accessibility (3 W)

- **[A11Y-R2-W-001]** inline rename の `useEffect(link.focus())` が blur 経由コミット時に Tab 移動先を上書きする
- **[A11Y-R2-W-002]** `aria-describedby` / `aria-invalid` が catch 直後 `onDone()` で unmount され実質 no-op
- **[A11Y-R2-W-003]** `DirectoryActionsMenu` の `onBlur` が Safari/Firefox の `<button>` クリック挙動で menu を premature に閉じる懸念

## Architecture (1 W)

- **[ARCH-R2-W-001]** schema の `DIRECTORY_NAME_MAX_LENGTH = 100` vs domain `valueObject.ts` の `= 80` の食い違い（FE-R2-W-002 と同じ）

## 解消済み（1周目より）
- ARCH-B-001 (form-in-form): ConfirmDialog の `event.stopPropagation()` で根本対処、副作用なし
- FE-W-001 (active style): TREE_ITEM_LINK へ移譲、リグレッション解消
- FE-W-002 (二重 commit): committedRef ガード
- A11Y-W-001/004 (menu/dialog focus restore): runAndClose 順序修正 + 初期 menuitem focus
- A11Y-W-002 (rename後 focus 復帰): wasRenamingRef + itemRef
- A11Y-W-003 (aria-describedby): errorId 連携追加（W-002 で no-op 指摘あり、再修正必要）
- A11Y-W-005 (空状態 CTA disabled)
- A11Y-W-007 (Move select whitespace 除去)
- ARCH-W-001 (focus-out close)
- ARCH-W-003 (transport 禁止文字 regex)
- errorResponse: `extractSerializedError` の plain SerializedError パススルー（presentation 共通基盤の妥当な改善）

---

## Design Decisions

- schema の `DIRECTORY_NAME_MAX_LENGTH` を 80 (domain と一致) に揃える方針 — 次のラウンドで反映
