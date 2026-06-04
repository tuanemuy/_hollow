"use client";

import { Check, Merge, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import {
  pillBtn,
  pillBtnDanger,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { FORM_ERROR, ROW_ACTIONS } from "../layout/styles";
import { MergeTagDialog } from "./MergeTagDialog";

type Props = {
  tagId: string;
  name: string;
  noteCount: number;
  candidates: readonly { id: string; name: string }[];
  onRename: (tagId: string, name: string) => void;
  onDelete: (tagId: string) => void;
  actionError: SerializedError | null;
};

export function TagActions({
  tagId,
  name,
  noteCount,
  candidates,
  onRename,
  onDelete,
  actionError,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const runRename = () => {
    const trimmed = draft.trim();
    // Leave the inline editor synchronously so the optimistic name (owned by
    // the parent `TagList`) renders immediately.
    setIsEditing(false);
    if (trimmed.length === 0 || trimmed === name) {
      return;
    }
    onRename(tagId, trimmed);
  };

  const runDelete = () => {
    // The row is removed optimistically the instant the delete transition
    // starts (parent-owned), so the dialog rendered inside this row unmounts;
    // close it first and let any failure surface in the row's `FORM_ERROR`
    // slot once it snaps back.
    setConfirmDeleteOpen(false);
    onDelete(tagId);
  };

  return (
    <div className={ROW_ACTIONS}>
      {isEditing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: inline edit field
            autoFocus
            className="h-7 px-2.5 bg-surface border border-transparent rounded-md text-sm text-ink outline-none focus:bg-bg focus:border-accent"
          />
          <button
            type="button"
            className={`${pillBtn} ${pillBtnPrimary}`}
            data-primary=""
            onClick={runRename}
          >
            <Icon icon={Check} />
            保存
          </button>
          <button
            type="button"
            className={pillBtn}
            onClick={() => {
              setIsEditing(false);
              setDraft(name);
            }}
          >
            キャンセル
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={pillBtn}
            onClick={() => {
              setDraft(name);
              setIsEditing(true);
            }}
          >
            <Icon icon={Pencil} />
            リネーム
          </button>
          {candidates.length > 0 ? (
            <button
              type="button"
              className={pillBtn}
              onClick={() => setIsMergeOpen(true)}
            >
              <Icon icon={Merge} />
              統合
            </button>
          ) : null}
          <button
            type="button"
            className={`${pillBtn} ${pillBtnDanger}`}
            data-danger=""
            onClick={() => setConfirmDeleteOpen(true)}
          >
            <Icon icon={Trash2} />
            削除
          </button>
        </>
      )}
      {actionError !== null && !confirmDeleteOpen ? (
        <span className={FORM_ERROR} role="alert" aria-live="polite">
          {displayError(actionError)}
        </span>
      ) : null}
      {isMergeOpen ? (
        <MergeTagDialog
          sourceTagId={tagId}
          sourceName={name}
          sourceNoteCount={noteCount}
          candidates={candidates}
          open={isMergeOpen}
          onClose={() => setIsMergeOpen(false)}
        />
      ) : null}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`タグ "#${name}" を削除`}
        description={renderDeleteDescription({ noteCount })}
        confirmLabel="削除"
        confirmIcon={Trash2}
        onConfirm={runDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

function renderDeleteDescription({
  noteCount,
}: {
  noteCount: number;
}): React.ReactNode {
  if (noteCount > 0) {
    return (
      <>
        参照ノートからも除去され、同名タグは今後自動抽出されなくなります（再追加するには手動で再作成が必要）。
        <strong>対象ノート: {noteCount} 件</strong>。続行しますか？
      </>
    );
  }

  return "参照ノートからも除去され、同名タグは今後自動抽出されなくなります（再追加するには手動で再作成が必要）。続行しますか？";
}
