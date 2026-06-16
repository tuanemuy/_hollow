# 実装計画 — Issue #595: feat(admin): P40 ダッシュボード情報設計（24h チャート + 最近のアクティビティ）の backend 新設と追従

**Issue:** #595
**親:** #514 / **派生元:** #545（P40 backend 新設の Phase 4 起票）
**作成日:** 2026-06-17
**複雑度:** 中〜大規模

---

## 目的

P40 ダッシュボードモックが描く「直近 24h チャート（アップロード数 / LLM 呼び出しの時系列）」と「最近のアクティビティフィード」を、ダミー数値ではなく backend 実データで描けるようにする。#545 で「データ源が無い」を理由に未追従とした 2 要素について、ドメイン〜アダプターの backend を新設してから `Dashboard/index.tsx` に追従する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `/admin` ダッシュボードに「直近 24 時間」セクションが表示され、アップロード数の hourly 時系列（直近 24 バケット）が backend 実データから描画される | Issue「1. 時系列メトリクス provider」+ モック §直近24時間 | A-1〜A-5 |
| AC-2 | 同セクションに LLM 呼び出しの hourly 時系列が描画される。**LLM 呼び出しの記録源が無い場合は AC-2 を満たせない**ため、記録源の有無を Step 1 で確定し、無ければ LLM 系列はスコープ外として明示（虚偽表示禁止）。**LLM 記録源無しと確定した場合、既存 scalar「LLM 呼び出し (24h)」カードも同じデータ源不在で現状『取得失敗』表示のままだが、scalar の挙動は #545 一致のとおり変更せず表示整合のみ確認する**（hourly を描かない判断が UI 全体で一貫する） | Issue「1. 時系列メトリクス provider」 | A-1, A-5, ADR-002 |
| AC-3 | 時系列バケットは取得失敗時に系列ごと `null` で degrade し、UI は「取得失敗」プレースホルダを出す（既存 scalar metric の partial-failure 契約に一致）。**実データで 0 件（その時間帯に ingestion 無し）は取得成功であり、24 バケットを 0 埋めして平坦に描く**。`null`（取得失敗）と 0（実データ 0）を UI で区別する | `usageMetricsProvider.ts` の partial-failure 契約 | A-2, A-4, A-5 |
| AC-4 | `/admin` に「最近のアクティビティ」テーブルが表示され、行はすべて backend に記録された実イベントに一致する。種別: 新規ユーザー（`user.created`）/ 大量アップロード（`ingestion.created` のバースト集約, ADR-005）/ ジョブ失敗（`ingestion.failed`）/ 設定変更（`instance_settings.updated`）。**「バックアップ」種別は per-owner エクスポート完了（`export.job.completed`）に限り、ラベルは実態（例『エクスポート完了』）とする。存在しない D1 nightly backup は出さない。該当イベントが運用上ほぼ発生しないなら本 Issue では種別を縮退（出さない）してよい**（他種別と同じ虚偽表示禁止の扱い） | Issue「2. アクティビティ / 監査ログ subsystem」+ モック §最近のアクティビティ | B-1〜B-8 |
| AC-5 | アクティビティ行は時刻（occurredAt）・種類・対象・詳細の 4 列で、各列は実データで埋まる。**「対象」「詳細」に必要なフィールド（ユーザーハンドル名 / locale / ファイル数 / エラー要約 / 設定種別 等）が各イベント payload に揃っているかを Step 8/9 のイベント payload 設計時に確認する**。payload に無ければ projection 時に別 repo を引くか payload を拡張し、空文字や ID 直書きで形式的に満たすことを避ける | モック activity table 構造 | B-3, B-4, B-5, B-8 |
| AC-6 | 設定変更（登録制御・LLM・プロンプト・限度・トークン等）が実行されると活動行として記録される（記録の書き込み側を本 Issue で新設）。**対象 usecase は実装時に変更系 adminSettings usecase を棚卸しして確定する**（`updateSpeechConfig`（音声）/ 各種 `reset*`（`resetPromptTemplate` / `resetAllPromptTemplates` / `resetDesignTokens`）/ `reencryptApiKey` / `updateUserPromptOverride` を含むか・含まないかを明示し、`settingKind` ユニオンの最終形と AC の検証範囲を一致させる。一部 usecase だけ emit して他が漏れる取りこぼしを防ぐ） | Issue「イベント記録（書き込み側）の新設が必要」 | B-5, B-6 |
| AC-7 | アクティビティ記録は at-least-once 配信に対し冪等（同一 `eventId` で二重行が出ない）。**consumer の `idempotencyStore`（dispatch 前 `hasProcessed`）が主防御、projection の `insertIfAbsent`（`event_id` unique）が `markProcessed` 前クラッシュ窓をカバーする二重防御。projection は件数加算等の非冪等操作を含まず 1 イベント → 1 行の自然キー insert に限定する**（ADR-001 / ADR-005） | CLAUDE.md outbox 契約「consumers must be idempotent」 | B-2, B-4, B-7 |
| AC-8 | 「期間を変更」「すべて見る」導線は、対応する遷移先が本 Issue に無ければリンクとして描かない（虚偽の導線を出さない）。実装する場合のみ描く | モック導線 + 虚偽表示禁止 | A-5, B-8, ADR-004 |
| AC-9 | `pnpm typecheck && pnpm lint:fix && pnpm format` がパスし、新規ドメイン/ユースケース/アダプターに単体・統合テストがある | CLAUDE.md 開発規約 | 全ステップ + C-1 |
| AC-10 | `ingestion_burst_log`・`activity_log` の保持方針が定義され、専用の刈り込み経路が動く（既存 pruner は `outbox_events` のみ対象＝新規テーブルは自動で刈られないため本 Issue で足す）。`ingestion_burst_log` は保持 24h、`activity_log` は保持期間定数（暫定 90 日）を超える行が pruner tick で削除される。保持を切っても「直近 N 件表示」は壊れない | ADR-005 保持節 / ADR-007（P-001-arch 無限増大） | B-9, C-1 |

## スコープ

### 含まれないもの

- **システムバックアップ（D1 / nightly）の新規実装** — モックの「バックアップ完了 D1 / nightly」行は OS/インフラ階層の定期バックアップを指す。コードベースの `export.job.completed` は**ユーザー起点のエクスポート（per-owner）**であり、D1 nightly backup という subsystem は存在しない。本 Issue でバックアップ subsystem を新設するのはスコープ過大。アクティビティの「バックアップ」種別は、実在する `export.job.completed`（管理者によるインスタンスエクスポート等、実イベント）に**意味を寄せて**記録するに留め、存在しない nightly backup 行はモックから写さない（虚偽表示禁止）。種別ラベルの最終文言は ADR-003 で扱う。
- **「期間を変更」による期間切替 UI（7日 / 30日等の任意レンジ集計）** — 本 Issue は「直近 24h hourly」のみ。任意レンジ集計は別 provider 拡張になるため範囲外。導線は AC-8 に従い描かない（実装しないなら出さない）。
- **「すべて見る」のアクティビティ全件一覧ページ（P40 以外の新規ルート）** — ダッシュボードに出すのは直近 N 件のみ。全件ページが必要なら別 Issue。導線は AC-8 に従う。
- **過去に発生済みのイベントの遡及バックフィル** — 活動ログは新設テーブルへ「本 Issue リリース以降の」イベントを記録する。リリース前のイベントは行に出ない（実データのみ表示）。空テーブル時の UI 空状態は実装する。
- **既存 scalar metrics（userCount / storage / uploadsToday / llmCallsToday）の挙動変更** — 既存 4 metric-card は触らない（#545 で一致済み）。

## 調査結果

### 関連ファイル

**時系列メトリクス（チャート）**
- `app/core/application/ports/usageMetricsProvider.ts` — 現状 scalar snapshot（`collect(): UsageMetricsSnapshot`）のみ。時系列フィールド無し。production 実装は存在せず `NullUsageMetricsProvider` のみ。
- `app/core/application/adminSettings/getUsageMetrics.ts` — provider を呼び DTO `GetUsageMetricsOutput` を返す usecase。
- DI: `app/core/application/di/serverCloudflare.ts`（`usageMetricsProvider: NullUsageMetricsProvider` を wire）。
- データ源候補テーブル（`app/core/adapters/d1/migrations/0001_hollow_schema.sql`）:
  - `ingestion_jobs`（`created_at`/`updated_at` ISO8601, `status`, index `idx_ij_status_updated`）→ アップロード時系列の源。
  - `media_assets`（`created_at` ISO8601, index `idx_media_owner`）。
  - **LLM 呼び出しの専用ログテーブルは存在しない**（要 Step 1 確定）。
- hourly bucket の既存パターン: `app/core/adapters/d1/repositories/promptPreviewRateLimiter.ts` + `0016_prompt_preview_counters.sql`（`window_start` 固定窓 + `ON CONFLICT DO UPDATE` の atomic upsert）。集計クエリ例: `ingestionJobRepository.sumByteSizeByOwnerSince` / `countByOwner`、`mediaAssetRepository.aggregateByOwner`（`COALESCE(SUM(...))` + `gte(createdAt, iso)`）。

**アクティビティログ subsystem**
- `app/core/domain/common/event.ts` — `DomainEventDraftBase` / `DomainEventBase` / `EventDraft` の二相イベントモデル。
- outbox: `app/core/adapters/d1/schema.ts`（`outbox_events`）、relay `app/worker/cloudflare/relay.ts`、consumer `app/worker/cloudflare/consumer.ts` + `handlers.ts`、dispatcher `app/core/application/workers/dispatchDomainEvent.ts`（event.type の switch でハンドラへ fan-out）。
- 既存の event-sourced projection（read-model を consumer で構築する先例）:
  - `app/core/application/search/handleNoteSavedEvent.ts`（検索インデックス）
  - `app/core/application/view/handleNotePurgedEvent.ts`（SavedView broken-link マーカー）
  - `app/core/application/publication/handleUserDeletedEvent.ts`（公開状態の取り消し）
- イベント源の在庫:
  - 新規ユーザー: `user.created`（`identity/events.ts`）✓ 既存
  - 大量アップロード: `ingestion.created`（`ingestion/events.ts`）✓ 既存（**「大量」判定ロジックは未実装** — 集約が必要）
  - ジョブ失敗: `ingestion.failed`（`ingestion/events.ts`）✓ 既存（payload に `errorCode`/`errorReason`）
  - 設定変更: **イベント皆無**。`app/core/domain/adminSettings/` に `events.ts` が無い。`toggleRegistrationPolicy` / `updateLLMConfig` / `updatePromptTemplate` / `updateInstanceLimits` / `updateDesignTokens` 等は `collectEvents` を呼んでいない（**書き込み側の新設が必要**）。
  - バックアップ: `export.job.completed`（`export/events.ts`）✓ 既存だが意味は per-owner エクスポート（スコープ節参照）。
- eventDecoders パターン: `app/core/application/ingestion/eventDecoders.ts`（zod strict + `buildEventDecoder`）。新規イベントもこの形で decoder を持たせる。

**フロントエンド**
- `app/components/admin/Dashboard/index.tsx` — RSC。`requireAdminUser()` → `loadUsageMetrics(actor.id)` → status banner + 4 metric-card + 「管理メニュー」honest filler（チャート/活動の置き場）。
- `app/components/admin/Dashboard/action.ts` — `loadUsageMetrics`（`serverData` を `cache()` でラップ）。
- `app/routes/admin/index.tsx` — `renderAdminDashboard` server fn が `<AdminDashboard />` を RSC 描画。
- モック: `spec/design/pages/P40-admin-dashboard.html`
  - チャート（655-694 行）: `section-title`「直近 24 時間」+ `section-link`「期間を変更」、`.charts` 2 カラム、各 `chart-card` に header（title + value）と SVG sparkline（viewBox 600×140, gradient fill + 1.5px stroke）。
  - 活動（696-751 行）: `section-title`「最近のアクティビティ」+ `section-link`「すべて見る」、4 列テーブル（時刻 HH:MM / 種類 tag / 対象 / 詳細）。tag バリアント: info / warning / error / success / 無印。狭幅で行積層（#545 ADR-004 と同じ実 DOM ラベル方式で揃える）。

### あるべきアーキテクチャ

- **依存方向は内向き**（presentation → application → domain、adapter は内側の port を実装）。新規 backend は domain（イベント定義）→ application（port / usecase / handler / DTO）→ adapter（D1 リポジトリ・provider 実装）→ presentation（loader / コンポーネント）の順で設計する。
- **Unit of Work**: 書き込みは `UnitOfWorkProvider.run(fn)` 内で行い、ドメインイベントは `collectEvents` 経由でのみ enqueue する。
- **Outbox / domain event**: イベントは UoW 内で transactionally に outbox 永続化 → relay → queue → consumer（`dispatchDomainEvent`）で out-of-band 配信。at-least-once・順序保証なし → **consumer は冪等必須**。
- **read-model projection の先例あり**: 検索・SavedView・publication が consumer ハンドラで projection テーブルを更新している。活動ログはこの確立パターンに乗せるのが正（ADR-001）。
- **partial-failure 契約**: `UsageMetricsProvider` は throw せず per-metric を `null` に落とす。時系列フィールドも同契約に従う。
- **入力検証は 2 点のみ**（transport boundary + value-object 構築）。loader/server fn の境界で検証し、内部は静的型を信頼。
- **虚偽表示禁止**（#540〜545 の鉄則）: 表示する数値・活動行はすべて実データに一致。データ源が無い系列・行・導線は描かない。

### 既存実装の状態（あるべき姿との一致 / 乖離）

- **チャートのデータ源**: 一致した read-model は無いが、`ingestion_jobs.created_at` から hourly bucket をクエリで導出可能（既存集計クエリ・index あり）。専用集計テーブルは不要（ADR-002）。LLM 呼び出しは**記録源が無く乖離** → Step 1 で確定し、無ければ AC-2 を満たさずスコープ明示。
- **活動ログ subsystem**: 完全に不在（乖離）。ただし projection パターン・outbox・必要イベントの過半は揃っており、**設定変更イベントの書き込み側**だけが欠落。本 Issue で `adminSettings/events.ts` 新設 + 各設定 usecase に `collectEvents` 追加（AC-6）。
- **「大量アップロード」「バックアップ」の意味付け**: モックのラベルに実イベントを寄せる（ADR-003）。存在しない nightly backup は写さない。
- **frontend**: `Dashboard/index.tsx` の「管理メニュー」filler 位置にチャート/活動セクションを追加。狭幅レスポンシブは #545 ADR-004（実 DOM ラベル）に揃える。

### 依存関係

- dispatcher `dispatchDomainEvent.ts` に新規 case を追加（fan-out）。既存ハンドラの挙動は変えない。
- worker DI: `activityLogRepository` を `WorkerContainer`（`createWorkerContainer`）に追加し、`ConsumerContainer` の `Pick<WorkerContainer, ...>` に載せる（`indexJobRepository` と同配線、ADR-006）。`UnitOfWorkContext` には足さない。
- 新規マイグレーション（activity_log / ingestion_burst_log テーブル）。既存テーブルは不変。
- 設定 usecase に `collectEvents` を足す → これらの usecase はイベントを emit するようになるが、新規イベント type は activity 以外の consumer では `default: skipped` され無害。
- **dispatcher の `ingestion.created` は新規 case ではなく既存 `runIngestionJob` case への fan-out 追加**（S-001-arch）。`user.created` / `ingestion.failed` / `export.job.completed` は現状 `default: skipped` なので純粋な新規 case。`ingestion.created` を別 case に二重登録するとジョブ実行が壊れるため取り違えない（手本: `note.trashed` の既存 fan-out）。
- **pruner の対象拡張**（ADR-005 保持節 / ADR-007）: 既存 pruner（`outboxPrune.ts` → `outboxRepository.pruneProcessed`）は `outbox_events` のみ削除し `processed_events`・read-model は刈らない。本 Issue で `ingestion_burst_log`（保持 24h）・`activity_log`（保持 90 日定数）の刈り込みを pruner エントリ点（`app/worker/cloudflare/pruner.ts`）に足す。`processed_events` の無刈りは既存運用課題でスコープ外（設定変更は低頻度で増分軽微）。

## 設計

### ドメインモデルへの影響

**チャート（時系列メトリクス）**
- ドメインエンティティへの影響は**なし**。時系列は集計（read 投影）であり、ドメイン不変条件を持たない。`UsageMetricsProvider` port（application 層）に時系列フィールドを足すのみ（ADR-002 で「既存 port 拡張 vs 新規 port」を判断）。

**アクティビティログ**
- 新規ドメインイベント `adminSettings/events.ts` を追加。`InstanceSettingsUpdatedEvent`（種別を payload で区別する単一イベント）を採用するか、設定種別ごとに分けるかは ADR-003。`InstanceSettings` エンティティの mutation メソッド（`setRegistrationOpen` 等）が `EventDraft` を返すよう拡張（identity/ingestion と同じ `{ entity, eventDrafts }` 形）。
- **活動ログ自体はドメイン概念ではなく read-model**（管理ダッシュボードの投影）。専用エンティティ・不変条件は持たせない。projection 行の構造は application 層の DTO / adapter スキーマで表現する（ADR-001）。
- 値オブジェクト: 活動種別（`ActivityKind`）を application 層の判別共用体（`"user_created" | "large_upload" | "job_failed" | "settings_changed" | "backup_completed"`）として持つ。ドメイン値オブジェクトにはしない（ビジネス不変条件を持たないため）。

### ユースケース / アプリケーションロジック

**チャート**
- `getUsageMetrics.ts` を拡張、または新規 usecase `getDashboardCharts`（ADR-002 で粒度判断）。provider の時系列フィールドを DTO に投影。ドメインロジックの紛れ込みなし（純投影）。

**アクティビティログ（書き込み側 = projection ハンドラ）**
- `app/core/application/activityLog/` を新設:
  - `recordActivity` 共通ロジック（冪等 insert: `eventId` を unique 自然キーに `ON CONFLICT(event_id) DO NOTHING`。**件数加算等の非冪等操作は持たない**）。
  - `handleUserCreatedEvent` / `handleIngestionFailedEvent` / `handleIngestionCreatedEvent`（バースト集約用の中間蓄積）/ `handleInstanceSettingsUpdatedEvent` / `handleExportJobCompletedEvent`。
  - **コンテナ / UoW（ADR-006）**: 各ハンドラは `WorkerContainer` 系統（`search/handleNoteSavedEvent.ts` と同じ）を取り、**UoW を開かず** `activityLogRepository.insertIfAbsent(...)` を直接呼ぶ。1 イベント → 1 行で、ドメインイベント再 emit もアトミック複数 insert も不要なため UoW 不要。`activityLogRepository` は `WorkerContainer` に追加し `ConsumerContainer` の `Pick<WorkerContainer, ...>` に載せる（`indexJobRepository` と同配線）。**`UnitOfWorkContext` には足さない**（request 路で書かないため。UoW 表面積を最小に保つ）。
  - 「大量アップロード」判定（ADR-005 方式A）: `ingestion.created` を中間テーブル `ingestion_burst_log`（`owner_id`, `hour_bucket`, `event_id` unique）に `insertIfAbsent` で蓄積（加算しない＝二重計上しない）。「大量アップロード」行は表示時（`getRecentActivity`）に owner + 窓で `COUNT(DISTINCT event_id)` を集約し、閾値（定数 `LARGE_UPLOAD_THRESHOLD` / `LARGE_UPLOAD_WINDOW_MINUTES`、暫定 5 分・N 件）以上の窓のみ 1 行に導出する read-time 集約。
- アクティビティログ取得 usecase: `getRecentActivity`（直近 N 件を occurredAt 降順で取得 → `RecentActivityDTO[]`。大量アップロードは中間テーブルの read-time 集約で導出）。読み取り専用。
- 設定変更の書き込み: 各 `adminSettings/*.ts` usecase に `collectEvents([InstanceSettingsEvents.updated(...)])` を追加（AC-6）。イベント生成をドメイン（`{ entity, eventDrafts }`）に置くか usecase 層 `collectEvents` に置くかは、実装時に既存のイベント収集パターンに合わせて判断（ADR-006 注記 / S-003-arch）。

**eventDecoders**: 新規イベント（設定変更）に `adminSettings/eventDecoders.ts` を追加（zod strict + `buildEventDecoder`）。`dispatchDomainEvent` がペイロードを decode して各ハンドラへ渡す。

### アダプター / 永続化 / 外部連携

**チャート**
- D1 実装 `D1UsageMetricsProvider` を新設。`ingestion_jobs` を hourly bucket 集計する。**実現方式（ADR-002 / S-001-arch）**: `created_at`（UTC ISO8601 TEXT）を `substr(created_at, 1, 13)`（"YYYY-MM-DDTHH"）で `GROUP BY` し `COUNT(*)`（`strftime('%Y-%m-%dT%H', created_at)` も等価）。drizzle `sql` テンプレートで記述。**欠損バケットは 24 本を 0 埋め**して返す（実データ 0 を平坦に描けるように）。partial-failure の try/catch は provider 内に閉じ、失敗時は系列を `null` で返す。
- **DI（ADR-002 / P-003-arch）**: `usageMetricsProvider` は `createRequestContainer`（request 路）に wire されている。`createRequestContainer` 内で `NullUsageMetricsProvider` → `new D1UsageMetricsProvider(db, clock)` に差し替え（D1 ハンドル `db` を注入）。**既存 scalar フィールド（userCount/storage/uploadsToday/llmCallsToday）は引き続き `null` を返す**（時系列フィールドのみ実装）→「既存 4 metric-card 挙動不変」（#545 一致）が成立。scalar も D1 で埋めるのは別 Issue。consumer は request container を spread 継承するだけで差し替え不要。

**アクティビティログ**
- 新規マイグレーション `activity_log` テーブル: `id` PK / `event_id`（unique, 冪等キー）/ `kind` / `actor_id` nullable / `target` text / `detail` text / `severity` / `occurred_at`（index 降順）/ `created_at`。加えて `ingestion_burst_log` 中間テーブル（`id` PK / `owner_id` / `hour_bucket` / `event_id` unique / `occurred_at`、ADR-005 方式A）。schema は `app/core/adapters/d1/schema.ts` に追加。
- `D1ActivityLogRepository`: `insertIfAbsent(entry)`（`ON CONFLICT(event_id) DO NOTHING` で冪等 — AC-7）と `findRecent(limit)`（occurred_at desc）+ バースト中間テーブルの read-time 集約 + **`pruneOlderThan(cutoff)`（`occurred_at < cutoff` を DELETE、保持刈り込み用 — AC-10）**。`ingestion_burst_log` 側にも同様の prune（24h 保持）を生やす。port は `ActivityLogRepository` interface を定義。prune クエリは既存 `outboxRepository.pruneProcessed` の定型に倣う。
- **コンテナ配線（ADR-006）**: `activityLogRepository` を `WorkerContainer` に追加（`createWorkerContainer` でインスタンス化、`indexJobRepository` と同配線）。`ConsumerContainer = RequestContainer & Pick<WorkerContainer, ... | "activityLogRepository">` に載せる。**`UnitOfWorkContext` には追加しない**。`dispatchDomainEvent` に新規 case を追加して各ハンドラへ振り分け。

### UI / プレゼンテーション

- `Dashboard/action.ts` に `loadDashboardCharts` / `loadRecentActivity`（`serverData` + `cache()`）を追加。
- `Dashboard/index.tsx` の「管理メニュー」filler 位置に:
  - 「直近 24 時間」セクション（チャートカード × 系列数）。系列が `null` の場合は「取得失敗」プレースホルダ（AC-3）。SVG sparkline は実データ点から path を生成。
  - 「最近のアクティビティ」テーブル（4 列、tag バリアント）。行が空なら honest な空状態（「アクティビティはまだありません」）。狭幅レスポンシブは #545 ADR-004 の実 DOM ラベル方式。
- 「期間を変更」「すべて見る」導線は AC-8 に従い、遷移先が無ければ描かない。
- スタイルは utility-first・トークン経由（CLAUDE.md §Styling）。モック準拠の意図的 px は維持、それ以外はトークン。

## 実装ステップ

> 依存方向の順（domain → application → adapter → presentation）。チャートとアクティビティは独立性が高く、PR を分割する（ADR-001 / PR 分割方針参照）。**PR-A = チャート**、**PR-B = アクティビティ**。ステップ番号は PR ごとに連番（A-n / B-n、S-002-arch 対応）。受け入れ基準表の「対応ステップ」列はこの接頭辞付き番号を指す。

### PR-A: 直近 24h チャート

#### A-1. LLM 呼び出し記録源の有無を確定（設計前提の確認）
- **対象:** `app/core/adapters/`・`app/core/application/` 全体の LLM 呼び出し箇所調査
- **変更内容:** LLM 呼び出しが永続記録されているか（カウンタ/ログ）を確定。無ければ AC-2 を「LLM 系列はデータ源なし → 本 Issue では描かない」とし、ADR-002 に記録。アップロード系列のみ実装。既存 scalar「LLM 呼び出し (24h)」カードは現状『取得失敗』のまま（挙動変更しない、表示整合のみ確認）。
- **理由:** 虚偽表示禁止。記録源の無い系列を描かない判断を最初に固定する（AC-2）。

#### A-2. `UsageMetricsProvider` port に時系列フィールドを追加
- **対象:** `app/core/application/ports/usageMetricsProvider.ts`
- **変更内容:** `UsageMetricsSnapshot` に hourly 時系列フィールド（例 `uploadsHourly: ReadonlyArray<{ hourStart: Date; count: number }> | null`、LLM は A-1 次第）を追加。`NullUsageMetricsProvider` も `null` を返すよう更新。partial-failure 契約を維持。
- **理由:** チャートのデータ契約。既存 port 拡張の是非は ADR-002。

#### A-3. D1 provider 実装（hourly 集計）+ DI 差し替え
- **対象:** `app/core/adapters/d1/repositories/usageMetricsProvider.ts`（新規）+ DI `serverCloudflare.ts`（`createRequestContainer`）
- **変更内容:** `D1UsageMetricsProvider` を新設。`ingestion_jobs` を直近 24h・hourly bucket で集計（`substr(created_at,1,13)` または `strftime('%Y-%m-%dT%H', created_at)` で UTC 時バケット `GROUP BY` + `COUNT(*)`、欠損バケットは 24 本 0 埋め）。throw せず `null` で degrade（try/catch を provider 内に閉じる）。**scalar フィールドは引き続き `null` を返す**（既存 4 metric-card 挙動不変、#545 一致）。`createRequestContainer` 内で `NullUsageMetricsProvider` → `new D1UsageMetricsProvider(db, clock)` に差し替え。
- **理由:** チャートの実データ源。専用集計テーブル不要（ADR-002）。DI 差し替えは request 路（P-003-arch）。

#### A-4. usecase / DTO 拡張
- **対象:** `app/core/application/adminSettings/getUsageMetrics.ts`（または新規 `getDashboardCharts.ts`）
- **変更内容:** provider の時系列を DTO に投影。
- **理由:** presentation へ時系列を渡す。

#### A-5. frontend: 直近 24h チャートセクション追加
- **対象:** `app/components/admin/Dashboard/{action.ts,index.tsx}`
- **変更内容:** loader 追加 → 「直近 24 時間」セクションを「管理メニュー」filler 位置に追加。実データ点から SVG path 生成。`null` 系列は「取得失敗」、**実データ 0（全 24h で 0 件 / 一部時間帯 0）は平坦線で正直に描き**「取得失敗」と区別する（AC-3 / S-005-arch）。「期間を変更」導線は AC-8 に従う。
- **理由:** AC-1〜3, 8。

### PR-B: 最近のアクティビティ

#### B-1. activity_log + ingestion_burst_log スキーマ + マイグレーション
- **対象:** `app/core/adapters/d1/schema.ts` + 新規 migration
- **変更内容:** `activity_log` テーブル（`event_id` unique 冪等キー、`occurred_at` index）。`ingestion_burst_log` 中間テーブル（`owner_id` / `hour_bucket` / `event_id` unique / `occurred_at`、ADR-005 方式A）。
- **理由:** projection 行・バースト中間蓄積の永続化。AC-4, 7。

#### B-2. ActivityLogRepository port + D1 実装 + コンテナ配線
- **対象:** `ActivityLogRepository` port（新規）+ `app/core/adapters/d1/repositories/activityLogRepository.ts`（新規）+ `serverCloudflare.ts` / `di/types.ts`
- **変更内容:** `insertIfAbsent`（`ON CONFLICT(event_id) DO NOTHING`）/ `findRecent(limit)` / バースト中間テーブルの read-time 集約。**`activityLogRepository` を `WorkerContainer` に追加（`createWorkerContainer` でインスタンス化）し、`ConsumerContainer` の `Pick<WorkerContainer, ...>` に `"activityLogRepository"` を追加して載せる（`indexJobRepository` と同配線）。`UnitOfWorkContext` には足さない**（ADR-006 / P-002-arch）。
- **理由:** 冪等 projection（AC-7）+ 取得。UoW 表面積を広げない。

#### B-3. RecentActivity DTO + getRecentActivity usecase
- **対象:** `app/core/application/activityLog/getRecentActivity.ts`（新規）+ view DTO
- **変更内容:** 直近 N 件を occurredAt 降順で `RecentActivityDTO[]`（kind / occurredAt / target / detail / severity）に投影。大量アップロードは `ingestion_burst_log` の read-time 集約（owner+窓で `COUNT(DISTINCT event_id)` ≥ 定数閾値）で導出。
- **理由:** AC-4, 5。

#### B-4. projection ハンドラ（既存イベント分）
- **対象:** `app/core/application/activityLog/handle{UserCreated,IngestionFailed,IngestionCreated,ExportJobCompleted}Event.ts`（新規）
- **変更内容:** 各ハンドラは `WorkerContainer` 系統を取り UoW を開かず `insertIfAbsent` で投影（ADR-006）。大量アップロードは `ingestion.created` を `ingestion_burst_log` に `insertIfAbsent`（加算しない、ADR-005 方式A）。バックアップは `export.job.completed` に意味を寄せ、ラベルは実態（『エクスポート完了』）、運用上ほぼ発生しないなら種別縮退可（ADR-003 / AC-4）。**各ハンドラで「対象」「詳細」列に必要な payload フィールドが揃うか確認**（揃わなければ payload 拡張 or 別 repo 引き、S-002-coverage / AC-5）。
- **理由:** AC-4, 5, 7。

#### B-5. 設定変更イベントの新設
- **対象:** `app/core/domain/adminSettings/events.ts`（新規）ほか + 各設定 usecase
- **変更内容:** `instance_settings.updated`（`settingKind` を payload で区別、ADR-003）を定義。イベント生成をドメイン（`{ entity, eventDrafts }`）に置くか usecase 層 `collectEvents` に置くかは**既存のイベント収集パターンに合わせて実装時に判断**（ADR-006 注記 / S-003-arch、ドメインを不要に重くしない）。「対象」「詳細」に必要なフィールド（設定種別・要約）を payload に持たせる（AC-5）。
- **理由:** AC-6 の書き込み側。

#### B-6. 設定 usecase に collectEvents 追加 + decoder
- **対象:** `app/core/application/adminSettings/{toggleRegistrationPolicy,updateLLMConfig,updatePromptTemplate,updateInstanceLimits,updateDesignTokens,updateSpeechConfig,resetPromptTemplate,resetAllPromptTemplates,resetDesignTokens,reencryptApiKey,updateUserPromptOverride,...}.ts` + 新規 `adminSettings/eventDecoders.ts`
- **変更内容:** **まず実在する変更系 adminSettings usecase を棚卸しして対象を確定する**（S-001-coverage）。`app/core/application/adminSettings/` の実在ファイルは `toggleRegistrationPolicy` / `updateLLMConfig` / `updatePromptTemplate` / `updateInstanceLimits` / `updateDesignTokens` / `updateSpeechConfig`（音声）/ `resetPromptTemplate` / `resetAllPromptTemplates` / `resetDesignTokens` / `reencryptApiKey` / `updateUserPromptOverride` 等。各々を「`instance_settings.updated` を emit する/しない」で明示的に仕分けし、`settingKind` ユニオンの最終形と一致させる（音声・各種 reset・再暗号化・ユーザー override を含むか/含まないかを記録に残し、一部 usecase だけ emit して他が漏れる取りこぼしを構造的に防ぐ）。仕分け後、対象 usecase で `collectEvents([InstanceSettingsEvents.updated(...)])`。decoder（zod strict + `buildEventDecoder`）を追加。
- **理由:** AC-6。設定変更を実イベントとして emit。対象の網羅範囲を AC-6 の検証境界と一致させる（S-001-coverage）。

#### B-7. dispatcher 配線
- **対象:** `app/core/application/workers/dispatchDomainEvent.ts`
- **変更内容:** activity ハンドラへ fan-out する。**`ingestion.created` は既存 `runIngestionJob` case への fan-out 追加**（同 case 内で `runIngestionJob` に加えて activity ハンドラを呼ぶ。新規 case として二重登録するとジョブ実行が壊れるので不可。手本: `note.trashed` の既存 fan-out）。**`user.created` / `ingestion.failed` / `export.job.completed` / `instance_settings.updated` は現状 `default: skipped` なので純粋な新規 case**。既存 case の挙動は不変。未登録 type は `default: skipped` のまま。fan-out の片方（`runIngestionJob`）が `retry` を返しても `ingestion_burst_log` の自然キー insert は冪等なので順序に依存しない（ADR-005 / S-002-arch）。
- **理由:** AC-4, 6, 7。冪等は consumer の idempotencyStore（主防御）+ handler 側 `insertIfAbsent`（二重防御）で担保。

#### B-8. frontend: 最近のアクティビティテーブル追加
- **対象:** `app/components/admin/Dashboard/{action.ts,index.tsx}`
- **変更内容:** loader 追加 → 「最近のアクティビティ」テーブルを追加。空状態は honest filler。狭幅は #545 ADR-004 の実 DOM ラベル方式。「すべて見る」導線は AC-8。
- **理由:** AC-4, 5, 8。

#### B-9. 保持・刈り込み経路（pruner 対象拡張）
- **対象:** `app/core/adapters/d1/repositories/activityLogRepository.ts`（prune クエリ）+ pruner エントリ点 `app/worker/cloudflare/pruner.ts` / `pruneOutbox` 相当（`app/core/application/workers/`）
- **変更内容:** `ActivityLogRepository`（および `ingestion_burst_log` 側）に `pruneOlderThan(cutoff)`（`occurred_at < cutoff` を DELETE）を生やす。pruner の daily tick から、`ingestion_burst_log`（保持 24h）・`activity_log`（保持 `ACTIVITY_LOG_RETENTION_DAYS` 定数・暫定 90 日）の prune を呼ぶ。既存 `outboxRepository.pruneProcessed` の定型に倣う。**既存 pruner は `outbox_events` のみ対象＝新規テーブルは自動で刈られない**ため本ステップで明示的に足す（"実装時に確認" ではなく確定）。`processed_events` の無刈りはスコープ外（既存運用課題、設定変更は低頻度で軽微）。
- **理由:** AC-10。`ingestion_burst_log` は `ingestion.created` 1:1 で高頻度蓄積し、刈り込み無しでは無限増大する（再設計が生んだ副作用、ADR-005 保持節 / ADR-007）。`activity_log` も全イベント恒久保持で index が増え続けるため保持上限を切る。

### 共通

#### C-1. テスト + 品質ゲート
- **対象:** 各層 `__tests__`
- **変更内容:** provider hourly 集計の統合テスト（24 バケット・空テーブルで 24 本 0 埋め・1 メトリクス失敗で系列のみ `null`）、activity projection の冪等性テスト（同 eventId 二重配信で二重行なし）、**大量アップロード集約の境界テスト（定数閾値前後で行が出る/出ない）**、設定変更の event emit テスト、getRecentActivity の順序・空状態テスト、**刈り込みテスト（`ingestion_burst_log` 保持 24h / `activity_log` 保持定数を超える行が prune で削除され、保持内は残る）**、**活動空状態 + 導線非表示の共存テスト**（空状態メッセージと「すべて見る」非表示が両立）。`pnpm typecheck && pnpm lint:fix && pnpm format`。
- **理由:** AC-9。

## 設計判断

詳細は `adr.md`。

- **ADR-001**: 活動ログは event-sourced projection（consumer ハンドラで read-model テーブルへ書く）を採用。既存先例（search / SavedView / publication）に整合。冪等の責務分担を明記（consumer の idempotencyStore が主防御、projection の自然キー UPSERT が `markProcessed` 前クラッシュ窓の二重防御。加算等の非冪等操作は禁止）。
- **ADR-002**: チャートは専用集計テーブルを作らず `ingestion_jobs` の hourly クエリで導出（`substr`/`strftime` で UTC 時バケット GROUP BY、欠損 24 バケット 0 埋め）。port は既存 `UsageMetricsProvider` を拡張。DI 差し替えは `createRequestContainer`、scalar は `null` 固定で既存挙動不変。LLM 系列はデータ源確定後に可否を決める。
- **ADR-003**: 設定変更イベントは種別を payload で区別する単一 `instance_settings.updated`。バックアップ種別は実在の `export.job.completed` に意味を寄せ（ラベルは『エクスポート完了』）、nightly backup は写さない。
- **ADR-004**: 「期間を変更」「すべて見る」導線は遷移先が無ければ描かない（虚偽導線回避）。
- **ADR-005**: 大量アップロードは件数加算を廃し、`ingestion.created` を `ingestion_burst_log`（`event_id` unique）に自然キー insert（二重計上が原理的に起きない）→ 表示時に窓集約（定数閾値）で 1 行導出。fan-out の片方 retry でも自然キー insert は冪等。`ingestion_burst_log` は保持 24h で専用刈り込み（無限増大の歯止め、P-001-arch）。
- **ADR-006**: 活動ログ projection は `WorkerContainer` 経由で UoW を開かず書く（`search/handleNoteSavedEvent` 系統）。`UnitOfWorkContext` には足さない。設定イベントの生成位置（ドメイン vs usecase collect）は実装時に既存パターンへ合わせる。
- **ADR-007**: 活動ログ系テーブルの保持方針を本 Issue で確定し、専用刈り込みを足す。既存 pruner は `outbox_events` のみ対象で新規テーブルを自動で刈らないため、`ingestion_burst_log`（24h）・`activity_log`（90 日定数）の prune を pruner daily tick に追加。`processed_events` 無刈りはスコープ外。

## リスクと注意点

- **LLM 系列のデータ源欠落**: LLM 呼び出しの永続記録が無ければ AC-2 を満たせない。A-1 で確定し、無ければ「アップロード系列のみ」に縮退（虚偽表示回避）。既存 scalar「LLM 呼び出し (24h)」カードも同じデータ源不在で『取得失敗』のまま（#545 一致で挙動変更しない）。LLM 記録源の新設まで踏み込むとスコープ膨張。
- **「バックアップ」種別の意味ずれ**: モックの D1 nightly backup は実在しない。`export.job.completed` に寄せる判断が運用者に誤読される懸念 → ラベル文言を実態（『エクスポート完了』）に合わせ、運用上ほぼ発生しないなら種別縮退も可（ADR-003 / AC-4）。
- **大量アップロード集約の二重計上（解消済み）**: 当初の「窓キー件数加算」案は consumer の dispatch 前冪等化（idempotencyStore）と衝突し、`markProcessed` 前クラッシュ → 再配信で二重計上しうる。ADR-005 で**件数加算を廃し**、`ingestion_burst_log` への自然キー insert（`event_id` unique）+ read-time 集約に再設計したため、二重計上は原理的に起きない。
- **DI 差し替えと既存 scalar の相互作用**: `usageMetricsProvider` を Null → D1 に差し替えると scalar も `null` → 実値に変わりうる。`D1UsageMetricsProvider` は**時系列のみ実装し scalar は `null` 固定**にすることで「既存 4 metric-card 挙動不変」を成立させる（A-3 で固定、P-003-arch）。
- **設定 usecase へのイベント追加の波及**: 各 usecase が新規イベントを emit するようになる。activity 以外の consumer では `default: skipped` で無害だが、outbox / `processed_events` 行が増える。設定変更は低頻度で relay/consumer 負荷は軽微想定。**`processed_events` は現状無刈り**（既存 pruner は `outbox_events` のみ削除）だが、設定変更は低頻度で増分軽微なため本 Issue ではスコープ外（正確化のみ。無刈り問題自体は別 Issue 化が望ましい）。
- **`ingestion_burst_log` の無限増大（P-001-arch、再設計の副作用）**: ADR-005 方式A は `ingestion.created`（1 ファイル 1 件＝高頻度）を 1:1 で蓄積するため、刈り込み経路が無いと無限増大する。再設計前の「窓キー 1 行へ加算」方式には無かった新規副作用。既存 pruner は `outbox_events` のみ対象で新規テーブルを自動で拾わない（grep 確認済み）ため、B-9 で `ingestion_burst_log`（保持 24h）・`activity_log`（保持 90 日定数）の専用刈り込みを pruner に足す（ADR-005 保持節 / ADR-007）。"実装時に確認" ではなく確定スコープ。
- **dispatcher fan-out の取り違え（S-001-arch）**: `ingestion.created` は既存 `runIngestionJob` case への fan-out 追加であり、別 case として二重登録するとジョブ実行が壊れる。`user.created` / `ingestion.failed` / `export.job.completed` / `instance_settings.updated` は純粋な新規 case。B-7 で区別を明記。
- **冪等性（二重防御）**: consumer の `idempotencyStore`（dispatch 前 `hasProcessed`）が主防御、projection の `insertIfAbsent`（event_id unique）が `markProcessed` 前クラッシュ窓の二重防御（AC-7 / ADR-001）。
- **空状態 / バックフィル無し**: リリース直後はテーブルが空。チャート（過去 ingestion_jobs から導出されるため埋まる）と異なり、活動テーブルは空状態 UI が必要。
- **hourly バケットのタイムゾーン**: `created_at` は UTC ISO8601 なので集計は UTC（`substr`/`strftime`）、表示は #545 と同じ時刻表記に揃える。実データ 0 件（その時間帯に ingestion 無し）は `null`（取得失敗）と区別し、平坦線で正直に描く（S-005-arch）。

## テスト方針

- provider: `ingestion_jobs` を時刻散布したシードで hourly 集計が直近 24 バケットを正しく返す統合テスト（実 D1）。**空テーブルで 24 本すべて 0 を返す（欠損 0 埋め）**テスト。1 メトリクス失敗時に系列のみ `null` で degrade する partial-failure テスト。scalar フィールドが `null` 固定であること。
- activity projection: 各イベント → 1 行投影。**同一 eventId 二重配信で行が増えない**冪等テスト。**大量アップロード集約: 定数閾値（`LARGE_UPLOAD_THRESHOLD`）前後で行が出る/出ない境界テスト、同一 eventId 再蓄積で `ingestion_burst_log` が二重計上しないテスト**（S-003-coverage / ADR-005）。
- 設定 usecase: 設定変更で `instance_settings.updated` が collectEvents される単体テスト。
- getRecentActivity: occurredAt 降順・limit・空状態テスト。バースト read-time 集約の件数導出テスト。
- frontend: チャート `null` 系列で「取得失敗」、**実データ 0 件は平坦線で描き「取得失敗」と区別**、活動空で空状態、導線が無ければリンク非表示（虚偽表示禁止の回帰）。**活動空状態 + 導線非表示の共存ケース**（リリース直後の空テーブルで、空状態メッセージ「アクティビティはまだありません」が出つつ「すべて見る」リンクが非表示で、両者が二重表示にならない）を 1 ケース追加（S-002-coverage）。
- 既存 4 metric-card の挙動が不変であること（回帰。D1 provider 差し替え後も scalar は `null` のまま）。
- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit` / `pnpm test:integration`。

## レビュー履歴

### 1周目

**修正した点**:
- **[arch P-001]（大量アップロード集約 vs idempotencyStore 二重計上）**: ADR-005 を全面改訂。当初の「窓キー unique + 件数加算（`ON CONFLICT DO UPDATE`）」は consumer の dispatch 前冪等化（`hasProcessed`）と衝突し `markProcessed` 前クラッシュ → 再配信で二重計上しうる、という正確な脅威モデルを明記。件数加算を廃し、`ingestion_burst_log`（`event_id` unique）への自然キー insert + read-time 集約に再設計（二重計上が原理的に起きない）。ADR-001 に冪等の責務分担（consumer 主防御 + projection 自然キー UPSERT 二重防御、加算系禁止）を追記。AC-7 / 設計 / リスク / テストに反映。
- **[arch P-002]（projection のコンテナ/UoW）**: ADR-006 を新設。activityLogRepository は `WorkerContainer` 経由（`search/handleNoteSavedEvent` 系統）で UoW を開かず書き、`UnitOfWorkContext` には足さない方針を確定。`ConsumerContainer` の `Pick<WorkerContainer, ...>` に載せる配線を plan の設計・ステップ B-2・依存関係に明記。
- **[arch P-003]（usageMetricsProvider 差し替え経路）**: 差し替えは `createRequestContainer`（request 路）であること、`D1UsageMetricsProvider` は時系列のみ実装し scalar フィールドは `null` 固定にすることで「既存 4 metric-card 挙動不変」が成立する条件を ADR-002・設計・ステップ A-3・リスクに明記。
- **[coverage P-001]（LLM 系列縮退と scalar 整合）**: AC-2 に、LLM 記録源無し確定時に既存 scalar「LLM 呼び出し (24h)」カードも同じデータ源不在で『取得失敗』のままだが #545 一致で挙動変更せず表示整合のみ確認する旨を追記。
- **[coverage P-002]（バックアップ行のラベル/縮退）**: AC-4 を「『バックアップ』は per-owner エクスポート完了（`export.job.completed`）に限り、ラベルは実態（『エクスポート完了』）、存在しない D1 nightly は出さない、運用上ほぼ発生しないなら種別縮退可」と締めた。

**取り込んだ改善提案**:
- **[arch S-001 / coverage S-003]**: hourly bucket の実現方式を UTC `substr`/`strftime` GROUP BY + 欠損 24 バケット 0 埋めに ADR-002・ステップ A-3 で具体化。大量アップロード閾値を定数化（`LARGE_UPLOAD_THRESHOLD` 等）し境界テストをテスト方針・C-1 に明記。
- **[arch S-002]**: 実装ステップを PR ごとの連番（A-1〜A-5 / B-1〜B-8 / C-1）に振り直し、AC 表の「対応ステップ」列も接頭辞付き番号に更新。
- **[arch S-005 / coverage S-002]**: 「実データ 0」と「取得失敗 null」の UI 区別を AC-3・ステップ A-5・テスト方針に明記。AC-5 の「対象」「詳細」列の payload フィールド有無を B-4/B-5 で確認する旨を追記。
- **[coverage S-001]**: AC-7 に idempotencyStore との二重防御の関係を明記。

**見送った提案とその理由**:
- **[arch S-003]（InstanceSettings 全 mutation の `{entity,eventDrafts}` 化 vs usecase collectEvents）**: 実装フェーズで既存のイベント収集パターンに合わせて判断する範囲のため、ADR-006 注記・ステップ B-5 に「既存パターンに合わせる」とだけ記し、設計を固定しない。
- **[arch S-004]（processed_events 肥大化 / pruner 対象）**: リスク節に「`processed_events`・`ingestion_burst_log` の刈り込みが pruner の既存対象に含まれるかは実装時に確認」と一行で触れるに留めた。→ 2周目 [arch P-001] で確定スコープに格上げ（下記）。

### 2周目

**修正した点**:
- **[arch P-001]（`ingestion_burst_log` の無限増大 — 再設計の副作用 / 1周目 S-004 の前提誤り）**: 既存 pruner（`outboxPrune.ts` → `outboxRepository.pruneProcessed`）は `outbox_events` のみ `processed_at < cutoff` で削除し `processed_events`・read-model テーブルは一切刈らない実態を確認（grep 0 件）。ADR-005 方式A は `ingestion.created`（高頻度・1 ファイル 1 件）を 1:1 で `ingestion_burst_log` に蓄積するため、刈り込み経路が無いと無限増大する（旧「窓キー加算」方式には無かった新規副作用）。対応として (a) `ingestion_burst_log`（保持 24h）・`activity_log`（保持 `ACTIVITY_LOG_RETENTION_DAYS` 定数・暫定 90 日）の retention を明確に定義し、(b) 専用の刈り込み経路を本 Issue スコープに追加。AC-10 新設、ステップ B-9 新設、ADR-005「保持・刈り込み」節を追記、ADR-007 を新設、依存関係・リスク節（`ingestion_burst_log` 無限増大 + `processed_events` 無刈りの正確化）・テスト方針（刈り込みテスト）に反映。1周目 S-004 の「pruner の既存対象に含まれるか実装時に確認」（"確認"止まり）を「**既存 pruner は `outbox_events` のみ対象。新規テーブルは専用刈り込みを足す**」と確定スコープに変更（[arch S-003] = activity_log 本体の保持と統合して扱った）。

**取り込んだ改善提案**:
- **[arch S-001]**: B-7 の `ingestion.created` は新規 case ではなく既存 `runIngestionJob` case への **fan-out 追加**である点を、ステップ B-7・依存関係・リスク節に明記（別 case への二重登録でジョブ実行が壊れる取り違えを防止。手本: `note.trashed` の既存 fan-out。`user.created` / `ingestion.failed` / `export.job.completed` / `instance_settings.updated` は `default: skipped` のため純粋な新規 case）。
- **[arch S-002]**: fan-out の片方（`runIngestionJob`）が `retry` を返しても `ingestion_burst_log` の自然キー insert は `ON CONFLICT(event_id) DO NOTHING` で冪等、と ADR-005「fan-out の冪等性」節・ステップ B-7 に明記（実装者が fan-out 順序で迷わない）。
- **[coverage S-001]**: B-6 に「実在する全変更系 adminSettings usecase（`updateSpeechConfig` / 各種 `reset*` / `reencryptApiKey` / `updateUserPromptOverride` 含む）を棚卸しし、`instance_settings.updated` を emit する/しないで明示的に仕分けして `settingKind` ユニオンの最終形と一致させる」一行を追加。対象列挙も実在ファイルで具体化し、AC-6 の検証境界と一致させた（一部 usecase だけ emit して他が漏れる取りこぼしを構造的に防止）。
- **[coverage S-002]**: テスト方針・C-1 に「活動空状態 + 導線非表示の共存」ケース（空テーブルで空状態メッセージが出つつ「すべて見る」リンクが非表示で二重表示にならない）を 1 件追加。

**見送った提案とその理由**:
- なし（2周目の要修正 1 件・改善提案 4 件はすべて反映）。

### 3周目

両視点とも問題点ゼロ・改善提案ゼロで終了。1〜2周目の反映（冪等な自然キー投影への再設計・WorkerContainer 経由 projection・retention/刈り込みの確定スコープ化・設定 usecase 棚卸し）が AC・ADR・ステップ・リスク・テストの全層に矛盾なく波及していること、虚偽表示禁止の鉄則が 3 周通して一貫していることを両レビュアーが確認。計画は収束。
