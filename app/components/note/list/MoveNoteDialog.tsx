"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState, useTransition } from "react";
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
import { bulkMoveNotesFn, moveNoteFn } from "../actions";
import type { FlatDirectory } from "../loaders";

type Props = {
  noteIds: readonly string[];
  open: boolean;
  onClose: () => void;
  tree: readonly FlatDirectory[];
  onMoved?: () => void;
};

export function MoveNoteDialog({
  noteIds,
  open,
  onClose,
  tree,
  onMoved,
}: Props) {
  const router = useRouter();
  const moveOne = useServerFn(moveNoteFn);
  const moveMany = useServerFn(bulkMoveNotesFn);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<SerializedError | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const targetId = useId();
  const titleId = useId();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (target === "" || noteIds.length === 0) return;
    setError(null);
    setBatchError(null);
    startTransition(async () => {
      try {
        const first = noteIds[0];
        if (noteIds.length === 1 && first !== undefined) {
          await moveOne({
            data: { noteId: first, newDirectoryId: target },
          });
        } else {
          const result = await moveMany({
            data: { noteIds: [...noteIds], newDirectoryId: target },
          });
          if (result.failures.length > 0) {
            setBatchError(
              `${result.successCount} 件成功、${result.failures.length} 件失敗`,
            );
          }
        }
        onMoved?.();
        await router.invalidate();
        onClose();
      } catch (e) {
        const err = extractSerializedError(e);
        if (
          err.kind === "validation" &&
          err.fieldErrors?.noteIds !== undefined
        ) {
          setBatchError("一度に移動できるのは 100 件までです");
        } else {
          setError(err);
        }
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
          {noteIds.length === 1
            ? "ノートを移動"
            : `${noteIds.length} 件のノートを移動`}
        </h2>
        <div className={field}>
          <label htmlFor={targetId} className={fieldLabel}>
            移動先ディレクトリ
          </label>
          <select
            id={targetId}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            className={fieldControl}
          >
            <option value="">— 選択してください —</option>
            {tree.map((dir) => (
              <option key={dir.id} value={dir.id}>
                {"  ".repeat(dir.depth)}
                {dir.path}
              </option>
            ))}
          </select>
        </div>
        {error !== null ? (
          <p className={formError} role="alert">
            {displayError(error)}
          </p>
        ) : null}
        {batchError !== null ? (
          <p className={formError} role="alert">
            {batchError}
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
            disabled={isPending || target === ""}
          >
            {isPending ? "移動中..." : "移動"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
