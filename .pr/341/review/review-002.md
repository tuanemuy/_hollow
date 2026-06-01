# PR Review #341 — feat(layout): add logout dropdown menu to header avatar

**PR:** #341  
**Date:** 2026-05-30  
**Round:** 2

---

## Summary

- **Blockers:** 0
- **Warnings:** 0
- **Notes:** 3
- **Verdict:** **APPROVED**

---

## Server Function & Presentation Layer

### Blockers

なし

### Warnings

なし

### Notes

**[N-001] Error handling now properly implemented**
- **場所:** `app/components/layout/UserMenu.tsx:5-13, 50, 72-79, 200-204`
- **理由:** Added comprehensive error handling for logout operation:
  - ✓ Imports `displayError` and `extractSerializedError` from presentation layer
  - ✓ State `logoutError` captures any thrown error from `logOut()` server function
  - ✓ try/catch block in logout onSelect properly extracts and stores error
  - ✓ Error display rendered in menu footer with `text-error` styling
  - ✓ Consistent with pattern used in `LoginForm` and `AccountDeleteForm`
  
  This brings logout error handling in line with project conventions.

**[N-002] Button disable logic remains appropriate**
- **場所:** `app/components/layout/UserMenu.tsx:193`
- **理由:** The `disabled={isPending && item.danger}` condition correctly:
  - Disables logout button during pending transition (prevents double-clicks)
  - Allows re-enabling once transition completes (either success or error)
  - If error occurs, button becomes enabled again, allowing user to retry
  - This is the right UX behavior
  
  No change needed.

**[N-003] Server function implementation unchanged and sound**
- **場所:** `app/components/layout/action.ts:24-36`
- **理由:** The `logOutFn` continues to follow all conventions. No changes were needed to the server function itself—the fix was entirely on the client side (error handling in the callback). This separation of concerns (server function is pure, client handles presentation of errors) is correct.

---

## Design Decisions

No new design decisions introduced in this round. All ADRs from Round 1 remain valid.

---

## Summary of Changes

**Round 1 → Round 2 fixes:**
- Added `logoutError` state to capture server function errors
- Added try/catch wrapper around `logOut()` + `router.invalidate()` + `router.navigate()`
- Added error display in menu panel using `displayError()`
- Imports added for `displayError` and `extractSerializedError`

All blockers from Round 1 have been resolved. Code now conforms to project error-handling conventions.

