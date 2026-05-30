"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, FolderInput, Globe, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { formError } from "@/components/common/styles";
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

// Design-compliant dark pill, sticky to the viewport bottom
// (`spec/design/pages/P10-home.html` `.bulk-bar`). On mobile the bar
// shrinks to the viewport width and its actions scroll horizontally.
const BULK_BAR =
  "sticky bottom-4 z-40 mx-auto mt-6 flex items-center gap-4 max-w-[720px] rounded-pill bg-ink text-white pl-5 pr-2 py-2 shadow-md max-sm:max-w-[calc(100vw-32px)] max-sm:gap-2 max-sm:pl-3 max-sm:pr-2";

const BULK_COUNT = "text-sm font-medium shrink-0 whitespace-nowrap";

const BULK_ACTIONS =
  "inline-flex items-center gap-1 ml-auto overflow-x-auto flex-nowrap";

const BULK_ACTION =
  "h-8 px-3 rounded-pill text-white text-[13px] font-medium inline-flex items-center gap-[5px] whitespace-nowrap shrink-0 transition-colors motion-reduce:transition-none hover:not-disabled:bg-white/12 disabled:opacity-55 disabled:cursor-not-allowed data-[danger]:hover:not-disabled:bg-error/60";

const BULK_DIVIDER = "w-px h-[18px] bg-white/20 mx-1 shrink-0";

export function BulkActionBar({ tree }: Props) {
  const router = useRouter();
  const trash = useServerFn(bulkTrashNotesFn);
  const { state, dispatch } = useSelection();
  const [open, setOpen] = useState<OpenDialog>(null);
  const [confirmTrashOpen, setConfirmTrashOpen] = useState(false);
  const [error, setError] = useState<SerializedError | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Mounted for the whole duration of selection mode so the bar stays a
  // stable anchor; actions disable themselves when nothing is selected
  // (Issue #354 ADR-005). The trailing × exits selection mode entirely.
  if (!state.mode) return null;

  const ids = [...state.ids];
  const hasSelection = ids.length > 0;

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
      <section className={BULK_BAR} aria-label="一括操作">
        <span className={BULK_COUNT}>{state.ids.size} 件選択中</span>
        <div className={BULK_ACTIONS}>
          <button
            type="button"
            className={BULK_ACTION}
            onClick={() => setOpen("move")}
            disabled={isPending || !hasSelection}
          >
            <Icon icon={FolderInput} />
            移動
          </button>
          <button
            type="button"
            className={BULK_ACTION}
            onClick={() => setOpen("visibility")}
            disabled={isPending || !hasSelection}
          >
            <Icon icon={Globe} />
            公開設定
          </button>
          <button
            type="button"
            className={BULK_ACTION}
            onClick={() => setOpen("export")}
            disabled={isPending || !hasSelection}
          >
            <Icon icon={Download} />
            エクスポート
          </button>
          <div className={BULK_DIVIDER} aria-hidden="true" />
          <button
            type="button"
            className={BULK_ACTION}
            data-danger=""
            onClick={() => setConfirmTrashOpen(true)}
            disabled={isPending || !hasSelection}
          >
            <Icon icon={Trash2} />
            {isPending ? "処理中..." : "ゴミ箱へ"}
          </button>
          <button
            type="button"
            className={BULK_ACTION}
            aria-label="選択モードを終了"
            onClick={() => dispatch({ type: "exitSelectMode" })}
            disabled={isPending}
          >
            <Icon icon={X} />
          </button>
        </div>
      </section>
      {error !== null ? (
        <p className={`${formError} text-center`} role="alert">
          {displayError(error)}
        </p>
      ) : null}
      {batchMessage !== null ? (
        <p className={`${formError} text-center`} role="status">
          {batchMessage}
        </p>
      ) : null}
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
