# 実装計画 — Issue #783: prune terminal-state job rows (export_jobs / tag_merge_jobs) on a retention window

**Issue:** #783
**作成日:** 2026-06-27
**複雑度:** 中〜大規模

---

## 目的

終端状態の job-state 行（`export_jobs` / `tag_merge_jobs`）が無限に蓄積する運用上のギャップを塞ぐ。日次 pruner の sweep に「保持期間を過ぎた終端状態行の削除」を追加し、既存の outbox / processed-events / activity-log / llm-call-log prune と同一パターンで配線する。

あわせて、レビュー Round 1（coverage [P-001]）で判明した重大ギャップ — `purgeExpiredExports` が定義のみでどの cron/worker/route からも一度も呼ばれておらず、`completed → (purge) → expired` 遷移が運用上一度も走らない — を解消するため、`purgeExpiredExports` を日次 pruner tick に配線する。これにより export の `completed`（健全運用下では終端 export 行の大半）→ `expired` → prune の連鎖が実際に閉じ、export の全終端行が確実に bound される。配線しない限り、completed を prune 対象から除外する本計画は「stop growing without bound」を export の最大ボリューム部分について満たせない。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `tag_merge_jobs` の `completed`/`failed` 行で `updated_at < cutoff` のものが prune される | Issue Tasks | 1,3,4,10 |
| AC-2 | `export_jobs` の終端行で `updated_at < cutoff` のものが prune される。ただしライブ artifact を持つ行を orphan 化しない（`completed` は除外、`failed`/`cancelled`/`expired` のみ対象） | Issue AC「artifact を orphan 化しない」/ ADR-003 | 1,3,4,10 |
| AC-3 | 非終端行（`pending`/`processing`）は年齢に関わらず決して prune されない | Issue AC | 1,4,10 |
| AC-4 | 最近の終端行（`updated_at >= cutoff`）は保持される | Issue Tasks | 1,4,10 |
| AC-5 | 保持期間ウィンドウのデフォルトは日単位で、現実的なポーリング完了窓（数秒間隔）より十分長い | Issue AC | 3,5 |
| AC-6 | 保持期間は env var から読まれ、ハードコードされない（`DEFAULT_*_RETENTION_MS` フォールバック付き） | Issue Proposal | 3,5,8 |
| AC-7 | 各 prune／purge は `runPruneTick` 内で独自の best-effort `try/catch` で実行され、失敗が他の prune や tick 全体を巻き戻さない | Issue Proposal / CLAUDE.md「worker → root」 | 6,10 |
| AC-8 | `export_jobs` の artifact 削除は依然 `purgeExpiredExports` の責務であり、本 prune は artifact ライフサイクルに干渉しない（completed を構造的に除外） | Issue AC | 1,3,4（ADR-003） |
| AC-9 | `purgeExpiredExports` が日次 pruner tick に配線され、`completed → expired → prune` の連鎖が実際に閉じる（completed export 行が無限蓄積しない） | レビュー coverage [P-001] / Issue ゴール「stop growing without bound」 | 6,7,9,10 |

## スコープ

### 含まれるもの
- 終端 job 行 prune（`export_jobs` の `failed`/`cancelled`/`expired`、`tag_merge_jobs` の `completed`/`failed`）の専用ポート・usecase・D1 アダプタ・DI・tuning・配線。
- `purgeExpiredExports` を日次 pruner tick（`runPruneTick`）に best-effort 配線する（ユーザー決定 / coverage [P-001]）。purge の**ロジック自体は無変更**で、未配線だった呼び出し経路のみを追加する。これにより completed→expired→prune の連鎖が閉じる（AC-9）。
- pruner の wrangler env に、purge が R2 アーティファクトを実削除するための binding（`OBJECT_STORAGE` バケット + `R2_OBJECT_BUCKET_NAME` + presign 系 secret）を追加。

### 含まれないもの
- `purgeExpiredExports` の**挙動／ロジック変更**（R2 削除順序・再試行・`findExpired` 述語などはそのまま。本変更は呼び出し経路の追加に限る）。artifact ライフサイクルの責務は引き続き purge にあり、本 prune は `expired`/`failed`/`cancelled` 行の GC のみ。
- `export_jobs` の `completed` 行の即時 prune（ADR-003 によりライブ artifact orphan 回避のため除外。purge による expired 化を経て prune される）。
- スキーマ／マイグレーション変更（`idx_export_jobs_updated_at` / `idx_tag_merge_jobs_updated_at` は既存。新規列・索引は不要）。
- 集約リポジトリ（`ExportJobRepository` / `TagMergeJobRepository`）への prune メソッド追加（ADR-001 により専用 worker ポートを新設）。
- `WorkerContainer` 型を `unitOfWorkProvider` / `objectStorage` で太らせること（ADR-005 案Y を採用し purge は別途 `RequestContainer` を構築するため不要。relay/dlq/indexer への波及も回避）。
- pruner の trigger / cron 設定変更（既存の日次 tick に相乗り）。

## 調査結果

- 関連ファイル:
  - prune usecase 群（確立パターン）: `app/core/application/workers/{outboxPrune,pruneProcessedEvents,pruneActivityLog,pruneLlmCallLog}.ts`。いずれも `cutoff = clock.now() - retentionMs` を計算 → `WorkerContainer` 上の専用ポートの `pruneXxx(cutoff)` を呼ぶ → `{ deleted }` を返し1行ログ。
  - prune ポート前例: `app/core/application/ports/outboxRepository.ts`（`pruneProcessed`）、`app/core/application/activityLog/ports.ts`（`pruneOlderThan` + `pruneBurstOlderThan`、1ポート2テーブル）、`app/core/application/llmCallLog/ports.ts`（`pruneOlderThan`）。
  - D1 prune アダプタ前例: `D1LlmCallLogRecorder`（`constructor(db)`、`db.delete(...).where(lt(...)).returning({id})` で件数）、`D1ActivityLogRepository`（`constructor(db)`）。
  - `WorkerContainer` 定義: `app/core/application/di/types.ts`（`outboxRepository` / `idempotencyStore` / `searchIndex` / `indexJobRepository` / `activityLogRepository` / `llmCallLogRecorder` を保持。UoW・`PendingBatch` は持たない）。
  - DI 構築: `createWorkerContainer`（`app/core/application/di/serverCloudflare.ts:1224`）。各 prune アダプタを `(db)` 等で生成。
  - tuning: `app/core/application/di/env.ts`（`pruneTuningSchema` / `readPruneTuning` / `TuningEnv`、env var 文字列を coerce、`DEFAULT_*_RETENTION_MS` を default に）。
  - 配線: `runPruneTick`（`app/worker/cloudflare/handlers.ts:107`）。outbox を先頭で実行（throw 可）、以降の processed-events / activity / llm を各々 try/catch で best-effort。
  - スキーマ: `app/core/adapters/d1/schema.ts`（`exportJobs` 595-650 / `tagMergeJobs` 656-690）。status enum・`idx_*_updated_at` 既存。
  - 集約: `export/entity.ts`（status 別 artifactKey/expiresAt 不変条件）、`tag/mergeJob/entity.ts`（terminal=completed|failed、両者 `completedAt` を持つ）。
  - artifact ライフサイクル: `app/core/application/export/purgeExpiredExports.ts`（`completed AND expiresAt<now` を expire し R2 削除。行は残す）。
  - purge の配線状況（レビュー coverage [P-001] の実コード確認結果）: `purgeExpiredExports` への参照は**定義箇所と `.issue/3/adr.md` のみ**で、`app/worker/cloudflare/{pruner,handlers}.ts`・`server.cloudflare.ts`・DI・`wrangler.toml` のいずれにも呼び出しが存在しない。すなわち `completed→expired` 遷移は運用上一度も走らず、completed を prune 対象から除外すると completed export 行が無限蓄積する（本計画で配線して解消）。
  - purge が要求するコンテナ型（実コード確認）: `purgeExpiredExports({ container, input }: ServiceArgs<...>)` の `ServiceArgs.container` は `app/core/application/types.ts` で **`RequestContainer`**（`unitOfWorkProvider` / `objectStorage` / `clock` / `logger` を含む完全な request 面）と型付けされる。purge 本体が実際に使うのは UoW・objectStorage・clock・logger の4つだが、型は `RequestContainer` 全体。→ `WorkerContainer` に2フィールド足すだけでは `RequestContainer` に代入不可で型エラーになるため、purge には `RequestContainer` を別途構築して渡す必要がある（ADR-005 案Y）。
  - コンテナ・ビルダー（実コード確認）:
    - `createWorkerContainer(env)`（`serverCloudflare.ts:1224`）= `WorkerContainer`。UoW・objectStorage を持たない。`runPruneTick`/`runRelayTick`/`runIndexJobTick`/`handleDlq` が使用。
    - `createRequestContainer(readRequestServerConfig(env))`（`serverCloudflare.ts:655` / `353`）= `RequestContainer`。`unitOfWorkProvider`（`D1UnitOfWorkProvider`）+ `objectStorage` を構築。`objectStorage` は `OBJECT_STORAGE` バインディング **かつ** SigV4 presign 4点（`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_OBJECT_BUCKET_NAME`）が**全て揃ったときのみ** `R2ObjectStorage`、欠落時は `createUnavailableObjectStorage()`（全メソッドが `StorageUnavailableError` を throw）にフォールバック（`serverCloudflare.ts:363-368, 698-701`）。LLM 等の adapter 構築は文字列を stash するだけで安価（コメント `:878-886`）。
    - `createConsumerContainer`（`:888`）は `createRequestContainer` + `createWorkerContainer` を内部で両方構築する前例。purge 配線の参考になるが、pruner は purge に request 面だけ要るので consumer を流用せず `createRequestContainer` を直接再利用する。
  - pruner entry: `app/worker/cloudflare/pruner.ts`（`scheduled` で `runPruneTick(env)` を `ctx.waitUntil`）。`PrunerEnv = ServerEnv`。
  - pruner の wrangler env: `wrangler.toml [env.pruner]`（`:243`）は現状 D1 バインディングと retention vars のみ。`OBJECT_STORAGE` r2_bucket・`R2_OBJECT_BUCKET_NAME` var・presign secret を**持たない**ため、現状のまま purge を配線すると objectStorage が unavailable フォールバックになり、R2 削除が throw（per-row catch で握りつぶされ tick は継続するが、prod では artifact が削除されない）。consumer env（`:178-184`）が `OBJECT_STORAGE` バインディング + `R2_OBJECT_BUCKET_NAME` var を持つのが配線の手本（presign 3 secret は SOPS で deploy 時注入）。
  - env doc: `wrangler.toml [env.pruner.vars]`（`OUTBOX_RETENTION_MS` / `PROCESSED_EVENTS_RETENTION_MS` をコメント付きで宣言）。
  - 既存テスト: `app/core/application/workers/__tests__/pruneProcessedEvents.test.ts`（stub ポート + `makeContainer` で `WorkerContainer` リテラル構築）、`app/worker/cloudflare/__tests__/runPruneTick.test.ts`（prune 関数を mock し best-effort 隔離を検証、`readPruneTuning` も mock `:37-41`）、`handlers.integration.test.ts`（実 D1 happy path）、`app/core/adapters/d1/__tests__/{llmCallLogRecorder,activityLogRepository,tagMergeJobRepository}.integration.test.ts`（実 D1 prune 前例）。
  - `WorkerContainer` リテラルを構築する共有 integration ヘルパー（arch [S-001]、実在確認済み）: `app/core/application/__tests__/helpers.ts:169` と `app/core/adapters/d1/__tests__/helpers.ts:154` がいずれも `new D1LlmCallLogRecorder(db)` 等で実コンテナを組み立てており、`jobStatePruner` フィールド追加時はここに stub/実装を足さないと多数の integration テストがコンパイルエラーになる（型付きなので `pnpm typecheck` で検出）。`pruneLlmCallLog.test.ts:39` は `as unknown as WorkerContainer` キャストのため追加不要。

- あるべきアーキテクチャ:
  - Hexagonal + DDD。依存は内向き。worker メンテナンス sweep はアプリケーション層 usecase + アプリケーション層ポート + アダプタ実装で構成し、ドメイン集約リポジトリ（UoW/OCC）とは分離する。
  - cross-cutting（clock/logger）はポート経由。prune cutoff は `container.clock.now()` から決定的に算出。
  - worker のパーシャル失敗耐性は明示的境界の `try/catch` のみ（CLAUDE.md「worker → root」）。
  - 保持期間等のチューニングは transport 境界（worker entry）で env を validate（`readPruneTuning`）。ハードコード禁止、`DEFAULT_*` フォールバック。

- 既存実装の状態: 既存 prune 群は「あるべき姿」と完全一致。本 Issue はその確立パターンへ2テーブル分を**追加**するのみで、乖離の是正は不要。唯一の判断点は「集約リポジトリに足すか専用ポートを新設するか」で、UoW/`PendingBatch` を持たない `WorkerContainer` の前提と既存 prune ポート前例から**専用ポート新設**が正（ADR-001）。

- 依存関係:
  - `WorkerContainer` 型に必須フィールド `jobStatePruner` を1つ追加するため、`WorkerContainer` リテラルを構築する全箇所に追加が必要: テストの `pruneProcessedEvents.test.ts` の `makeContainer`、共有ヘルパー `app/core/application/__tests__/helpers.ts:169` / `app/core/adapters/d1/__tests__/helpers.ts:154`（arch [S-001]）、本番 `createWorkerContainer`。型付きなので `pnpm typecheck` で漏れを検出。
  - purge 配線は `WorkerContainer` 型を太らせず、`runPruneTick` 内で `createRequestContainer(readRequestServerConfig(env))` を追加で構築する（ADR-005 案Y）。relay/dlq/indexer の `WorkerContainer` 利用箇所・`ConsumerContainer`（`Pick<WorkerContainer, ...>`、`jobStatePruner` は pick 外なので波及なし）には影響しない。
  - `runPruneTick` の返り値契約は activity/llm/purge と同じく拡張しない（best-effort、ログのみ）。`runPruneTick.test.ts` の mock 一覧に prune 2関数 + `purgeExpiredExports` を追加し、`readPruneTuning` mock に新 retention フィールド2つを追加（arch [S-002]）。

## 設計

### ドメインモデルへの影響
なし。prune は集約をロードせずバージョン照合もしない非トランザクショナルな行 GC であり、ドメイン不変条件・エンティティ・ドメインポートに変更はない。終端状態の定義（export: failed/cancelled/expired を対象、completed 除外 / tag_merge: completed/failed）はアダプタの DELETE 述語にエンコードする。既存のドメイン不変条件（completed の artifactKey/expiresAt 等）を**根拠として参照**するのみ。

### ユースケース / アプリケーションロジック
- 新ポート `JobStatePruner`（`app/core/application/ports/jobStatePruner.ts`）— ADR-001/002。
  - `pruneTerminalExportJobs(cutoff: Date): Promise<{ deleted: number }>`
  - `pruneTerminalTagMergeJobs(cutoff: Date): Promise<{ deleted: number }>`
  - JSDoc に「終端のみ・非終端は不可侵・export は completed 除外（artifact orphan 回避、ADR-003 / Issue AC）」を明記。
- 新 usecase 2本（`app/core/application/workers/`）— `pruneProcessedEvents` を踏襲:
  - `pruneExportJobs.ts`: `DEFAULT_EXPORT_JOBS_RETENTION_MS` 定数 + `pruneExportJobs(container, { retentionMs })`。`cutoff = clock.now() - retentionMs` → `jobStatePruner.pruneTerminalExportJobs(cutoff)` → 1行ログ → `{ deleted }`。
  - `pruneTagMergeJobs.ts`: `DEFAULT_TAG_MERGE_JOBS_RETENTION_MS` 定数 + `pruneTagMergeJobs(container, { retentionMs })`。同型。
- `WorkerContainer`（`di/types.ts`）に `jobStatePruner: JobStatePruner` を追加。JSDoc に「pruner 日次 tick で終端 job 行を sweep。集約リポジトリとは別の worker メンテナンスポート（ADR-001）」を記す。
- purge 配線（ADR-005 案Y）: `purgeExpiredExports` は `ServiceArgs.container: RequestContainer` を要求するため、`runPruneTick` 内で `createRequestContainer(readRequestServerConfig(env))` により purge 専用 `RequestContainer` を1つ構築し、`purgeExpiredExports({ container, input: {} })` を best-effort `try/catch` で呼ぶ。`WorkerContainer` 型は太らせない（既存 prune sweep は従来どおり `createWorkerContainer(env)` の `WorkerContainer` を使う）。purge は export-jobs prune の**前段**で実行する — completed→expired を先に進めるため。ただし同一 tick で新規 expired 化された行は `updated_at = now`（≥ retention cutoff）なので、その tick では prune されず、次回以降の tick で retention 経過後に prune される（即時削除ではない点を明記）。purge の戻り値 `{ expired }` はログのみで `runPruneTick` の返り値契約（`{ outboxDeleted, processedEventsDeleted }`）は不変。

### アダプター / 永続化 / 外部連携
- `D1JobStatePruner`（`app/core/adapters/d1/repositories/jobStatePruner.ts`）— `constructor(private readonly db: Database)`。`mapDbError` でラップ。
  - export: `db.delete(exportJobs).where(and(inArray(exportJobs.status, ['failed','cancelled','expired']), lt(exportJobs.updatedAt, cutoff.toISOString()))).returning({ id })` → 件数。
  - tag_merge: `db.delete(tagMergeJobs).where(and(inArray(tagMergeJobs.status, ['completed','failed']), lt(tagMergeJobs.updatedAt, cutoff.toISOString()))).returning({ id })` → 件数。
  - `updated_at` は ISO8601 UTC text 比較（既存 `findExpired` / llm prune と同じ lexicographic 比較で正しく動作）。`idx_*_updated_at` が述語の sort/scan を支える。
- DI: `createWorkerContainer`（`serverCloudflare.ts`）に `jobStatePruner: new D1JobStatePruner(db)` を追加。
- purge 用 R2 binding: `wrangler.toml [env.pruner]` に `OBJECT_STORAGE` r2_bucket バインディング + `R2_OBJECT_BUCKET_NAME` var を追加（consumer env と同形）。presign 3 secret（`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`）は SOPS で deploy 時注入される運用前提。これらが揃わないと `createRequestContainer` は objectStorage を unavailable フォールバックにし、purge の `objectStorage.delete` が `StorageUnavailableError` を throw → purge の per-row `catch` で warn ログ握りつぶし → tick はクラッシュしないが prod では artifact が削除されず orphan 化する。よって prod では binding 追加が必須。
- スキーマ／マイグレーション変更なし。

### UI / プレゼンテーション
なし。worker 内部のメンテナンス処理であり UI 影響はない。`MergeTagDialog` / `ExportJobDetail` のポーリングは retention 窓（日単位）内で確実に終端状態を読めるため挙動不変（AC-5）。

## 実装ステップ

依存方向の順（内側→外側）。

### 1. prune ポート定義
- **対象ファイル:** `app/core/application/ports/jobStatePruner.ts`（新規）
- **変更内容:** `JobStatePruner` インターフェースを定義（`pruneTerminalExportJobs` / `pruneTerminalTagMergeJobs`、各 `(cutoff: Date) => Promise<{ deleted: number }>`）。JSDoc に終端のみ・非終端不可侵・export completed 除外の根拠（ADR-003 / Issue AC）を記述。
- **理由:** アプリケーション層が依存する prune 抽象。アダプタはこれを実装する（内向き依存）。

### 2. WorkerContainer に port を追加
- **対象ファイル:** `app/core/application/di/types.ts`
- **変更内容:** `WorkerContainer` に `jobStatePruner: JobStatePruner` を追加（import + JSDoc）。
- **理由:** usecase が container 経由でポートへ到達するため。

### 3. prune usecase 2本
- **対象ファイル:** `app/core/application/workers/pruneExportJobs.ts` / `pruneTagMergeJobs.ts`（新規）
- **変更内容:** `DEFAULT_*_RETENTION_MS`（各7日, ADR-004）+ `{ retentionMs }` オプション型 + usecase 関数。`pruneProcessedEvents` と同型（cutoff 算出 → ポート呼び出し → 構造化 info ログ `[export-jobs]` / `[tag-merge-jobs]` → `{ deleted }`）。
- **理由:** 確立された prune usecase パターンの踏襲（AC-1/2/6）。

### 4. D1 アダプタ実装
- **対象ファイル:** `app/core/adapters/d1/repositories/jobStatePruner.ts`（新規）
- **変更内容:** `D1JobStatePruner implements JobStatePruner`。`constructor(db)`。`inArray(status, terminalSet)` + `lt(updatedAt, cutoff.toISOString())` の DELETE を `returning({ id })` で件数化、`mapDbError` でラップ。終端集合は export=`['failed','cancelled','expired']`（completed 除外）、tag_merge=`['completed','failed']`。
- **理由:** ポートの D1 実装（AC-1/2/3/4/8）。`completed` 除外で artifact orphan を構造的に防止（ADR-003）。

### 5. tuning 拡張
- **対象ファイル:** `app/core/application/di/env.ts`
- **変更内容:** `TuningEnv` に `EXPORT_JOBS_RETENTION_MS?` / `TAG_MERGE_JOBS_RETENTION_MS?` を追加。`pruneTuningSchema` に `exportJobsRetentionMs` / `tagMergeJobsRetentionMs`（`z.coerce.number().int().positive().default(DEFAULT_*)`）。`readPruneTuning` で両 env をマップ。`DEFAULT_*_RETENTION_MS` を usecase からインポート。
- **理由:** 保持期間を env から決定的に読む（AC-6）。既存の関心ごと1 var 規約に沿う（ADR-004）。

### 6. runPruneTick 配線（prune 2本 + purge）
- **対象ファイル:** `app/worker/cloudflare/handlers.ts`
- **変更内容:**
  - `pruneExportJobs` / `pruneTagMergeJobs` / `purgeExpiredExports` を import。さらに `createRequestContainer` / `readRequestServerConfig` を `serverCloudflare` から import。
  - `runPruneTick` 内、llm-call-log prune の後・export-jobs prune の**前**に、purge 専用 `RequestContainer` を構築し（`const purgeContainer = createRequestContainer(readRequestServerConfig(env))`）、独立した best-effort `try/catch` で `purgeExpiredExports({ container: purgeContainer, input: {} })` を実行。失敗は `logger.error` で握りつぶす。
  - 続けて `pruneExportJobs` / `pruneTagMergeJobs` を各々独立した best-effort `try/catch` で `tuning.exportJobsRetentionMs` / `tuning.tagMergeJobsRetentionMs` を渡して実行。失敗は `logger.error` で握りつぶす。
  - 関数頭の doc コメントに「purge 配線（completed→expired を先に進める。同一 tick の新規 expired は cutoff より新しく同 tick では prune されない）」と2テーブル prune の sweep を追記。返り値契約は据え置き（activity/llm/purge はログのみ）。
- **理由:** 日次 tick への相乗り（AC-7/9）。各 prune・purge が互いと outbox を巻き戻さない隔離を担保。purge を前段に置くことで completed→expired→prune の連鎖を tick 内で確実に閉じる。

### 7. DI 配線（worker container）
- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`（`createWorkerContainer`）
- **変更内容:** `jobStatePruner: new D1JobStatePruner(db)` を追加（import 追加）。purge 用 `createRequestContainer` は既存関数の再利用なので新規構築コードは不要（ステップ6で呼び出すのみ）。
- **理由:** 実 runtime で worker container にポート実装を供給（AC-9 の purge 配線は `createRequestContainer` 再利用で達成）。

### 8. env doc（retention vars）
- **対象ファイル:** `wrangler.toml`（`[env.pruner.vars]`）
- **変更内容:** `EXPORT_JOBS_RETENTION_MS` / `TAG_MERGE_JOBS_RETENTION_MS` を `DEFAULT_*` と一致するコメント付きで宣言（7日 = `604800000`）。
- **理由:** operator 可視化と既存 env 宣言慣行への一致（AC-6）。

### 9. wrangler pruner env に R2 binding 追加（purge 用）
- **対象ファイル:** `wrangler.toml`（`[env.pruner]`）
- **変更内容:** consumer env と同形で `[[env.pruner.r2_buckets]]`（`binding = "OBJECT_STORAGE"`）+ `[env.pruner.vars]` に `R2_OBJECT_BUCKET_NAME` を追加。コメントで「purge の R2 artifact 実削除に必要。presign 3 secret（`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`）は SOPS で deploy 時注入。欠落時は objectStorage が unavailable フォールバックになり delete が throw → purge per-row catch で tick は継続するが artifact は削除されない」を明記。
- **理由:** purge が prod で artifact を実削除できるようにする（AC-9 の完全充足）。binding 不在でも tick はクラッシュしないが orphan が残るため必須。

### 10. テスト（ステップ詳細は「テスト方針」）
- **対象ファイル:** 新規 unit（`pruneExportJobs.test.ts` / `pruneTagMergeJobs.test.ts`）、新規 integration（`app/core/adapters/d1/__tests__/jobStatePruner.integration.test.ts`）、既存更新（`pruneProcessedEvents.test.ts` の `makeContainer` + 共有ヘルパー `app/core/application/__tests__/helpers.ts` / `app/core/adapters/d1/__tests__/helpers.ts` に `jobStatePruner` 追加 / `runPruneTick.test.ts` の mock に prune 2関数 + `purgeExpiredExports` 追加・`readPruneTuning` mock に新 retention 2フィールド追加 / `handlers.integration.test.ts` の happy path 確認）。

## 設計判断

- ADR-001: prune は専用アプリケーション層ポート（`JobStatePruner`）で表現し、ドメイン集約リポジトリには足さない（UoW/`PendingBatch` 非依存・worker prune 前例一致）。
- ADR-002: テーブル横断の1ポート2メソッド構成（`ActivityLogRepository` 前例・DI 最小化）。
- ADR-003: export の `completed` を prune 対象から除外（ライブ artifact orphan 回避。completed→expired→prune の連鎖に委ねる）。本 Issue で purge を配線するため連鎖が実際に閉じる前提に訂正（旧「未配線でも恒久蓄積は起きない」断定は撤回）。`expired` を対象に残す判断は維持するが「expired ⇒ 必ず削除済み」という過剰主張は事実訂正（purge の R2 削除は expire コミット後 best-effort・再試行なしのため、R2 削除失敗の expired 行が存在しうる）。
- ADR-004: retention デフォルト7日、テーブルごとに独立 env var。
- ADR-005: `purgeExpiredExports` を `runPruneTick` に配線する（案Y: `WorkerContainer` を太らせず purge には `createRequestContainer(readRequestServerConfig(env))` で `RequestContainer` を別途構築）+ pruner env への R2 binding 追加。

詳細は `.issue/783/adr.md`。

## リスクと注意点

- **artifact orphan（最重要）:** export の prune は `completed` を含めてはならない。含めると `expiresAt` 未到来のライブ R2 オブジェクトが orphan 化する。アダプタの DELETE 述語で `completed` を構造的に除外し、integration テストで「completed 行は年齢に関わらず保持」を固定する（AC-2/8, ADR-003）。
- **非終端の不可侵:** `pending`/`processing` を述語に含めない。スタックジョブが消えると進行中処理を失う。テストで「古い pending/processing が保持」を固定（AC-3）。
- **WorkerContainer 型拡張の波及:** `jobStatePruner` 必須フィールド追加で `WorkerContainer` リテラルを構築する全箇所がコンパイルエラーになりうる。`makeContainer`・共有ヘルパー2本（`app/core/application/__tests__/helpers.ts` / `app/core/adapters/d1/__tests__/helpers.ts`、arch [S-001]）・`createWorkerContainer` に漏れなく追加（`pnpm typecheck` で検出）。purge 配線は `WorkerContainer` を太らせないので relay/dlq/indexer/consumer への波及はない。
- **`updated_at` text 比較:** ISO8601 UTC 文字列の lexicographic 比較が時刻順と一致することに依存（既存 `findExpired` / llm prune と同じ前提。`toISOString()` で UTC 固定なので成立）。
- **索引利用の正確な把握（arch [S-003]）:** `idx_*_updated_at`（`(desc(updatedAt), desc(id))`）は `updated_at < cutoff` のレンジ境界のみを支え、`status IN (...)` は索引に含まれないためレンジ scan 後の per-row フィルタになる。終端行は全体の一部なので「retention を過ぎた行」をレンジ scan してから status を弾く形。想定データ量では性能問題なく、SQLite は DESC 索引でも `<` レンジ scan が機能する。正確性・性能とも問題なしと判断（将来の索引議論で混乱しないよう明記）。
- **completed の最終 GC 経路（purge 配線で解消）:** export `completed` は必ず `expiresAt` を持ち、本 Issue で `purgeExpiredExports` を `runPruneTick` に配線するため、completed→expired→prune の連鎖が実際に走る。配線前は purge が一度も呼ばれず completed 行が**確定的に**無限蓄積していた（旧計画の「万一 expiry が滞ると…」という稀ヒカップ表現は現状を過小評価していたため訂正）。
- **expired + R2 削除失敗の artifact orphan（arch [P-001]）:** `purgeExpiredExports` は `completed→expired` を**先にコミット**し、その後に `objectStorage.delete` を best-effort（warn 握りつぶし・再試行なし）で実行する。`findExpired` は `status=completed` のみ拾うため、一度 `expired` になった行の R2 削除は二度と再試行されない。よって「`expired` ⇒ artifact 削除済み」は成立せず、R2 削除に失敗した `expired` 行を本 prune が削除すると artifact が確定的に orphan 化しうる。ただし `expired` を prune 対象に残す判断は維持する（恒久蓄積防止という Issue 目的の達成には `expired` 削除が必要で、orphan リスクは purge の堅牢性=R2 削除の信頼性の問題であり終端行 GC の責務外）。purge 側の削除順序入れ替え・再試行は本 Issue スコープ外。

## テスト方針

- **Unit — usecase（`pruneExportJobs.test.ts` / `pruneTagMergeJobs.test.ts`）:** `pruneProcessedEvents.test.ts` を踏襲。stub `jobStatePruner` を注入し (1) `cutoff = clock.now() - retentionMs` が `Date` で一度だけ正しく渡る、(2) `{ deleted }` を素通し、(3) 構造化 info ログ（deleted/retentionMs/cutoff）を出す、(4) 0 件でもログ。`DEFAULT_*_RETENTION_MS` が日単位であることを定数アサートで固定（AC-5）。
- **Integration — D1 アダプタ（`jobStatePruner.integration.test.ts`）:** 実 D1 に各 status・各 `updated_at` の行を seed し検証:
  - tag_merge: 古い `completed`/`failed` は削除、最近の `completed`/`failed` は保持、古い `pending`/`processing` は保持（AC-1/3/4）。
  - export: 古い `failed`/`cancelled`/`expired` は削除、古い `completed` は**保持**（artifact orphan 回避の固定、AC-2/8）、最近の終端は保持、古い `pending`/`processing` は保持（AC-3/4）。
  - 返り値 `{ deleted }` の件数一致。
- **Unit — 配線（`runPruneTick.test.ts`）:** mock 一覧に `pruneExportJobs` / `pruneTagMergeJobs` / `purgeExpiredExports` を追加（`createRequestContainer` / `readRequestServerConfig` もモック）。`readPruneTuning` mock に `exportJobsRetentionMs` / `tagMergeJobsRetentionMs` を追加（arch [S-002]、fidelity 維持）。検証: (1) purge / 各 prune のいずれかが throw しても他 prune・outbox・tick が巻き戻らず `error` ログのみで継続（AC-7）、(2) purge が export-jobs prune より**前**に呼ばれる順序、(3) purge が throw しても後続 prune が走る隔離（AC-9）。`WorkerContainer` 型を太らせる箇所として共有ヘルパー2本のスタブ追加もここで列挙。
- **Integration — happy path（`handlers.integration.test.ts`）:** 実 D1 で `runPruneTick` が新 prune + purge 配線も含めて例外なく完走することを確認（必要に応じ seed 追加）。テスト env では objectStorage が unavailable フォールバックでも purge の per-row catch で tick がクラッシュしないこと（completed 期限切れを seed しない限り delete は呼ばれない）を併せて確認。
- **型:** `pnpm typecheck` で `WorkerContainer` 拡張の波及（`jobStatePruner` 追加漏れ、共有ヘルパー2本含む）を検出。

## レビュー履歴

### Round 1（coverage / arch-risk）反映

- **purge 配線をスコープに追加（coverage [P-001] / ユーザー決定）:** `purgeExpiredExports` が定義のみで未配線（completed→expired 遷移が運用上一度も走らない）ことが実コード確認で判明。completed を prune から除外する本計画では export `completed` 行が無限蓄積し Issue ゴール「stop growing without bound」を満たせないため、`purgeExpiredExports` を `runPruneTick` に配線することをスコープに追加（AC-9 / ステップ6・7・9）。purge のロジックは無変更で呼び出し経路のみ追加。
- **コンテナ配線方式の確定（ADR-005 新設）:** `ServiceArgs.container` が `RequestContainer` 型であることを実コードで確認。`WorkerContainer` に2フィールド足すだけでは型を満たせないため、案Y（`WorkerContainer` は太らせず purge には `createRequestContainer(readRequestServerConfig(env))` を別途構築して渡す）を採用。relay/dlq/indexer/consumer への波及を回避。
- **pruner env への R2 binding 追加（ステップ9）:** purge が R2 artifact を実削除するため `OBJECT_STORAGE` バケット + `R2_OBJECT_BUCKET_NAME` + presign secret を `[env.pruner]` に追加。欠落時は unavailable フォールバックで delete が throw → per-row catch で tick 継続するが prod では orphan が残るため必須、と明記。
- **ADR-003 訂正（coverage [P-001] / arch [P-001]）:** 「（未配線でも）恒久蓄積は起きない」断定を撤回し purge 配線前提に更新。「`expired` ⇒ 必ず artifact 削除済み」の過剰主張を事実訂正（expire コミット後 best-effort・再試行なしのため R2 削除失敗の expired 行が存在しうる）。`expired` を prune 対象に残す判断自体は維持。
- **AC↔ステップのトレーサビリティ整備（coverage [S-001]）:** AC 表の「対応ステップ」に、終端フィルタ / completed 除外を実装する D1 アダプタ（ステップ4）を AC-1/2/3/4/8 に紐づけ。AC-5 に DEFAULT 定数を定義するステップ3を追加。
- **テストヘルパー列挙（arch [S-001]）:** `WorkerContainer` を構築する共有 integration ヘルパー（`app/core/application/__tests__/helpers.ts:169` / `app/core/adapters/d1/__tests__/helpers.ts:154`）の実在を確認し、`jobStatePruner` 追加対象としてテストステップ・リスクに明示。
- **runPruneTick.test.ts の readPruneTuning モック拡張（arch [S-002]）:** 新 retention フィールド（export/tag_merge）を mock に追加する旨を明記。
- **索引利用の正確化（arch [S-003]）:** `idx_*_updated_at` はレンジ境界のみを支え `status IN(...)` は索引外の per-row フィルタになる点を調査結果・リスクに記載（正確性・性能とも問題なしと判断）。
- **維持した良い構造:** 既存 prune 群（outbox/processed-events/activity/llm）の確立パターン踏襲、内側→外側の依存方向順ステップ、tag_merge 側の設計（artifact を持たないため `completed` を終端集合に含める非対称）はそのまま維持。
