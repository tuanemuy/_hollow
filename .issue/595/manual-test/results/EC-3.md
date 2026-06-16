# EC-3: 同一イベント二重配信での冪等性

対応 AC: AC-7

| # | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | 同一 event_id を activity_log に 2 回 insert | 行が 1 つだけ（event_id unique）| 直接 SQL で同一 event_id を 2 回 INSERT すると uniqueIndex `uniq_activity_log_event_id` で 2 回目が弾かれる（ON CONFLICT DO NOTHING）。スキーマで unique index 確認済み | PASS（スキーマ/コード）|

確認方式: コード/スキーマ静的確認 + 統合テスト。
`D1ActivityLogRepository.insertIfAbsent` は `onConflictDoNothing({ target: activityLog.eventId })`、
`ingestion_burst_log` も同様。`projection.test.ts` / `activityLogRepository.integration.test.ts` に
同一 eventId 二重配信で二重行が出ない冪等テストあり。
agent-browser での実イベント二重 dispatch は TC-4 同様 emit 自体が困難なため未実施。

判定: **PASS（コード/スキーマ/統合テストで担保。UI 経由 E2E は未実施）**
