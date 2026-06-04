"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, RefreshCw, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  pillBtn,
  pillBtnDanger,
  pillBtnPrimary,
} from "@/components/common/styles";
import {
  displayError,
  displayJobErrorCode,
} from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  CHIP,
  CHIP_MUTED,
  CHIP_SUCCESS,
  CHIP_WARNING,
  FORM_ERROR,
} from "../layout/styles";
import {
  commitIngestionPreviewFn,
  discardIngestionPreviewFn,
  type IngestionJobWire,
  ownerRetryIngestionJobFn,
  regenerateIngestionPreviewFn,
} from "./actions";

type Props = {
  job: IngestionJobWire;
};

const JOB_CARD =
  "border border-hairline rounded-lg px-5 py-4 mb-3 bg-surface-elevated data-[discarded]:opacity-60 data-[discarded]:bg-surface";
const JOB_CARD_HEAD =
  "flex justify-between gap-3 mb-2 items-baseline flex-wrap";
const JOB_CARD_NAME = "text-[15px] font-medium text-ink break-words";
const JOB_CARD_META = "text-xs text-ink-tertiary";
const JOB_CARD_ACTIONS = "inline-flex gap-2 mt-3 flex-wrap";

const statusLabel: Record<IngestionJobWire["status"], string> = {
  pending: "待機中",
  processing: "処理中",
  previewing: "プレビュー可能",
  saved: "保存済み",
  failed: "失敗",
  discarded: "破棄済み",
};

const statusChipClass = (status: IngestionJobWire["status"]): string => {
  switch (status) {
    case "failed":
      return `${CHIP} ${CHIP_WARNING}`;
    case "saved":
      return `${CHIP} ${CHIP_SUCCESS}`;
    case "previewing":
      return CHIP;
    default:
      return `${CHIP} ${CHIP_MUTED}`;
  }
};

export function IngestionJobRow({ job }: Props) {
  const router = useRouter();
  const commit = useServerFn(commitIngestionPreviewFn);
  const discard = useServerFn(discardIngestionPreviewFn);
  const regenerate = useServerFn(regenerateIngestionPreviewFn);
  const ownerRetry = useServerFn(ownerRetryIngestionJobFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Dim the card the moment discard starts rather than after the loader
  // round-trip. Snaps back to the server-confirmed status on failure.
  // List removal stays on the invalidate path.
  const [optimisticDiscarded, setOptimisticDiscarded] = useOptimistic(
    job.status === "discarded",
    (_cur: boolean, next: boolean) => next,
  );

  const jobId = job.id;

  const suggestedDirectoryId = job.preview?.suggestedDirectoryId ?? null;
  const suggestedDirectoryName = job.preview?.suggestedDirectoryName ?? null;
  const willCreateDirectory =
    suggestedDirectoryId === null && suggestedDirectoryName !== null;

  const onCommit = () => {
    startTransition(async () => {
      try {
        const result = await commit({
          data: {
            jobId,
            ...(suggestedDirectoryId === null
              ? {}
              : { directoryId: suggestedDirectoryId }),
            ...(willCreateDirectory && suggestedDirectoryName !== null
              ? { directoryNameToCreate: suggestedDirectoryName }
              : {}),
          },
        });
        if (willCreateDirectory) {
          // 新規ディレクトリ作成で Sidebar tree が変わるため _app も invalidate
          // する（.issue/299/adr.md ADR-003）。
          await router.invalidate();
        }
        await router.navigate({
          to: "/notes/$noteId",
          params: { noteId: result.noteId as unknown as string },
        });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const runDiscard = () => {
    startTransition(async () => {
      try {
        setOptimisticDiscarded(true);
        await discard({ data: { jobId } });
        await routerInvalidate(router);
        setConfirmDiscardOpen(false);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onRegenerate = () => {
    startTransition(async () => {
      try {
        await regenerate({ data: { jobId } });
        await routerInvalidate(router);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onRetry = () => {
    startTransition(async () => {
      try {
        await ownerRetry({ data: { jobId } });
        await routerInvalidate(router);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div className={JOB_CARD} data-discarded={optimisticDiscarded || undefined}>
      <div className={JOB_CARD_HEAD}>
        <div>
          <div className={JOB_CARD_NAME}>{job.originalFileName}</div>
          <div className={JOB_CARD_META}>
            {job.mimeType} · {(job.byteSize / 1024).toFixed(1)} KB
          </div>
        </div>
        <span className={statusChipClass(job.status)}>
          {statusLabel[job.status]}
        </span>
      </div>
      {job.preview !== null ? (
        <div className="text-sm text-ink-secondary">
          <strong className="text-ink">{job.preview.title}</strong>
          {job.preview.suggestedTagNames.length > 0 ? (
            <span className="ml-2">
              {job.preview.suggestedTagNames
                .map((name) => `#${name}`)
                .join(" ")}
            </span>
          ) : null}
        </div>
      ) : null}
      {(() => {
        const msg = displayJobErrorCode(job.errorCode);
        return msg !== null ? (
          <p className={FORM_ERROR} role="alert">
            {msg}
          </p>
        ) : null;
      })()}
      <div className={JOB_CARD_ACTIONS}>
        {!optimisticDiscarded && job.status === "previewing" ? (
          <>
            <button
              type="button"
              className={`${pillBtn} ${pillBtnPrimary}`}
              data-primary=""
              onClick={onCommit}
              disabled={isPending}
            >
              <Icon icon={Check} />
              ノートとして保存
            </button>
            <button
              type="button"
              className={pillBtn}
              onClick={onRegenerate}
              disabled={isPending}
            >
              <Icon icon={RefreshCw} />
              再生成
            </button>
            <button
              type="button"
              className={`${pillBtn} ${pillBtnDanger}`}
              data-danger=""
              onClick={() => {
                setError(null);
                setConfirmDiscardOpen(true);
              }}
              disabled={isPending}
            >
              <Icon icon={Trash2} />
              破棄
            </button>
          </>
        ) : null}
        {!optimisticDiscarded && job.status === "failed" ? (
          <>
            <button
              type="button"
              className={pillBtn}
              onClick={onRetry}
              disabled={isPending}
            >
              <Icon icon={RefreshCw} />
              再試行
            </button>
            <button
              type="button"
              className={`${pillBtn} ${pillBtnDanger}`}
              data-danger=""
              onClick={() => {
                setError(null);
                setConfirmDiscardOpen(true);
              }}
              disabled={isPending}
            >
              <Icon icon={Trash2} />
              破棄
            </button>
          </>
        ) : null}
        {job.status === "saved" && job.savedAsNoteId !== null ? (
          <Link
            to="/notes/$noteId"
            params={{
              noteId: job.savedAsNoteId,
            }}
            className={pillBtn}
          >
            <Icon icon={ArrowRight} />
            ノートを開く
          </Link>
        ) : null}
      </div>
      {error !== null && !confirmDiscardOpen ? (
        <p className={FORM_ERROR} role="alert">
          {displayError(error)}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmDiscardOpen}
        title="ジョブを破棄"
        description="このジョブを破棄しますか？"
        confirmLabel="破棄"
        confirmIcon={Trash2}
        isPending={isPending}
        error={confirmDiscardOpen ? (error ?? undefined) : undefined}
        onConfirm={runDiscard}
        onClose={() => {
          setConfirmDiscardOpen(false);
          setError(null);
        }}
      />
    </div>
  );
}
