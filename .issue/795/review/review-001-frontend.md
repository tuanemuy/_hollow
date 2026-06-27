# Frontend Review — PR #797: refactor(note): polish the editor's media-upload UI

**Reviewer:** Claude Code  
**Date:** 2026-06-27  
**Branch:** issue/795/polish-editor-media-upload  

---

## Summary

Implementation of Issue #795 frontend requirements (dropzone, preview, validation, state machine) is **90% complete** with strong architectural alignment (CLAUDE.md, ADR-001/002, mock-first). Two issues prevent ship-readiness: (1) missing `data-disabled` attribute on dropzone label to suppress pointer-events during disabled/uploading states, and (2) aria-label placed on hidden input instead of visible label.

**Blockers:** 1 / **Warnings:** 2 / **Notes:** 11

---

## Blockers

### [B-001] Missing `data-disabled` attribute on dropzone label

**Description:**  
Per ADR and plan.md Step 5, the dropzone `<label>` must render `data-disabled={state.kind === "uploading" || disabled || undefined}` to suppress pointer-events and provide visual feedback. The attribute is absent, leaving no CSS styling to block interaction when uploading or parent-disabled.

**Location:**  
`app/components/note/editor/MediaUploader.tsx:228–234`

**Current code:**
```jsx
<label
  htmlFor={inputId}
  className={DROPZONE}
  data-dragover={isDragOver ? "" : undefined}  // ← only this
  onDragOver={onDragOver}
  onDragLeave={onDragLeave}
  onDrop={onDrop}
>
```

**Expected code:**
```jsx
<label
  htmlFor={inputId}
  className={DROPZONE}
  data-dragover={isDragOver ? "" : undefined}
  data-disabled={state.kind === "uploading" || disabled || undefined}  // ← add this
  onDragOver={onDragOver}
  onDragLeave={onDragLeave}
  onDrop={onDrop}
>
```

**Related CSS:**  
The `DROPZONE` constant in `common/styles.ts` (line 551) must also define hover/pointer-events overrides for `data-[disabled]:`:

```css
[&_input[type=file]]:hidden
data-[disabled]:pointer-events-none
data-[disabled]:opacity-disabled
```

Or similar suppression pattern. Currently the DROPZONE constant lacks any `data-[disabled]:` variant.

**Why:**  
- Handlers guard with `state.kind === "uploading"` early-return, so click/drop are functionally blocked, but **visual feedback is missing**.
- AC-6 (a11y) and plan Step 5 both mandate data-disabled for "pointer-events-none 相当でクリックも抑止".
- Without this, the label remains visually interactive while disabled, confusing the user.
- The parent `disabled` prop is ignored visually (the label doesn't dim, pointer-events aren't suppressed).

**Proposal:**  
1. Add `data-disabled={state.kind === "uploading" || disabled || undefined}` to the label.
2. Extend the `DROPZONE` constant to include `data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled` (or similar Tailwind utilities) so CSS visually suppresses interaction.

---

## Warnings

### [W-001] aria-label on hidden input instead of visible label

**Description:**  
The `<input type="file">` (hidden by DROPZONE CSS) carries `aria-label="メディアを挿入"` (line 251), but the accessible name should be on the visible `<label>` element that users interact with.

**Location:**  
`app/components/note/editor/MediaUploader.tsx:228–254`

**Current code:**
```jsx
<label htmlFor={inputId} className={DROPZONE} ...>
  <div className="text-center">
    <p>画像・動画をドラッグ&ドロップ またはクリックして選択</p>
    <p>対応形式: 画像・動画 / 1ファイルずつ</p>
  </div>
  <input
    id={inputId}
    type="file"
    aria-label="メディアを挿入"  // ← on hidden input
    ...
  />
</label>
```

**Expected behavior:**  
The label element should carry the aria-label (or the input's aria-label should be removed, with the label's text content serving as the accessible name). Screen readers should announce "メディアを挿入, button" or similar when focusing the label.

**Why:**  
- WCAG 3.2.4 (Label in Name): the visible text of the dropzone (「画像・動画をドラッグ&ドロップ」) should be in the accessible name.
- Placing aria-label on a hidden input may confuse assistive technologies about which element to announce.
- AC-6 requires proper `htmlFor`/`useId` labelling — this is partially met (the association exists) but the accessible name placement is off.

**Proposal:**  
Move `aria-label="メディアを挿入"` from the `<input>` to the `<label>`, OR remove it from the input and let the label's text content (the visible "画像・動画…") serve as the accessible name. The label-to-input association (`htmlFor`/`id`) is already correct.

---

### [W-002] Duplicate `formatMegabytes` function

**Description:**  
The `formatMegabytes(bytes: number) => string` function is defined identically in two places:
- `app/components/media/validation.ts:23`
- `app/components/note/editor/MediaUploader.tsx:103`

**Location:**  
Both files above.

**Why:**  
Code duplication is a minor code smell. Since both are used for the same purpose (human-readable MB labels), a single SSOT is better. The function is pure and small, so it could be:
1. Moved to `media/validation.ts` and imported into both files, or
2. Hoisted to a utility module (e.g., `media/formatting.ts`), or
3. Left as-is if deemed trivially small.

**Proposal:**  
Extract `formatMegabytes` to a shared location (e.g., `media/validation.ts` exports it) and import into `MediaUploader.tsx`. This follows CLAUDE.md's principle of "Shared structural primitives in `app/lib/`" or domain-scoped utilities.

---

## Notes

### [N-001] Strong state machine design (idle | uploading | error | done)

The implementation correctly abandons the `selected` state (per plan revisions), moving directly from `idle` → `uploading` after validation passes. No independent confirmation step. Preview (filename + size + thumbnail/icon) is embedded in the `uploading` state alongside progress, matching AC-2 and mock precisely. Rejection (unsupported/oversized) is correctly held in `idle` state with optional `validationRejection` payload, allowing the dropzone to remain visible for re-selection.

**Location:** `MediaUploader.tsx:46–71` (UploadState type), `128–190` (runUpload logic), `256–373` (render).

---

### [N-002] Validation rejection correctly embedded in idle state

The `idle` state carries an optional `validationRejection` field that tracks format/size failures without transitioning to `uploading`. This allows the banner to be shown alongside the dropzone, and the next file selection to overwrite the rejection. Clean state design.

**Location:** `MediaUploader.tsx:46–54`, `135–142` (setState on validation fail), `258–303` (render banner).

---

### [N-003] ALERT primitives reused correctly for consistent UX

The implementation uses `ALERT` + `ALERT_ERROR`/`ALERT_WARNING`/`ALERT_SUCCESS` + icon/content structure directly, mirroring ingestion's UploadForm. This ensures visual and textual consistency across the codebase.

**Location:** `MediaUploader.tsx:260–302` (validation banner), `313–330` (success), and RetryableError for error state.

---

### [N-004] DROPZONE constant successfully moved to common/styles.ts

The `DROPZONE` utility-class string was correctly extracted from ingestion's two locations (UploadForm:30, UploadDialog:58) and moved to `common/styles.ts:551` as the SSOT. Both ingestion components and the new editor MediaUploader now import from the shared location. The string itself is unchanged (full diff confirmed), so no regression.

**Location:** `common/styles.ts:535–552` (definition), imported by UploadForm.tsx:19, UploadDialog.tsx, MediaUploader.tsx:17.

---

### [N-005] BYTE_SIZE_MAX exported from media/schema.ts

The constant `BYTE_SIZE_MAX` (5 GiB, ADR-002) is already exported from `schema.ts:5` and imported by `validateMediaFile` in `validation.ts:1`. This ensures client and server validation use the same upper bound, satisfying the ADR requirement. No new constant was added; the existing value was simply exported.

**Location:** `media/schema.ts:5` (export), `media/validation.ts:1, 44` (import and use).

---

### [N-006] validateMediaFile single-file variant correctly isolated

The `validateMediaFile(file: File) → MediaValidationResult` function in `validation.ts` is a clean single-file variant of ingestion's multi-file `validateUploadFiles`, with its own error types and size label generation. No coupling to ingestion's `IngestionService.detectKind`; format detection is simple (`file.type.startsWith("image/")`), and size is checked against the shared `BYTE_SIZE_MAX`. This respects ADR-001 (validation logic per-domain).

**Location:** `media/validation.ts:37–55`.

---

### [N-007] ObjectURL lifecycle properly managed with useEffect cleanup

The `useEffect(() => { ... return () => revokeObjectURL(url) }, [state])` pattern correctly captures the thumbnail URL and revokes it when state transitions out of `uploading`. The cleanup runs only once per upload, avoiding double-revoke or leak. The pattern mirrors the design's S-005 recommendation.

**Location:** `MediaUploader.tsx:119–126`.

---

### [N-008] Second-upload guard implemented via handler early-return

Each handler (`onDragOver`, `onDragLeave`, `onDrop`, `onChange`) opens with a guard `if (state.kind === "uploading") return`, preventing nested runUpload calls while upload is in flight. This is complementary to the (missing) data-disabled visual feedback and keeps the state machine strictly guarded against concurrent uploads.

**Location:** `MediaUploader.tsx:130, 193, 199, 204`.

---

### [N-009] Props contract {contentHtml, onInsert, disabled} unchanged

The `MediaUploaderProps` type and `onInsert` callback signature remain identical to the pre-refactor version. NoteEditor (verified via git diff) has **zero changes**, confirming that all three modes (WYSIWYG, HTML, inline) continue to work without modification. AC-5 is fully met.

**Location:** `MediaUploader.tsx:40–44`, unaffected NoteEditor.tsx:195–223.

---

### [N-010] Mock-first design: P12-editor.html and mobile variant updated

Both desktop (`spec/design/pages/P12-editor.html:1224–1321`) and mobile (`spec/design/pages/mobile/P12-editor.html`) mocks include full media-upload UI states (idle/dropzone, uploading with image/video, validation errors, retry, success). The implementation matches all visible states and behaviours shown in the mock. AC-7 is satisfied.

---

### [N-011] Utility-first and common/styles.ts conventions followed

All styling is via Tailwind utilities in `className` strings; no new CSS files or `@apply` rules were added. The `DROPZONE` constant follows the hoist-repeated-utilities pattern documented in CLAUDE.md and `common/styles.ts` header. Minor: the `formatMegabytes` utility (W-002) could be similarly hoisted to a constant, but is currently a function in two files.

---

## Detailed AC Checklist

| AC | Requirement | Status | Notes |
|----|---|---|---|
| AC-1 | Dropzone + click-to-select | ✅ | Label wraps input, onDrop handler, native file picker via htmlFor. |
| AC-2 | Preview (filename + size, image=thumb, video=icon) + progress concurrent | ✅ | Implemented in uploading state; image uses ObjectURL createObjectURL, video/other uses lucide Play icon. |
| AC-3 | Client format/size validation + ALERT banner (unsupported/oversized) | ✅ | validateMediaFile checks MIME type and BYTE_SIZE_MAX; rejection banner in idle state. |
| AC-4 | progress / error / success states clearly presented | ✅ | ProgressBar (decorative), RetryableError, ALERT_SUCCESS banner. Mutually exclusive rendering. |
| AC-5 | Props contract unchanged, insertion flow unbroken | ✅ | Props unchanged, NoteEditor unchanged, onInsert called with correct signature. |
| AC-6 | a11y (live-region, labels, TOUCH_TARGET, role, etc) | ⚠️ | `htmlFor`/`useId` correct, `aria-live` on progress, `role="alert"`/`role="status"` on banners. **Issue:** aria-label on input not label; TOUCH_TARGET on retry button via pillBtn (inherited). |
| AC-7 | Mock matches implementation | ✅ | All states (idle/uploading/error/done) visually match P12-editor.html and mobile variant. |
| AC-8 | typecheck/lint/format pass | ⏳ | Not fully reviewable from code; CI must verify. No syntax/type errors observed. |

---

## Recommendation

**Ship-ready after blocker fixes:**

1. **[B-001]** Add `data-disabled={...}` to label and extend DROPZONE with `data-[disabled]:` CSS.
2. **[W-001]** Move `aria-label` from input to label.

After these two fixes, the implementation is robust and ready for review/merge. The **[W-002]** duplication is a polish item (low priority).

**Testing:** Manual browser test (drag/drop, error states, success) and `pnpm typecheck && pnpm lint:fix && pnpm format` must pass before merge.
