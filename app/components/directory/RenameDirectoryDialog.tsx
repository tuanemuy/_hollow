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
import { renameDirectoryFn } from "./actions";
import { DIRECTORY_NAME_MAX_LENGTH } from "./schema";

export type RenameDirectoryDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  directoryId: string;
  currentName: string;
}>;

export function RenameDirectoryDialog({
  open,
  onClose,
  directoryId,
  currentName,
}: RenameDirectoryDialogProps) {
  const router = useRouter();
  const renameDirectory = useServerFn(renameDirectoryFn);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();
  const nameId = useId();
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
    }
  }, [open, currentName]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stop React event bubbling so a Dialog mounted inside an outer form
    // (e.g. NoteEditor's form) does not also fire that form's submit handler.
    event.stopPropagation();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (trimmed === currentName) {
      onClose();
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await renameDirectory({
          data: { directoryId, newName: trimmed },
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
          ディレクトリをリネーム
        </h2>
        <div className={field}>
          <label htmlFor={nameId} className={fieldLabel}>
            新しい名前
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
            {isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
