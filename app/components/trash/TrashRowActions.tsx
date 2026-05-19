"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
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

  const onPurge = () => {
    if (!confirm("このノートを完全に削除しますか？この操作は取り消せません。"))
      return;
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
        onClick={onPurge}
        disabled={isPending}
      >
        完全削除
      </button>
      {error !== null ? (
        <span className={FORM_ERROR} role="alert">
          {displayError(error)}
        </span>
      ) : null}
    </div>
  );
}
