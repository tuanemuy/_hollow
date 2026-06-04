"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { NOTE_HISTORY_SEARCH } from "@/components/auth/links";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { formError, pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { restoreNoteRevisionFn } from "../actions";

/**
 * Client-side toolbar wrapping the "restore" action on the past-revision
 * viewer. Renders a "back to history" link unconditionally; the restore
 * button is disabled when the note is currently trashed (Issue #158
 * plan D-2) and surfaces the underlying business reason via the title
 * attribute so a screen reader / hover state explains the disabled
 * state.
 */
export type NoteRevisionRestorePanelProps = Readonly<{
  noteId: string;
  revisionId: string;
  noteStatus: "active" | "trashed";
}>;

export function NoteRevisionRestorePanel({
  noteId,
  revisionId,
  noteStatus,
}: NoteRevisionRestorePanelProps) {
  const router = useRouter();
  const restore = useServerFn(restoreNoteRevisionFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const trashed = noteStatus === "trashed";

  const runRestore = () => {
    startTransition(async () => {
      try {
        await restore({
          data: { noteId, revisionId },
        });
        await router.navigate({
          to: "/notes/$noteId",
          params: { noteId },
        });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div className="mt-4 mb-6 flex flex-wrap gap-2 items-center">
      <Link
        to="/notes/$noteId/history"
        params={{ noteId }}
        search={NOTE_HISTORY_SEARCH}
        className={pillBtn}
      >
        履歴一覧に戻る
      </Link>
      <button
        type="button"
        className={`${pillBtn} ${pillBtnPrimary}`}
        data-primary={trashed ? undefined : ""}
        onClick={() => setConfirmOpen(true)}
        disabled={trashed || isPending}
        aria-disabled={trashed ? "true" : undefined}
        title={
          trashed
            ? "ゴミ箱に入っているノートには復元できません。先にノートを復元してください。"
            : undefined
        }
      >
        この版に復元
      </button>
      {error !== null && !confirmOpen ? (
        <span className={formError} role="alert">
          {displayError(error)}
        </span>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="この版に復元しますか？"
        confirmLabel="復元する"
        confirmIcon={RotateCcw}
        isPending={isPending}
        error={confirmOpen ? (error ?? undefined) : undefined}
        onConfirm={runRestore}
        onClose={() => {
          setConfirmOpen(false);
          setError(null);
        }}
      />
    </div>
  );
}
