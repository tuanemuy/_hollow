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
  ALERT_TITLE,
  ALERT_WARNING,
} from "@/components/common/styles";
import type { InstanceSettingsDTO } from "@/core/application/dto/adminSettings";
import type { AlertDTO } from "@/core/application/dto/common";
import { requireAdminUser } from "@/lib/server/currentUser";
import { loadUsageMetrics } from "../Dashboard/action";
import { loadInstanceSettings } from "../LLMSettingsForm/action";

// 案D semantic modifiers are info/success/warning/error only; `critical`
// maps to `error` (no dedicated `critical` modifier). See .issue/539/plan.md.
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

function LimitsCard({ limits }: { limits: InstanceSettingsDTO["limits"] }) {
  const rows: readonly { label: string; value: string }[] = [
    {
      label: "1 日あたりアップロード上限",
      value: formatBytes(limits.maxUploadBytesPerDay),
    },
    {
      label: "1 取り込み最大サイズ",
      value: formatBytes(limits.maxIngestionBytes),
    },
    { label: "1 ノート最大サイズ", value: formatBytes(limits.maxNoteBytes) },
    {
      label: "エクスポート成果物上限",
      value: formatBytes(limits.maxExportArtifactBytes),
    },
    {
      label: "ノートあたり共有リンク上限",
      value: `${formatNumber(limits.maxShareLinksPerNote)} 件`,
    },
    {
      label: "編集ロック TTL",
      value: `${formatNumber(limits.editLockTtlSec)} 秒`,
    },
    {
      label: "ゴミ箱保持日数",
      value: `${formatNumber(limits.trashRetentionDays)} 日`,
    },
    {
      label: "ノートあたり履歴保持件数",
      value: `${formatNumber(limits.maxNoteRevisionsPerNote)} 件`,
    },
  ];
  return (
    <div className="border border-hairline rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-left align-middle px-4 py-3">
                項目
              </th>
              <th className="font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-right align-middle px-4 py-3">
                値
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-t border-hairline first:border-t-0 hover:bg-surface-elevated"
              >
                <td className="px-4 py-3 text-left align-middle">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-right align-middle font-mono">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export async function MetricsPage() {
  const actor = await requireAdminUser();
  const [metrics, { settings }] = await Promise.all([
    loadUsageMetrics(actor.id),
    loadInstanceSettings(actor.id),
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
        利用状況
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        インスタンス全体の利用量と、設定済みの上限値。
      </p>

      <section
        className="grid grid-cols-1 gap-4 mb-10 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="現在の利用量"
      >
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">ユーザー数</div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatNumber(metrics.userCount)}
          </div>
        </div>
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">合計ストレージ</div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatBytes(totalStorage)}
          </div>
          <div className="text-xs text-ink-tertiary">
            R2 {formatBytes(metrics.storageR2Bytes)} / DO{" "}
            {formatBytes(metrics.storageDurableObjectBytes)}
          </div>
        </div>
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">
            本日アップロード
          </div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatNumber(metrics.uploadsToday)}
          </div>
        </div>
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="text-sm text-ink-secondary mb-2">
            LLM 呼び出し (24h)
          </div>
          <div className="text-2xl font-regular tracking-tighter text-ink mb-[2px]">
            {formatNumber(metrics.llmCallsToday)}
          </div>
        </div>
      </section>

      {metrics.alerts.length > 0 ? (
        <section className="mb-10">
          <h2 className="text-xl font-semibold tracking-tight m-0">アラート</h2>
          <p className="text-sm text-ink-secondary m-0 mb-4">
            しきい値を超えた / 注意が必要な項目。
          </p>
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
                <p className={`${ALERT_TITLE} font-mono`}>{alert.code}</p>
                <p className={ALERT_BODY}>{alert.message}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold tracking-tight m-0">
            インスタンス上限
          </h2>
        </div>
        <p className="text-sm text-ink-secondary m-0 mb-4">
          各種クォータ・ストレージ上限の現在値。
        </p>
        <LimitsCard limits={settings.limits} />
      </section>

      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold tracking-tight m-0">
            登録ポリシー
          </h2>
        </div>
        <p className="text-sm text-ink-secondary m-0 mb-4">
          現在のサインアップ公開状態。
          <code className="font-mono text-xs px-[5px] py-[1px] bg-surface rounded-xs">
            /admin/registration
          </code>{" "}
          から変更できます。
        </p>
        <div className="border border-hairline rounded-lg p-5 bg-bg">
          <div className="flex gap-3">
            <span
              className={`inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium ${
                settings.registration.open
                  ? "bg-success-surface text-success"
                  : "bg-warning-surface text-warning"
              }`}
            >
              {settings.registration.open ? "公開中" : "停止中"}
            </span>
            {settings.registration.closedReason !== null ? (
              <span className="text-ink-secondary">
                {settings.registration.closedReason}
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
