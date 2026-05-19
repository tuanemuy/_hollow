"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import type { ExportJobDTO } from "@/core/application/export/view";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { cancelExportFn, downloadExportFn } from "../ExportForm/action";

export const STATUS_LABEL: Readonly<Record<ExportJobDTO["status"], string>> = {
  pending: "待機中",
  processing: "処理中",
  completed: "完了",
  failed: "失敗",
  cancelled: "キャンセル",
  expired: "期限切れ",
};

export function ExportJobsListView({
  jobs,
}: {
  jobs: readonly ExportJobDTO[];
}) {
  if (jobs.length === 0) {
    return <p>エクスポートジョブはありません。</p>;
  }
  return (
    <ul>
      {jobs.map((job) => (
        <ExportJobRow key={job.id} job={job} />
      ))}
    </ul>
  );
}

function ExportJobRow({ job }: { job: ExportJobDTO }) {
  const router = useRouter();
  const cancel = useServerFn(cancelExportFn);
  const download = useServerFn(downloadExportFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const isActive = job.status === "pending" || job.status === "processing";
  const canDownload = job.status === "completed";

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

  return (
    <li>
      <div>
        <span>{STATUS_LABEL[job.status]}</span>
        <span>
          {job.format} / {job.scope}
        </span>
        <span>
          {job.progress.processed}/{job.progress.total}
        </span>
        <time dateTime={job.createdAt}>{job.createdAt}</time>
        {job.expiresAt !== null ? <span>有効期限: {job.expiresAt}</span> : null}
      </div>
      {job.errorReason !== null ? (
        <p role="alert">エラー: {job.errorReason}</p>
      ) : null}
      <div>
        {canDownload ? (
          <button type="button" onClick={onDownload} disabled={isPending}>
            ダウンロード
          </button>
        ) : null}
        {isActive ? (
          <button type="button" onClick={onCancel} disabled={isPending}>
            キャンセル
          </button>
        ) : null}
        <Link to="/exports/$jobId" params={{ jobId: job.id }}>
          詳細
        </Link>
      </div>
      {message !== "" ? <p role="alert">{message}</p> : null}
    </li>
  );
}
