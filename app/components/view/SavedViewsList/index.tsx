"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Calendar,
  Check,
  Folder,
  Globe,
  Hash,
  LayoutGrid,
  List,
  type LucideIcon,
  MoreVertical,
  Star,
  Trash2,
} from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { Menu, MenuItem } from "@/components/common/Menu";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { ALERT_ICON, chip } from "@/components/common/styles";
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
  applyBtn,
  brokenBanner,
  brokenBody,
  brokenCode,
  brokenDetail,
  brokenTitle,
  chipBroken,
  dateRangeChipLabel,
  defaultMark,
  directoryChipLabel,
  emptyState,
  fixBtn,
  menuBtn,
  publicMark,
  renameInput,
  rowActions,
  rowError,
  sortChipLabel,
  textAction,
  viewChips,
  viewHead,
  viewIconWrap,
  viewList,
  viewMain,
  viewName,
  viewRow,
  visibilityChipLabel,
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

type RemoveAction = Readonly<{ type: "remove"; id: string }>;
type AddAction = Readonly<{ type: "add"; view: SavedViewDTO }>;
type ViewsAction = RemoveAction | AddAction;

export function reduceViews(
  cur: readonly SavedViewDTO[],
  action: ViewsAction,
): readonly SavedViewDTO[] {
  switch (action.type) {
    case "remove":
      return cur.filter((view) => view.id !== action.id);
    case "add":
      // The duplicate's id is server-assigned, so once the loader commits the
      // baseline carries the same row. Guard against double-keying if the
      // baseline already has it (the optimistic patch is dropped on the next
      // re-render anyway).
      return cur.some((view) => view.id === action.view.id)
        ? cur
        : [...cur, action.view];
  }
}

export function SavedViewsList({ views, directories, tags }: Props) {
  const router = useRouter();
  const remove = useServerFn(deleteSavedViewFn);
  const duplicate = useServerFn(duplicateSavedViewFn);

  // Server-confirmed baseline. `useOptimistic` removes/adds a row
  // synchronously while the delete / duplicate + loader round-trip is in
  // flight, then snaps back to this baseline once the navigation commits and
  // fresh props arrive. Hooks run before the empty-list early return so the
  // empty check uses the optimistic projection, not raw `views`.
  const [optimisticViews, applyOptimistic] = useOptimistic(views, reduceViews);
  // The affected row is removed from / added to `optimisticViews` the instant
  // the mutation starts, so there's no need to expose the transition's
  // pending flag to the rows (gating every sibling on one mutation would
  // needlessly lock the whole list).
  const [, startMutation] = useTransition();
  // The delete / duplicate error is owned by the parent (the deleted row may
  // be optimistically removed mid-flight; the duplicate has no row of its
  // own) and surfaced in the affected row's existing `rowError` slot.
  // Duplicate errors are attributed to the source row (`viewId`).
  const [actionErrorId, setActionErrorId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<SerializedError | null>(null);

  const onDelete = (viewId: string) => {
    setActionErrorId(null);
    setActionError(null);
    startMutation(async () => {
      try {
        applyOptimistic({ type: "remove", id: viewId });
        await remove({ data: { viewId } });
        await routerInvalidate(router);
      } catch (e) {
        setActionErrorId(viewId);
        setActionError(extractSerializedError(e));
      }
    });
  };

  const onDuplicate = (viewId: string) => {
    setActionErrorId(null);
    setActionError(null);
    startMutation(async () => {
      try {
        const { view } = await duplicate({ data: { viewId } });
        applyOptimistic({ type: "add", view });
        await routerInvalidate(router);
      } catch (e) {
        // The duplicate has no row of its own; surface the error on the
        // source row that was duplicated.
        setActionErrorId(viewId);
        setActionError(extractSerializedError(e));
      }
    });
  };

  if (optimisticViews.length === 0) {
    return <p className={emptyState}>保存ビューはまだありません。</p>;
  }
  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  // Directory chips show the human path (`Research / Papers`) rather than the
  // bare name so nested directories disambiguate; `FlatDirectory.path` is a
  // leading-slash `/a/b` form, so trim the slash and re-space the separators.
  const directoryNameById = new Map(
    directories.map((dir) => [
      dir.id,
      dir.path.replace(/^\//, "").split("/").join(" / "),
    ]),
  );
  return (
    <ul className={viewList}>
      {optimisticViews.map((view) => {
        const id = view.id;
        return (
          <SavedViewRow
            key={view.id}
            view={view}
            directories={directories}
            tags={tags}
            tagNameById={tagNameById}
            directoryNameById={directoryNameById}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            actionError={actionErrorId === id ? actionError : null}
          />
        );
      })}
    </ul>
  );
}

function SavedViewRow({
  view,
  directories,
  tags,
  tagNameById,
  directoryNameById,
  onDelete,
  onDuplicate,
  actionError,
}: {
  view: SavedViewDTO;
  directories: readonly FlatDirectory[];
  tags: readonly TagOption[];
  tagNameById: ReadonlyMap<string, string>;
  directoryNameById: ReadonlyMap<string, string>;
  onDelete: (viewId: string) => void;
  onDuplicate: (viewId: string) => void;
  actionError: SerializedError | null;
}) {
  const router = useRouter();
  const setDefault = useServerFn(setDefaultSavedViewFn);
  const rename = useServerFn(renameSavedViewFn);
  const update = useServerFn(updateSavedViewFn);
  const repair = useServerFn(repairSavedViewFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(view.name);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Row-owned optimistic fields. Each mirrors the server-confirmed prop and
  // snaps back to it on loader re-fetch / failure.
  const [optimisticName, applyOptimisticName] = useOptimistic(
    view.name,
    (_cur: string, next: string) => next,
  );
  const [optimisticIsDefault, applyOptimisticIsDefault] = useOptimistic(
    view.isDefault,
    (_cur: boolean, next: boolean) => next,
  );
  const [optimisticBroken, applyOptimisticBroken] = useOptimistic(
    view.brokenConditions.length > 0,
    (_cur: boolean, next: boolean) => next,
  );

  const viewId = view.id;

  const nameId = useId();

  const onToggleDefault = () => {
    startTransition(async () => {
      try {
        applyOptimisticIsDefault(!optimisticIsDefault);
        await setDefault({
          data: {
            kind: view.kind,
            viewId: optimisticIsDefault ? null : view.id,
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
    // Leave the inline editor synchronously (outside the transition) so the
    // optimistic name renders immediately; regular state set inside a
    // pending transition would stay deferred until the mutation resolves.
    setIsEditing(false);
    startTransition(async () => {
      try {
        applyOptimisticName(trimmed);
        await rename({ data: { viewId: view.id, name: trimmed } });
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
        applyOptimisticBroken(false);
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
  // Delete / duplicate are optimistic and parent-owned: the deleted row
  // unmounts the moment the delete starts (so its error can't live in the
  // now-gone confirm dialog), and the duplicate has no row of its own (its
  // error is attributed to this source row). The parent feeds both back into
  // this row's `rowError` slot via `actionError`.
  const rowOwnedError = error ?? actionError;
  const summary =
    rowOwnedError !== null && nameFieldErrors === undefined
      ? displayError(rowOwnedError)
      : "";

  const isBroken = optimisticBroken;

  const initialTagNames = view.query.tagIds
    .map((id) => tagNameById.get(id))
    .filter((name): name is string => name !== undefined);

  // Condition chips mirroring P20's `.view-chips`: display mode (always) +
  // visibility / date range / sort / tags / directory when set. Date-range
  // preset resolution needs a base date; `new Date()` is read once per render
  // (the label is a display-only "今年 / 過去30日" hint, not a stored value).
  const visibilityChip = visibilityChipLabel(view.query.visibilityFilter);
  const dateChip = dateRangeChipLabel(view.query.dateRange, new Date());
  const directoryChip = directoryChipLabel(view.query.directoryId, (id) =>
    directoryNameById.get(id),
  );

  const rowBusy = isPending;

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
              <span className={viewName}>{optimisticName}</span>
              {optimisticIsDefault ? (
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
              {visibilityChip !== null ? (
                <span className={chip}>{visibilityChip}</span>
              ) : null}
              {dateChip !== null ? (
                <span className={chip}>{dateChip}</span>
              ) : null}
              <span className={chip}>{sortChipLabel(view.sort)}</span>
              {view.query.tagIds.map((tagId) => {
                const name = tagNameById.get(tagId);
                return (
                  <span key={tagId} className={chip}>
                    <Icon icon={Hash} />
                    {name ?? tagId}
                  </span>
                );
              })}
              {directoryChip !== null ? (
                <span className={chip}>
                  <Icon icon={Folder} />
                  {directoryChip}
                </span>
              ) : null}
              {isBroken ? (
                <span className={`${chip} ${chipBroken}`}>
                  <Icon icon={AlertTriangle} />
                  壊れた条件: {view.brokenConditions.length} 件
                </span>
              ) : null}
            </div>
            {isBroken ? (
              <div className={brokenBanner} role="status">
                <span className={ALERT_ICON} aria-hidden="true">
                  <Icon icon={AlertTriangle} size={20} />
                </span>
                <div className={brokenBody}>
                  <p className={brokenTitle}>壊れた条件があります</p>
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
            search={{ viewId }}
            className={applyBtn}
            aria-label={`${view.name} を適用`}
          >
            <Icon icon={Check} />
            適用
          </Link>
          <Menu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            ariaLabel={`${view.name} のその他の操作`}
            panelClassName="absolute right-0 mt-1 z-40 min-w-[184px]"
            trigger={(triggerProps) => (
              <button
                {...triggerProps}
                type="button"
                className={menuBtn}
                aria-label={`${view.name} のその他の操作`}
              >
                <Icon icon={MoreVertical} />
              </button>
            )}
          >
            <MenuItem
              onSelect={() => setEditDialogOpen(true)}
              disabled={rowBusy}
            >
              編集
            </MenuItem>
            <MenuItem onSelect={() => setIsEditing(true)} disabled={rowBusy}>
              名前変更
            </MenuItem>
            <MenuItem onSelect={() => onDuplicate(viewId)} disabled={rowBusy}>
              複製
            </MenuItem>
            <MenuItem onSelect={onToggleDefault} disabled={rowBusy}>
              {optimisticIsDefault ? "既定を解除" : "既定にする"}
            </MenuItem>
            <MenuItem
              danger
              separatorBefore
              onSelect={() => {
                setError(null);
                setConfirmDeleteOpen(true);
              }}
              disabled={rowBusy}
            >
              削除
            </MenuItem>
          </Menu>
        </div>
      )}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="保存ビューを削除"
        description={`「${view.name}」を削除しますか？`}
        confirmLabel="削除"
        confirmIcon={Trash2}
        onConfirm={() => {
          // The row is removed optimistically the moment the delete
          // transition starts, so the dialog (rendered inside this row)
          // unmounts; close it first and let any failure surface in the
          // row's `rowError` slot once it snaps back.
          setConfirmDeleteOpen(false);
          onDelete(viewId);
        }}
        onClose={() => {
          setConfirmDeleteOpen(false);
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
