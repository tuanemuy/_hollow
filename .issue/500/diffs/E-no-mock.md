# バッチE 対応なし記録（実装→モック欠落）

## admin/metrics（利用状況）— モック無し

- route: `app/routes/admin/metrics.tsx`（/admin/metrics「利用状況」）
- component: `app/components/admin/Metrics/index.tsx`（MetricsPage）

対応するデザインモック（`spec/design/pages/Pxx-admin-metrics.html`）が **存在しない**。これは「実装にはあるがモックに無い画面」。

実装の概要（確認した範囲）:
- 管理ナビ `route.tsx` の `ADMIN_NAV` に `/admin/metrics`「利用状況」として登録済み（admin シェルから到達可能）。
- `loadUsageMetrics`（Dashboard/action）＋ `loadInstanceSettings`（LLMSettingsForm/action）を読み、利用状況メトリクスとインスタンス上限（`InstanceSettingsDTO.limits`）を表示。
- `LimitsCard` で「1日あたりアップロード上限」「1取り込み最大サイズ」等のインスタンス上限を一覧。formatNumber/formatBytes ユーティリティで整形。

判断:
- モック新設は本 Issue #500 のスコープ外（Issue はモック36枚 → 実装の突き合わせが必須スコープ）。
- フォローアップ候補として「P40 系の admin デザイン言語に沿った Pxx-admin-metrics モックの新設」を別 Issue で起票する候補とする。
- ダッシュボード（P40）が「インスタンス状態の概況」、metrics（モック欠落）が「利用状況・インスタンス上限の詳細」という役割分担になっており、P40 モックに残置したチャート/アクティビティ系（P40.md の B 項目）と metrics の責務整理も併せて検討すると良い。

別Issue化候補: Yes（admin-metrics モックの新設）
