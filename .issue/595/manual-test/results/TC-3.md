# TC-3: 最近のアクティビティが実イベントから記録・表示される

対応 AC: AC-4, AC-5, AC-6

確認方式: **直接シードのフォールバック**（inline-relay 経由の E2E projection は agent-browser の
click が React のフォーム送信/onClick に届かず設定変更イベントを emit できなかったため — analysis.md 参照）。
テーブルのレンダリング（4 列・全 ActivityKind・tag tone・target/detail の可読性・降順）を直接シードで検証。

シード: activity_log に 5 行（全 5 kind を網羅）。

| # | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | activity_log に user_created/job_failed/settings_changed×2/export_completed をシード | — | seed-595-activity.sql 適用、5 行 | — |
| 2 | `/admin`「最近のアクティビティ」確認 | 4 列テーブル（時刻/種類/対象/詳細） | columnheader 時刻・種類・対象・詳細の 4 列テーブル描画 | PASS |
| 3 | 行が occurredAt 降順か | 降順 | 19:45 → 19:39 → 19:32 → 19:25 → 19:07 で降順 | PASS |
| 4 | 種類タグが kind に対応・人間可読 | ラベル化 | 新規ユーザー/ジョブ失敗/設定変更/設定変更/エクスポート完了 | PASS |
| 5 | severity tag tone が種別に対応 | info/warning/error/success | success→bg-success-surface, error→bg-error-surface, info→bg-accent-surface（settings）| PASS |
| 6 | 対象・詳細が ID 直書き/空でなく可読 | 可読 | @new-user / report.pdf / 登録ポリシー / LLM 設定 / dev-admin、詳細も日本語要約 | PASS |

判定: **PASS**（テーブルレンダリングは完全に検証。書き込み側 E2E は TC-4/analysis 参照）
