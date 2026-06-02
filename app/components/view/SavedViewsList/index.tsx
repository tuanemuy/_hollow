"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Calendar,
  Globe,
  LayoutGrid,
  List,
  type LucideIcon,
  Star,
  Trash2,
} from "lucide-react";
import { useId, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { chip } from "@/components/common/styles";
import type { FlatDirectory } from "@/components/note/directoryTree";
import { ViewFormDialog } from "@/components/view/ViewFormDialog";
import type { SavedViewDTO } from "@/core/application/dto/view";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { SAVED_VIEW_NAME_MAX } from "../schema";
import {
  deleteSavedViewFn,
  duplicateSavedViewFn,
  renameSavedViewFn,
  repairSavedViewFn,
  setDefaultSavedViewFn,
  updateSavedViewFn,
} from "./action";
import {
  brokenBanner,
  brokenBody,
  brokenCode,
  brokenDetail,
  brokenTitle,
  chipBroken,
  defaultMark,
  emptyState,
  fixBtn,
  publicMark,
  renameInput,
  rowActions,
  rowError,
  textAction,
  textActionApply,
  textActionDanger,
  viewChips,
  viewHead,
  viewIconWrap,
  viewList,
  viewMain,
  viewName,
  viewRow,
} from "./styles";

type TagOption = Readonly<{ id: string; name: string }>;

type Props = {
  views: readonly SavedViewDTO[];
  directories: readonly FlatDirectory[];
  tags: readonly TagOption[];
};

const BROKEN_KIND_LABEL: Record<
  SavedViewDTO["brokenConditions"][number]["kind"],
  string
> = {
  tag: "タグ",
  directory: "ディレクトリ",
  note: "ノート",
};

const DISPLAY_MODE_ICON: Record<SavedViewDTO["displayMode"], LucideIcon> = {
  list: List,
  tile: LayoutGrid,
  calendar: Calendar,
};

const DISPLAY_MODE_LABEL: Record<SavedViewDTO["displayMode"], string> = {
  list: "リスト表示",
  tile: "タイル表示",
  calendar: "カレンダー表示",
};

export function SavedViewsList({ views, directories, tags }: Props) {
  if (views.length === 0) {
    return <p className={emptyState}>保存ビューはまだありません。</p>;
  }
  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  return (
    <ul className={viewList}>
      {views.map((view) => (
        <SavedViewRow
          key={view.id}
          view={view}
          directories={directories}
          tags={tags}
          tagNameById={tagNameById}
        />
      ))}
    </ul>
  );
}

function SavedViewRow({
  view,
  directories,
  tags,
  tagNameById,
}: {
  view: SavedViewDTO;
  directories: readonly FlatDirectory[];
  tags: readonly TagOption[];
  tagNameById: ReadonlyMap<string, string>;
}) {
  const router = useRouter();
  const remove = useServerFn(deleteSavedViewFn);
  const setDefault = useServerFn(setDefaultSavedViewFn);
  const rename = useServerFn(renameSavedViewFn);
  const update = useServerFn(updateSavedViewFn);
  const duplicate = useServerFn(duplicateSavedViewFn);
  const repair = useServerFn(repairSavedViewFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(view.name);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const nameId = useId();

  const runDelete = () => {
    startTransition(async () => {
      try {
        await remove({ data: { viewId: view.id } });
        await routerInvalidate(router);
        setConfirmDeleteOpen(false);
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
        await routerInvalidate(router);
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
        await routerInvalidate(router);
        setError(null);
        setIsEditing(false);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onDuplicate = () => {
    startTransition(async () => {
      try {
        await duplicate({ data: { viewId: view.id } });
        await routerInvalidate(router);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onRepair = () => {
    startTransition(async () => {
      try {
        await repair({ data: { viewId: view.id } });
        await routerInvalidate(router);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const nameFieldErrors =
    error?.kind === "validation" ? error.fieldErrors?.name : undefined;
  // While the delete confirmation is open the (shared) error is shown
  // inside the dialog (see the `error` guard on `ConfirmDialog` below), so
  // suppress the inline summary to avoid double-display (Issue #98).
  const summary =
    error !== null && nameFieldErrors === undefined && !confirmDeleteOpen
      ? displayError(error)
      : "";

  const isBroken = view.brokenConditions.length > 0;

  const initialTagNames = view.query.tagIds
    .map((id) => tagNameById.get(id as unknown as string))
    .filter((name): name is string => name !== undefined);

  return (
    <li className={viewRow}>
      <span className={viewIconWrap}>
        <Icon icon={DISPLAY_MODE_ICON[view.displayMode]} />
      </span>
      <div className={viewMain}>
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={nameId} className="sr-only">
              名前
            </label>
            <input
              // biome-ignore lint/a11y/noAutofocus: focus moves into the inline rename editor on open so keyboard users can type immediately
              autoFocus
              id={nameId}
              type="text"
              className={renameInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={SAVED_VIEW_NAME_MAX}
              disabled={isPending}
              aria-invalid={nameFieldErrors !== undefined}
            />
            <button
              type="button"
              className={textAction}
              onClick={onSaveRename}
              disabled={isPending}
            >
              保存
            </button>
            <button
              type="button"
              className={textAction}
              onClick={() => {
                setDraft(view.name);
                setIsEditing(false);
                setError(null);
              }}
              disabled={isPending}
            >
              キャンセル
            </button>
          </div>
        ) : (
          <>
            <div className={viewHead}>
              <span className={viewName}>{view.name}</span>
              {view.isDefault ? (
                <span className={defaultMark}>
                  <Icon icon={Star} />
                  既定
                </span>
              ) : null}
              {view.kind === "public" ? (
                <span className={publicMark}>
                  <Icon icon={Globe} />
                  公開
                </span>
              ) : null}
            </div>
            <div className={viewChips}>
              <span className={chip}>
                <Icon icon={DISPLAY_MODE_ICON[view.displayMode]} />
                {DISPLAY_MODE_LABEL[view.displayMode]}
              </span>
              {isBroken ? (
                <span className={`${chip} ${chipBroken}`}>
                  <Icon icon={AlertTriangle} />
                  壊れた条件: {view.brokenConditions.length} 件
                </span>
              ) : null}
            </div>
            {isBroken ? (
              <div className={brokenBanner}>
                <Icon icon={AlertTriangle} />
                <div className={brokenBody}>
                  <div className={brokenTitle}>壊れた条件があります</div>
                  <ul className={brokenDetail}>
                    {view.brokenConditions.map((condition) => {
                      const label = BROKEN_KIND_LABEL[condition.kind];
                      return (
                        <li key={`${condition.kind}:${condition.id}`}>
                          {condition.lastSeenName !== "" ? (
                            <>
                              削除済み{label}{" "}
                              <code className={brokenCode}>
                                {condition.lastSeenName}
                              </code>{" "}
                              を参照しています。
                            </>
                          ) : (
                            <>削除済みの{label}を参照しています。</>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <button
                  type="button"
                  className={fixBtn}
                  onClick={onRepair}
                  disabled={isPending}
                  aria-label={`${view.name} の壊れた条件を修復`}
                >
                  修復
                </button>
              </div>
            ) : null}
          </>
        )}
        {nameFieldErrors !== undefined ? (
          <p className={rowError} role="alert">
            {nameFieldErrors[0]}
          </p>
        ) : null}
        {summary !== "" ? (
          <p className={rowError} role="alert">
            {summary}
          </p>
        ) : null}
      </div>
      {isEditing ? null : (
        <div className={rowActions}>
          <Link
            to="/"
            search={{ viewId: view.id as unknown as string }}
            className={`${textAction} ${textActionApply}`}
            aria-label={`${view.name} を適用`}
          >
            適用
          </Link>
          <button
            type="button"
            className={textAction}
            onClick={() => setEditDialogOpen(true)}
            disabled={isPending}
            aria-label={`${view.name} を編集`}
          >
            編集
          </button>
          <button
            type="button"
            className={textAction}
            onClick={() => setIsEditing(true)}
            disabled={isPending}
            aria-label={`${view.name} の名前を変更`}
          >
            名前変更
          </button>
          <button
            type="button"
            className={textAction}
            onClick={onDuplicate}
            disabled={isPending}
            aria-label={`${view.name} を複製`}
          >
            複製
          </button>
          <button
            type="button"
            className={textAction}
            onClick={onToggleDefault}
            disabled={isPending}
            aria-label={
              view.isDefault
                ? `${view.name} の既定を解除`
                : `${view.name} を既定にする`
            }
          >
            {view.isDefault ? "既定を解除" : "既定にする"}
          </button>
          <button
            type="button"
            className={`${textAction} ${textActionDanger}`}
            onClick={() => {
              setError(null);
              setConfirmDeleteOpen(true);
            }}
            disabled={isPending}
            aria-label={`${view.name} を削除`}
          >
            削除
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="保存ビューを削除"
        description={`「${view.name}」を削除しますか？`}
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
      <ViewFormDialog
        mode="edit"
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        directories={directories}
        tags={tags}
        view={view}
        initialTagNames={initialTagNames}
        submit={update}
      />
    </li>
  );
}
