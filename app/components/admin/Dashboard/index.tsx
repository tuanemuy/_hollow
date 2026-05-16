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

function bannerToneFor(severity: AlertDTO["severity"]): string {
  switch (severity) {
    case "critical":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "info";
  }
}

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
    <main className="admin-main">
      <h1 className="admin-page-title">ダッシュボード</h1>
      <p className="admin-page-subtitle">Hollow インスタンス全体の状態</p>

      {metrics.alerts.length > 0 ? (
        <div>
          {metrics.alerts.map((alert) => (
            <div
              key={alert.code}
              className={`admin-banner ${bannerToneFor(alert.severity)}`}
              role="alert"
            >
              <div className="admin-banner-body">
                <strong>{alert.code}</strong>
                {alert.message}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-status-banners">
          <div className="admin-status-banner">
            <span className="admin-status-dot" aria-hidden="true" />
            <div className="admin-status-banner-body">
              <div className="admin-status-banner-title">
                All systems operational
              </div>
              <div className="admin-status-banner-meta">
                重大アラートはありません
              </div>
            </div>
          </div>
        </div>
      )}

      <section className="admin-metrics" aria-label="主要メトリクス">
        <div className="admin-metric-card">
          <div className="admin-metric-label">ユーザー数</div>
          <div className="admin-metric-value">
            {formatNumber(metrics.userCount)}
          </div>
          <div className="admin-metric-sub">
            {metrics.userCount === null ? "取得失敗" : "現在の登録数"}
          </div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-label">ストレージ消費</div>
          <div className="admin-metric-value">{formatBytes(totalStorage)}</div>
          <div className="admin-metric-sub">
            R2 {formatBytes(metrics.storageR2Bytes)} · DO{" "}
            {formatBytes(metrics.storageDurableObjectBytes)}
          </div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-label">当日アップロード</div>
          <div className="admin-metric-value">
            {formatNumber(metrics.uploadsToday)}
          </div>
          <div className="admin-metric-sub">
            {metrics.uploadsToday === null ? "取得失敗" : "件 / 24h"}
          </div>
        </div>
        <div className="admin-metric-card">
          <div className="admin-metric-label">LLM 呼び出し (24h)</div>
          <div className="admin-metric-value">
            {formatNumber(metrics.llmCallsToday)}
          </div>
          <div className="admin-metric-sub">
            {metrics.llmCallsToday === null ? "取得失敗" : "回 / 24h"}
          </div>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">管理メニュー</h2>
        </div>
        <p className="admin-section-desc">
          ヘッダーの管理ナビから各設定画面に移動できます。
        </p>
      </section>
    </main>
  );
}
