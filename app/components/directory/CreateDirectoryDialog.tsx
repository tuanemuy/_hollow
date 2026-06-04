"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useState, useTransition } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  field,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { createDirectoryFn } from "./actions";
import { DIRECTORY_NAME_MAX_LENGTH } from "./schema";

export type CreateDirectoryDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  /**
   * Parent directory id under which the new directory is created. Pass
   * the root id (`tree[0].id`) to create at top level. `null` is sent to
   * the server as a request for root placement, but in practice callers
   * always pass the explicit root id (we do not rely on the server-side
   * `null -> root` fallback).
   */
  parentId: string | null;
  parentName?: string | null;
}>;

export function CreateDirectoryDialog({
  open,
  onClose,
  parentId,
  parentName,
}: CreateDirectoryDialogProps) {
  const router = useRouter();
  const createDirectory = useServerFn(createDirectoryFn);
  const [name, setName] = useState("");
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stop React event bubbling so a Dialog mounted inside an outer form
    // (e.g. NoteEditor's form) does not also fire that form's submit handler.
    event.stopPropagation();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await createDirectory({
          data: { parentId, name: trimmed },
        });
        // Sidebar の directory tree を更新するため _app も invalidate（rule 2）
        await router.invalidate();
        onClose();
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closable={!isPending}
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          ディレクトリを新規作成
        </h2>
        {parentName !== undefined && parentName !== null ? (
          <p className="text-sm text-ink-secondary mb-2">
            作成先: {parentName}
          </p>
        ) : null}
        <div className={field}>
          <label htmlFor={nameId} className={fieldLabel}>
            ディレクトリ名
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={DIRECTORY_NAME_MAX_LENGTH}
            required
            autoFocus
            disabled={isPending}
            className={fieldControl}
          />
        </div>
        {error !== null ? (
          <p className={formError} role="alert">
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
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
            disabled={isPending || name.trim().length === 0}
          >
            {isPending ? "作成中..." : "作成"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
