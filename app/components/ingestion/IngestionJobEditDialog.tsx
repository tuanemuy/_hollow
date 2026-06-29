"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/common/Dialog";
import { dialogTitle } from "@/components/common/styles";
import { getDirectoryTreeFn } from "../note/actions";
import type { FlatDirectory } from "../note/loaders";
import type { IngestionJobWire } from "./actions";
import { IngestionPreviewForm } from "./IngestionPreviewForm";
import { notifyIngestionQueueChanged } from "./queueBadgeBus";

type Props = Readonly<{
  job: IngestionJobWire;
  open: boolean;
  onClose: () => void;
}>;

/**
 * Queue-side preview editor (Issue #538): a thin `Dialog` wrapper around
 * `IngestionPreviewForm`, opened from a `previewing` row's 編集 action.
 *
 * Callback wiring:
 * - commit → navigate to the new note (same landing as the row's
 *   one-click save);
 * - discard / regenerate → close and let the queue's own polling and the
 *   row's progress display track the job (no in-dialog waiting state —
 *   the fire-and-forget model);
 * - every success path announces `notifyIngestionQueueChanged()` so the
 *   sidebar upload nav item count refreshes. The form itself already runs
 *   `routerInvalidate` on discard / regenerate, so the dialog does not
 *   invalidate again.
 *
 * Backdrop click is intentionally not a close path (`closeOnBackdropClick`
 * stays off): the form has no pending-state output to gate it on, and an
 * accidental backdrop click must not discard in-progress edits. Esc / the
 * × button / キャンセル remain available.
 */
export function IngestionJobEditDialog({ job, open, onClose }: Props) {
  const router = useRouter();
  const getTree = useServerFn(getDirectoryTreeFn);
  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [tree, setTree] = useState<readonly FlatDirectory[]>([]);
  const [isTreeLoading, setIsTreeLoading] = useState(false);

  // Lazy-load the directory tree the first time the dialog opens. A load
  // failure leaves the picker empty — the user can still type a new
  // directory name. Silent recovery is preferable to blocking the editing
  // UX with a banner (same pattern as the former modal editing view).
  useEffect(() => {
    if (!open) return;
    if (tree.length > 0) return;
    let cancelled = false;
    setIsTreeLoading(true);
    void (async () => {
      try {
        const { flat } = await getTree();
        if (!cancelled) setTree(flat);
      } catch {
        // Silent: see above.
      } finally {
        if (!cancelled) setIsTreeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tree.length, getTree]);

  const onCommitted = useCallback(
    (noteId: string) => {
      notifyIngestionQueueChanged();
      void router.navigate({ to: "/notes/$noteId", params: { noteId } });
    },
    [router],
  );

  const onDiscarded = useCallback(() => {
    notifyIngestionQueueChanged();
    onClose();
  }, [onClose]);

  const onRegenerated = useCallback(() => {
    notifyIngestionQueueChanged();
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      initialFocusRef={titleInputRef}
      showCloseButton
    >
      <h2 id={titleId} className={dialogTitle}>
        プレビューを編集: {job.originalFileName}
      </h2>
      <IngestionPreviewForm
        job={job}
        tree={tree}
        isTreeLoading={isTreeLoading}
        titleInputRef={titleInputRef}
        onCommitted={onCommitted}
        onDiscarded={onDiscarded}
        onRegenerated={onRegenerated}
        onCancel={onClose}
      />
    </Dialog>
  );
}
