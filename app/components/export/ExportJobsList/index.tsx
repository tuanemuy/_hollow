"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { exportStatusTag } from "@/components/common/exportStatus";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  formError,
  pillBtn,
  pillBtnDanger,
  pillBtnGhost,
  pillBtnPrimary,
  pillBtnSmDense,
  tagBadge,
  tagTone,
} from "@/components/common/styles";
import { EMPTY_STATE } from "@/components/layout/styles";
import type { ExportJobDTO } from "@/core/application/export/view";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { cancelExportFn, downloadExportFn } from "../ExportForm/action";
import {
  COUNT_CELL,
  FAIL_SUMMARY,
  FORMAT_PILL,
  JOB_ACTIONS,
  JOB_CARD,
  JOB_CARD_HEAD,
  JOB_META,
  JOB_META_DIVIDER,
  JOBS_LIST,
  META_K,
  META_V,
  PROGRESS,
  PROGRESS_BAR,
  STATUS_DOT,
  STATUS_DOT_COLOR,
} from "../styles";

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
    return <p className={EMPTY_STATE}>エクスポートジョブはありません。</p>;
  }
  return (
    <ul className={JOBS_LIST}>
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

  const tone = exportStatusTag(job.status);
  const showProgressBar = job.status === "processing" && job.progress.total > 0;
  const pct =
    job.progress.total > 0
      ? Math.min(
          100,
          Math.round((job.progress.processed / job.progress.total) * 100),
        )
      : 0;

  return (
    <li className={JOB_CARD}>
      <div className={JOB_CARD_HEAD}>
        <div className="min-w-0 flex-1">
          <span className={`${tagBadge} ${tagTone[tone]}`}>
            <span
              className={`${STATUS_DOT} ${STATUS_DOT_COLOR[tone]} ${
                job.status === "processing" ? "motion-safe:animate-pulse" : ""
              }`}
              aria-hidden="true"
            />
            {STATUS_LABEL[job.status]}
          </span>
        </div>
        <span className={FORMAT_PILL}>
          {job.format} / {job.scope}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className={COUNT_CELL}>
          {job.progress.processed}/{job.progress.total}
        </span>
        {showProgressBar ? (
          <div className={PROGRESS}>
            <div className={PROGRESS_BAR} style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>

      {job.errorReason !== null ? (
        <p className={FAIL_SUMMARY} role="alert">
          エラー: {job.errorReason}
        </p>
      ) : null}

      <div className={`${JOB_META} ${JOB_META_DIVIDER}`}>
        <div className="min-w-0">
          <div className={META_K}>作成日時</div>
          <time className={META_V} dateTime={job.createdAt}>
            {job.createdAt}
          </time>
        </div>
        {job.expiresAt !== null ? (
          <div className="min-w-0">
            <div className={META_K}>有効期限</div>
            <span className={META_V}>{job.expiresAt}</span>
          </div>
        ) : null}
      </div>

      <div className={JOB_ACTIONS}>
        {canDownload ? (
          <button
            type="button"
            className={`${pillBtn} ${pillBtnPrimary} ${pillBtnSmDense}`}
            data-primary=""
            data-sm=""
            onClick={onDownload}
            disabled={isPending}
          >
            ダウンロード
          </button>
        ) : null}
        {isActive ? (
          <button
            type="button"
            className={`${pillBtn} ${pillBtnDanger} ${pillBtnSmDense}`}
            data-danger=""
            data-sm=""
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </button>
        ) : null}
        <Link
          to="/exports/$jobId"
          params={{ jobId: job.id }}
          className={`${pillBtn} ${pillBtnGhost} ${pillBtnSmDense}`}
          data-ghost=""
          data-sm=""
        >
          詳細
        </Link>
      </div>
      {message !== "" ? (
        <p className={formError} role="alert">
          {message}
        </p>
      ) : null}
    </li>
  );
}
