"use client";

import { AlertTriangle, type LucideIcon, Trash2 } from "lucide-react";
import { useId } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import {
  ALERT,
  ALERT_BODY,
  ALERT_CONTENT,
  ALERT_ERROR,
  ALERT_ICON,
  ALERT_TITLE,
  dialogActions,
  formError,
  pillBtn,
  pillBtnDanger,
} from "./styles";

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
  /**
   * Optional name of the object the destructive action targets (a note
   * title, a `#tag`, …). When set, an error-toned `.alert` block is rendered
   * above the description showing 「削除対象」 + this name, the heading's
   * warning icon is suppressed (the alert already carries an icon), and the
   * subject id is woven into `aria-describedby` so a screen reader announces
   * what is being deleted. Leaving it unset preserves the original look and
   * behavior verbatim (backward compatible). See `.issue/542/adr.md` ADR-002.
   */
  subject?: string;
  isPending?: boolean;
  /**
   * Server error to surface inside the dialog. When set, the dialog must
   * stay open so a sighted user is not misled by "modal disappeared =
   * success". Rendered as a `role="alert"` region between the description
   * and the action row, and woven into `aria-describedby`. The calling
   * side is responsible for the open/close lifecycle: it removes the
   * `setConfirmOpen(false)` from its `catch` and only closes on success
   * (Issue #98 ADR-001).
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
 * See the `error` prop for the in-dialog error contract. `isPending` and
 * `error` are mutually exclusive in practice — by the time an error is
 * surfaced the transition has completed, so `isPending` is `false`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "OK",
  confirmIcon,
  subject,
  isPending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const subjectId = useId();
  const errorId = useId();

  // `role="alert"` already announces assertively, so the woven
  // `aria-describedby` only needs to point at the ids that are actually
  // rendered. `filter(Boolean).join(" ") || undefined` keeps the "error
  // only" case (no description) valid and never emits an empty string.
  const describedBy =
    [
      subject !== undefined ? subjectId : null,
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
        <div className="flex items-start gap-2 mb-4">
          {subject === undefined ? (
            <Icon
              icon={AlertTriangle}
              size={20}
              className="text-warning shrink-0"
            />
          ) : null}
          <h2
            id={titleId}
            className="text-lg font-medium min-w-0 [overflow-wrap:anywhere]"
          >
            {title}
          </h2>
        </div>
        {subject !== undefined ? (
          <div className={`${ALERT} ${ALERT_ERROR} mb-4`}>
            <span className={ALERT_ICON} aria-hidden="true">
              <Icon icon={Trash2} size={20} />
            </span>
            <div className={ALERT_CONTENT}>
              <p className={ALERT_TITLE}>削除対象</p>
              <p id={subjectId} className={ALERT_BODY}>
                {subject}
              </p>
            </div>
          </div>
        ) : null}
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
