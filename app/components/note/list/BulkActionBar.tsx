"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, FolderInput, Globe, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { formError, pillBtn, pillBtnDanger } from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { bulkTrashNotesFn } from "../actions";
import type { FlatDirectory } from "../loaders";
import { BulkExportDialog } from "./BulkExportDialog";
import { BulkVisibilityDialog } from "./BulkVisibilityDialog";
import { MoveNoteDialog } from "./MoveNoteDialog";
import { useSelection } from "./SelectionContext";

type Props = {
  tree: readonly FlatDirectory[];
};

type OpenDialog = "move" | "visibility" | "export" | null;

export function BulkActionBar({ tree }: Props) {
  const router = useRouter();
  const trash = useServerFn(bulkTrashNotesFn);
  const { state, dispatch } = useSelection();
  const [open, setOpen] = useState<OpenDialog>(null);
  const [confirmTrashOpen, setConfirmTrashOpen] = useState(false);
  const [error, setError] = useState<SerializedError | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (state.ids.size === 0) return null;

  const ids = [...state.ids];

  const runTrash = () => {
    setError(null);
    setBatchMessage(null);
    startTransition(async () => {
      try {
        const result = await trash({ data: { noteIds: ids } });
        if (result.failures.length > 0) {
          setBatchMessage(
            `${result.successCount} 件成功、${result.failures.length} 件失敗`,
          );
        }
        dispatch({ type: "clear" });
        await routerInvalidate(router);
      } catch (e) {
        const err = extractSerializedError(e);
        if (
          err.kind === "validation" &&
          err.fieldErrors?.noteIds !== undefined
        ) {
          setBatchMessage("一度に処理できるのは 100 件までです");
        } else {
          setError(err);
        }
      }
    });
  };

  return (
    <>
      <section
        className="sticky top-[var(--header-height)] z-[5] flex flex-wrap items-center gap-3 px-4 py-3 mb-3 bg-accent-surface rounded-md"
        aria-label="一括操作"
      >
        <span className="text-[13px] font-medium text-ink">
          {state.ids.size} 件選択中
        </span>
        <div className="inline-flex gap-1.5 flex-wrap ml-auto">
          <button
            type="button"
            className={pillBtn}
            onClick={() => setOpen("move")}
            disabled={isPending}
          >
            <Icon icon={FolderInput} />
            移動
          </button>
          <button
            type="button"
            className={pillBtn}
            onClick={() => setOpen("visibility")}
            disabled={isPending}
          >
            <Icon icon={Globe} />
            公開設定
          </button>
          <button
            type="button"
            className={pillBtn}
            onClick={() => setOpen("export")}
            disabled={isPending}
          >
            <Icon icon={Download} />
            エクスポート
          </button>
          <button
            type="button"
            className={pillBtnDanger}
            onClick={() => setConfirmTrashOpen(true)}
            disabled={isPending}
          >
            <Icon icon={Trash2} />
            {isPending ? "処理中..." : "ゴミ箱へ"}
          </button>
          <button
            type="button"
            className={pillBtn}
            onClick={() => dispatch({ type: "clear" })}
            disabled={isPending}
          >
            <Icon icon={X} />
            選択解除
          </button>
        </div>
        {error !== null ? (
          <p className={formError} role="alert">
            {displayError(error)}
          </p>
        ) : null}
        {batchMessage !== null ? (
          <p className={formError} role="status">
            {batchMessage}
          </p>
        ) : null}
      </section>
      <MoveNoteDialog
        noteIds={ids}
        open={open === "move"}
        onClose={() => setOpen(null)}
        tree={tree}
        onMoved={() => dispatch({ type: "clear" })}
      />
      <BulkVisibilityDialog
        open={open === "visibility"}
        onClose={() => setOpen(null)}
      />
      <BulkExportDialog
        open={open === "export"}
        onClose={() => setOpen(null)}
      />
      <ConfirmDialog
        open={confirmTrashOpen}
        title="一括ゴミ箱移動"
        description={`${ids.length} 件のノートをゴミ箱に移動しますか？`}
        confirmLabel="ゴミ箱へ"
        confirmIcon={Trash2}
        isPending={isPending}
        onConfirm={() => {
          setConfirmTrashOpen(false);
          runTrash();
        }}
        onClose={() => setConfirmTrashOpen(false)}
      />
    </>
  );
}
