"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Merge, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  pillBtn,
  pillBtnDanger,
  pillBtnPrimary,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { FORM_ERROR, ROW_ACTIONS } from "../layout/styles";
import { deleteTagFn, renameTagFn } from "./actions";
import { MergeTagDialog } from "./MergeTagDialog";
import { progressBarIndeterminate, progressTrack } from "./styles";

type Props = {
  tagId: string;
  name: string;
  noteCount: number;
  candidates: readonly { id: string; name: string }[];
};

export function TagActions({ tagId, name, noteCount, candidates }: Props) {
  const router = useRouter();
  const renameTag = useServerFn(renameTagFn);
  const removeTag = useServerFn(deleteTagFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const onRename = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === name) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameTag({ data: { tagId, newName: trimmed } });
        await routerInvalidate(router);
        setIsEditing(false);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const runDelete = () => {
    startTransition(async () => {
      try {
        await removeTag({ data: { tagId } });
        await routerInvalidate(router);
        setConfirmDeleteOpen(false);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div className={ROW_ACTIONS}>
      {isEditing ? (
        <>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isPending}
            // biome-ignore lint/a11y/noAutofocus: inline edit field
            autoFocus
            className="h-[30px] px-2.5 bg-surface border border-transparent rounded-md text-[13px] text-ink outline-none focus:bg-bg focus:border-accent"
          />
          <button
            type="button"
            className={`${pillBtn} ${pillBtnPrimary}`}
            data-primary=""
            onClick={onRename}
            disabled={isPending}
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
            disabled={isPending}
          >
            キャンセル
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className={pillBtn}
            onClick={() => setIsEditing(true)}
            disabled={isPending}
          >
            <Icon icon={Pencil} />
            リネーム
          </button>
          {candidates.length > 0 ? (
            <button
              type="button"
              className={pillBtn}
              onClick={() => setIsMergeOpen(true)}
              disabled={isPending}
            >
              <Icon icon={Merge} />
              統合
            </button>
          ) : null}
          <button
            type="button"
            className={`${pillBtn} ${pillBtnDanger}`}
            data-danger=""
            onClick={() => {
              setError(null);
              setConfirmDeleteOpen(true);
            }}
            disabled={isPending}
          >
            <Icon icon={Trash2} />
            削除
          </button>
        </>
      )}
      {error !== null && !confirmDeleteOpen ? (
        <span className={FORM_ERROR} role="alert" aria-live="polite">
          {displayError(error)}
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
        description={renderDeleteDescription({
          isPending: isPending && confirmDeleteOpen,
          noteCount,
        })}
        confirmLabel="削除"
        confirmIcon={Trash2}
        isPending={isPending}
        error={confirmDeleteOpen ? (error ?? undefined) : undefined}
        onConfirm={runDelete}
        onClose={() => {
          setConfirmDeleteOpen(false);
          setError(null);
        }}
      />
    </div>
  );
}

function renderDeleteDescription({
  isPending,
  noteCount,
}: {
  isPending: boolean;
  noteCount: number;
}): React.ReactNode {
  if (isPending) {
    if (noteCount > 0) {
      return (
        <>
          <span aria-live="polite">
            <strong>{noteCount} 件のノートを更新中…</strong>
          </span>
          <div
            role="progressbar"
            aria-busy={true}
            aria-valuemin={0}
            aria-valuemax={noteCount}
            // biome-ignore lint/a11y/useValidAriaValues: indeterminate progressbar omits aria-valuenow attribute (React skips undefined props) — see .issue/55/adr.md ADR-002
            aria-valuenow={undefined}
            aria-label={`${noteCount} 件のノートを更新中`}
            className={progressTrack}
          >
            <div className={progressBarIndeterminate} />
          </div>
        </>
      );
    }
    return <span aria-live="polite">削除中…</span>;
  }

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
