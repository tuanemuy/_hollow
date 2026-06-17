# EC-2: チャート取得失敗（系列 null で degrade）

対応 AC: AC-3

| # | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | provider が uploadsHourly=null を返す状況を再現 | 当該系列が「取得失敗」プレースホルダ、ページは落ちない | 本環境では集計クエリ失敗を擬似する手段がなく（D1 を壊さず null を返させられない）、UI 上での実再現は未実施 | NOT RUN |

コード確認（静的）: `D1UsageMetricsProvider.collectUploadsHourly` は try/catch で
失敗時 `null` を返し throw しない（partial-failure 契約）。`Dashboard/index.tsx` は
`metrics.uploadsHourly === null` のとき「取得失敗」プレースホルダ（h-[140px] のメッセージ）を
描き、実データ 0（平坦線）と区別する。統合テスト
`usageMetricsProvider.integration.test.ts` に degrade ケースあり（C-1）。

判定: **NOT RUN**（UI 実再現は手段なし。コード・統合テストで担保済み）
