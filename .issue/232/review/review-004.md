# PR Review #004 — feat(issue/232) after review-003 fixes

**PR:** #291
**Date:** 2026-05-28
**Round:** 4回目

---

## Summary

- Blockers: 0
- Warnings: 1 (focus restore が `disabled=true` で no-op 化)
- Verdict: **BLOCKED**

## Accessibility
- **[FOCUS-FINAL-W-001]** `catch` 内の `inputRef.current?.focus()` は `startTransition` 中の `isPending=true` で input が `disabled` のため no-op になり、A11Y-R3-W-002 の意図したフォーカス復帰が動作しない可能性が高い

## 解消確認
- A11Y-R3-W-001 (エラー孤児化): `onCancel` 経由 `setRenameError(null)` で解消
- typecheck / lint / 2547 tests 通過

## 次の修正
`useEffect` で `errorPresent && !isPending` を watch して input にフォーカスを当てる方式に切り替える
