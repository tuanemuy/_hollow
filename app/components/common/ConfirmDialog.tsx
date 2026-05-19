"use client";

import { useId } from "react";
import {
  dialog,
  dialogActions,
  dialogBackdrop,
  dialogTitle,
  pillBtn,
  pillBtnDanger,
} from "@/components/note/styles";

export type ConfirmDialogProps = Readonly<{
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
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
  isPending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();

  if (!open) return null;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    onConfirm();
  };

  return (
    <div
      className={dialogBackdrop}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description !== undefined ? descId : undefined}
    >
      <form className={dialog} onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          {title}
        </h2>
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
          <button type="submit" className={pillBtnDanger} disabled={isPending}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
