"use client";

import { AlertTriangle, type LucideIcon } from "lucide-react";
import { useId } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { dialogActions, pillBtn, pillBtnDanger } from "./styles";

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
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "OK",
  confirmIcon,
  isPending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();

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
      ariaDescribedBy={description !== undefined ? descId : undefined}
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
