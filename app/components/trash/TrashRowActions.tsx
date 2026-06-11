"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { pillBtn, pillBtnDanger } from "@/components/common/styles";
import { purgeNoteFn, restoreNoteFn } from "@/components/note/actions";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR, ROW_ACTIONS } from "../layout/styles";

type Props = {
  noteId: string;
  noteTitle: string;
};

export function TrashRowActions({ noteId, noteTitle }: Props) {
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
        await routerInvalidate(router);
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
        await routerInvalidate(router);
        setConfirmPurgeOpen(false);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div className={`${ROW_ACTIONS} max-sm:flex-wrap`}>
      <button
        type="button"
        className={pillBtn}
        onClick={onRestore}
        disabled={isPending}
        aria-busy={isPending}
      >
        <Icon icon={RotateCcw} />
        {isPending ? "復元中..." : "復元"}
      </button>
      <button
        type="button"
        className={`${pillBtn} ${pillBtnDanger}`}
        data-danger=""
        onClick={() => {
          setError(null);
          setConfirmPurgeOpen(true);
        }}
        disabled={isPending}
      >
        <Icon icon={Trash2} />
        完全に削除
      </button>
      {error !== null && !confirmPurgeOpen ? (
        <span className={FORM_ERROR} role="alert">
          {displayError(error)}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmPurgeOpen}
        title="ノートを完全に削除"
        subject={noteTitle}
        description={
          <>
            このノートを完全に削除しますか？
            <strong className="font-medium text-ink">
              この操作は取り消せません。
            </strong>
          </>
        }
        confirmLabel="完全に削除"
        confirmIcon={Trash2}
        isPending={isPending}
        error={confirmPurgeOpen ? (error ?? undefined) : undefined}
        onConfirm={runPurge}
        onClose={() => {
          setConfirmPurgeOpen(false);
          setError(null);
        }}
      />
    </div>
  );
}
