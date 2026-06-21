"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useTransition } from "react";
import { exportStatusTag } from "@/components/common/exportStatus";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  formError,
  pillBtn,
  pillBtnDanger,
  pillBtnPrimary,
  tagBadge,
  tagTone,
  textLink,
} from "@/components/common/styles";
import type { ExportJobDTO } from "@/core/application/export/view";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { cancelExportFn, downloadExportFn } from "../ExportForm/action";
import { STATUS_LABEL } from "../ExportJobsList";
import {
  FAIL_SUMMARY,
  JOB_ACTIONS,
  JOB_META,
  META_K,
  META_V,
  PROGRESS,
  PROGRESS_BAR,
  STATUS_DOT,
  STATUS_DOT_COLOR,
} from "../styles";

const POLL_INTERVAL_MS = 3000;
const FAILED_NOTE_IDS_DISPLAY_LIMIT = 50;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function ExportJobDetailView({ job }: { job: ExportJobDTO }) {
  const router = useRouter();
  const cancel = useServerFn(cancelExportFn);
  const download = useServerFn(downloadExportFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const isActive = job.status === "pending" || job.status === "processing";
  const isCompleted = job.status === "completed";
  const isExpiredByClock =
    isCompleted &&
    job.expiresAt !== null &&
    Date.parse(job.expiresAt) <= Date.now();
  const canDownload = isCompleted && !isExpiredByClock;

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "hidden" && !inFlight) {
        inFlight = true;
        try {
          await routerInvalidate(router);
        } finally {
          inFlight = false;
        }
      }
      if (cancelled) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [isActive, router]);

  const onCancel = () => {
    startTransition(async () => {
      try {
        await cancel({ data: { jobId: job.id } });
        await routerInvalidate(router);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onDownload = () => {
    startTransition(async () => {
      try {
        const { url } = await download({ data: { jobId: job.id } });
        window.location.href = url;
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const message = error === null ? "" : displayError(error);

  const showProgressBar = job.status === "processing" && job.progress.total > 0;
  const showProcessingPending =
    job.status === "processing" && job.progress.total === 0;
  const tone = exportStatusTag(job.status);
  const pct =
    job.progress.total > 0
      ? Math.min(
          100,
          Math.round((job.progress.processed / job.progress.total) * 100),
        )
      : 0;

  return (
    <section>
      <dl className={JOB_META}>
        <dt className={META_K}>ステータス</dt>
        <dd className={META_V}>
          <span className={`${tagBadge} ${tagTone[tone]}`}>
            <span
              className={`${STATUS_DOT} ${STATUS_DOT_COLOR[tone]} ${
                job.status === "processing" ? "motion-safe:animate-pulse" : ""
              }`}
              aria-hidden="true"
            />
            {STATUS_LABEL[job.status]}
          </span>
        </dd>

        <dt className={META_K}>形式 / スコープ</dt>
        <dd className={`${META_V} font-mono`}>
          {job.format} / {job.scope}
        </dd>

        <dt className={META_K}>進捗</dt>
        <dd className={META_V}>
          {showProgressBar ? (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono">
                {job.progress.processed}/{job.progress.total}
              </span>
              <div
                className={PROGRESS}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={job.progress.total}
                aria-valuenow={job.progress.processed}
              >
                <div className={PROGRESS_BAR} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : showProcessingPending ? (
            <span className="text-ink-secondary">処理待ち</span>
          ) : (
            <span className="font-mono">
              {job.progress.processed}/{job.progress.total}
            </span>
          )}
        </dd>

        <dt className={META_K}>作成日時</dt>
        <dd className={META_V}>
          <time dateTime={job.createdAt}>{job.createdAt}</time>
        </dd>

        {job.completedAt !== null ? (
          <>
            <dt className={META_K}>完了日時</dt>
            <dd className={META_V}>
              <time dateTime={job.completedAt}>{job.completedAt}</time>
            </dd>
          </>
        ) : null}

        {job.expiresAt !== null ? (
          <>
            <dt className={META_K}>有効期限</dt>
            <dd className={META_V}>
              <time dateTime={job.expiresAt}>{job.expiresAt}</time>
            </dd>
          </>
        ) : null}

        {job.artifactSize !== null ? (
          <>
            <dt className={META_K}>ファイルサイズ</dt>
            <dd className={META_V}>{formatBytes(job.artifactSize)}</dd>
          </>
        ) : null}

        {job.errorReason !== null ? (
          <>
            <dt className={META_K}>エラー内容</dt>
            <dd className={FAIL_SUMMARY} role="alert">
              {job.errorReason}
            </dd>
          </>
        ) : null}

        {job.failedNoteIds.length > 0 ? (
          <>
            <dt className={META_K}>失敗したノート</dt>
            <dd className={META_V}>
              <ul className="font-mono text-xs text-ink-tertiary flex flex-col gap-1 [overflow-wrap:anywhere]">
                {job.failedNoteIds
                  .slice(0, FAILED_NOTE_IDS_DISPLAY_LIMIT)
                  .map((id) => (
                    <li key={id}>{id}</li>
                  ))}
              </ul>
              {job.failedNoteIds.length > FAILED_NOTE_IDS_DISPLAY_LIMIT ? (
                <p className="text-xs text-ink-tertiary mt-1">
                  他 {job.failedNoteIds.length - FAILED_NOTE_IDS_DISPLAY_LIMIT}{" "}
                  件
                </p>
              ) : null}
            </dd>
          </>
        ) : null}
      </dl>

      <div className={JOB_ACTIONS}>
        {canDownload ? (
          <button
            type="button"
            className={`${pillBtn} ${pillBtnPrimary}`}
            data-primary=""
            onClick={onDownload}
            disabled={isPending}
          >
            ダウンロード
          </button>
        ) : null}
        {isActive ? (
          <button
            type="button"
            className={`${pillBtn} ${pillBtnDanger}`}
            data-danger=""
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </button>
        ) : null}
        {isCompleted && isExpiredByClock ? (
          <p className="text-sm text-ink-secondary" role="status">
            有効期限切れのため再エクスポートが必要です。
          </p>
        ) : null}
      </div>

      {message !== "" ? (
        <p className={formError} role="alert">
          {message}
        </p>
      ) : null}

      <p className="mt-6">
        <Link className={textLink} to="/exports" search={{ offset: 0 }}>
          一覧へ戻る
        </Link>
      </p>
    </section>
  );
}
