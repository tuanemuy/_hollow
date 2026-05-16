import type { InstanceSettingsDTO } from "@/core/application/dto/adminSettings";
import { requireAdminUser } from "@/lib/server/currentUser";
import { loadUsageMetrics } from "../Dashboard/action";
import { loadInstanceSettings } from "../LLMSettingsForm/action";

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
  ];
  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>項目</th>
              <th style={{ textAlign: "right" }}>値</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td
                  style={{
                    textAlign: "right",
                    fontFamily: "var(--admin-font-mono)",
                  }}
                >
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
    <main className="admin-main">
      <h1 className="admin-page-title">利用状況</h1>
      <p className="admin-page-subtitle">
        インスタンス全体の利用量と、設定済みの上限値。
      </p>

      <section className="admin-metrics" aria-label="現在の利用量">
        <div className="admin-metric-card">
          <div className="admin-metric-label">ユーザー数</div>
          <div className="admin-metric-value">
            {formatNumber(metrics.userCount)}
          </div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-label">合計ストレージ</div>
          <div className="admin-metric-value">{formatBytes(totalStorage)}</div>
          <div className="admin-metric-sub">
            R2 {formatBytes(metrics.storageR2Bytes)} / DO{" "}
            {formatBytes(metrics.storageDurableObjectBytes)}
          </div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-label">本日アップロード</div>
          <div className="admin-metric-value">
            {formatNumber(metrics.uploadsToday)}
          </div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-label">LLM 呼び出し (24h)</div>
          <div className="admin-metric-value">
            {formatNumber(metrics.llmCallsToday)}
          </div>
        </div>
      </section>

      {metrics.alerts.length > 0 ? (
        <section className="admin-section">
          <h2 className="admin-section-title">アラート</h2>
          <p className="admin-section-desc">
            しきい値を超えた / 注意が必要な項目。
          </p>
          {metrics.alerts.map((alert) => (
            <div
              key={alert.code}
              className={`admin-banner ${
                alert.severity === "critical"
                  ? "error"
                  : alert.severity === "warning"
                    ? "warning"
                    : "info"
              }`}
            >
              <div className="admin-banner-body">
                <strong>{alert.code}</strong>
                {alert.message}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">インスタンス上限</h2>
        </div>
        <p className="admin-section-desc">
          各種クォータ・ストレージ上限の現在値。
        </p>
        <LimitsCard limits={settings.limits} />
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">登録ポリシー</h2>
        </div>
        <p className="admin-section-desc">
          現在のサインアップ公開状態。
          <code className="admin-code">/admin/registration</code>{" "}
          から変更できます。
        </p>
        <div className="admin-card">
          <div style={{ display: "flex", gap: "var(--admin-space-3)" }}>
            <span
              className={`admin-tag ${
                settings.registration.open ? "success" : "warning"
              }`}
            >
              {settings.registration.open ? "公開中" : "停止中"}
            </span>
            {settings.registration.closedReason !== null ? (
              <span style={{ color: "var(--admin-color-ink-secondary)" }}>
                {settings.registration.closedReason}
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
