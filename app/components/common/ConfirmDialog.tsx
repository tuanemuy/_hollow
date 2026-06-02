"use client";

import { AlertTriangle, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { dialogActions, formError, pillBtn, pillBtnDanger } from "./styles";

export type ConfirmDialogProps = Readonly<{
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  /**
   * Optional lucide icon rendered before `confirmLabel` on the confirm button.
   * Uses the `Icon` wrapper at default size (16) per spec §7.1 "icon + text"
   * sizing rule. Kept rendered during `isPending` so the button form stays
   * stable while only the label morphs (e.g. "リセット中...").
   */
  confirmIcon?: LucideIcon;
  isPending?: boolean;
  /**
   * Server error to surface inside the dialog. When set, the dialog must
   * stay open so a sighted user is not misled by "modal disappeared =
   * success". Rendered as a `role="alert"` region between the description
   * and the action row, and woven into `aria-describedby`. The calling
   * side is responsible for the open/close lifecycle: it removes the
   * `setConfirmOpen(false)` from its `catch` and only closes on success
   * (see Issue #98 ADR-001, which overrides Issue #55 ADR-003).
   */
  error?: SerializedError | undefined;
  onConfirm: () => void;
  onClose: () => void;
}>;

/**
 * Generic confirmation dialog used in place of `window.confirm`.
 *
 * Renders nothing when `open` is false. Pressing the confirm button (or
 * submitting via Enter inside the embedded `<form>`) calls `onConfirm`;
 * pressing cancel calls `onClose`. The confirm button always uses the
 * destructive palette — every current caller confirms a destructive
 * action (trash / purge / delete / discard) so the variant prop was
 * removed (YAGNI). Keep this in `components/common/` so all domains
 * (note / view / ingestion / trash / tag) can import it without
 * introducing a cross-domain dependency — see Issue #13 ADR-005.
 *
 * When `error` is set the dialog stays open and shows the error in a
 * `role="alert"` region: the caller must drop `setConfirmOpen(false)` from
 * its `catch` and only close on success (Issue #98 ADR-001). `isPending`
 * and `error` are mutually exclusive in practice — by the time an error is
 * surfaced the transition has completed, so `isPending` is `false`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "OK",
  confirmIcon,
  isPending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const errorId = useId();

  // `role="alert"` already announces assertively, so the woven
  // `aria-describedby` only needs to point at the ids that are actually
  // rendered. `filter(Boolean).join(" ") || undefined` keeps the "error
  // only" case (no description) valid and never emits an empty string.
  const describedBy =
    [
      description !== undefined ? descId : null,
      error !== undefined ? errorId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stop React event bubbling so a ConfirmDialog mounted inside an
    // outer form (e.g. NoteEditor / IngestionPreviewForm) does not also
    // fire that form's submit handler. Portal places this `<form>` under
    // document.body in the real DOM, but React's synthetic submit still
    // bubbles up the virtual ancestor chain.
    event.stopPropagation();
    if (isPending) return;
    onConfirm();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      role="alertdialog"
      ariaLabelledBy={titleId}
      ariaDescribedBy={describedBy}
      closable={!isPending}
    >
      <form onSubmit={submit}>
        <div className="flex items-center gap-2 mb-4">
          <Icon icon={AlertTriangle} size={20} className="text-warning" />
          <h2 id={titleId} className="text-lg font-medium">
            {title}
          </h2>
        </div>
        {description !== undefined ? (
          <div id={descId} className="text-sm text-ink-secondary">
            {description}
          </div>
        ) : null}
        {error !== undefined ? (
          <p id={errorId} role="alert" className={formError}>
            {displayError(error)}
          </p>
        ) : null}
        <div className={dialogActions}>
          <button
            type="button"
            className={pillBtn}
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={`${pillBtn} ${pillBtnDanger}`}
            data-danger=""
            disabled={isPending}
          >
            {confirmIcon !== undefined ? <Icon icon={confirmIcon} /> : null}
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
