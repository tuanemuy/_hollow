"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { IngestionJobDTO } from "@/core/application/dto/ingestion";
import { displayError } from "@/core/presentation/errorDisplay";
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
  PILL_BTN,
} from "../layout/styles";
import {
  commitIngestionPreviewFn,
  discardIngestionPreviewFn,
  regenerateIngestionPreviewFn,
} from "./actions";

type Props = {
  job: IngestionJobDTO;
};

const JOB_CARD =
  "border border-hairline rounded-lg px-5 py-4 mb-3 bg-surface-elevated";
const JOB_CARD_HEAD =
  "flex justify-between gap-3 mb-2 items-baseline flex-wrap";
const JOB_CARD_NAME = "text-[15px] font-medium text-ink break-words";
const JOB_CARD_META = "text-xs text-ink-tertiary";
const JOB_CARD_ACTIONS = "inline-flex gap-2 mt-3 flex-wrap";

const statusLabel: Record<IngestionJobDTO["status"], string> = {
  pending: "待機中",
  processing: "処理中",
  previewing: "プレビュー可能",
  saved: "保存済み",
  failed: "失敗",
  discarded: "破棄済み",
};

const statusChipClass = (status: IngestionJobDTO["status"]): string => {
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

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const jobId = job.id as unknown as string;

  const onCommit = () => {
    startTransition(async () => {
      try {
        const result = await commit({ data: { jobId } });
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
        await discard({ data: { jobId } });
        await router.invalidate();
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
        await router.invalidate();
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <div className={JOB_CARD}>
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
        <div className="text-[13px] text-ink-secondary">
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
      {job.errorReason !== null ? (
        <p className={FORM_ERROR} role="alert">
          {job.errorCode}: {job.errorReason}
        </p>
      ) : null}
      <div className={JOB_CARD_ACTIONS}>
        {job.status === "previewing" ? (
          <>
            <button
              type="button"
              className={PILL_BTN}
              data-primary=""
              onClick={onCommit}
              disabled={isPending}
            >
              ノートとして保存
            </button>
            <button
              type="button"
              className={PILL_BTN}
              onClick={onRegenerate}
              disabled={isPending}
            >
              再生成
            </button>
            <button
              type="button"
              className={PILL_BTN}
              data-danger=""
              onClick={() => setConfirmDiscardOpen(true)}
              disabled={isPending}
            >
              破棄
            </button>
          </>
        ) : null}
        {job.status === "failed" ? (
          <button
            type="button"
            className={PILL_BTN}
            data-danger=""
            onClick={() => setConfirmDiscardOpen(true)}
            disabled={isPending}
          >
            破棄
          </button>
        ) : null}
        {job.status === "saved" && job.savedAsNoteId !== null ? (
          <Link
            to="/notes/$noteId"
            params={{
              noteId: job.savedAsNoteId as unknown as string,
            }}
            className={PILL_BTN}
          >
            ノートを開く
          </Link>
        ) : null}
      </div>
      {error !== null ? (
        <p className={FORM_ERROR} role="alert">
          {displayError(error)}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirmDiscardOpen}
        title="ジョブを破棄"
        description="このジョブを破棄しますか？"
        confirmLabel="破棄"
        isPending={isPending}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          runDiscard();
        }}
        onClose={() => setConfirmDiscardOpen(false)}
      />
    </div>
  );
}
