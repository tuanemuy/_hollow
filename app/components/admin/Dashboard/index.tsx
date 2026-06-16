import {
  AlertCircle,
  AlertTriangle,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/common/Icon";
import {
  ALERT,
  ALERT_BODY,
  ALERT_CONTENT,
  ALERT_ERROR,
  ALERT_ICON,
  ALERT_INFO,
  ALERT_TITLE_MONO,
  ALERT_WARNING,
  tagBadge,
  tagTone,
  tagToneNeutral,
} from "@/components/common/styles";
import type { RecentActivityRowDTO } from "@/core/application/activityLog/getRecentActivity";
import type { ActivityKind } from "@/core/application/activityLog/types";
import type { HourlyMetricPointDTO } from "@/core/application/adminSettings/getUsageMetrics";
import type { AlertDTO } from "@/core/application/dto/common";
import { requireAdminUser } from "@/lib/server/currentUser";
import { loadRecentActivity, loadUsageMetrics } from "./action";
import {
  type ActivityTagTone,
  activityTagTone,
  buildSparkline,
  CHART_HEIGHT,
  CHART_WIDTH,
  hasActivityRows,
  sumCounts,
} from "./chart";

function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("ja-JP").format(value);
}

function formatBytes(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const scaled = value / 1024 ** i;
  return `${scaled.toFixed(scaled >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// 案D semantic modifiers are info/success/warning/error only; `critical`
// maps to `error` (no dedicated `critical` modifier).
const ALERT_TONE: Record<AlertDTO["severity"], string> = {
  critical: ALERT_ERROR,
  warning: ALERT_WARNING,
  info: ALERT_INFO,
};

const ALERT_TONE_ICON: Record<AlertDTO["severity"], LucideIcon> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

function UploadsSparkline({
  points,
}: {
  points: readonly HourlyMetricPointDTO[];
}) {
  const { line, area } = buildSparkline(points);
  return (
    <svg
      className="w-full h-[140px] text-ink-secondary"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="アップロード数の直近 24 時間の推移"
    >
      {/* `role="img"` + `aria-label` already names the chart; a duplicate
          `<title>` would double-announce on some screen readers (N-004). */}
      <defs>
        <linearGradient id="uploads-spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#uploads-spark-fill)" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Activity table — human labels and tag tones per ActivityKind. Only real,
// backend-emitted kinds appear (虚偽表示禁止): there is no D1 nightly backup
// row; "バックアップ"-adjacent activity is the per-owner export completion.
const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  user_created: "新規ユーザー",
  large_upload: "大量アップロード",
  job_failed: "ジョブ失敗",
  settings_changed: "設定変更",
  export_completed: "エクスポート完了",
};

// Tag tone per ActivityKind, matching the P40 mock's `.tag` variants. The tone
// is derived from the kind (display concern) rather than the row's backend
// `severity`, so the table colours follow the mock without touching the
// application-layer severity contract (N-002). `neutral` reuses the shared
// neutral chip; the rest reuse the common `tagTone` palette.
const ACTIVITY_TAG_TONE: Record<ActivityTagTone, string> = {
  info: tagTone.info,
  success: tagTone.success,
  warning: tagTone.warning,
  error: tagTone.error,
  neutral: tagToneNeutral,
};

// Responsive table: desktop is a real table; on narrow widths each cell
// stacks with an in-DOM column label (#545 / #589 ADR-004 — same approach
// as the P46 Jobs table).
const ACTIVITY_TABLE_WRAP =
  "border border-hairline rounded-lg overflow-hidden max-sm:border-none max-sm:rounded-none";
const ACTIVITY_TABLE = "w-full border-collapse text-sm max-sm:block";
const ACTIVITY_TH =
  "px-4 py-3 text-left align-middle text-ink-secondary font-medium border-b border-hairline";
const ACTIVITY_ROW =
  "border-t border-hairline first:border-t-0 max-sm:block max-sm:border max-sm:border-hairline max-sm:rounded-lg max-sm:mb-3 max-sm:p-4 max-sm:bg-bg";
const ACTIVITY_TD =
  "px-4 py-3 text-left align-middle max-sm:flex max-sm:gap-3 max-sm:items-start max-sm:px-0 max-sm:py-1";
const ACTIVITY_STACK_LABEL =
  "hidden max-sm:inline-block max-sm:w-[64px] shrink-0 text-ink-tertiary text-xs uppercase tracking-[0.04em]";

/** HH:MM in the viewer's locale time zone, matching the #545 time format. */
function formatActivityTime(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function ActivityRow({ row }: { row: RecentActivityRowDTO }) {
  return (
    <tr className={ACTIVITY_ROW}>
      <td className={ACTIVITY_TD}>
        <span className={ACTIVITY_STACK_LABEL}>時刻</span>
        <span className="text-ink-secondary tabular-nums">
          {formatActivityTime(row.occurredAt)}
        </span>
      </td>
      <td className={ACTIVITY_TD}>
        <span className={ACTIVITY_STACK_LABEL}>種類</span>
        <span
          className={`${tagBadge} ${ACTIVITY_TAG_TONE[activityTagTone(row.kind)]}`}
        >
          {ACTIVITY_KIND_LABEL[row.kind]}
        </span>
      </td>
      <td className={ACTIVITY_TD}>
        <span className={ACTIVITY_STACK_LABEL}>対象</span>
        <span className="max-sm:break-words">{row.target}</span>
      </td>
      <td className={ACTIVITY_TD}>
        <span className={ACTIVITY_STACK_LABEL}>詳細</span>
        <span className="text-ink-secondary max-sm:break-words">
          {row.detail}
        </span>
      </td>
    </tr>
  );
}

export async function AdminDashboard() {
  const actor = await requireAdminUser();
  const [metrics, activity] = await Promise.all([
    loadUsageMetrics(actor.id),
    loadRecentActivity(actor.id),
  ]);
  const totalStorage =
    metrics.storageDurableObjectBytes === null &&
    metrics.storageR2Bytes === null
      ? null
      : (metrics.storageDurableObjectBytes ?? 0) +
        (metrics.storageR2Bytes ?? 0);

  return (
    <main className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        ダッシュボード
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        Hollow インスタンス全体の状態
      </p>

      {metrics.alerts.length > 0 ? (
        <div>
          {metrics.alerts.map((alert) => (
            <div
              key={alert.code}
              className={`${ALERT} ${ALERT_TONE[alert.severity]} mb-3`}
              role="alert"
            >
              <span className={ALERT_ICON} aria-hidden="true">
                <Icon icon={ALERT_TONE_ICON[alert.severity]} size={20} />
              </span>
              <div className={ALERT_CONTENT}>
                <p className={ALERT_TITLE_MONO}>{alert.code}</p>
                <p className={ALERT_BODY}>{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 mb-8 md:grid-cols-2">
          <div className="flex items-center gap-3 px-5 py-4 rounded-lg border border-hairline bg-bg">
            <span
              className="shrink-0 w-[10px] h-[10px] rounded-full bg-success shadow-[0_0_0_4px_rgba(31,143,58,0.12)]"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink">
                All systems operational
              </div>
              <div className="text-xs text-ink-secondary mt-[2px]">
                重大アラートはありません
              </div>
            </div>
          </div>
        </div>
      )}

      <section
        className="grid grid-cols-1 gap-4 mb-10 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="主要メトリクス"
      >
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">ユーザー数</div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatNumber(metrics.userCount)}
          </div>
          <div className="text-xs text-ink-tertiary">
            {metrics.userCount === null ? "取得失敗" : "現在の登録数"}
          </div>
        </div>
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">ストレージ消費</div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatBytes(totalStorage)}
          </div>
          <div className="text-xs text-ink-tertiary">
            R2 {formatBytes(metrics.storageR2Bytes)} · DO{" "}
            {formatBytes(metrics.storageDurableObjectBytes)}
          </div>
        </div>
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">
            当日アップロード
          </div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatNumber(metrics.uploadsToday)}
          </div>
          <div className="text-xs text-ink-tertiary">
            {metrics.uploadsToday === null ? "取得失敗" : "件 / 24h"}
          </div>
        </div>
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">
            LLM 呼び出し (24h)
          </div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatNumber(metrics.llmCallsToday)}
          </div>
          <div className="text-xs text-ink-tertiary">
            {metrics.llmCallsToday === null ? "取得失敗" : "回 / 24h"}
          </div>
        </div>
      </section>

      <section className="mb-10" aria-label="直近 24 時間">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold tracking-tight m-0">
            直近 24 時間
          </h2>
          {/* 「期間を変更」導線は遷移先が未実装のため描かない (AC-8 / ADR-004) */}
        </div>
        {/* モックはアップロード/LLM の 2 枚構成だが、LLM 系列はデータ源が無く
            正しく非描画 (AC-2 / 虚偽表示禁止)。残る 1 枚を全幅にして sm 以上で
            空セルが残らないようにする。LLM 記録源が入れば 2 カラムに戻す (N-001)。 */}
        <div className="grid grid-cols-1 gap-4">
          <div className="border border-hairline rounded-lg p-5 bg-bg">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div className="text-sm text-ink-secondary">アップロード数</div>
              <div className="text-lg font-regular tracking-tighter text-ink">
                {metrics.uploadsHourly === null
                  ? "—"
                  : formatNumber(sumCounts(metrics.uploadsHourly))}
              </div>
            </div>
            {metrics.uploadsHourly === null ? (
              <div className="h-[140px] flex items-center justify-center text-xs text-ink-tertiary">
                取得失敗
              </div>
            ) : (
              <UploadsSparkline points={metrics.uploadsHourly} />
            )}
            <div className="text-xs text-ink-tertiary mt-2">
              {metrics.uploadsHourly === null ? "取得失敗" : "件 / 24h（毎時）"}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-10" aria-label="最近のアクティビティ">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold tracking-tight m-0">
            最近のアクティビティ
          </h2>
          {/* 「すべて見る」導線は全件一覧ルートが未実装のため描かない
              (AC-8 / ADR-004)。空状態メッセージと二重表示にもならない。 */}
        </div>
        {!hasActivityRows(activity.rows.length) ? (
          <div className="border border-hairline rounded-lg p-8 bg-bg text-center text-sm text-ink-secondary">
            アクティビティはまだありません
          </div>
        ) : (
          <div className={ACTIVITY_TABLE_WRAP}>
            <table className={ACTIVITY_TABLE}>
              <thead className="max-sm:hidden">
                <tr>
                  <th className={ACTIVITY_TH}>時刻</th>
                  <th className={ACTIVITY_TH}>種類</th>
                  <th className={ACTIVITY_TH}>対象</th>
                  <th className={ACTIVITY_TH}>詳細</th>
                </tr>
              </thead>
              <tbody className="max-sm:block">
                {activity.rows.map((row) => (
                  <ActivityRow key={row.key} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold tracking-tight m-0">
            管理メニュー
          </h2>
        </div>
        <p className="text-sm text-ink-secondary m-0 mb-4">
          ヘッダーの管理ナビから各設定画面に移動できます。
        </p>
      </section>
    </main>
  );
}
