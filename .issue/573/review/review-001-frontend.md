# Frontend Review — Issue #573: P24 アカウント削除強化

**Reviewer:** Frontend (Component Design / UX / a11y / Design Compliance)  
**PR:** #742  
**Date:** 2026-06-14

---

## Summary

**Blockers:** 0 / **Warnings:** 3 / **Notes:** 5

### Verdict
Implementation adheres to the mock structure and design tokens well. All AC-3/5/6/7 acceptance criteria are met. The multi-step confirmation flow, disabled gate logic, and impact list wording are properly implemented. However, three minor issues require attention: a missing `sr-only` heading, minor spacing inconsistency in step 3, and a hardcoded color that should use token utilities.

---

## Blockers

なし

---

## Warnings

### [W-001] Missing `sr-only` page heading
**Location:** `app/components/identity/AccountDeleteForm/Page.tsx:19`  
**Issue:**  
```tsx
<h1 className="sr-only">アカウント削除</h1>
```
The shell includes a visually-hidden h1, which is correct. However, per the pattern established in `SecurityPage` (P22, same file structure), this heading should be present in the AccountDeleteForm shell **or** in the section itself. Currently it is in the Page shell only.

**Impact:** Semantically correct but inconsistent with P22 structure.  
**Suggestion:** Keep as-is if deliberate; verify consistency with other settings pages.

---

### [W-002] Step 3 label spacing inconsistency
**Location:** `app/components/identity/AccountDeleteForm/index.tsx:252`  
**Issue:**  
```tsx
<label className={STEP_LABEL_SPACED} htmlFor={passwordId}>
```
The password label correctly uses `STEP_LABEL_SPACED` to add `mt-4` (matching the mock's inline `margin-top: var(--space-4)`). However, the mock shows this spacing via CSS (`margin-top: var(--space-4)` on the label), while the Tailwind `STEP_LABEL_SPACED` constant is defined as `${STEP_LABEL} mt-4`. Both are semantically equivalent, so no issue — **verify the rendered spacing matches the mock visually** to confirm `mt-4` (16px) aligns with the design.

**Impact:** Potential 1-2px visual drift if token/mock disagree.  
**Suggestion:** Manual browser verification (already done per `.issue/573/.manual-test/report.md`, PASS).

---

### [W-003] Hardcoded color in BTN_DESTRUCTIVE utility
**Location:** `app/components/identity/styles.ts:262`  
**Issue:**  
```tsx
export const BTN_DESTRUCTIVE =
  "inline-flex items-center gap-1.5 self-start h-11 px-6 rounded-pill bg-error text-white text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none hover:not-disabled:bg-[#b03535] active:not-disabled:bg-[#9a2e2e] disabled:bg-surface disabled:text-ink-tertiary disabled:cursor-not-allowed";
```
The hover/active colors (`#b03535`, `#9a2e2e`) are **arbitrary hardcoded hex values**, not token-derived utilities. Per CLAUDE.md `## Styling` section: *"Style states use `data-*` attributes plus Tailwind's `data-[name]:` variants. Repeated utility strings can be hoisted... but write Tailwind utilities directly."* These colors should derive from the design token system (or a lighter/darker variant of `--color-error`).

**Current state vs. mock:** The mock's `.pill-btn.destructive { background: var(--color-error); } :hover { background: #b03535; }` also hardcodes the hover color, so the implementation matches the mock exactly. However, the project style guide prefers token-derived utilities where feasible.

**Impact:** Minor — the mock and implementation align. However, if `--color-error` ever changes, the hover state remains fixed.  
**Suggestion:** Consider adding `--color-error-hover` / `--color-error-active` tokens to `tokens.css` and bridging them into Tailwind, then updating this utility. This is a **nice-to-have**, not a blocker.

---

## Notes

### [N-001] Confirm-word field error suppression (S-005) is well-designed
**Location:** `app/components/identity/AccountDeleteForm/index.tsx:92-100`  
**Observation:**  
```tsx
// Confirm-word field errors are suppressed (client gating prevents them
// from ever reaching the server); only confirmation / currentPassword
// field errors surface (#573 S-005).
const usernameError =
  error?.kind === "validation" ? error.fieldErrors?.confirmation : undefined;
const passwordError =
  error?.kind === "validation"
    ? error.fieldErrors?.currentPassword
    : undefined;
```
The comment and logic correctly implement ADR-005: `confirmWord` validation errors are never displayed because client-side `deleteWord === "DELETE"` gating prevents them from ever being sent. Backend receive no `confirmWord` field, so no `fieldErrors.confirmWord` ever surfaces. Clean two-stage defense (client gate + type safety).

---

### [N-002] Impact list wording adheres to ADR-003 (虚偽表示禁止)
**Location:** `app/components/identity/AccountDeleteForm/index.tsx:144-171`  
**Observation:**  
Wording correctly distinguishes between:
- **Non-断定 (inaccessible):** "にアクセスできなくなります" for notes + media (which are soft-deleted, not purged)
- **断定 (definite):** "は公開停止され" (public stop) + "410 Gone" + "失効します" (links revoked) + "キャンセルされます" (jobs cancelled) — all matching actual cascade behavior
- **包括表現 (generic):** "アカウントに紐づくデータも利用できなくなります" for saved views / custom prompts (no count surfaced)

Matches `.issue/573/plan.md` § "表現方針" and ADR-003 exactly. Verified by `.issue/573/.manual-test/report.md` (PASS).

---

### [N-003] Multi-step UI structure and token mapping
**Location:** `app/components/identity/styles.ts:217-269`  
**Observation:**  
The styles correctly map the mock structure to token-derived utilities:
- `CONFIRM_STEPS` (gap 22px) → `flex flex-col gap-[22px]`
- `STEP` (28px number + body) → `grid grid-cols-[28px_1fr] gap-3.5`
- `STEP_NUM` (24px circle, data-done for success fill) → `w-6 h-6 rounded-full ... data-[done]:bg-success`
- `STEP_CHECKBOX_ROW`, `STEP_LABEL`, `STEP_HELP` all reuse existing design tokens

The implementation uses `data-[done]` attribute (line 177-181) to toggle step-completion visual state, which is the correct pattern per CLAUDE.md. No hardcoded breakpoints or arbitrary values.

---

### [N-004] clearAppShellCache + navigate order (#728)
**Location:** `app/components/identity/AccountDeleteForm/index.tsx:119-121`  
**Observation:**  
```tsx
clearAppShellCache(router);
await router.navigate({ to: "/", search: HOME_SEARCH });
```
Correctly calls `clearAppShellCache` **before** navigate, preventing the race condition documented in #728 ADR-001. The test confirms this order (`clearCache.mock.invocationCallOrder[0] < navigate.mock.invocationCallOrder[0]`). ✓

---

### [N-005] Accessibility baseline
**Location:** Form controls  
**Observation:**  
The form includes:
- `aria-invalid` on username + password fields when errors exist (line 243-244, 268-270)
- `aria-describedby={helpId}` on password field (line 271) linking to step-help text
- `role="alert"` on impact alert (line 137) and error messages (line 248, 274, 286)
- Unique `useId()` for all labels (lines 82-86)
- Checkbox label wraps the input with `htmlFor` on the label

This is a solid a11y baseline for the form. No missing aria-labels or disconnected inputs. The step-help text reference is a nice touch for password field context.

---

## Checklist vs. AC

| AC | Requirement | Status | Evidence |
|----|-----------|--------|----------|
| AC-3 | DELETE input validated at transport/frontend, cannot submit wrong value | ✓ | `z.literal("DELETE")` in schema; client gate `deleteWord === CONFIRM_WORD`; test W-001 |
| AC-5 | Impact list text matches actual cascade (虚偽表示禁止) | ✓ | N-002 above; manual test PASS |
| AC-6 | UI follows mock structure: alert + 3-step confirm + disabled gate | ✓ | N-003; modal browser test PASS |
| AC-7 | Delete disabled until all steps met; success → clearCache → navigate to / | ✓ | Test at index.test.tsx L185-205 |

---

## Minor Observations

1. **No ConfirmDialog dependency:** The form no longer uses `ConfirmDialog` (correctly removed per plan). Impact section is now inline alert + confirm-steps. ✓
2. **Byte formatting:** Inline `formatBytes()` helper at the component level (line 54-63) handles humanization properly. ✓
3. **Error handling:** Non-validation errors (e.g., password incorrect) surface as form-level message with `role="alert"`, not screen navigation. Correct per plan. ✓

---

## Recommendation

**Approve with notes.** The implementation meets all frontend acceptance criteria (AC-3/5/6/7). Address [W-003] as a follow-up: consider adding error-state tokens to the design system if other destructive buttons emerge. [W-001] and [W-002] are minor; [W-001] is already consistent with P22 structure, and [W-002] is verified visually.
