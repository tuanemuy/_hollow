"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { Dialog } from "@/components/common/Dialog";
import {
  dialogActions,
  dialogTitle,
  field,
  formError,
  pillBtn,
  pillBtnPrimary,
} from "@/components/common/styles";
import { DirectorySelectField } from "@/components/directory/DirectorySelectField";
import {
  excludeSubtree,
  flattenDirectoryTree,
  getDescendantIds,
} from "@/components/note/directoryTree";
import type { DirectoryTreeNode } from "@/core/application/dto/directory";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { moveDirectoryFn } from "./actions";

export type MoveDirectoryDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  /** Forest from `loadDirectoryTree`; `tree[0]` is the implicit root. */
  tree: readonly DirectoryTreeNode[];
  directoryId: string;
  directoryName: string;
}>;

/**
 * Move a directory to another parent. The destination select excludes
 * the moving subtree (self + descendants) so users cannot pick a cyclic
 * target — the backend `assertNotCyclicMove` is still the source of
 * truth. The hidden root is surfaced as a fixed "（ルート）" label and
 * we send `tree[0].id` explicitly (no reliance on the server-side
 * `null -> root` fallback).
 */
export function MoveDirectoryDialog({
  open,
  onClose,
  tree,
  directoryId,
  directoryName,
}: MoveDirectoryDialogProps) {
  const router = useRouter();
  const moveDirectory = useServerFn(moveDirectoryFn);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();
  const targetId = useId();
  const titleId = useId();

  // tree[0] is the implicit root (ensured by DirectoryService.ensureRoot
  // at signup). Real users always have it, so the optional chain below
  // is a defensive belt-and-suspenders only.
  const rootId = tree[0]?.id as unknown as string | undefined;

  // Cyclic-safe destination list excluding the moving subtree (SSOT is the
  // backend `assertNotCyclicMove`; this mirrors it for UX). The root is
  // separated out and surfaced via `includeRootOption` so it is not rendered
  // twice — its name="" path="/" would otherwise read ambiguously.
  const options = useMemo(() => {
    const flat = flattenDirectoryTree(tree);
    const excludeIds = getDescendantIds(tree, directoryId);
    return excludeSubtree(flat, excludeIds).filter((dir) => dir.id !== rootId);
  }, [tree, directoryId, rootId]);

  useEffect(() => {
    if (!open) {
      setTarget(null);
      setError(null);
    }
  }, [open]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Stop React event bubbling so a Dialog mounted inside an outer form
    // (e.g. NoteEditor's form) does not also fire that form's submit handler.
    event.stopPropagation();
    if (target === null) return;
    setError(null);
    startTransition(async () => {
      try {
        await moveDirectory({
          data: { directoryId, newParentId: target },
        });
        // Sidebar の directory tree を更新するため _app も invalidate（rule 2）
        await router.invalidate();
        onClose();
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closable={!isPending}
    >
      <form onSubmit={submit}>
        <h2 id={titleId} className={dialogTitle}>
          「{directoryName}」を移動
        </h2>
        <div className={field}>
          <DirectorySelectField
            id={targetId}
            label="移動先"
            options={options}
            value={target}
            onChange={setTarget}
            disabled={isPending}
            {...(rootId !== undefined
              ? { includeRootOption: { id: rootId, label: "（ルート）" } }
              : {})}
          />
        </div>
        {error !== null ? (
          <p className={formError} role="alert">
            {displayError(error)}
          </p>
        ) : null}
        <div className={dialogActions}>
          <button
            type="button"
            className={pillBtn}
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </button>
          <button
            type="submit"
            data-primary
            className={`${pillBtn} ${pillBtnPrimary}`}
            disabled={isPending || target === null}
          >
            {isPending ? "移動中..." : "移動"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
