"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import type { NoteId } from "@/core/application/dto/note";
import type { Visibility } from "@/core/application/dto/publication";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { deleteNoteFn, duplicateNoteFn } from "../actions";
import { MoveNoteDialog } from "../list/MoveNoteDialog";
import { SelectionProvider } from "../list/SelectionContext";
import type { FlatDirectory } from "../loaders";
import { UrlCopyButton } from "./UrlCopyButton";

/**
 * Operation menu for a single note on the detail page.
 *
 * Wrapped in a local `SelectionProvider` so the shared
 * `MoveNoteDialog` (originally a bulk-action component) can be reused
 * in single-note mode without dragging the home-page selection model
 * into the detail route. The dialog falls back to `noteId` when the
 * selection set is empty.
 */
export type NoteActionsProps = Readonly<{
  noteId: NoteId;
  status: "active" | "trashed";
  visibility: Visibility;
  publicShareUrl: string | null;
  tree: readonly FlatDirectory[];
}>;

type OpenDialog = "move" | null;

export function NoteActions(props: NoteActionsProps) {
  return (
    <SelectionProvider>
      <NoteActionsInner {...props} />
    </SelectionProvider>
  );
}

function NoteActionsInner({
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

  const onDelete = () => {
    if (!confirm("このノートをゴミ箱に移動しますか？")) return;
    startTransition(async () => {
      try {
        await remove({ data: { noteId: noteIdStr } });
        await router.navigate({ to: "/" });
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

  if (status === "trashed") {
    return (
      <div className="action-menu">
        <Link to="/trash" search={{ page: 1, limit: 20 }} className="pill-btn">
          ゴミ箱を開く
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="action-menu" role="toolbar" aria-label="ノート操作">
        <Link
          to="/notes/$noteId/edit"
          params={{ noteId: noteIdStr }}
          className="pill-btn primary"
        >
          編集
        </Link>
        <Link
          to="/notes/$noteId/publish"
          params={{ noteId: noteIdStr }}
          className="pill-btn"
        >
          公開設定
        </Link>
        <button
          type="button"
          className="pill-btn"
          onClick={() => setOpen("move")}
          disabled={isPending}
        >
          移動
        </button>
        <UrlCopyButton url={copyUrl} />
        <button
          type="button"
          className="pill-btn"
          onClick={onDuplicate}
          disabled={isPending}
        >
          複製
        </button>
        <Link
          to="/notes/$noteId/export"
          params={{ noteId: noteIdStr }}
          className="pill-btn"
        >
          エクスポート
        </Link>
        <button
          type="button"
          className="pill-btn"
          disabled
          aria-disabled="true"
          title="履歴は今後実装予定です"
        >
          履歴
        </button>
        <button
          type="button"
          className="pill-btn danger"
          onClick={onDelete}
          disabled={isPending}
        >
          削除
        </button>
        {error !== null ? (
          <span className="form-error" role="alert">
            {displayError(error)}
          </span>
        ) : null}
      </div>
      <MoveNoteDialog
        noteId={noteIdStr}
        open={open === "move"}
        onClose={() => setOpen(null)}
        tree={tree}
      />
    </>
  );
}
