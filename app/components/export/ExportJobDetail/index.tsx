"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ExportJobDTO } from "@/core/application/export/view";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { cancelExportFn, downloadExportFn } from "../ExportForm/action";
import { STATUS_LABEL } from "../ExportJobsList";

const POLL_INTERVAL_MS = 3000;

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

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "hidden" && !inFlightRef.current) {
        inFlightRef.current = true;
        try {
          await router.invalidate();
        } finally {
          inFlightRef.current = false;
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
        await router.invalidate();
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

  return (
    <section>
      <dl>
        <dt>ステータス</dt>
        <dd>{STATUS_LABEL[job.status]}</dd>

        <dt>形式 / スコープ</dt>
        <dd>
          {job.format} / {job.scope}
        </dd>

        <dt>進捗</dt>
        <dd>
          {showProgressBar ? (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={job.progress.total}
              aria-valuenow={job.progress.processed}
            >
              {job.progress.processed}/{job.progress.total}
            </div>
          ) : showProcessingPending ? (
            <span>処理待ち</span>
          ) : (
            <span>
              {job.progress.processed}/{job.progress.total}
            </span>
          )}
        </dd>

        <dt>作成日時</dt>
        <dd>
          <time dateTime={job.createdAt}>{job.createdAt}</time>
        </dd>

        {job.completedAt !== null ? (
          <>
            <dt>完了日時</dt>
            <dd>
              <time dateTime={job.completedAt}>{job.completedAt}</time>
            </dd>
          </>
        ) : null}

        {job.expiresAt !== null ? (
          <>
            <dt>有効期限</dt>
            <dd>
              <time dateTime={job.expiresAt}>{job.expiresAt}</time>
            </dd>
          </>
        ) : null}

        {job.artifactSize !== null ? (
          <>
            <dt>ファイルサイズ</dt>
            <dd>{formatBytes(job.artifactSize)}</dd>
          </>
        ) : null}

        {job.errorReason !== null ? (
          <>
            <dt>エラー内容</dt>
            <dd role="alert">{job.errorReason}</dd>
          </>
        ) : null}

        {job.failedNoteIds.length > 0 ? (
          <>
            <dt>失敗したノート</dt>
            <dd>
              <ul>
                {job.failedNoteIds.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
      </dl>

      <div>
        {canDownload ? (
          <button type="button" onClick={onDownload} disabled={isPending}>
            ダウンロード
          </button>
        ) : null}
        {isCompleted && isExpiredByClock ? (
          <p role="status">有効期限切れのため再エクスポートが必要です。</p>
        ) : null}
        {isActive ? (
          <button type="button" onClick={onCancel} disabled={isPending}>
            キャンセル
          </button>
        ) : null}
      </div>

      {message !== "" ? <p role="alert">{message}</p> : null}

      <p>
        <Link to="/exports" search={{ offset: 0 }}>
          一覧へ戻る
        </Link>
      </p>
    </section>
  );
}
