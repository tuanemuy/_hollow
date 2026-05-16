"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import type { NoteId } from "@/core/application/dto/note";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { deleteNoteFn, duplicateNoteFn } from "./actions";

type Props = {
  noteId: NoteId;
  status: "active" | "trashed";
};

export function NoteActions({ noteId, status }: Props) {
  const router = useRouter();
  const remove = useServerFn(deleteNoteFn);
  const duplicate = useServerFn(duplicateNoteFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const onDelete = () => {
    if (!confirm("このノートをゴミ箱に移動しますか？")) return;
    startTransition(async () => {
      try {
        await remove({ data: { noteId: noteId as unknown as string } });
        await router.navigate({ to: "/" });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onDuplicate = () => {
    startTransition(async () => {
      try {
        const result = await duplicate({
          data: { noteId: noteId as unknown as string },
        });
        await router.navigate({
          to: "/notes/$noteId",
          params: { noteId: result.noteId },
        });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div
      style={{
        display: "inline-flex",
        gap: "var(--space-2)",
        margin: "var(--space-4) 0 var(--space-6)",
        flexWrap: "wrap",
      }}
    >
      {status === "active" ? (
        <>
          <Link
            to="/notes/$noteId/edit"
            params={{ noteId: noteId as unknown as string }}
            className="pill-btn primary"
          >
            編集
          </Link>
          <button
            type="button"
            className="pill-btn"
            onClick={onDuplicate}
            disabled={isPending}
          >
            複製
          </button>
          <button
            type="button"
            className="pill-btn danger"
            onClick={onDelete}
            disabled={isPending}
          >
            削除
          </button>
        </>
      ) : (
        <Link to="/trash" search={{ page: 1, limit: 20 }} className="pill-btn">
          ゴミ箱を開く
        </Link>
      )}
      {error !== null ? (
        <span className="form-error" role="alert">
          {displayError(error)}
        </span>
      ) : null}
    </div>
  );
}
