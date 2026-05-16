"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import type { IngestionJobDTO } from "@/core/application/dto/ingestion";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  commitIngestionPreviewFn,
  discardIngestionPreviewFn,
  regenerateIngestionPreviewFn,
} from "./actions";

type Props = {
  job: IngestionJobDTO;
};

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
      return "chip warning";
    case "saved":
      return "chip success";
    case "previewing":
      return "chip";
    default:
      return "chip muted";
  }
};

export function IngestionJobRow({ job }: Props) {
  const router = useRouter();
  const commit = useServerFn(commitIngestionPreviewFn);
  const discard = useServerFn(discardIngestionPreviewFn);
  const regenerate = useServerFn(regenerateIngestionPreviewFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

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

  const onDiscard = () => {
    if (!confirm("このジョブを破棄しますか？")) return;
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
    <div className="job-card">
      <div className="job-card-head">
        <div>
          <div className="job-card-name">{job.originalFileName}</div>
          <div className="job-card-meta">
            {job.mimeType} · {(job.byteSize / 1024).toFixed(1)} KB
          </div>
        </div>
        <span className={statusChipClass(job.status)}>
          {statusLabel[job.status]}
        </span>
      </div>
      {job.preview !== null ? (
        <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
          <strong style={{ color: "var(--color-ink)" }}>
            {job.preview.title}
          </strong>
          {job.preview.suggestedTagNames.length > 0 ? (
            <span style={{ marginLeft: "var(--space-2)" }}>
              {job.preview.suggestedTagNames
                .map((name) => `#${name}`)
                .join(" ")}
            </span>
          ) : null}
        </div>
      ) : null}
      {job.errorReason !== null ? (
        <p className="form-error" role="alert">
          {job.errorCode}: {job.errorReason}
        </p>
      ) : null}
      <div className="job-card-actions">
        {job.status === "previewing" ? (
          <>
            <button
              type="button"
              className="pill-btn primary"
              onClick={onCommit}
              disabled={isPending}
            >
              ノートとして保存
            </button>
            <button
              type="button"
              className="pill-btn"
              onClick={onRegenerate}
              disabled={isPending}
            >
              再生成
            </button>
            <button
              type="button"
              className="pill-btn danger"
              onClick={onDiscard}
              disabled={isPending}
            >
              破棄
            </button>
          </>
        ) : null}
        {job.status === "failed" ? (
          <button
            type="button"
            className="pill-btn danger"
            onClick={onDiscard}
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
            className="pill-btn"
          >
            ノートを開く
          </Link>
        ) : null}
      </div>
      {error !== null ? (
        <p className="form-error" role="alert">
          {displayError(error)}
        </p>
      ) : null}
    </div>
  );
}
