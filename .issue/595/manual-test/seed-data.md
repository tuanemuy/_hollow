# Seed Data — Issue #595 manual test

実行日時 (UTC): 2026-06-16T19:43Z 基準（サーバー clock = システム時刻）

## admin

- `pnpm seed:dev-admin`（冪等）
- user id: `01950000-0000-7000-8000-000000000001`
- session token: `dev-admin-session-token`
- cookie: `__Host-session`（Secure-only。`document.cookie` 不可、CDP 経由で注入）

## チャート用 ingestion_jobs（直近 24h）

owner = dev-admin。id prefix `019e5950-0000-%`（クリーンアップ用識別子）。
status は `previewing`（`ij_status_enum` 許容値）。`created_at` は固定 UTC ISO8601。

| created_at (UTC) | hours ago | 件数（同一時バケット） |
|---|---|---|
| 2026-06-16T18:00 | 約1h | 1 |
| 2026-06-16T16:00/05/10 | 約3h | 3 |
| 2026-06-16T09:00/05/10/15/20 | 約10h | 5（ピーク） |
| 2026-06-15T23:00/05 | 約20h | 2 |

合計 11 行 / 4 時間バケットにピーク、それ以外の約20本のバケットは 0 件（平坦線で描画されるべき）。

既存 ingestion_jobs（23 行）はすべて 24h 窓外（最新 2026-06-14T01:19）なので、
チャートは本シードのみを反映する。

検証用 SQL: `/tmp/seed-595-chart.sql`

## activity_log

初期は空（0 行）。
- まず inline-relay 経由の E2E projection を試みる（admin 設定変更を UI で実行）。
- projection が確認できない場合は activity_log への直接シードにフォールバックし、
  どちらで確認したかを report に明記する。
