# 実装計画 — Issue #748: LLM 呼び出しの永続記録源を新設し P40 ダッシュボードに LLM 時系列を追従

**Issue:** #748
**作成日:** 2026-06-18
**複雑度:** 中〜大規模

---

## 目的

LLM 呼び出しを owner / provider / occurredAt 付きで永続記録する read-model テーブルを新設し、P40 ダッシュボードの「直近 24 時間」に LLM hourly 系列を（アップロード系列と同型で）追加する。併せて scalar「LLM 呼び出し (24h)」カードを実データで埋め、『取得失敗』固定を解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | LLM 呼び出し（preview / ingestion 両経路）が成功すると `llm_call_log` に owner / provider / occurredAt を持つ行が **1 LLM API 呼び出し = 1 行**で永続記録される。記録粒度は「LLM API 呼び出し回数」であり、1 ユーザ操作で複数の LLM 呼び出しが走る場合は複数行記録される（例: ingestion の structure プレビューは `structureToHtml` + `suggestMetadata` で 2 行、html/markdown 分岐は `suggestMetadata` のみで 1 行、空 audio は LLM を呼ばないので 0 行）。**但し書き: provider が Stub（LLM 未設定）のときは記録しない** — Stub は実 LLM 呼び出しではなく、記録すると scalar/系列が実態と乖離して虚偽表示禁止（AC-4）と衝突するため。記録される `provider` は env 値ではなく **実際に構築された provider の解決済み名**（真実源は `buildLlmProvider` / `resolveConsumerLlmConfig` が構築した provider, ADR-002 / ADR-006） | Issue「やること」1 / 虚偽表示禁止 | 1, 2, 3, 6, 7, 11 |
| AC-2 | `D1UsageMetricsProvider` が LLM 呼び出しの hourly 時系列（UTC hourly bucket・24 本 0 埋め・partial-failure 時 `null` degrade）を返す | Issue「やること」2 | 4, 5 |
| AC-3 | scalar `llmCallsToday`（カードラベル「回 / 24h」= 直近 24h の LLM API 呼び出し回数）が `llm_call_log` から実データ（直近 24h の `COUNT(*)`）で算出され、データ源失敗時のみ `null`（取得失敗表示）になる | Issue「やること」3 | 5 |
| AC-4 | P40 Dashboard「直近 24 時間」に LLM 系列カードが追加され、実データに一致した表示になる（系列 `null` 時は『取得失敗』、0 件は平坦線）。scalar カードも実数表示される | Issue「やること」4 / 虚偽表示禁止 | 8 |
| AC-5 | 記録失敗が LLM 本処理（プレビュー結果返却・ジョブ実行）を壊さない（best-effort・失敗はログのみ） | ADR-002 | 6, 7 |
| AC-6 | `llm_call_log` が既存 pruner の daily tick で保持期間（`LLM_CALL_LOG_RETENTION_HOURS = 48`）超過行を刈られる。表示窓 24h < 保持窓 48h を満たすため、daily tick のタイミングに依らず直近 24h の表示対象が刈られない。刈り込みは `runPruneTick` 内の **独立した try/catch ブロック**で行い、activity-log prune の失敗と相互にブロックしない | ADR-005 / #595 ADR-007 | 10, 11 |
| AC-7 | 他 scalar（userCount / storage* / uploadsToday）の挙動は不変（引き続き `null` 固定） | #595 ADR-002 整合 | 5 |

## スコープ

### 含まれないもの
- **provider 別系列の描画**: `provider` カラムは保持するが、本 Issue では集約系列のみ描く（虚偽ではなく、単に集約表示）。
- **他 scalar（userCount / storage* / uploadsToday）の D1 実装**: 本 Issue は LLM 記録源のみ新設。他はデータ源不在のまま `null` 固定据え置き（#595 ADR-002 整合, AC-7）。
- **token 数 / コスト / レイテンシの記録**: 「呼び出し回数」のみ。課金明細用途ではない（best-effort 記録のため概算）。
- **「期間を変更」導線・任意レンジ集計**: #595 ADR-004 のとおり遷移先未実装の導線は描かない。
- **ドメインイベント `llm.called` の新設**: 記録は直接ポート経由（ADR-002）。dispatcher / outbox / projection ハンドラは増やさない。

## 調査結果

- 関連ファイル:
  - `app/core/adapters/d1/repositories/usageMetricsProvider.ts` — `collectUploadsHourly()`（UTC `substr(created_at,1,13)` bucket・24 本 0 埋め・try/catch null degrade）。本 Issue で LLM 系列メソッドを同型追加。
  - `app/core/application/ports/usageMetricsProvider.ts` — `UsageMetricsSnapshot` / `UsageMetricsHourlyPoint` / `NullUsageMetricsProvider`。`llmCallsHourly` を追加。
  - `app/core/application/adminSettings/getUsageMetrics.ts` — usecase + DTO（`HourlyMetricPointDTO`, `hourStart` を ISO8601 へ map）。`llmCallsHourly` を DTO に追加。
  - `app/components/admin/Dashboard/index.tsx` — 「直近 24 時間」セクション（現状 LLM カードは非描画、scalar は `null` → 『取得失敗』）。LLM 系列カード追加 + scalar 実数表示。`UploadsSparkline` / `chart.ts` を再利用。
  - LLM 呼び出し call-site:
    - `app/core/application/ingestion/previewPrompt.ts`（request 路・UoW 無し・`actorUserId`→`ownerId` 在・`container` 在）。`metadata` 分岐は `suggestMetadata` 1 回、`structure` 分岐は `structureToHtml` 1 回（=各分岐 1 LLM 呼び出し）。両呼び出しは 1 つの try で囲われ、Stub の `unsupported_format` は `catch` で `translateLLMError`→`llm_preview_unavailable` に変換され成功路に到達しない（=Stub は自然に記録されない）。記録は各 `await container.llmProvider.*` の**成功直後・return 前**に挿入できる。
    - `app/core/application/ingestion/runIngestionJob.ts` の `runPipeline`（consumer 路）は **`PipelineDeps` のみを受け取る free function で、`container` / `clock` / recorder / provider 名を持たない**（L273）。LLM 呼び出しは `deps.llm.structureToHtml`（L346, structure 系のみ）と `deps.llm.suggestMetadata`（L370, 共通パス）の 2 箇所で、html/markdown 分岐は `structureToHtml` をスキップ、空 audio は両方スキップして早期 return する。呼び出し元 `runIngestionJob`（L124 の `runPipeline(...)`）は `container` を保持しているため、recorder / clock / provider 名は **`runPipeline` の引数（`PipelineDeps` 拡張）として注入**し、各 `deps.llm.*` 成功直後に best-effort 記録するのが call 回数と 1:1 で整合する（ステップ 7 で確定）。
  - provider 名の真実源: `buildLlmProvider`（`serverCloudflare.ts` L578-591）は `LLMProvider` インスタンスのみ返し、解決済み provider 名を外に出さない。`adminLlmApiKey` / `adminLlmModel` のいずれか欠落時は `provider` を無視して `StubLLMProvider` を返す。よって env の `ADMIN_LLM_PROVIDER` 値は「実際に構築された provider」と一致しない（Stub のとき特に）。記録の `provider` 列の真実源は env 値でなく**実際に構築された provider の名前**とし、`buildLlmProvider` が「provider と解決済み名のペア」を返す形に変更する（ADR-006）。
  - LLM port/adapter: `app/core/domain/ingestion/ports/llmProvider.ts`（`LLMProvider`）、`app/core/adapters/{anthropic,openai,gemini}/llmProvider.ts`、`app/core/adapters/llm/registry.ts`、provider 解決は `app/core/application/di/serverCloudflare.ts` の `buildLlmProvider`（request, 既定 "anthropic"）/ `resolveConsumerLlmConfig`（consumer, env override > DB）。
  - 先例（同型再利用元）: `ingestion_burst_log`（自然キー insert + read-time 集約）の schema（`app/core/adapters/d1/schema.ts` L848-867, migration `0018_activity_log.sql`）。**注意（P-004 訂正）**: `ingestion_burst_log.occurred_at` は `integer(... { mode: "timestamp_ms" })` であり substr bucket ではない。hour bucket は別途 `hour_bucket` text カラムに保持し、read-time 集約は `occurred_at`（ms）の sliding window で行う。「UTC substr bucket」は `uploadsHourly` が引く `ingestion_jobs.created_at`（ISO8601 text）の特性であって `ingestion_burst_log` の特性ではない。よって `llm_call_log` で「ingestion_burst_log 同型にすれば substr bucket が使える」は成立しない（bucket 方式は設計セクションで 1 つに確定する）。`ActivityLogRepository`（`app/core/application/activityLog/ports.ts` / `app/core/adapters/d1/repositories/activityLogRepository.ts`, `onConflictDoNothing({target: eventId})`）、刈り込み（`app/core/application/workers/pruneActivityLog.ts` / `app/worker/cloudflare/handlers.ts` `runPruneTick`, `types.ts` の retention 定数）。
  - DI 配線先例: `D1ActivityLogRepository` は RequestContainer（read 用）と WorkerContainer（write 用）両方に載る（`app/core/application/di/serverCloudflare.ts` / `app/core/application/di/types.ts`）。
  - 最新 migration 番号: `0019_ingestion_jobs_created_at_index.sql`。本 Issue は `0020_*` を採番。
- あるべきアーキテクチャ: ヘキサゴナル + DDD（CLAUDE.md）。依存は内側へ。LLM 記録は「ドメインの中核ではない read-model」なので #595 の活動ログ projection と同格の application 層 read-model として設計する。ただし LLM 呼び出しは preview（request 路・UoW 無し）でも起き、outbox enqueue が使えないため、記録経路は **outbox/event ではなく直接ポート（同期 best-effort）** を採る（ADR-002）。partial-failure・UTC hourly bucket・自然キー insert・pruner daily tick は #595 の確立パターンに揃える。
- 既存実装の状態: #595 はデータ源不在を理由に LLM 系列・scalar を意図的に未実装にした（`usageMetricsProvider.ts` の JSDoc / Dashboard コメント / `.issue/595/adr.md` A-1 に明記）。これは「あるべき姿への意図的な保留」であり乖離ではない。本 Issue がその保留を解消する。既存パターン（アップロード系列）は正であり忠実に踏襲する。
- 依存関係: `usageMetricsProvider` の port 拡張は DTO（`getUsageMetrics`）と UI（Dashboard）に波及。LLM call-site への記録呼び出しは `previewPrompt` / `runIngestionJob` の振る舞いに best-effort で追加（成否に影響させない）。新テーブルは migration + schema + pruner 配線 + DI 配線に波及。

## 設計

### ドメインモデルへの影響
**新しいドメイン概念・不変条件は増やさない。** LLM 呼び出しの「回数記録」は管理ダッシュボードの read-model であり、ドメインの中核（ingestion アグリゲート）の不変条件ではない（#595 ADR-001 の活動ログと同じ位置づけ）。`provider` は既存ドメイン値（`LLMProvider` = "anthropic" | "openai" | "gemini"、`app/core/domain/adminSettings/valueObject.ts`）を再利用する。新規ドメインイベントも定義しない（ADR-002: 記録は直接ポート経由）。

### ユースケース / アプリケーションロジック
- 新規 application モジュール `app/core/application/llmCallLog/`:
  - `ports.ts`: `LlmCallLogRecorder` は **write / prune に責務を絞る**（`recordCall(entry)` / `pruneOlderThan(cutoff)`）。**read 系（`countSince` / `collectLlmCallsHourly` 等）はポートに生やさず `D1UsageMetricsProvider` 内の read に閉じる**（arch[S-001]）。理由: `D1UsageMetricsProvider` は constructor で `db` を直接持ち、`collectUploadsHourly` も provider 内で直接 drizzle クエリを書く既存パターンに最も忠実。read を recorder と provider の両方に生やすと同じ集計が 2 箇所に出て乖離リスクが生じる。責務分離は「recorder = write/prune、provider = read」と確定する。
  - `types.ts`: `LlmCallLogEntry`（`id` / `ownerId` / `provider` / `occurredAt`、`eventId` は持たない, ADR-008）+ retention 定数 `LLM_CALL_LOG_RETENTION_HOURS = 48`（表示窓 24h < 保持窓 48h, AC-6）。
- provider 名の真実源（P-002 / ADR-006）: 記録する `provider` は env の `ADMIN_LLM_PROVIDER` 値ではなく **`buildLlmProvider` が実際に構築した provider の解決済み名**とする。`buildLlmProvider` を「`{ provider: LLMProvider; providerName: string }` を返す」形に変更し（Stub フォールバック時は記録対象外なので `providerName` は使わない／"stub" 等を返しても recorder 側で Stub を除外する）、container に `llmProviderName`（解決済み名）を載せる。consumer 路は `resolveConsumerLlmConfig` の解決結果（env override > DB）由来の provider 名を同じ経路で container に載せる。
- `previewPrompt`: 各 LLM 呼び出し（`suggestMetadata` / `structureToHtml`）の**成功直後・return 前**に `container.llmCallLogRecorder.recordCall(...)` を try/catch で best-effort 呼び出し（失敗は `logger.warn` のみ、本処理を壊さない）。`ownerId` は在、`occurredAt` は `container.clock.now()`、`provider` は `container.llmProviderName`。Stub は成功路に到達しない（catch で `llm_preview_unavailable` 化）ため自然に記録されない。
- `runIngestionJob` / `runPipeline`: `runPipeline` は `container` を持たない free function なので、`PipelineDeps` に `recorder: LlmCallLogRecorder` / `clock: Clock` / `providerName: string` を追加し、呼び出し元 `runIngestionJob`（L124）から `container.llmCallLogRecorder` / `container.clock` / `container.llmProviderName` を渡す。各 `deps.llm.structureToHtml` / `deps.llm.suggestMetadata` の**成功直後**に best-effort 記録する（html/markdown 分岐は `structureToHtml` を呼ばないので記録しない、空 audio 早期 return も記録しない → call 回数と 1:1）。**Stub 非記録は明示的な Stub 判定で実現しない**: `StubLLMProvider` は両メソッドが必ず throw するため、記録を `deps.llm.*` 成功直後（await が解決し throw を抜けた後）に置けば、Stub では記録地点に到達せず構造的に非記録になる（arch[S-001]）。Stub 判定フラグを `PipelineDeps` に持ち回す実装は入れない。
- `getUsageMetrics`: 出力 DTO に `llmCallsHourly: readonly HourlyMetricPointDTO[] | null` を追加し、snapshot を ISO8601 へ map（`uploadsHourly` と同じ）。

### アダプター / 永続化 / 外部連携
- migration `0020_llm_call_log.sql` + `schema.ts` に `llm_call_log` テーブル。**`occurred_at` の格納型は ISO8601 text に確定する（P-004 / ADR-007）。** カラム: `id` PK / `owner_id` / `provider`（"anthropic" | "openai" | "gemini"）/ `occurred_at` text（ISO8601 UTC）/ `created_at` ts_ms、index: `idx_llm_call_log_occurred_at`（`occurred_at`）。bucket 方式は `uploadsHourly`（`ingestion_jobs.created_at`）と同一の `substr(occurred_at, 1, 13)` を再利用する。これにより `collectUploadsHourly` のコードを最大限流用でき「両系列で bucket 境界が一致」をテストで簡潔に満たせる。`ingestion_burst_log`（ts_ms + 別 `hour_bucket` text）の方式は採らない（substr が使えず流用できないため）。
  - **`event_id` unique 制約は撤廃する（arch[S-002] / ADR-008）。** 記録は同期 best-effort で再配信窓が無く冪等キーが不要なため、`onConflictDoNothing({target: event_id})` も unique index も設けない。`recordCall` は単純 insert とし、entry は `id`（`idGenerator.next()`）/ `ownerId` / `provider` / `occurredAt` のみを持つ（`eventId` フィールドは廃止）。これにより「同期記録に冪等キーがある」という誤読リスクと unique index 1 本ぶんの書き込みコストを避ける。
- `D1LlmCallLogRecorder`（`app/core/adapters/d1/repositories/llmCallLogRecorder.ts`）: `recordCall` = 単純 `insert`、`pruneOlderThan` = `delete where occurred_at < cutoff`。read 系は持たない（read は provider に閉じる, arch[S-001]）。
- `D1UsageMetricsProvider`: `collectLlmCallsHourly()`（`collectUploadsHourly` と同型・24 本 0 埋め・try/catch null degrade、`llm_call_log` を `substr(occurred_at, 1, 13)` で UTC hour bucket 化）と scalar `llmCallsToday`（`COUNT(*) WHERE occurred_at >= (now-24h の ISO8601 文字列)`、try/catch）を追加。`occurred_at` を ISO8601 text に統一したため `collectUploadsHourly` と同一の bucket 化ロジックを流用できる。両 read は provider 内で直接 drizzle クエリを書く（recorder ポートを経由しない）。
- provider 名の引き回し（P-002 / ADR-006）: `buildLlmProvider`（request）が `{ provider, providerName }` を返すよう変更し、`createRequestContainer` が `llmProviderName` を container に載せる。`resolveConsumerLlmConfig`（consumer）の解決結果由来の provider 名も同経路で container（および `runPipeline` 引数）に届ける。env 値そのままではなく**実際に構築された provider の名前**を真実源とする。
- DI: `D1LlmCallLogRecorder` を RequestContainer（preview の write）と WorkerContainer（ingestion の write + pruner）の両方に載せる（`D1ActivityLogRepository` の前例どおり、`ConsumerContainer` は RequestContainer を spread 継承）。`D1UsageMetricsProvider`（read）は RequestContainer のみ（既存どおり）。`UnitOfWorkContext` には足さない（preview は UoW 外で書く）。container に `llmProviderName`（解決済み provider 名）も載せる。

### UI / プレゼンテーション
- `app/components/admin/Dashboard/index.tsx`:
  - 「直近 24 時間」セクションを 1 カラム固定から、アップロード + LLM の 2 カラム（`md:grid-cols-2` 等、#595 で外したモック構成へ復帰）に戻す。LLM カードは `metrics.llmCallsHourly` を sparkline で描画、`null` 時は『取得失敗』、0 件は平坦線。
  - `UploadsSparkline` の `aria-label` は現状ハードコード（index.tsx L80「アップロード数の直近 24 時間の推移」）。**`aria-label` を prop 化して汎用 `Sparkline` にし、LLM 系列でも再利用する**（arch[S-005]）。LLM カードは aria-label「LLM 呼び出し数の直近 24 時間の推移」を渡す。アップロードカードは既存文言を prop で渡す（描画は不変）。
  - scalar「LLM 呼び出し (24h)」カードは `metrics.llmCallsToday` をそのまま表示（既存ロジックは `null` → 『取得失敗』のままで、実数が入れば実数表示になる。**scalar カード自体は変更不要** — プランどおり、データ源新設で値が `null` から実数に変わるだけ, arch[S-005]）。
  - #595 で書いた「LLM 系列はデータ源が無く非描画」コメントを撤去。

## 実装ステップ

依存方向の順（内側 → 外側）に並べる。

### 1. application 層 LLM call-log ポート/型を新設
- **対象ファイル:** `app/core/application/llmCallLog/ports.ts`, `app/core/application/llmCallLog/types.ts`（新規）
- **変更内容:** `LlmCallLogRecorder` ポートは **write / prune のみ**（`recordCall(entry)` / `pruneOlderThan(cutoff)`）。read 系は持たない（read は `D1UsageMetricsProvider` に閉じる, arch[S-001]）。`LlmCallLogEntry` 型（`id` / `ownerId` / `provider` / `occurredAt`、**`eventId` は持たない**, ADR-008）、`LLM_CALL_LOG_RETENTION_HOURS = 48` 定数（表示窓 24h < 保持窓 48h, AC-6）。`provider` は `LLMProvider` VO 型を再利用。
- **理由:** 記録の抽象を内側で定義（ADR-002）。read/write 責務分離（arch[S-001]）。

### 2. D1 スキーマ + migration を追加
- **対象ファイル:** `app/core/adapters/d1/schema.ts`, `app/core/adapters/d1/migrations/0020_llm_call_log.sql`（新規）
- **変更内容:** `llm_call_log` テーブル定義: `id` PK / `owner_id` / `provider` / **`occurred_at` text（ISO8601 UTC, P-004 / ADR-007）** / `created_at` ts_ms、index `idx_llm_call_log_occurred_at`。**`event_id` unique 制約は設けない（ADR-008）** — 同期 best-effort 記録で冪等キー不要。`uploadsHourly` と同じ `substr(occurred_at,1,13)` bucket を再利用するため `occurred_at` は ISO8601 text。
- **理由:** 永続記録源の実体（AC-1）。bucket 流用と冪等不要の確定（P-004 / arch[S-002]）。

### 3. D1LlmCallLogRecorder アダプタを実装
- **対象ファイル:** `app/core/adapters/d1/repositories/llmCallLogRecorder.ts`（新規）
- **変更内容:** `recordCall` = 単純 `insert`（unique 制約・onConflict なし, ADR-008）、`pruneOlderThan` = `delete where occurred_at < cutoff`。read 系は実装しない（read は provider, arch[S-001]）。
- **理由:** ポート実装（AC-1, AC-6）。

### 4. usageMetricsProvider ポート/Null 実装に LLM 系列フィールドを追加
- **対象ファイル:** `app/core/application/ports/usageMetricsProvider.ts`
- **変更内容:** `UsageMetricsSnapshot` に `llmCallsHourly: ReadonlyArray<UsageMetricsHourlyPoint> | null` 追加、JSDoc 更新、`NullUsageMetricsProvider` に `llmCallsHourly: null`。
- **理由:** 時系列供給契約の拡張（AC-2）。

### 5. D1UsageMetricsProvider に LLM 系列 + scalar を実装
- **対象ファイル:** `app/core/adapters/d1/repositories/usageMetricsProvider.ts`
- **変更内容:** `collectLlmCallsHourly()`（`collectUploadsHourly` と同型・24 本 0 埋め・try/catch null degrade、`substr(occurred_at,1,13)` で UTC hour bucket 化、ISO8601 text なので `collectUploadsHourly` のロジックを流用）、scalar `llmCallsToday` 算出（`COUNT(*) WHERE occurred_at >= (now-24h の ISO8601)`、try/catch）。read は provider 内で直接 drizzle クエリ（recorder ポート非経由, arch[S-001]）。`collect()` で両者を返す。他 scalar は `null` 固定維持（AC-7）。クラス JSDoc を「LLM 系列なし」から更新。
- **理由:** AC-2, AC-3, AC-7。

### 6. previewPrompt に best-effort 記録を追加
- **対象ファイル:** `app/core/application/ingestion/previewPrompt.ts`
- **変更内容:** 各 LLM 呼び出し成功直後（`return` 前）に `container.llmCallLogRecorder.recordCall({ id: container.idGenerator.next(), ownerId, provider: container.llmProviderName, occurredAt: container.clock.now() })` を try/catch（失敗は `logger.warn`）。`metadata`（`suggestMetadata` 1 回）/ `structure`（`structureToHtml` 1 回）両分岐をカバー（各分岐 1 行）。Stub は catch で `llm_preview_unavailable` 化され成功路に到達しないため自然に記録されない（=Stub 記録なし, AC-1 但し書き）。
- **理由:** AC-1, AC-5（request 路の記録）。

### 7. runIngestionJob に best-effort 記録を追加
- **対象ファイル:** `app/core/application/ingestion/runIngestionJob.ts`（`runPipeline` + 呼び出し元）
- **変更内容:** `runPipeline` は `PipelineDeps` のみ受け取る free function で `container` / `clock` / recorder / provider 名を持たない（P-001）。`PipelineDeps` に `recorder: LlmCallLogRecorder` / `clock: Clock` / `providerName: string` を追加し、呼び出し元 `runIngestionJob`（L124 の `runPipeline(...)`）から `container.llmCallLogRecorder` / `container.clock` / `container.llmProviderName` を渡す。各 `deps.llm.structureToHtml`（L346, structure 系のみ）/ `deps.llm.suggestMetadata`（L370, 共通パス）の**成功直後（await が解決し throw を抜けた後）**に `deps.recorder.recordCall({ id, ownerId: deps.ownerId, provider: deps.providerName, occurredAt: deps.clock.now() })` を try/catch best-effort で呼ぶ。html/markdown 分岐は `structureToHtml` を呼ばず記録しない、空 audio 早期 return も記録しない（call 回数と 1:1, AC-1）。**Stub 非記録は明示的な Stub 判定を入れず構造的に保証する**: `StubLLMProvider` は両メソッドが必ず throw するため、記録を呼び出し成功直後に置けば Stub では到達しない＝自然に非記録になる（arch[S-001]）。Stub 判定フラグを `PipelineDeps` に持ち回さない。
- **理由:** AC-1, AC-5（consumer 路の記録）。`runPipeline` の現実の関数構造に合わせた記録フック（P-001）。記録地点の配置だけで Stub 非記録を保証（arch[S-001]）。

### 8. Dashboard に LLM 系列カードを追加・scalar 表示を有効化
- **対象ファイル:** `app/components/admin/Dashboard/index.tsx`, 必要なら `app/components/admin/Dashboard/chart.ts`
- **変更内容:** 「直近 24 時間」を 2 カラムへ戻し LLM カード追加（`metrics.llmCallsHourly`、`null`→『取得失敗』、0→平坦線）。`UploadsSparkline` の `aria-label` を prop 化して汎用 `Sparkline` にし（arch[S-005]）、アップロード／LLM の両カードで再利用（LLM は「LLM 呼び出し数の直近 24 時間の推移」を渡す）。#595 の非描画コメント撤去。scalar カードは変更不要（既存ロジックのまま実数が反映される, arch[S-005]）。
- **理由:** AC-4。

### 9. getUsageMetrics DTO に LLM 系列を追加
- **対象ファイル:** `app/core/application/adminSettings/getUsageMetrics.ts`
- **変更内容:** 出力に `llmCallsHourly` 追加、snapshot を ISO8601 へ map（`uploadsHourly` と同じ）。
- **理由:** AC-2, AC-4（UI への受け渡し）。

### 10. pruner に llm_call_log の刈り込みを追加
- **対象ファイル:** 新規 `app/core/application/workers/pruneLlmCallLog.ts`, `app/worker/cloudflare/handlers.ts`（`runPruneTick`）
- **変更内容:** `pruneActivityLog` への相乗りは**せず**、`pruneLlmCallLog(container)` を新設（`LLM_CALL_LOG_RETENTION_HOURS = 48` で cutoff 計算 → `container.llmCallLogRecorder.pruneOlderThan(cutoff)`）。`runPruneTick` 内に **`pruneActivityLog` とは独立した try/catch ブロック**で `pruneLlmCallLog` を呼ぶ（arch[S-003]）。理由: 現状 `runPruneTick` は `pruneActivityLog` を 1 つの try/catch で包んでおり（handlers.ts L104-110）、`pruneActivityLog` 内で逐次 await するため、相乗りすると activity prune の失敗が LLM prune をスキップさせ得る。独立ブロックで failure isolation を確保する。retention 定数は `llmCallLog/types.ts` に置く。
- **理由:** AC-6（failure isolation, arch[S-003]）。

### 11. DI 配線
- **対象ファイル:** `app/core/application/di/types.ts`, `app/core/application/di/serverCloudflare.ts`（および他 DI 入口があれば）
- **変更内容:** `D1LlmCallLogRecorder` を RequestContainer（preview write）/ WorkerContainer（ingestion write + pruner）に載せる（`ConsumerContainer` は RequestContainer を spread 継承するので consumer 路の write も賄える）。**`buildLlmProvider` を `{ provider, providerName }` を返す形に変更し、`createRequestContainer` が `llmProviderName`（解決済み provider 名）を container に載せる**（P-002 / ADR-006）。consumer 路は `resolveConsumerLlmConfig` 解決結果由来の provider 名を container（および `runPipeline` 引数）に届ける。env 値そのままでなく実際に構築された provider 名を真実源とする。`UnitOfWorkContext` には足さない。`D1UsageMetricsProvider`（read）は RequestContainer のみ（既存どおり）。
- **理由:** AC-1（provider 真実源, P-002）, AC-5, AC-6 を成立させる配線。

### 12. テスト
- **対象ファイル:** provider / recorder / pruner / usecase の各テスト。
- **変更内容:** 下記「テスト方針」参照。

## 設計判断

詳細は `.issue/748/adr.md`。要約:
- **ADR-001**: 記録源は専用カウンタ集計でなく「呼び出しイベントログ read-model（`llm_call_log`, 1 LLM API 呼び出し 1 行・append insert）」。#595 の件数加算廃止判断と整合。
- **ADR-002**: 記録タイミングはドメインイベント経由でなく「呼び出し直後の直接ポート記録（best-effort）」。preview が UoW/outbox を持たないため。Stub（LLM 未設定）は実呼び出しでないため記録しないが、これは明示的 Stub 判定でなく「記録を呼び出し成功直後に置く＝Stub は throw して到達しない」配置で構造的に保証する（arch[S-001]）。
- **ADR-003**: 時系列供給は `usageMetricsProvider` を拡張（#595 と同じ）。read は provider に閉じ recorder は write/prune に絞る（arch[S-001]）。
- **ADR-004**: scalar `llmCallsToday` を `llm_call_log` から実装（null 固定解除。データ源新設に伴う正しい変化）。
- **ADR-005**: `llm_call_log` の刈り込みを既存 pruner daily tick に追加（`runPruneTick` 内の独立 try/catch, 保持窓 48h）。
- **ADR-006**: 記録する provider 名の真実源は env 値でなく `buildLlmProvider` が実際に構築した provider の解決済み名。`buildLlmProvider` を名前付きで返す形に変更。
- **ADR-007**: `llm_call_log.occurred_at` は ISO8601 text にし、`uploadsHourly` と同じ `substr(...,1,13)` bucket を流用する（ts_ms + 別 hour_bucket は採らない）。
- **ADR-008**: `event_id` unique 制約を撤廃（同期 best-effort 記録で冪等キー不要）。`recordCall` は単純 insert。

## リスクと注意点

- **occurred_at の型 / bucket 化（確定済 P-004 / ADR-007）**: `llm_call_log.occurred_at` は ISO8601 text に確定。アップロード系列（`ingestion_jobs.created_at` ISO8601 text）と同じ `substr(...,1,13)` bucket を流用する。`ingestion_burst_log`（ts_ms + 別 hour_bucket）の方式は採らない。「ingestion_burst_log が UTC substr bucket」という旧調査記述は誤りであり訂正済み（実体は ts_ms + 別 hour_bucket text）。アップロード系列と「同じ UTC hourly bucket・24 本 0 埋め」結果が一致することをテストで保証する。
- **provider 名の真実源（確定済 P-002 / ADR-006）**: env 値そのままでなく `buildLlmProvider` が実際に構築した provider 名を真実源とし、`buildLlmProvider` を名前付き返却に変更して container（`llmProviderName`）へ載せる。consumer 路は `resolveConsumerLlmConfig` 解決結果由来の名前を `runPipeline` 引数へ届ける。**Stub（LLM 未設定）の呼び出しは記録しない**（実 LLM 呼び出しでないため。虚偽表示禁止整合, AC-1 但し書き）。**Stub 非記録は明示的な Stub 判定では実現しない**: `StubLLMProvider` は両メソッドが必ず throw するため、記録を LLM 呼び出し成功直後（throw を抜けた後）に置けば、request 路（catch で `llm_preview_unavailable` 化）・consumer 路（throw でジョブ失敗）のいずれも Stub は記録地点に到達せず構造的に非記録になる（arch[S-001]）。Stub 判定フラグを引き回す実装は入れない。
- **best-effort 記録の取りこぼし**: 記録失敗を握り潰すため、表示は厳密カウントでなく「概算」。課金カウントとして使わない旨を JSDoc に明記。虚偽表示禁止に対しては「概算である」ことを欺かない（カードラベルは現状「回 / 24h」のまま実態に整合）。
- **既存 scalar 挙動不変原則との関係**: scalar を 1 つだけ実装する（ADR-004）。他 scalar は不変（AC-7）。レビューで #545 / #595 ADR-002 との整合を確認。
- **migration 番号衝突**: 最新は `0019`。`0020` を採番（並行 PR があれば再採番）。
- **Dashboard レイアウト回帰**: #595 で 1 カラム全幅にした「直近 24 時間」を 2 カラムへ戻すため、モバイル（max-sm）表示の回帰確認が要る（#749 のモバイル整合と干渉しないこと）。

## テスト方針

- **D1LlmCallLogRecorder（real-DB integration）**: `recordCall` が 1 行 insert する（unique 制約なし, ADR-008）。`pruneOlderThan` の境界（cutoff 前後、保持窓 48h 前提）。
- **D1UsageMetricsProvider（real-DB integration）**: LLM 系列が 24 本・UTC hour bucket（`substr(occurred_at,1,13)`）・0 埋め・partial-failure 時 `null`（クエリ失敗を注入）。`llmCallsToday` の 24h 窓集計（窓内/外の境界）。アップロード系列と LLM 系列で bucket 境界が一致すること（ISO8601 text 同型）。他 scalar が `null` 固定であること（AC-7）。
- **previewPrompt（unit, fake recorder）**: `metadata` / `structure` 各分岐の LLM 成功時に `recordCall` が **1 回**、正しい owner/provider（解決済み名）/occurredAt で呼ばれる。`recordCall` が throw しても本処理の戻り値が変わらない（記録の局所 try/catch が本処理 throw 経路と混同されないこと, best-effort, AC-5 / arch[S-003]）。Stub provider 時は catch で `llm_preview_unavailable` 化され成功路（記録地点）に到達しないため記録されない（明示的 Stub 判定に依存しない, AC-1 但し書き / arch[S-001]）。
- **runIngestionJob / runPipeline（unit, fake recorder）**: structure 系で `recordCall` が **2 回**（`structureToHtml` + `suggestMetadata`）、html/markdown 分岐で **1 回**（`suggestMetadata` のみ）、空 audio 早期 return で **0 回**呼ばれる（記録粒度 = LLM API 呼び出し回数, AC-1）。`recordCall` throw でもジョブ実行が壊れない（AC-5）。Stub provider 時は記録されない（`StubLLMProvider` が throw して記録地点に到達しないことを fake で確認 — 明示的 Stub 判定に依存しない, AC-1 但し書き / arch[S-001]）。**記録の best-effort try/catch は `runPipeline` 内の各 LLM 呼び出し直後に局所配置されており、`runPipeline` の throw 経路（本処理失敗 → 呼び出し元 `runIngestionJob` の catch でジョブ失敗）と混同しないこと**: 記録失敗が `runPipeline` の戻り値・ジョブ遷移に波及せず、本処理 throw は従来どおりジョブを失敗させることを別々に検証する（arch[S-003], AC-5 のリグレッション防止）。
- **pruneLlmCallLog / runPruneTick（integration）**: `llm_call_log` の刈り込みが daily tick で実行される。`runPruneTick` 内で **独立 try/catch** のため、activity-log prune の失敗が LLM prune をブロックしない／その逆もブロックしないこと（failure isolation, arch[S-003]）。outbox prune もブロックしない。
- **Sparkline（unit / 描画）**: `aria-label` prop が反映され、アップロード／LLM の両カードで正しい文言が出る（arch[S-005]）。
- **getUsageMetrics（unit）**: `llmCallsHourly` の DTO map（Date → ISO8601）。
- **手動/ブラウザ（docs/test.md）**: P40 Dashboard で LLM カードが描画され（系列 + scalar）、データ無し時は『取得失敗』/0 件平坦線、データ投入後に実数が一致すること。モバイル表示の回帰確認。

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点 / アーキテクチャ・リスク視点の指摘を反映）**:
- **[P-001]** consumer 路の記録フック地点を実コードに合わせて確定。`runPipeline` は `PipelineDeps` のみ受け取る free function（`container`/`clock`/recorder/provider 名を持たない）なので、`PipelineDeps` に `recorder` / `clock` / `providerName` を追加し、呼び出し元 `runIngestionJob`（L124）が `container` から渡す方式に確定。各 `deps.llm.*` 成功直後に記録（structure 2 回 / html・markdown 1 回 / 空 audio 0 回）。preview 路は `container` を直接使い各分岐で 1 行記録。設計セクション・調査結果・ステップ 7 を具体化。
- **[P-002]** provider 名の真実源を確定。`buildLlmProvider` は名前を返さないため、`{ provider, providerName }` を返す形に変更し `llmProviderName`（実構築 provider の解決済み名）を container に載せる方式を plan / ADR-006 に明記。env 値は真実源としない。
- **[P-003 / S-002]** Stub 時の記録方針を「記録しない（実 LLM 呼び出しのみ記録）」に確定（虚偽表示禁止）。AC-1 但し書きに明文化。request 路は catch 変換で自然に非記録、consumer 路は Stub 判定で recorder スキップ。
- **[P-004]** bucket 化方式の内部矛盾を解消。「ingestion_burst_log が UTC substr bucket」という誤った調査記述を訂正（実体は ts_ms + 別 hour_bucket text）。`llm_call_log.occurred_at` を ISO8601 text に確定し `uploadsHourly` と同じ `substr(...,1,13)` を流用（ADR-007）。
- **[S-001（coverage）]** 記録粒度を「1 LLM API 呼び出し = 1 行」と明文化。structure プレビューは 2 行など複数行記録される旨と scalar「回/24h」= API 呼び出し回数を AC-1 / AC-3 に定義。
- **[S-003（coverage）]** 保持期間を 48h に確定（表示窓 24h < 保持窓 48h）。AC-6 と境界テストの期待値を確定。
- **[arch S-001]** read 系を `usageMetricsProvider` の read に閉じ、`LlmCallLogRecorder` ポートを write/prune に絞る責務分離を plan に明記。
- **[arch S-002]** `event_id` unique 制約を撤廃（同期 best-effort で冪等不要）。`recordCall` は単純 insert、`LlmCallLogEntry` から `eventId` を除去（ADR-008）。
- **[arch S-003]** pruner を `pruneActivityLog` 相乗りでなく新規 `pruneLlmCallLog` とし、`runPruneTick` 内の独立 try/catch で呼ぶ方式に確定（failure isolation）。
- **[arch S-005]** `UploadsSparkline` の `aria-label` を prop 化して汎用 `Sparkline` にし LLM 系列で再利用。scalar カードは変更不要を明記。

**ADR への追記**:
- ADR-006（provider 名真実源）、ADR-007（occurred_at ISO8601 text + substr bucket）、ADR-008（event_id unique 撤廃）を追加。既存 ADR-002/003/005 の文言も Stub 非記録・read/write 分離・独立 try/catch・保持窓 48h に合わせて精緻化。

**見送った提案とその理由**:
- **[arch S-004]** DI container 配置の詳細は既に plan の DI セクション（ステップ 11）で `D1ActivityLogRepository` 前例どおりに具体化済みのため、追加の独立対応は不要（指摘内容は反映済み）。

### 2周目

**2周目: 両視点とも問題点ゼロで終了。** 要件カバレッジ視点は問題点ゼロ・改善提案ゼロ（Round 1 の3提案が AC/ADR/テスト方針へ実質反映され、スコープ膨張も無いことを実コードで再確認）。アーキテクチャ・リスク視点は問題点ゼロ・改善提案 3 件（S-001〜S-003、いずれも実装をシンプル・一意にするための任意の磨き込みで承認を妨げない）。改善提案 3 件はすべて取り込んだ。

**取り込んだ改善提案**:
- **[arch S-001]** consumer 路の「Stub 判定で recorder をスキップ」を削除。`StubLLMProvider` は両メソッドが必ず throw するため、記録を LLM 呼び出し成功直後（throw を抜けた後）に置けば Stub 非記録は構造的に保証される。明示的な Stub 判定フラグの引き回しを設計・実装ステップ・リスク欄・テスト方針・ADR-002 から削り、「記録は LLM 呼び出し成功直後に置く（失敗時は throw されるため到達せず＝Stub・エラーは自然に非記録）」に簡潔化（設計セクション・ステップ 7・リスク欄・テスト方針・ADR-002）。
- **[arch S-002]** `resolveConsumerLlmConfig` が `null` を返す場合の `providerName` の出所を ADR-006 に 1 行補足。この経路では resolved config 由来の名前が存在せず、`ConsumerContainer` が RequestContainer を spread 継承するため request 側で解決済みの `llmProviderName` を継承する（出所 = request 側継承）ことを明記。
- **[arch S-003]** 記録の best-effort try/catch は `runPipeline` 内の各 LLM 呼び出し直後に局所配置し、`runPipeline` の throw 経路（本処理失敗 → 呼び出し元のジョブ失敗）と混同しないことをテスト方針に明記（記録失敗が戻り値・ジョブ遷移に波及しないこと／本処理 throw は従来どおりジョブを失敗させることを別々に検証, AC-5 リグレッション防止）。

**見送った提案とその理由**:
- なし（改善提案 3 件はすべて取り込み）。
