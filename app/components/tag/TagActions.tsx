"use client";

import { Check, Merge, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { Menu, MenuItem } from "@/components/common/Menu";
import {
  pillBtn,
  pillBtnGhostDanger,
  pillBtnIcon,
  pillBtnPrimary,
  pillBtnSm,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { FORM_ERROR, ROW_ACTIONS } from "../layout/styles";
import { MergeTagDialog } from "./MergeTagDialog";
import {
  TAG_EDITING_BLOCK,
  TAG_EDITING_FIELD,
  TAG_EDITING_GRID,
  TAG_EDITING_HEADING,
  TAG_RENAME_INPUT,
  TAG_ROW_ACTIONS,
  TAG_ROW_KEBAB_WRAP,
} from "./styles";

type Props = {
  tagId: string;
  name: string;
  noteCount: number;
  candidates: readonly { id: string; name: string }[];
  onRename: (tagId: string, name: string) => void;
  onDelete: (tagId: string) => void;
  onMerge: (sourceTagId: string, targetTagId: string) => void;
  actionError: SerializedError | null;
};

export function TagActions({
  tagId,
  name,
  noteCount,
  candidates,
  onRename,
  onDelete,
  onMerge,
  actionError,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const startRename = () => {
    setDraft(name);
    setIsEditing(true);
  };

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

  if (isEditing) {
    return (
      // Editing block spans the whole row (mock `.tag-editing-block`) and
      // carries `data-editing` so the row's name/count column hides via the
      // `<li>`'s `group-has-[[data-editing]]` rule (TagActions-completed wrapper
      // — state stays local, see `.issue/542/adr.md` ADR-004).
      <div
        data-editing=""
        className={`[grid-column:1/-1] ${TAG_EDITING_BLOCK}`}
      >
        <div className={TAG_EDITING_GRID}>
          <div className={TAG_EDITING_FIELD}>
            <p className={TAG_EDITING_HEADING}>
              #{name} をリネーム（{noteCount} 件のノートに反映）
            </p>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="タグ名"
              // biome-ignore lint/a11y/noAutofocus: inline edit field
              autoFocus
              className={TAG_RENAME_INPUT}
            />
          </div>
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              className={`${pillBtn} ${pillBtnPrimary} ${pillBtnSm}`}
              data-primary=""
              data-sm=""
              onClick={runRename}
            >
              <Icon icon={Check} />
              保存
            </button>
            <button
              type="button"
              className={`${pillBtn} ${pillBtnSm}`}
              data-sm=""
              onClick={() => {
                setIsEditing(false);
                setDraft(name);
              }}
            >
              キャンセル
            </button>
          </span>
        </div>
        {actionError !== null && !confirmDeleteOpen ? (
          <span className={FORM_ERROR} role="alert" aria-live="polite">
            {displayError(actionError)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={ROW_ACTIONS}>
      <span className={TAG_ROW_ACTIONS}>
        <button
          type="button"
          className={`${pillBtn} ${pillBtnSm}`}
          data-sm=""
          onClick={startRename}
        >
          <Icon icon={Pencil} />
          リネーム
        </button>
        {candidates.length > 0 ? (
          <button
            type="button"
            className={`${pillBtn} ${pillBtnSm}`}
            data-sm=""
            onClick={() => setIsMergeOpen(true)}
          >
            <Icon icon={Merge} />
            統合
          </button>
        ) : null}
        <button
          type="button"
          className={`${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}`}
          data-ghost-danger=""
          data-sm=""
          onClick={() => setConfirmDeleteOpen(true)}
        >
          <Icon icon={Trash2} />
          削除
        </button>
      </span>
      <span className={TAG_ROW_KEBAB_WRAP}>
        <Menu
          open={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          ariaLabel={`#${name} の操作`}
          panelClassName="absolute right-0 mt-1 z-40 min-w-[180px]"
          trigger={(triggerProps) => (
            <button
              {...triggerProps}
              type="button"
              aria-label="操作メニュー"
              title="操作メニュー"
              data-icon=""
              data-open={isMenuOpen || undefined}
              className={`${pillBtn} ${pillBtnIcon} data-[open]:bg-surface-hover`}
            >
              <Icon icon={MoreHorizontal} />
            </button>
          )}
        >
          <MenuItem onSelect={startRename} icon={Pencil}>
            リネーム
          </MenuItem>
          {candidates.length > 0 ? (
            <MenuItem onSelect={() => setIsMergeOpen(true)} icon={Merge}>
              統合
            </MenuItem>
          ) : null}
          <MenuItem
            separatorBefore
            danger
            onSelect={() => setConfirmDeleteOpen(true)}
            icon={Trash2}
          >
            削除
          </MenuItem>
        </Menu>
      </span>
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
          onMerge={onMerge}
        />
      ) : null}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`タグ "#${name}" を削除`}
        subject={`#${name}`}
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
