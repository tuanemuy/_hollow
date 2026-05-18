"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useTransition } from "react";
import type { ExportJobDTO } from "@/core/application/dto/export";
import type { IngestionJobDTO } from "@/core/application/dto/ingestion";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { retryExportJobFn, retryIngestionJobFn } from "./action";

type IngestionStatus = IngestionJobDTO["status"];
type ExportStatus = ExportJobDTO["status"];

const STATUS_ORDER: Record<IngestionStatus | ExportStatus, number> = {
  failed: 0,
  pending: 1,
  processing: 2,
  previewing: 3,
  completed: 4,
  saved: 5,
  cancelled: 6,
  expired: 7,
  discarded: 8,
};

function sortFailedFirst<T extends { status: IngestionStatus | ExportStatus }>(
  rows: readonly T[],
): readonly T[] {
  return [...rows].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99),
  );
}

function ingestionStatusTag(status: IngestionStatus): string {
  switch (status) {
    case "failed":
      return "error";
    case "pending":
    case "processing":
    case "previewing":
      return "info";
    case "saved":
      return "success";
    case "discarded":
      return "warning";
  }
}

function ingestionStatusLabel(status: IngestionStatus): string {
  switch (status) {
    case "pending":
      return "待機中";
    case "processing":
      return "処理中";
    case "previewing":
      return "プレビュー中";
    case "saved":
      return "保存済";
    case "failed":
      return "失敗";
    case "discarded":
      return "破棄";
  }
}

function exportStatusTag(status: ExportStatus): string {
  switch (status) {
    case "failed":
      return "error";
    case "pending":
    case "processing":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
    case "expired":
      return "warning";
  }
}

function exportStatusLabel(status: ExportStatus): string {
  switch (status) {
    case "pending":
      return "待機中";
    case "processing":
      return "処理中";
    case "completed":
      return "完了";
    case "failed":
      return "失敗";
    case "cancelled":
      return "キャンセル";
    case "expired":
      return "期限切れ";
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function IngestionRow({
  job,
  onChange,
}: {
  job: IngestionJobDTO;
  onChange: () => Promise<void>;
}) {
  const retry = useServerFn(retryIngestionJobFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const runRetry = () => {
    startTransition(async () => {
      setError(null);
      try {
        await retry({ data: { jobId: job.id as unknown as string } });
        await onChange();
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <tr>
      <td>
        <div className="admin-user-handle" title={job.id as unknown as string}>
          {shortenId(job.id as unknown as string)}
        </div>
        <div className="admin-user-sub">{job.originalFileName}</div>
      </td>
      <td>
        <span className={`admin-tag ${ingestionStatusTag(job.status)}`}>
          {ingestionStatusLabel(job.status)}
        </span>
      </td>
      <td>{job.kind}</td>
      <td title={job.ownerId as unknown as string}>
        {shortenId(job.ownerId as unknown as string)}
      </td>
      <td>{formatDateTime(job.updatedAt)}</td>
      <td>
        {job.errorCode !== null ? (
          <div>
            <div style={{ fontFamily: "var(--admin-font-mono)" }}>
              {job.errorCode}
            </div>
            {job.errorReason !== null ? (
              <div className="admin-user-sub">{job.errorReason}</div>
            ) : null}
          </div>
        ) : (
          <span style={{ color: "var(--admin-color-ink-tertiary)" }}>—</span>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        {job.status === "failed" ? (
          <button
            type="button"
            className="admin-btn sm"
            onClick={runRetry}
            disabled={isPending}
          >
            {isPending ? "再実行中…" : "再実行"}
          </button>
        ) : null}
        {summary !== "" ? (
          <p
            className="admin-field-error"
            style={{ textAlign: "right", marginTop: 6 }}
          >
            {summary}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function ExportRow({
  job,
  onChange,
}: {
  job: ExportJobDTO;
  onChange: () => Promise<void>;
}) {
  const retry = useServerFn(retryExportJobFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const runRetry = () => {
    startTransition(async () => {
      setError(null);
      try {
        await retry({ data: { jobId: job.id as unknown as string } });
        await onChange();
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <tr>
      <td>
        <div className="admin-user-handle" title={job.id as unknown as string}>
          {shortenId(job.id as unknown as string)}
        </div>
        <div className="admin-user-sub">
          {job.format} · {job.scope}
        </div>
      </td>
      <td>
        <span className={`admin-tag ${exportStatusTag(job.status)}`}>
          {exportStatusLabel(job.status)}
        </span>
      </td>
      <td>
        {job.progress.total > 0
          ? `${job.progress.processed}/${job.progress.total}`
          : "—"}
      </td>
      <td title={job.ownerId as unknown as string}>
        {shortenId(job.ownerId as unknown as string)}
      </td>
      <td>{formatDateTime(job.createdAt)}</td>
      <td>
        {job.errorReason !== null ? (
          <div className="admin-user-sub">{job.errorReason}</div>
        ) : (
          <span style={{ color: "var(--admin-color-ink-tertiary)" }}>—</span>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        {job.status === "failed" ? (
          <button
            type="button"
            className="admin-btn sm"
            onClick={runRetry}
            disabled={isPending}
          >
            {isPending ? "再実行中…" : "再実行"}
          </button>
        ) : null}
        {summary !== "" ? (
          <p
            className="admin-field-error"
            style={{ textAlign: "right", marginTop: 6 }}
          >
            {summary}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function CleanupSection() {
  const items: readonly { title: string; description: string }[] = [
    {
      title: "メディア孤児クリーンアップ",
      description:
        "参照されないメディアを定期パージします。実行は cron 駆動で、現状は実行履歴を保持しないため最終実行時刻・件数は表示しません。",
    },
    {
      title: "ゴミ箱自動パージ",
      description:
        "保持期間を超えたゴミ箱内ノートを物理削除します。保持期間は `/admin/metrics` のインスタンス上限を参照。",
    },
    {
      title: "期限切れエクスポート artifact 削除",
      description:
        "期限切れの artifact ファイルとメタデータをまとめてパージします。実行履歴の永続化と失敗アラートは別 Issue で対応予定です。",
    },
  ];
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">クリーンアップ</h2>
      </div>
      <p className="admin-section-desc">
        以下は cron
        駆動で実行されます。実行履歴の永続化は未対応のため、ここでは概要のみ表示します。
      </p>
      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>項目</th>
                <th>説明</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.title}>
                  <td>{item.title}</td>
                  <td>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function JobsBoard({
  ingestionJobs,
  exportJobs,
}: {
  ingestionJobs: readonly IngestionJobDTO[];
  exportJobs: readonly ExportJobDTO[];
}) {
  const router = useRouter();

  const sortedIngestion = useMemo(
    () => sortFailedFirst(ingestionJobs),
    [ingestionJobs],
  );
  const sortedExport = useMemo(() => sortFailedFirst(exportJobs), [exportJobs]);

  const onChange = async () => {
    await router.invalidate();
  };

  return (
    <>
      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">取り込みジョブ</h2>
        </div>
        <p className="admin-section-desc">
          最新 {ingestionJobs.length} 件。失敗ジョブを上部にピン留めします。
        </p>
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ジョブ</th>
                  <th>状態</th>
                  <th>種別</th>
                  <th>所有者</th>
                  <th>更新</th>
                  <th>エラー</th>
                  <th style={{ textAlign: "right" }}>アクション</th>
                </tr>
              </thead>
              <tbody>
                {sortedIngestion.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        color: "var(--admin-color-ink-tertiary)",
                        padding: "var(--admin-space-6)",
                      }}
                    >
                      取り込みジョブはまだありません。
                    </td>
                  </tr>
                ) : (
                  sortedIngestion.map((job) => (
                    <IngestionRow
                      key={job.id as unknown as string}
                      job={job}
                      onChange={onChange}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">エクスポートジョブ</h2>
        </div>
        <p className="admin-section-desc">
          最新 {exportJobs.length} 件。失敗ジョブを上部にピン留めします。
        </p>
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ジョブ</th>
                  <th>状態</th>
                  <th>進捗</th>
                  <th>所有者</th>
                  <th>作成</th>
                  <th>エラー</th>
                  <th style={{ textAlign: "right" }}>アクション</th>
                </tr>
              </thead>
              <tbody>
                {sortedExport.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        color: "var(--admin-color-ink-tertiary)",
                        padding: "var(--admin-space-6)",
                      }}
                    >
                      エクスポートジョブはまだありません。
                    </td>
                  </tr>
                ) : (
                  sortedExport.map((job) => (
                    <ExportRow
                      key={job.id as unknown as string}
                      job={job}
                      onChange={onChange}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <CleanupSection />
    </>
  );
}
