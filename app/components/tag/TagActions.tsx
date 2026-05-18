"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { deleteTagFn, renameTagFn } from "./actions";
import { MergeTagDialog } from "./MergeTagDialog";

type Props = {
  tagId: string;
  name: string;
  candidates: readonly { id: string; name: string }[];
};

export function TagActions({ tagId, name, candidates }: Props) {
  const router = useRouter();
  const renameTag = useServerFn(renameTagFn);
  const removeTag = useServerFn(deleteTagFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isMergeOpen, setIsMergeOpen] = useState(false);

  const onRename = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === name) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameTag({ data: { tagId, newName: trimmed } });
        await router.invalidate();
        setIsEditing(false);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onDelete = () => {
    if (
      !confirm(
        `タグ "#${name}" を削除します。参照ノートからも除去され、同名タグは今後自動抽出されなくなります（再追加するには手動で再作成が必要）。続行しますか？`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await removeTag({ data: { tagId } });
        await router.invalidate();
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div className="row-actions">
      {isEditing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isPending}
            // biome-ignore lint/a11y/noAutofocus: inline edit field
            autoFocus
            style={{
              height: 30,
              padding: "0 10px",
              background: "var(--color-surface)",
              border: "1px solid transparent",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
            }}
          />
          <button
            type="button"
            className="pill-btn primary"
            onClick={onRename}
            disabled={isPending}
          >
            保存
          </button>
          <button
            type="button"
            className="pill-btn"
            onClick={() => {
              setIsEditing(false);
              setDraft(name);
            }}
            disabled={isPending}
          >
            キャンセル
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="pill-btn"
            onClick={() => setIsEditing(true)}
            disabled={isPending}
          >
            リネーム
          </button>
          {candidates.length > 0 ? (
            <button
              type="button"
              className="pill-btn"
              onClick={() => setIsMergeOpen(true)}
              disabled={isPending}
            >
              統合
            </button>
          ) : null}
          <button
            type="button"
            className="pill-btn danger"
            onClick={onDelete}
            disabled={isPending}
          >
            削除
          </button>
        </>
      )}
      {error !== null ? (
        <span className="form-error" role="alert">
          {displayError(error)}
        </span>
      ) : null}
      {isMergeOpen ? (
        <MergeTagDialog
          sourceTagId={tagId}
          sourceName={name}
          candidates={candidates}
          open={isMergeOpen}
          onClose={() => setIsMergeOpen(false)}
        />
      ) : null}
    </div>
  );
}
