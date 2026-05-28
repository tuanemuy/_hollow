"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { SavedViewDTO } from "@/core/application/dto/view";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { SAVED_VIEW_NAME_MAX } from "../schema";
import {
  deleteSavedViewFn,
  renameSavedViewFn,
  setDefaultSavedViewFn,
} from "./action";

type Props = { views: readonly SavedViewDTO[] };

export function SavedViewsList({ views }: Props) {
  if (views.length === 0) {
    return <p>保存ビューはまだありません。</p>;
  }
  return (
    <ul>
      {views.map((view) => (
        <SavedViewRow key={view.id} view={view} />
      ))}
    </ul>
  );
}

function SavedViewRow({ view }: { view: SavedViewDTO }) {
  const router = useRouter();
  const remove = useServerFn(deleteSavedViewFn);
  const setDefault = useServerFn(setDefaultSavedViewFn);
  const rename = useServerFn(renameSavedViewFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(view.name);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const nameId = useId();

  const runDelete = () => {
    startTransition(async () => {
      try {
        await remove({ data: { viewId: view.id } });
        await router.invalidate();
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onToggleDefault = () => {
    startTransition(async () => {
      try {
        await setDefault({
          data: {
            kind: view.kind,
            viewId: view.isDefault ? null : view.id,
          },
        });
        await router.invalidate();
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onSaveRename = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === view.name) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await rename({ data: { viewId: view.id, name: trimmed } });
        await router.invalidate();
        setError(null);
        setIsEditing(false);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const nameFieldErrors =
    error?.kind === "validation" ? error.fieldErrors?.name : undefined;
  const summary =
    error !== null && nameFieldErrors === undefined ? displayError(error) : "";

  return (
    <li>
      {isEditing ? (
        <>
          <label htmlFor={nameId}>名前</label>
          <input
            id={nameId}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={SAVED_VIEW_NAME_MAX}
            disabled={isPending}
            aria-invalid={nameFieldErrors !== undefined}
          />
          <button type="button" onClick={onSaveRename} disabled={isPending}>
            保存
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(view.name);
              setIsEditing(false);
              setError(null);
            }}
            disabled={isPending}
          >
            キャンセル
          </button>
        </>
      ) : (
        <>
          <span>{view.name}</span>
          <span>{view.kind === "personal" ? "個人" : "共有"}</span>
          <span>{view.displayMode}</span>
          {view.isDefault ? (
            <span>
              <span aria-hidden="true">★</span>
              <span>既定</span>
            </span>
          ) : null}
          {view.brokenConditions.length > 0 ? (
            <span role="alert">
              壊れた条件: {view.brokenConditions.length} 件
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            disabled={isPending}
          >
            名前変更
          </button>
          <button type="button" onClick={onToggleDefault} disabled={isPending}>
            {view.isDefault ? "既定を解除" : "既定にする"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isPending}
          >
            削除
          </button>
        </>
      )}
      {nameFieldErrors !== undefined ? (
        <p role="alert">{nameFieldErrors[0]}</p>
      ) : null}
      {summary !== "" ? <p role="alert">{summary}</p> : null}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="保存ビューを削除"
        description={`「${view.name}」を削除しますか？`}
        confirmLabel="削除"
        confirmIcon={Trash2}
        isPending={isPending}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          runDelete();
        }}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </li>
  );
}
