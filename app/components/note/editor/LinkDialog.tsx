"use client";

import { useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  fieldControl,
  formError,
  pillBtn,
  pillBtnDanger,
  pillBtnPrimary,
} from "@/components/common/styles";
import { isAllowedLinkUri } from "./linkUri";

const UNSUPPORTED_SCHEME_MESSAGE =
  "対応していない URL スキームです (http / https / mailto / 相対 URL のみ)";

/**
 * WYSIWYG link insert / edit dialog (Issue #825) — replaces the native
 * `window.prompt` (URL entry) + `window.alert` (unsupported-scheme warning)
 * with an in-app `Dialog` (bottom sheet on mobile). Owns only the URL text
 * input, `isAllowedLinkUri` validation and the inline `role="alert"` error;
 * the actual TipTap `setLink` / `unsetLink` commands stay in the parent
 * `WysiwygEditor` (`onSubmit` / `onRemove`), so no editor instance is handed
 * to the dialog.
 *
 * Rendered only while a link edit is pending (mount == open), so the URL input
 * seeds from `initialHref` on each open without a reset effect.
 */
export type LinkDialogProps = Readonly<{
  /** Current href when editing an existing link; empty for a fresh insert. */
  initialHref: string;
  /** Whether the selection already carries a link (drives the 解除 button). */
  hasLink: boolean;
  onSubmit: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}>;

export function LinkDialog({
  initialHref,
  hasLink,
  onSubmit,
  onRemove,
  onClose,
}: LinkDialogProps) {
  const titleId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialHref);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stop React event bubbling so this dialog's submit does not also fire the
    // enclosing NoteEditor `<form>` submit (the Portal places the form under
    // document.body in the real DOM, but React's synthetic submit still
    // bubbles up the virtual ancestor chain — mirrors ConfirmDialog).
    event.stopPropagation();
    const trimmed = url.trim();
    if (trimmed.length === 0 || !isAllowedLinkUri(trimmed)) {
      setError(UNSUPPORTED_SCHEME_MESSAGE);
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabelledBy={titleId}
      initialFocusRef={inputRef}
      closeOnBackdropClick
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          {hasLink ? "リンクを編集" : "リンクを挿入"}
        </h2>
        <input
          ref={inputRef}
          // Not `type="url"`: the browser's native constraint validation would
          // reject relative / fragment / query URLs (`/foo`, `#sec`, `?q=x`)
          // that `isAllowedLinkUri` explicitly allows, blocking submit before
          // our own guard runs (#825 B-001). `inputMode="url"` keeps the mobile
          // URL soft keyboard; scheme validation lives solely in `submit`.
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error !== null) setError(null);
          }}
          placeholder="https://example.com"
          aria-label="リンク URL"
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? errorId : undefined}
          className={fieldControl}
        />
        {error !== null ? (
          <p id={errorId} role="alert" className={formError}>
            {error}
          </p>
        ) : null}
        <div className={dialogActions}>
          <button type="button" className={pillBtn} onClick={onClose}>
            キャンセル
          </button>
          {hasLink ? (
            <button
              type="button"
              data-danger=""
              className={`${pillBtn} ${pillBtnDanger}`}
              onClick={onRemove}
            >
              解除
            </button>
          ) : null}
          <button
            type="submit"
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
          >
            {hasLink ? "更新" : "挿入"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
