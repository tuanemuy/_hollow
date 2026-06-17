# TC-4: 設定変更が活動行として記録される（書き込み側）

対応 AC: AC-6

| # | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | `/admin/registration` で登録制御スイッチをトグルし「変更を保存」 | instance_settings.updated が outbox に emit され、projection で activity_log に行が出る | agent-browser の click でスイッチ状態が変わらず（aria-checked=true のまま）、保存後も outbox_events に instance_settings.updated が **0 件**、activity_log 0 件 | BLOCKED |
| 2 | server ログで server-fn 実行を確認 | usecase 実行ログ | RegistrationForm/action.ts のモジュールロードのみ。server-fn 実行・エラーログなし | — |

原因: agent-browser の CDP synthetic click が Radix/headless `role=switch` と
「変更を保存」フォーム送信（TanStack server function）の React ハンドラに届かない既知の偽陽性。
トースト・エラーいずれも出ず、サーバー側で usecase が走った形跡なし。
→ **実ブラウザでの手動確認が必要**。本環境では書き込み側 E2E を確証できない。

コード確認（静的）: `toggleRegistrationPolicy.ts` ほか各 adminSettings usecase は
`collectEvents([AdminSettingsEvents.updated(...)])` を save 成功時に無条件 emit しており、
発火さえすれば活動行が出る実装になっている（コード上は AC-6 を満たす）。

判定: **BLOCKED**（agent-browser 制約により E2E 未確証。実装コードは整合）
