"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { HOME_SEARCH, TRASH_SEARCH } from "@/components/auth/links";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { NoteId } from "@/core/application/dto/note";
import type { Visibility } from "@/core/application/dto/publication";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { deleteNoteFn, duplicateNoteFn } from "../actions";
import { MoveNoteDialog } from "../list/MoveNoteDialog";
import type { FlatDirectory } from "../loaders";
import { formError, pillBtn, pillBtnDanger, pillBtnPrimary } from "../styles";
import { UrlCopyButton } from "./UrlCopyButton";

export type NoteActionsProps = Readonly<{
  noteId: NoteId;
  status: "active" | "trashed";
  visibility: Visibility;
  publicShareUrl: string | null;
  tree: readonly FlatDirectory[];
}>;

type OpenDialog = "move" | null;

export function NoteActions({
  noteId,
  status,
  visibility,
  publicShareUrl,
  tree,
}: NoteActionsProps) {
  const router = useRouter();
  const remove = useServerFn(deleteNoteFn);
  const duplicate = useServerFn(duplicateNoteFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [open, setOpen] = useState<OpenDialog>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const noteIdStr = noteId as unknown as string;

  // For visibility public/unlisted prefer the share URL when available;
  // private always falls back to the internal `/notes/<id>` URL. The
  // origin is resolved at click time so SSR doesn't pre-bake `location`.
  const copyUrl =
    (visibility === "public" || visibility === "unlisted") &&
    publicShareUrl !== null
      ? publicShareUrl
      : typeof location === "undefined"
        ? `/notes/${noteIdStr}`
        : `${location.origin}/notes/${noteIdStr}`;

  const runDelete = () => {
    startTransition(async () => {
      try {
        await remove({ data: { noteId: noteIdStr } });
        await router.navigate({ to: "/", search: HOME_SEARCH });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onDuplicate = () => {
    startTransition(async () => {
      try {
        const result = await duplicate({ data: { noteId: noteIdStr } });
        await router.navigate({
          to: "/notes/$noteId/edit",
          params: { noteId: result.noteId },
        });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const MENU = "inline-flex flex-wrap gap-2 my-4 mb-6 items-center";

  if (status === "trashed") {
    return (
      <div className={MENU}>
        <Link to="/trash" search={TRASH_SEARCH} className={pillBtn}>
          ゴミ箱を開く
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={MENU} role="toolbar" aria-label="ノート操作">
        <Link
          to="/notes/$noteId/edit"
          params={{ noteId: noteIdStr }}
          data-primary
          className={`${pillBtn} ${pillBtnPrimary}`}
        >
          編集
        </Link>
        <Link
          to="/notes/$noteId/publish"
          params={{ noteId: noteIdStr }}
          className={pillBtn}
        >
          公開設定
        </Link>
        <button
          type="button"
          className={pillBtn}
          onClick={() => setOpen("move")}
          disabled={isPending}
        >
          移動
        </button>
        <UrlCopyButton url={copyUrl} />
        <button
          type="button"
          className={pillBtn}
          onClick={onDuplicate}
          disabled={isPending}
        >
          複製
        </button>
        <Link
          to="/notes/$noteId/export"
          params={{ noteId: noteIdStr }}
          className={pillBtn}
        >
          エクスポート
        </Link>
        <button
          type="button"
          className={pillBtn}
          disabled
          aria-disabled="true"
          title="履歴は今後実装予定です"
        >
          履歴
        </button>
        <button
          type="button"
          className={pillBtnDanger}
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={isPending}
        >
          削除
        </button>
        {error !== null ? (
          <span className={formError} role="alert">
            {displayError(error)}
          </span>
        ) : null}
      </div>
      <MoveNoteDialog
        noteIds={[noteIdStr]}
        open={open === "move"}
        onClose={() => setOpen(null)}
        tree={tree}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="このノートをゴミ箱に移動"
        confirmLabel="ゴミ箱へ"
        isPending={isPending}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          runDelete();
        }}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
}
