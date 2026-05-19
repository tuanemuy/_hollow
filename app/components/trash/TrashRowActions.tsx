"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { purgeNoteFn, restoreNoteFn } from "@/components/note/actions";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR, PILL_BTN, ROW_ACTIONS } from "../layout/styles";

type Props = {
  noteId: string;
};

export function TrashRowActions({ noteId }: Props) {
  const router = useRouter();
  const restore = useServerFn(restoreNoteFn);
  const purge = useServerFn(purgeNoteFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);

  const onRestore = () => {
    startTransition(async () => {
      try {
        await restore({ data: { noteId, restoreDirectoryId: null } });
        await router.invalidate();
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const runPurge = () => {
    startTransition(async () => {
      try {
        await purge({ data: { noteId } });
        await router.invalidate();
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div className={ROW_ACTIONS}>
      <button
        type="button"
        className={PILL_BTN}
        onClick={onRestore}
        disabled={isPending}
      >
        復元
      </button>
      <button
        type="button"
        className={PILL_BTN}
        data-danger=""
        onClick={() => setConfirmPurgeOpen(true)}
        disabled={isPending}
      >
        完全削除
      </button>
      {error !== null ? (
        <span className={FORM_ERROR} role="alert">
          {displayError(error)}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmPurgeOpen}
        title="ノートを完全に削除"
        description="このノートを完全に削除しますか？この操作は取り消せません。"
        confirmLabel="完全削除"
        isPending={isPending}
        onConfirm={() => {
          setConfirmPurgeOpen(false);
          runPurge();
        }}
        onClose={() => setConfirmPurgeOpen(false)}
      />
    </div>
  );
}
