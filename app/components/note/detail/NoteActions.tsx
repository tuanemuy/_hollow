"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, FolderInput, Globe, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  HOME_SEARCH,
  NOTE_HISTORY_SEARCH,
  TRASH_SEARCH,
} from "@/components/auth/links";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import {
  formError,
  pillBtn,
  pillBtnIcon,
  pillBtnPrimary,
  scrollbarHidden,
} from "@/components/common/styles";
import { PublishSettings } from "@/components/publication/PublishSettings";
import type {
  ShareLinkDTO,
  Visibility,
} from "@/core/application/dto/publication";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { deleteNoteFn, duplicateNoteFn } from "../actions";
import { MoveNoteDialog } from "../list/MoveNoteDialog";
import type { FlatDirectory } from "../loaders";
import { NoteActionsMenu } from "./NoteActionsMenu";
import { UrlCopyButton } from "./UrlCopyButton";

export type NoteActionsProps = Readonly<{
  noteId: string;
  status: "active" | "trashed";
  publishState: Readonly<{
    visibility: Visibility;
    publishedAt: string | null;
    links: readonly ShareLinkDTO[];
  }>;
  appUrl: string;
  /** Active share link (`/share/by-id/<id>`), or null. Used for unlisted. */
  shareLinkUrl: string | null;
  /** Canonical public URL (`/u/<username>/<slug>`). Used for public. */
  publicNoteUrl: string;
  tree: readonly FlatDirectory[];
}>;

type OpenDialog = "move" | "publish" | null;

function visibilityLabel(v: Visibility): string {
  switch (v) {
    case "public":
      return "公開";
    case "unlisted":
      return "限定公開";
    case "private":
      return "非公開";
  }
}

/**
 * Status dot color driven by a `data-visibility` value-match variant rather
 * than a conditional class string (CLAUDE.md state-style convention). The
 * three variant utilities are kept in a single string literal so Tailwind's
 * JIT can see them; splitting them across branches would hide the tokens.
 * The `aria-[current=page]` precedent in `directory/styles.ts` confirms
 * value-match variants generate correctly under Tailwind v4.
 */
const VISIBILITY_DOT =
  "inline-block w-[6px] h-[6px] rounded-full data-[visibility=public]:bg-status-public data-[visibility=unlisted]:bg-status-link data-[visibility=private]:bg-status-private";

// Desktop: a single wrapping pill cloud. Mobile (`max-sm:`): the toolbar splits
// into (a) a horizontal-scroll rail holding the scrollable icon pills and (b)
// the overflow "⋯" menu pinned at the end, kept OUTSIDE the rail.
//
// `MENU` is the outer row. On mobile it is `flex flex-nowrap` and `min-w-0` so
// it fits the content column; on desktop it is the original `inline-flex
// flex-wrap` cloud. The scrollable pills live in `MENU_RAIL` (mock
// `.action-toolbar`: `overflow-x-auto`, scrollbar hidden, children no-shrink),
// which isolates the page from horizontal overflow. The "⋯" menu is excluded
// from the rail because its inline dropdown would otherwise be clipped by the
// rail's overflow box (`overflow-x:auto` forces `overflow-y:auto`).
const MENU =
  "inline-flex flex-wrap gap-2 my-4 mb-6 items-center max-sm:flex max-sm:flex-nowrap max-sm:min-w-0";

// Mobile-only horizontal scroll rail wrapping the leading pills. On desktop it
// dissolves into the wrapping cloud (`contents`) so the pills wrap as before.
const MENU_RAIL = `contents flex-wrap gap-2 items-center max-sm:flex max-sm:flex-1 max-sm:min-w-0 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5 max-sm:[&>*]:shrink-0 ${scrollbarHidden}`;

// Circular icon-only buttons for the frequently-used actions kept visible in
// the toolbar (#459). The labeled 公開設定 pill is intentionally the lone
// stateful exception (it surfaces the current visibility).
const ICON_BTN = `${pillBtn} ${pillBtnIcon}`;
const ICON_BTN_PRIMARY = `${pillBtn} ${pillBtnIcon} ${pillBtnPrimary}`;

export function NoteActions({
  noteId,
  status,
  publishState,
  appUrl,
  shareLinkUrl,
  publicNoteUrl,
  tree,
}: NoteActionsProps) {
  const visibility = publishState.visibility;
  const router = useRouter();
  const remove = useServerFn(deleteNoteFn);
  const duplicate = useServerFn(duplicateNoteFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [open, setOpen] = useState<OpenDialog>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Copy URL by visibility: public → the canonical public URL; unlisted →
  // the active share link when one exists; everything else (private, or
  // unlisted with no active link) → the internal `/notes/<id>` URL. The
  // origin is resolved at click time so SSR doesn't pre-bake `location`.
  const internalUrl =
    typeof location === "undefined"
      ? `/notes/${noteId}`
      : `${location.origin}/notes/${noteId}`;
  const copyUrl =
    visibility === "public"
      ? publicNoteUrl
      : visibility === "unlisted" && shareLinkUrl !== null
        ? shareLinkUrl
        : internalUrl;

  const runDelete = () => {
    startTransition(async () => {
      try {
        await remove({ data: { noteId } });
        await router.navigate({ to: "/", search: HOME_SEARCH });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onDuplicate = () => {
    startTransition(async () => {
      try {
        const result = await duplicate({ data: { noteId } });
        await router.navigate({
          to: "/notes/$noteId/edit",
          params: { noteId: result.noteId },
        });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onHistory = () => {
    router.navigate({
      to: "/notes/$noteId/history",
      params: { noteId },
      search: NOTE_HISTORY_SEARCH,
    });
  };

  const onDelete = () => {
    setError(null);
    setConfirmDeleteOpen(true);
  };

  if (status === "trashed") {
    return (
      <div className={MENU}>
        <Link to="/trash" search={TRASH_SEARCH} className={pillBtn}>
          <Icon icon={Trash2} />
          ゴミ箱を開く
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className={MENU} role="toolbar" aria-label="ノート操作">
        {/* Scroll rail: leading pills scroll horizontally on mobile; on desktop
            `display:contents` lets them flow into the wrapping cloud above. */}
        <div className={MENU_RAIL}>
          <Link
            to="/notes/$noteId/edit"
            params={{ noteId }}
            data-icon=""
            data-primary
            aria-label="編集"
            title="編集"
            className={ICON_BTN_PRIMARY}
          >
            <Icon icon={Pencil} size={20} />
          </Link>
          <button
            type="button"
            className={pillBtn}
            onClick={() => setOpen("publish")}
          >
            <span
              className={VISIBILITY_DOT}
              data-visibility={visibility}
              aria-hidden="true"
            />
            <Icon icon={Globe} />
            <span className="sr-only">公開状態: </span>
            {visibilityLabel(visibility)}
          </button>
          <button
            type="button"
            className={ICON_BTN}
            data-icon=""
            aria-label="移動"
            title="移動"
            onClick={() => setOpen("move")}
            disabled={isPending}
          >
            <Icon icon={FolderInput} size={20} />
          </button>
          <UrlCopyButton url={copyUrl} />
          <Link
            to="/notes/$noteId/export"
            params={{ noteId }}
            data-icon=""
            aria-label="エクスポート"
            title="エクスポート"
            className={ICON_BTN}
          >
            <Icon icon={Download} size={20} />
          </Link>
        </div>
        {/* Kept outside the rail so the inline dropdown is not clipped by the
            rail's `overflow-x:auto` box. */}
        <NoteActionsMenu
          onDuplicate={onDuplicate}
          onHistory={onHistory}
          onDelete={onDelete}
          disabled={isPending}
        />
        {error !== null && !confirmDeleteOpen ? (
          <span className={formError} role="alert">
            {displayError(error)}
          </span>
        ) : null}
      </div>
      <MoveNoteDialog
        noteIds={[noteId]}
        open={open === "move"}
        onClose={() => setOpen(null)}
        tree={tree}
      />
      <PublishSettings
        open={open === "publish"}
        onClose={() => setOpen(null)}
        noteId={noteId}
        appUrl={appUrl}
        publicNoteUrl={publicNoteUrl}
        initial={publishState}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="このノートをゴミ箱に移動"
        confirmLabel="ゴミ箱へ"
        confirmIcon={Trash2}
        isPending={isPending}
        error={confirmDeleteOpen ? (error ?? undefined) : undefined}
        onConfirm={runDelete}
        onClose={() => {
          setConfirmDeleteOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
