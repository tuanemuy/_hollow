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
import type { AlertDTO } from "@/core/application/dto/common";
import { requireAdminUser } from "@/lib/server/currentUser";
import { loadUsageMetrics } from "./action";

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

export async function AdminDashboard() {
  const actor = await requireAdminUser();
  const metrics = await loadUsageMetrics(actor.id);
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
                <p className={`${ALERT_TITLE} font-mono`}>{alert.code}</p>
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
