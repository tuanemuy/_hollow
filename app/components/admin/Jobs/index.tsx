"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  KeyRound,
  Link2,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { pillBtn, pillBtnSm } from "@/components/common/styles";
import type {
  BackfillInternalLinksResultDTO,
  RebuildSearchIndexResultDTO,
  ReencryptApiKeyResultDTO,
} from "@/core/application/dto/adminSettings";
import type { ExportJobDTO } from "@/core/application/dto/export";
import type { IngestionJobDTO } from "@/core/application/dto/ingestion";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  backfillInternalLinksFn,
  rebuildSearchIndexFn,
  reencryptApiKeyFn,
  retryExportJobFn,
  retryIngestionJobFn,
} from "./action";

type IngestionStatus = IngestionJobDTO["status"];
type ExportStatus = ExportJobDTO["status"];
type Tone = "info" | "success" | "warning" | "error";

const TAG_BASE =
  "inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium whitespace-nowrap";
const TAG_TONE: Record<Tone, string> = {
  info: "bg-accent-surface text-accent-ink",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  error: "bg-error-surface text-error",
};

const FIELD_ERROR_CLASS = "text-xs text-error mt-1";

const SECTION_CLASS = "mb-10";
const SECTION_HEADER_CLASS = "flex items-baseline justify-between gap-3 mb-4";
const SECTION_TITLE_CLASS = "text-xl font-semibold tracking-tight m-0";
const SECTION_DESC_CLASS = "text-sm text-ink-secondary m-0 mb-4";
// Below `sm` each high-density table reflows into one card per row (same
// approach as P45 UsersTable / P47 Metrics): the <table>/<tr>/<td> become
// block, <thead> is hidden, and each auxiliary cell carries a real <span>
// column label (#589 ADR-001/ADR-002). Desktop is untouched (`max-sm:` only).
const TABLE_WRAP_CLASS =
  "border border-hairline rounded-lg overflow-hidden max-sm:border-none max-sm:rounded-none";
const TABLE_SCROLL_CLASS = "overflow-x-auto max-sm:overflow-x-visible";
const TABLE_CLASS =
  "w-full min-w-[920px] max-sm:min-w-0 border-collapse text-sm max-sm:block";
const TH_CLASS =
  "font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-left align-middle px-4 py-3";
const TH_RIGHT_CLASS = `${TH_CLASS.replace("text-left", "text-right")}`;
const TD_CLASS =
  "px-4 py-3 text-left align-middle max-sm:flex max-sm:gap-3 max-sm:items-start max-sm:py-1";
const TD_RIGHT_CLASS =
  "px-4 py-3 text-right align-middle max-sm:block max-sm:pt-3 max-sm:mt-2 max-sm:border-t max-sm:border-hairline";
// Job-heading cell (job ID + file): no label, bottom-bordered card header.
const TD_HEAD_CLASS =
  "px-4 py-3 text-left align-middle max-sm:block max-sm:pb-3 max-sm:mb-2 max-sm:border-b max-sm:border-hairline";
const STACK_LABEL =
  "hidden max-sm:inline-block max-sm:w-[84px] text-ink-tertiary text-xs uppercase tracking-[0.04em]";
// Action cell inner row: stacks full-width below `sm`, restoring the 44px tap
// floor stripped by `pillBtnSm` via the parent-scoped child selector (ADR-004,
// mirrors publication/styles.ts LINK_MINI_ROW).
const ACTION_ROW_CLASS =
  "max-sm:flex max-sm:flex-col max-sm:items-stretch [&>button]:max-sm:min-h-[44px]! [&>button]:max-sm:w-full [&>button]:max-sm:justify-center";
// Operation section row (rebuild / backfill / re-encrypt): same stacking + floor.
const OP_ROW_CLASS =
  "flex items-center gap-3 max-sm:flex-col max-sm:items-stretch [&>button]:max-sm:min-h-[44px]! [&>button]:max-sm:w-full [&>button]:max-sm:justify-center";
const ROW_CLASS =
  "border-t border-hairline first:border-t-0 hover:bg-surface-elevated max-sm:block max-sm:border max-sm:border-hairline max-sm:rounded-lg max-sm:mb-3 max-sm:p-4 max-sm:bg-bg";
const EMPTY_CELL_CLASS =
  "text-center text-ink-tertiary px-4 py-6 max-sm:block max-sm:text-center";

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
        await retry({ data: { jobId: job.id } });
        await onChange();
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <tr className={ROW_CLASS}>
      <td className={TD_HEAD_CLASS}>
        <div className="text-sm font-medium" title={job.id}>
          {shortenId(job.id)}
        </div>
        <div className="text-xs text-ink-tertiary">{job.originalFileName}</div>
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>状態</span>
        <span
          className={`${TAG_BASE} ${TAG_TONE[ingestionStatusTag(job.status)]}`}
        >
          {ingestionStatusLabel(job.status)}
        </span>
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>種別</span>
        {job.kind}
      </td>
      <td className={TD_CLASS} title={job.ownerId}>
        <span className={STACK_LABEL}>所有者</span>
        <span className="max-sm:break-words">{shortenId(job.ownerId)}</span>
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>更新</span>
        {formatDateTime(job.updatedAt)}
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>エラー</span>
        {job.errorCode !== null ? (
          <div className="max-sm:break-words">
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
        <div className={ACTION_ROW_CLASS}>
          {job.status === "failed" ? (
            <button
              type="button"
              className={`${pillBtn} ${pillBtnSm}`}
              data-sm=""
              onClick={runRetry}
              disabled={isPending}
            >
              <Icon icon={RefreshCw} />
              {isPending ? "再実行中…" : "再実行"}
            </button>
          ) : null}
          {summary !== "" ? (
            <p
              className={`${FIELD_ERROR_CLASS} text-right max-sm:text-left`}
              style={{ marginTop: 6 }}
            >
              {summary}
            </p>
          ) : null}
        </div>
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
        await retry({ data: { jobId: job.id } });
        await onChange();
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <tr className={ROW_CLASS}>
      <td className={TD_HEAD_CLASS}>
        <div className="text-sm font-medium" title={job.id}>
          {shortenId(job.id)}
        </div>
        <div className="text-xs text-ink-tertiary">
          {job.format} · {job.scope}
        </div>
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>状態</span>
        <span
          className={`${TAG_BASE} ${TAG_TONE[exportStatusTag(job.status)]}`}
        >
          {exportStatusLabel(job.status)}
        </span>
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>進捗</span>
        {job.progress.total > 0
          ? `${job.progress.processed}/${job.progress.total}`
          : "—"}
      </td>
      <td className={TD_CLASS} title={job.ownerId}>
        <span className={STACK_LABEL}>所有者</span>
        <span className="max-sm:break-words">{shortenId(job.ownerId)}</span>
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>作成</span>
        {formatDateTime(job.createdAt)}
      </td>
      <td className={TD_CLASS}>
        <span className={STACK_LABEL}>エラー</span>
        {job.errorReason !== null ? (
          <div className="text-xs text-ink-tertiary max-sm:break-words">
            {job.errorReason}
          </div>
        ) : (
          <span className="text-ink-tertiary">—</span>
        )}
      </td>
      <td className={TD_RIGHT_CLASS}>
        <div className={ACTION_ROW_CLASS}>
          {job.status === "failed" ? (
            <button
              type="button"
              className={`${pillBtn} ${pillBtnSm}`}
              data-sm=""
              onClick={runRetry}
              disabled={isPending}
            >
              <Icon icon={RefreshCw} />
              {isPending ? "再実行中…" : "再実行"}
            </button>
          ) : null}
          {summary !== "" ? (
            <p
              className={`${FIELD_ERROR_CLASS} text-right max-sm:text-left`}
              style={{ marginTop: 6 }}
            >
              {summary}
            </p>
          ) : null}
        </div>
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
        <h2 className={`${SECTION_TITLE_CLASS} inline-flex items-center gap-2`}>
          <Icon icon={Sparkles} />
          クリーンアップ
        </h2>
      </div>
      <p className={SECTION_DESC_CLASS}>
        以下は cron
        駆動で実行されます。実行履歴の永続化は未対応のため、ここでは概要のみ表示します。
      </p>
      <div className={TABLE_WRAP_CLASS}>
        <div className={TABLE_SCROLL_CLASS}>
          <table className={TABLE_CLASS}>
            <thead className="max-sm:hidden">
              <tr>
                <th className={TH_CLASS}>項目</th>
                <th className={TH_CLASS}>説明</th>
              </tr>
            </thead>
            <tbody className="max-sm:block">
              {items.map((item) => (
                <tr key={item.title} className={ROW_CLASS}>
                  <td className={TD_HEAD_CLASS}>{item.title}</td>
                  <td className={TD_CLASS}>
                    <span className={STACK_LABEL}>説明</span>
                    {item.description}
                  </td>
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
        <h2 className={`${SECTION_TITLE_CLASS} inline-flex items-center gap-2`}>
          <Icon icon={Search} />
          検索インデックスの再構築
        </h2>
      </div>
      <p className={SECTION_DESC_CLASS}>
        Note を source of truth として `search_documents` を再投入します。host
        table
        が古い・破損した場合の整合性回復経路です。実行中は再構築ボタンを無効化します。
      </p>
      <div className={OP_ROW_CLASS}>
        <button
          type="button"
          className={`${pillBtn} ${pillBtnSm}`}
          data-sm=""
          onClick={runRebuild}
          disabled={isPending}
          aria-busy={isPending || undefined}
          data-pending={isPending || undefined}
        >
          <Icon icon={RefreshCw} />
          {isPending ? "再構築中…" : "再構築を実行"}
        </button>
        {result !== null ? (
          <p
            className="text-xs text-ink-secondary m-0"
            role="status"
            aria-live="polite"
          >
            {result.processedCount} 件を {formatDateTime(result.finishedAt)}{" "}
            に再投入しました
          </p>
        ) : null}
      </div>
      {summary !== "" ? (
        <p className={`${FIELD_ERROR_CLASS} mt-1.5`} role="alert">
          {summary}
        </p>
      ) : null}
    </section>
  );
}

function InternalLinkBackfillSection() {
  const backfill = useServerFn(backfillInternalLinksFn);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BackfillInternalLinksResultDTO | null>(
    null,
  );
  const [error, setError] = useState<SerializedError | null>(null);

  const runBackfill = () => {
    startTransition(async () => {
      setError(null);
      try {
        const out = await backfill();
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
        <h2 className={`${SECTION_TITLE_CLASS} inline-flex items-center gap-2`}>
          <Icon icon={Link2} />
          内部リンクのバックフィル
        </h2>
      </div>
      <p className={SECTION_DESC_CLASS}>
        未解決の内部リンク（`resolved_note_id IS NULL`）を全 owner
        横断で再解決します。#127
        修正前から滞留している行の運用修復経路です。冪等なので再実行できます。実行中はボタンを無効化します。
      </p>
      <div className={OP_ROW_CLASS}>
        <button
          type="button"
          className={`${pillBtn} ${pillBtnSm}`}
          data-sm=""
          onClick={runBackfill}
          disabled={isPending}
          aria-busy={isPending || undefined}
          data-pending={isPending || undefined}
        >
          <Icon icon={Link2} />
          {isPending ? "バックフィル中…" : "バックフィルを実行"}
        </button>
        {result !== null ? (
          <p
            className="text-xs text-ink-secondary m-0"
            role="status"
            aria-live="polite"
          >
            {result.resolvedRows} 件のリンクを解決しました（owner{" "}
            {result.ownerCount} 名・走査 {result.scannedNotes} 回 / 走査回数は
            distinct ノート数ではありません）—{" "}
            {formatDateTime(result.finishedAt)}
          </p>
        ) : null}
      </div>
      {summary !== "" ? (
        <p className={`${FIELD_ERROR_CLASS} mt-1.5`} role="alert">
          {summary}
        </p>
      ) : null}
    </section>
  );
}

function reencryptResultLabel(result: ReencryptApiKeyResultDTO): string {
  if (result.reencrypted) {
    return "API キーを新しいマスターキーで再暗号化しました。";
  }
  switch (result.skipped) {
    case "already-new-key":
      return "すでに現在のマスターキーで暗号化済みです（処理なし）。";
    case "not-db":
      return "API キーは環境変数管理のため、再暗号化対象がありません。";
    default:
      return "処理なし。";
  }
}

function SecretRotationSection() {
  const reencrypt = useServerFn(reencryptApiKeyFn);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ReencryptApiKeyResultDTO | null>(null);
  const [error, setError] = useState<SerializedError | null>(null);

  const runReencrypt = () => {
    startTransition(async () => {
      setError(null);
      try {
        const out = await reencrypt();
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
        <h2 className={`${SECTION_TITLE_CLASS} inline-flex items-center gap-2`}>
          <Icon icon={KeyRound} />
          マスターキーの再暗号化
        </h2>
      </div>
      <p className={SECTION_DESC_CLASS}>
        `SECRET_BOX_MASTER_KEY` をローテーションした後に実行します。DB
        保存された LLM API
        キーを旧マスターキーで復号し、新マスターキーで再暗号化します。新キーをデプロイし、旧キーを
        `SECRET_BOX_MASTER_KEY_PREVIOUS`
        に設定した状態で実行してください。完了後は旧キーを削除します。冪等のため複数回実行しても安全です。
      </p>
      <div className={OP_ROW_CLASS}>
        <button
          type="button"
          className={`${pillBtn} ${pillBtnSm}`}
          data-sm=""
          onClick={runReencrypt}
          disabled={isPending}
          aria-busy={isPending || undefined}
          data-pending={isPending || undefined}
        >
          <Icon icon={KeyRound} />
          {isPending ? "再暗号化中…" : "再暗号化を実行"}
        </button>
        {result !== null ? (
          <p
            className="text-xs text-ink-secondary m-0"
            role="status"
            aria-live="polite"
          >
            {reencryptResultLabel(result)}
          </p>
        ) : null}
      </div>
      {summary !== "" ? (
        <p className={`${FIELD_ERROR_CLASS} mt-1.5`} role="alert">
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
    await routerInvalidate(router);
  };

  return (
    <>
      <section className={SECTION_CLASS}>
        <div className={SECTION_HEADER_CLASS}>
          <h2
            className={`${SECTION_TITLE_CLASS} inline-flex items-center gap-2`}
          >
            <Icon icon={Upload} />
            取り込みジョブ
          </h2>
        </div>
        <p className={SECTION_DESC_CLASS}>
          最新 {ingestionJobs.length} 件。失敗ジョブを上部にピン留めします。
        </p>
        <div className={TABLE_WRAP_CLASS}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
              <thead className="max-sm:hidden">
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
              <tbody className="max-sm:block">
                {sortedIngestion.length === 0 ? (
                  <tr className="max-sm:block">
                    <td colSpan={7} className={EMPTY_CELL_CLASS}>
                      取り込みジョブはまだありません。
                    </td>
                  </tr>
                ) : (
                  sortedIngestion.map((job) => (
                    <IngestionRow key={job.id} job={job} onChange={onChange} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={SECTION_CLASS}>
        <div className={SECTION_HEADER_CLASS}>
          <h2
            className={`${SECTION_TITLE_CLASS} inline-flex items-center gap-2`}
          >
            <Icon icon={Download} />
            エクスポートジョブ
          </h2>
        </div>
        <p className={SECTION_DESC_CLASS}>
          最新 {exportJobs.length} 件。失敗ジョブを上部にピン留めします。
        </p>
        <div className={TABLE_WRAP_CLASS}>
          <div className={TABLE_SCROLL_CLASS}>
            <table className={TABLE_CLASS}>
              <thead className="max-sm:hidden">
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
              <tbody className="max-sm:block">
                {sortedExport.length === 0 ? (
                  <tr className="max-sm:block">
                    <td colSpan={7} className={EMPTY_CELL_CLASS}>
                      エクスポートジョブはまだありません。
                    </td>
                  </tr>
                ) : (
                  sortedExport.map((job) => (
                    <ExportRow key={job.id} job={job} onChange={onChange} />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <SearchIndexSection />

      <InternalLinkBackfillSection />

      <SecretRotationSection />

      <CleanupSection />
    </>
  );
}
