# Frontend Review — PR #797 Round 2

**Reviewer:** Claude Code  
**Date:** 2026-06-27  
**Branch:** issue/795/polish-editor-media-upload  
**Focus:** Zero-based fresh review after Round 1 fixes

---

## Summary

Round 1 blockers ([B-001] data-disabled, [W-001] aria-label placement) have been **fully resolved**. The implementation is **architecturally sound and feature-complete**, with robust state machine design, correct a11y patterns, and mock-first compliance. All AC-1 through AC-7 are met. Two minor polish items remain; no ship-blockers.

**Blockers:** 0 / **Warnings:** 1 / **Notes:** 9

---

## Blockers

**None**

---

## Warnings

### [W-001] `data-disabled` attribute value uses `true` instead of empty string per CLAUDE.md convention

**Description:**  
The `data-disabled` attribute is rendered with a boolean `true` value instead of an empty string `""` when the condition is met:

```jsx
// Current (line 232-234)
data-disabled={state.kind === "uploading" || disabled === true || undefined}
```

This renders as `data-disabled="true"` when disabled, vs. the CLAUDE.md convention of `data-x=""` for "statically-on" attributes.

**Location:**  
`app/components/note/editor/MediaUploader.tsx:232–234`

**Why:**  
CLAUDE.md (line 48–53) documents: `data-x={value || undefined}` for dynamic state, `data-x=""` for statically-on attributes. The current expression `a || b || undefined` yields a boolean `true` (not an empty string or value). While Tailwind's `data-[disabled]:` variant tests for **attribute presence, not value** (so both "true" and "" work functionally), the convention should use `""` for clarity and consistency.

**Proposal:**  
Refactor the expression to:
```jsx
data-disabled={state.kind === "uploading" || disabled ? "" : undefined}
```

This explicitly renders `data-disabled=""` (present) or no attribute (absent), matching the documented pattern.

**Note:** Tests expect `getAttribute("data-disabled") === "true"` (line 473 in MediaUploader.test.tsx), so this refactor will require updating that assertion to `=== ""` as well.

---

## Notes

### [N-001] Round 1 blocker [B-001] fully resolved

The `data-disabled` attribute is now present on the dropzone `<label>` (line 232–234), and the `DROPZONE` constant in `common/styles.ts:554` correctly includes `data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled` CSS. Interaction suppression during uploading and disabled states is working as designed.

**Location:** `MediaUploader.tsx:228–256` (label with data-disabled), `common/styles.ts:553–554` (DROPZONE constant).

---

### [N-002] Round 1 warning [W-001] resolved: aria-label now on visible label, not hidden input

The `aria-label="メディアを挿入"` is correctly placed on the visible `<label>` element (line 238), not the hidden `<input>` (which carries no aria-label). Accessible name is correct: screen readers announce the label's aria-label when focusing the dropzone.

**Location:** `MediaUploader.tsx:228–239`.

---

### [N-003] Round 1 warning [W-002] resolved: formatMegabytes duplication eliminated

The `formatMegabytes` function is no longer defined twice. It is defined once in `media/validation.ts:23–25` and correctly imported by `MediaUploader.tsx:25–26`. No code duplication; proper SSOT.

**Location:** `media/validation.ts:23–25` (source), `MediaUploader.tsx:25–26` (import).

---

### [N-004] State machine (idle | uploading | error | done) correctly implemented

The `UploadState` type (lines 50–75) cleanly separates four mutually exclusive states with appropriate payloads:
- **idle**: optionally carries `validationRejection` (reason, sizeLabel, filename) to show error banners while keeping dropzone visible.
- **uploading**: carries file, mediaKind, progress (number | null), and thumbnailUrl for preview rendering.
- **error**: carries SerializedError and lastFile/lastKind for retry.
- **done**: carries filename for success confirmation.

No dead states (e.g., `selected` is correctly absent per plan revisions). Transitions follow the design: idle → uploading (validation pass) / idle with rejection (validation fail) → done (success) / error (failure). Re-selection from done/error/rejection returns to idle. Correct.

**Location:** `MediaUploader.tsx:50–75` (type), `128–190` (transitions in runUpload).

---

### [N-005] Validation rejection correctly held in idle state with optional payload

The `validationRejection` field on the idle state (line 53–57) allows validation errors (unsupported format, oversized) to be displayed without transitioning out of idle. This keeps the dropzone visible so users can immediately re-select a valid file. Banner and dropzone are correctly rendered together in the idle state (lines 261–306). Next selection clears the rejection and allows new file handling. Solid design.

**Location:** `MediaUploader.tsx:53–57` (type), `135–142` (setState on validation fail), `261–306` (conditional render).

---

### [N-006] ObjectURL lifecycle correctly managed in single useEffect cleanup

The thumbnail URL (`state.thumbnailUrl`) is created via `URL.createObjectURL(file)` (line 149, image kind only) and cleaned up in a single `useEffect` hook (lines 119–126) that runs whenever state changes. The cleanup function revokes the URL only once per state transition, avoiding double-revoke or leak. The dependency is `[state]` (all state changes trigger cleanup if leaving uploading state), not per-handler cleanup. Correct per plan S-005.

**Location:** `MediaUploader.tsx:119–126` (useEffect cleanup), `147–150` (createObjectURL).

---

### [N-007] Second-upload guard implemented via early-return in all handlers

Each event handler (`onDragOver` line 193, `onDragLeave` line 199, `onDrop` line 204, `onChange` line 212) checks `if (state.kind === "uploading") return` at the top, preventing nested `runUpload` calls. Combined with the `data-disabled` visual feedback, the dropzone cannot be triggered while uploading. Robust against double-click / double-drop during in-flight upload.

**Location:** `MediaUploader.tsx:192–222` (handlers).

---

### [N-008] ALERT banner styling correctly uses shared ALERT_* primitives

Validation rejection (unsupported/oversized), error, and success banners all use the shared `ALERT` + `ALERT_ICON` + `ALERT_CONTENT` structure (lines 263–305 for validation, `RetryableError` for error, lines 317–333 for success). Visual consistency with ingestion's UploadForm is maintained. Icons are from lucide-react (AlertCircle/AlertTriangle/CheckCircle2). Correct banner strategy per ADR-001.

**Location:** `MediaUploader.tsx:260–333` (banner renders).

---

### [N-009] a11y: aria-live, role, and ProgressBar decorative mode correctly used

- **aria-live:** progress text (line 365) has `aria-live="polite"` to announce "アップロード中…" state changes; percent is aria-hidden.
- **role:** validation/error banners have `role="alert"` (lines 268, and RetryableError); success has `role="status"` + `aria-live="polite"` (lines 319–320).
- **ProgressBar:** rendered with `decorative={true}` (line 360), so it carries `aria-hidden` and does not announce itself; the adjacent live-region text carries the announcement. No double-announce.
- **Accessible label:** dropzone has `aria-label="メディアを挿入"` (line 238); input is hidden but associated via `htmlFor`/`id` (lines 250, 229).
- WCAG 2.1 practices are followed. Correct per AC-6.

**Location:** `MediaUploader.tsx:228–376` (full component).

---

### [N-010] DROPZONE constant shared across editor + ingestion

The `DROPZONE` utility string moved from ingestion's two consumers (UploadForm, UploadDialog) to `common/styles.ts:553–554` and is imported by all three (MediaUploader, UploadForm, UploadDialog). No divergence; visual SSOT is maintained. ADR-001 achieved.

**Location:** `common/styles.ts:553–554` (definition), `MediaUploader.tsx:17` (import), verified in UploadForm.tsx and UploadDialog.tsx (PR diff).

---

### [N-011] BYTE_SIZE_MAX exported and used as clien-side/server validation SSOT

`BYTE_SIZE_MAX` (5 GiB) is exported from `media/schema.ts:5` and imported by `validateMediaFile` (line 1 in validation.ts) and by `MediaUploader` (line 23). Client validation uses the same constant as the server's presign schema, guaranteeing "client-pass → server-pass" contract per ADR-002. No duplicate limits; single source of truth.

**Location:** `media/schema.ts:5` (export), `media/validation.ts:44` (size check).

---

### [N-012] validateMediaFile correctly isolates single-file media-specific validation

The `validateMediaFile` function (media/validation.ts:37–55) validates format (image/* | video/*) and size independently. No coupling to ingestion's `IngestionService.detectKind` (which is multi-format + custom logic). Single-file design (returns one result per call, not array) fits editor UX. Clean separation per ADR-001.

**Location:** `media/validation.ts:37–55`.

---

### [N-013] Props contract {contentHtml, onInsert, disabled} and onInsert signature unchanged

`MediaUploaderProps` type (lines 44–48) is identical to pre-refactor; NoteEditor.tsx has **zero changes** (verified via git diff, no output = no changes). All three modes (WYSIWYG `setImage`, HTML `setHtmlDraft`, inline `setContent`) continue to work without modification to the parent. AC-5 achieved.

**Location:** `MediaUploader.tsx:44–48` (props type), `NoteEditor.tsx` (unchanged).

---

## Detailed AC Checklist

| AC | Requirement | Status | Notes |
|----|---|---|---|
| AC-1 | Dropzone + click-to-select + drag-and-drop | ✅ | Label wraps input, onDrop handler, native file picker, data-dragover visual feedback. |
| AC-2 | Preview (filename + size, image=thumbnail, video=icon) + progress concurrent | ✅ | Uploading state renders preview (12x12 img or play icon) + progress bar + filename/size. Preview inline with progress, not separate step. |
| AC-3 | Client format/size validation + ALERT banner (unsupported/oversized) | ✅ | validateMediaFile checks MIME type and BYTE_SIZE_MAX; rejection held in idle state with conditional banner. |
| AC-4 | progress / error / success states clearly presented | ✅ | ProgressBar (decorative), RetryableError (role=alert), ALERT_SUCCESS (role=status). Mutually exclusive rendering. |
| AC-5 | Props contract unchanged, insertion flow unbroken | ✅ | Props type unchanged, NoteEditor unchanged, insertMediaIntoHtml flow intact. |
| AC-6 | a11y: live-region, labels, TOUCH_TARGET, role, etc. | ✅ | aria-live on progress text, htmlFor/useId on dropzone, role=alert/status/progressbar on banners, ProgressBar decorative to avoid double-announce. Retry pill button inherits TOUCH_TARGET from pillBtn. |
| AC-7 | Implementation matches P12-editor.html mock | ✅ | All states (idle/uploading/error/done) match mock visuals: dropzone with dashed border, preview with thumbnail/icon, progress bar, ALERT banners, success confirmation. |
| AC-8 | typecheck / lint / format pass | ⏳ | No syntax/type errors observed in code review; CI must confirm. |

---

## Recommendation

**Ship-ready after one cosmetic refinement:**

The only outstanding item is [W-001]: refactor `data-disabled` to use `""` instead of boolean `true` for CLAUDE.md convention compliance. This is a low-priority polish point (functionally equivalent, tests will need updating). No architectural or AC blockers.

After that refinement and a final `pnpm typecheck && pnpm lint:fix && pnpm format`, the PR is ready for merge.

---

## Change Summary (Round 1 → Round 2)

- ✅ [B-001] Resolved: `data-disabled` attribute added to label, DROPZONE constant extended with CSS.
- ✅ [W-001] Resolved: `aria-label` moved from hidden input to visible label.
- ✅ [W-002] Resolved: `formatMegabytes` duplication eliminated (now imported from validation.ts).
- ✅ All AC-1 through AC-7 achieved; state machine, validation, a11y, props contract verified.

**New finding:** [W-001] (Round 2): Minor convention issue with `data-disabled={true}` vs. `data-disabled=""` — easily fixed, no functional impact.
