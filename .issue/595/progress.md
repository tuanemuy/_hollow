# 進捗メモ — Issue #595 PR-B（最近のアクティビティ）

## 実装済み（B-1〜B-9 + テスト）

- B-1: `activity_log` / `ingestion_burst_log` スキーマ + 手書きマイグレーション `0018_activity_log.sql`。
- B-2: `ActivityLogRepository` port（`app/core/application/activityLog/ports.ts`）+ `D1ActivityLogRepository`。WorkerContainer/RequestContainer に配線（後者は read usecase 用、ADR-006 補足参照）。
- B-3: `getRecentActivity` usecase + `RecentActivityRowDTO`。burst は read-time 集約。
- B-4: projection ハンドラ 5 種（user_created / ingestion_failed / ingestion_created(burst) / export_completed / settings_changed）。各々 ConsumerContainer を取り、対象/詳細は read-only UoW lookup で解決。
- B-5: `app/core/domain/adminSettings/events.ts`（単一 `instance_settings.updated`、settingKind を payload で区別）。
- B-6: 9 usecase に `collectEvents` 追加（仕分けは adr.md 実装メモ参照）+ `adminSettings/eventDecoders.ts`。
- B-7: dispatcher 配線。`ingestion.created` は既存 runIngestionJob case への fan-out 追加。残り 4 type は新規 case。
- B-8: Dashboard に「最近のアクティビティ」テーブル。空状態 honest filler、「すべて見る」非表示（AC-8）、狭幅 data-label スタッキング。
- B-9: `pruneActivityLog` worker usecase を pruner daily tick に追加（activity 90d / burst 24h）。

## 既知の制限・判断保留

- burst の read-time 集約は in-process バケット（floor-to-5min）。SQL 内 `COUNT(DISTINCT)` ではなく、5 分窓（hour_bucket より細かい）を決定的に扱うためアダプタ側で実施。スキャン上限は `limit * THRESHOLD` 行。極端に多数の owner が同時バーストした場合、recent 上位に偏る可能性はあるが、ダッシュボード直近 N 件表示の用途では許容。
- `large_upload` の detail は「N 件のアップロード」のみ（モックの「2.4 GB を 5 分間で受信」のようなバイト数/時間幅は burst log にバイト数を持たせていないため出さない。虚偽表示回避で件数のみ）。
- 閾値 `LARGE_UPLOAD_THRESHOLD=20` / 窓 `5 分` は暫定（定数化済み、チューニング容易）。
- 保持期間 90d / 24h は暫定定数。

## テスト

- `activityLogRepository.integration.test.ts`: 冪等性 / 順序 / 空 / burst 境界（閾値前後）/ burst 冪等 / 窓非結合 / prune。
- `activityLog/__tests__/projection.test.ts`（unit）: settings projection の投影内容 + 冪等性（AC-7）。
- `activityLog/__tests__/getRecentActivity.integration.test.ts`: admin gate / 空状態 / 順序。
- `adminSettings/__tests__/adminSettingsEvents.integration.test.ts`: settingKind emit 検証。
- 既存 worker/search テストの WorkerContainer に `activityLogRepository` を追加（FakeActivityLogRepository）。
