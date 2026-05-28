"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { deleteDirectoryFn } from "./actions";

export type DeleteDirectoryDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  directoryId: string;
  directoryName: string;
  /** Optional callback fired after a successful delete. */
  onDeleted?: () => void;
}>;

export function DeleteDirectoryDialog({
  open,
  onClose,
  directoryId,
  directoryName,
  onDeleted,
}: DeleteDirectoryDialogProps) {
  const router = useRouter();
  const deleteDirectory = useServerFn(deleteDirectoryFn);
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteDirectory({ data: { directoryId } });
        // Sidebar の directory tree を更新するため _app も invalidate（rule 2）
        await router.invalidate();
        onDeleted?.();
        onClose();
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <ConfirmDialog
      open={open}
      title={`「${directoryName}」を削除しますか？`}
      description={
        <div className="flex flex-col gap-2">
          <p>
            このディレクトリを削除します。配下のノートはゴミ箱へ移動し、配下のディレクトリも再帰的に削除されます。
          </p>
          {error !== null ? (
            <p className="text-error text-[13px]" role="alert">
              {displayError(error)}
            </p>
          ) : null}
        </div>
      }
      confirmLabel={isPending ? "削除中..." : "削除"}
      isPending={isPending}
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
