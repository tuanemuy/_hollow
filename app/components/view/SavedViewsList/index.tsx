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
import {
  brokenBanner,
  brokenBody,
  brokenDetail,
  brokenTitle,
  chipBroken,
  defaultMark,
  emptyState,
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

type Props = { views: readonly SavedViewDTO[] };

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

export function SavedViewsList({ views }: Props) {
  if (views.length === 0) {
    return <p className={emptyState}>保存ビューはまだありません。</p>;
  }
  return (
    <ul className={viewList}>
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
        await routerInvalidate(router);
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

  const nameFieldErrors =
    error?.kind === "validation" ? error.fieldErrors?.name : undefined;
  const summary =
    error !== null && nameFieldErrors === undefined ? displayError(error) : "";

  const isBroken = view.brokenConditions.length > 0;

  return (
    <li className={viewRow}>
      <span className={viewIconWrap}>
        <Icon
          icon={DISPLAY_MODE_ICON[view.displayMode]}
          label={DISPLAY_MODE_LABEL[view.displayMode]}
        />
      </span>
      <div className={viewMain}>
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={nameId} className="sr-only">
              名前
            </label>
            <input
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
              <div className={brokenBanner} role="alert">
                <Icon icon={AlertTriangle} />
                <div className={brokenBody}>
                  <div className={brokenTitle}>壊れた条件があります</div>
                  <div className={brokenDetail}>
                    削除済みの参照（{view.brokenConditions.length}{" "}
                    件）を含みます。
                    このビューを開いても結果は空になる場合があります。
                  </div>
                </div>
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
          >
            適用
          </Link>
          <button
            type="button"
            className={textAction}
            onClick={() => setIsEditing(true)}
            disabled={isPending}
          >
            名前変更
          </button>
          <button
            type="button"
            className={textAction}
            onClick={onToggleDefault}
            disabled={isPending}
          >
            {view.isDefault ? "既定を解除" : "既定にする"}
          </button>
          <button
            type="button"
            className={`${textAction} ${textActionDanger}`}
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isPending}
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
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          runDelete();
        }}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </li>
  );
}
