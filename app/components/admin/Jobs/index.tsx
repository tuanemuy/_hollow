"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useTransition } from "react";
import type { RebuildSearchIndexResultDTO } from "@/core/application/dto/adminSettings";
import type { ExportJobDTO } from "@/core/application/dto/export";
import type { IngestionJobDTO } from "@/core/application/dto/ingestion";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  rebuildSearchIndexFn,
  retryExportJobFn,
  retryIngestionJobFn,
} from "./action";

type IngestionStatus = IngestionJobDTO["status"];
type ExportStatus = ExportJobDTO["status"];
type Tone = "info" | "success" | "warning" | "error";

const TAG_BASE =
  "inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium";
const TAG_TONE: Record<Tone, string> = {
  info: "bg-accent-surface text-accent-ink",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  error: "bg-error-surface text-error",
};

const BTN_SM_CLASS =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface text-ink text-xs font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";

const FIELD_ERROR_CLASS = "text-xs text-error mt-1";

const SECTION_CLASS = "mb-10";
const SECTION_HEADER_CLASS = "flex items-baseline justify-between gap-3 mb-4";
const SECTION_TITLE_CLASS = "text-xl font-semibold tracking-tight m-0";
const SECTION_DESC_CLASS = "text-sm text-ink-secondary m-0 mb-4";
const TABLE_WRAP_CLASS = "border border-hairline rounded-lg overflow-hidden";
const TABLE_SCROLL_CLASS = "overflow-x-auto";
const TABLE_CLASS = "w-full border-collapse text-sm";
const TH_CLASS =
  "font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-left align-middle px-4 py-3";
const TH_RIGHT_CLASS = `${TH_CLASS.replace("text-left", "text-right")}`;
const TD_CLASS = "px-4 py-3 text-left align-middle";
const TD_RIGHT_CLASS = "px-4 py-3 text-right align-middle";
const ROW_CLASS =
  "border-t border-hairline first:border-t-0 hover:bg-surface-elevated";

// Stable sort (ES2019+) preserves the loader-side ORDER BY updated_at DESC for rows within the same bucket.
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

function ingestionStatusTag(status: IngestionStatus): Tone {
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

function exportStatusTag(status: ExportStatus): Tone {
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
    <tr className={ROW_CLASS}>
      <td className={TD_CLASS}>
        <div
          className="text-sm font-medium"
          title={job.id as unknown as string}
        >
          {shortenId(job.id as unknown as string)}
        </div>
        <div className="text-xs text-ink-tertiary">{job.originalFileName}</div>
      </td>
      <td className={TD_CLASS}>
        <span
          className={`${TAG_BASE} ${TAG_TONE[ingestionStatusTag(job.status)]}`}
        >
          {ingestionStatusLabel(job.status)}
        </span>
      </td>
      <td className={TD_CLASS}>{job.kind}</td>
      <td className={TD_CLASS} title={job.ownerId as unknown as string}>
        {shortenId(job.ownerId as unknown as string)}
      </td>
      <td className={TD_CLASS}>{formatDateTime(job.updatedAt)}</td>
      <td className={TD_CLASS}>
        {job.errorCode !== null ? (
          <div>
            <div className="font-mono">{job.errorCode}</div>
            {job.errorReason !== null ? (
              <div className="text-xs text-ink-tertiary">{job.errorReason}</div>
            ) : null}
          </div>
        ) : (
          <span className="text-ink-tertiary">—</span>
        )}
      </td>
      <td className={TD_RIGHT_CLASS}>
        {job.status === "failed" ? (
          <button
            type="button"
            className={BTN_SM_CLASS}
            onClick={runRetry}
            disabled={isPending}
          >
            {isPending ? "再実行中…" : "再実行"}
          </button>
        ) : null}
        {summary !== "" ? (
          <p
            className={`${FIELD_ERROR_CLASS} text-right`}
            style={{ marginTop: 6 }}
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
    <tr className={ROW_CLASS}>
      <td className={TD_CLASS}>
        <div
          className="text-sm font-medium"
          title={job.id as unknown as string}
        >
          {shortenId(job.id as unknown as string)}
        </div>
        <div className="text-xs text-ink-tertiary">
          {job.format} · {job.scope}
        </div>
      </td>
      <td className={TD_CLASS}>
        <span
          className={`${TAG_BASE} ${TAG_TONE[exportStatusTag(job.status)]}`}
        >
          {exportStatusLabel(job.status)}
        </span>
      </td>
      <td className={TD_CLASS}>
        {job.progress.total > 0
          ? `${job.progress.processed}/${job.progress.total}`
          : "—"}
      </td>
      <td className={TD_CLASS} title={job.ownerId as unknown as string}>
        {shortenId(job.ownerId as unknown as string)}
      </td>
      <td className={TD_CLASS}>{formatDateTime(job.createdAt)}</td>
      <td className={TD_CLASS}>
        {job.errorReason !== null ? (
          <div className="text-xs text-ink-tertiary">{job.errorReason}</div>
        ) : (
          <span className="text-ink-tertiary">—</span>
        )}
      </td>
      <td className={TD_RIGHT_CLASS}>
        {job.status === "failed" ? (
          <button
            type="button"
            className={BTN_SM_CLASS}
            onClick={runRetry}
            disabled={isPending}
          >
            {isPending ? "再実行中…" : "再実行"}
          </button>
        ) : null}
        {summary !== "" ? (
          <p
            className={`${FIELD_ERROR_CLASS} text-right`}
            style={{ marginTop: 6 }}
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
    <section className={SECTION_CLASS}>
      <div className={SECTION_HEADER_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>クリーンアップ</h2>
      </div>
      <p className={SECTION_DESC_CLASS}>
        以下は cron
        駆動で実行されます。実行履歴の永続化は未対応のため、ここでは概要のみ表示します。
      </p>
      <div className={TABLE_WRAP_CLASS}>
        <div className={TABLE_SCROLL_CLASS}>
          <table className={TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TH_CLASS}>項目</th>
                <th className={TH_CLASS}>説明</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.title} className={ROW_CLASS}>
                  <td className={TD_CLASS}>{item.title}</td>
                  <td className={TD_CLASS}>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SearchIndexSection() {
  const rebuild = useServerFn(rebuildSearchIndexFn);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<RebuildSearchIndexResultDTO | null>(
    null,
  );
  const [error, setError] = useState<SerializedError | null>(null);

  const runRebuild = () => {
    startTransition(async () => {
      setError(null);
      try {
        const out = await rebuild();
        setResult(out);
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <section className={SECTION_CLASS}>
      <div className={SECTION_HEADER_CLASS}>
        <h2 className={SECTION_TITLE_CLASS}>検索インデックスの再構築</h2>
      </div>
      <p className={SECTION_DESC_CLASS}>
        Note を source of truth として `search_documents` を再投入します。host
        table
        が古い・破損した場合の整合性回復経路です。実行中は再構築ボタンを無効化します。
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={BTN_SM_CLASS}
          onClick={runRebuild}
          disabled={isPending}
          data-pending={isPending || undefined}
        >
          {isPending ? "再構築中…" : "再構築を実行"}
        </button>
        {result !== null ? (
          <p className="text-xs text-ink-secondary m-0">
            {result.processedCount} 件を {formatDateTime(result.finishedAt)}{" "}
            に再投入しました
          </p>
        ) : null}
      </div>
      {summary !== "" ? (
        <p className={FIELD_ERROR_CLASS} style={{ marginTop: 6 }}>
          {summary}
        </p>
      ) : null}
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
      <section className={SECTION_CLASS}>
        <div className={SECTION_HEADER_CLASS}>
          <h2 className={SECTION_TITLE_CLASS}>取り込みジョブ</h2>
        </div>
        <p className={SECTION_DESC_CLASS}>
          最新 {ingestionJobs.length} 件。失敗ジョブを上部にピン留めします。
        </p>
        <div className={TABLE_WRAP_CLASS}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
              <thead>
                <tr>
                  <th className={TH_CLASS}>ジョブ</th>
                  <th className={TH_CLASS}>状態</th>
                  <th className={TH_CLASS}>種別</th>
                  <th className={TH_CLASS}>所有者</th>
                  <th className={TH_CLASS}>更新</th>
                  <th className={TH_CLASS}>エラー</th>
                  <th className={TH_RIGHT_CLASS}>アクション</th>
                </tr>
              </thead>
              <tbody>
                {sortedIngestion.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center text-ink-tertiary px-4 py-6"
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

      <section className={SECTION_CLASS}>
        <div className={SECTION_HEADER_CLASS}>
          <h2 className={SECTION_TITLE_CLASS}>エクスポートジョブ</h2>
        </div>
        <p className={SECTION_DESC_CLASS}>
          最新 {exportJobs.length} 件。失敗ジョブを上部にピン留めします。
        </p>
        <div className={TABLE_WRAP_CLASS}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
              <thead>
                <tr>
                  <th className={TH_CLASS}>ジョブ</th>
                  <th className={TH_CLASS}>状態</th>
                  <th className={TH_CLASS}>進捗</th>
                  <th className={TH_CLASS}>所有者</th>
                  <th className={TH_CLASS}>作成</th>
                  <th className={TH_CLASS}>エラー</th>
                  <th className={TH_RIGHT_CLASS}>アクション</th>
                </tr>
              </thead>
              <tbody>
                {sortedExport.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center text-ink-tertiary px-4 py-6"
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

      <SearchIndexSection />

      <CleanupSection />
    </>
  );
}
