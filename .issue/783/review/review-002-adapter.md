# Review 002 — Adapter / Infrastructure / DI（Round 2 フルレビュー）

対象 PR: #792 / Issue #783
観点: Adapter / Infrastructure / DI（ゼロベース）
結果: **Blockers 0 / Warnings 0 / Notes 3**

---

## 検証サマリー

`.issue/783/plan.md` の AC のうち adapter/DI に関わる基準（AC-1/2/3/4/6/8/9）と
ADR-001/002/005/006 をコードに照合し、いずれも満たされていることを確認した。
`pnpm typecheck` はクリーンに通過する。

確認済みの主な事実:

- **DELETE 述語の正しさ（AC-1/2/3/4/8）** — `jobStatePruner.ts`:
  - export: `inArray(exportJobs.status, ["failed","cancelled","expired"])` + `lt(updatedAt, cutoff.toISOString())`。`completed` を構造的に除外（ADR-003）。schema の `export_jobs_status_enum`（`pending/processing/completed/failed/cancelled/expired`）と終端集合の整合を確認。
  - tag_merge: `inArray(tagMergeJobs.status, ["completed","failed"])` + 同 `lt`。schema の `tag_merge_jobs_status_enum`（`pending/processing/completed/failed`）と整合。artifact を持たないため `completed` を含める非対称も正しい。
  - 非終端（`pending`/`processing`）はどちらの集合にも入らず、年齢に関わらず不可侵（AC-3）。
  - `returning({ id })` → `rows.length` で件数化。既存 prune アダプタ前例と同一。
  - `lt`（`<`）は境界の `updated_at == cutoff` を保持（lte でない）。integration テストが `AT_CUTOFF` ケースで固定済み。
- **`mapDbError` の一貫性** — 両メソッドとも `mapDbError("Failed to prune ...", async () => {...})` でラップ。`ApplicationError` 素通し / `SQLITE_CONSTRAINT*` → `ConflictError` / その他 → `SystemError(DatabaseError)` という既存契約に乗る。export_jobs / tag_merge_jobs は被参照 FK を持たない（users への外向き参照のみ）ため bulk DELETE で FK 違反は発生しない。
- **`updated_at` ISO8601 text 比較** — `exportJobRepository.ts:242` / `tagMergeJobRepository.ts:126` がともに `updatedAt: job.updatedAt.toISOString()` で UTC ISO8601 text 保存。`cutoff.toISOString()` との lexicographic `<` 比較は時刻順と一致（`findExpired` / llm prune と同一前提）。`idx_*_updated_at`（`desc(updatedAt), desc(id)`）がレンジ境界を支える（status 絞り込みは索引外の per-row フィルタ、Round 1 [S-003] 既述で正確性・性能とも問題なし）。
- **DI 配線と波及（ADR-006）** — `createWorkerContainer`（`serverCloudflare.ts:1245`）が `jobStatePruner: new D1JobStatePruner(db)` を供給。`ConsumerContainer` の `Pick<WorkerContainer, ...>` に `"jobStatePruner"` を追加（`types.ts:371`）し、`createConsumerContainer`（`:974`）が `workerContainer.jobStatePruner` を forward。`ConsumerContainer ⊇ WorkerContainer`（dispatch handler が `WorkerContainer` 型を要求）の不変条件が復元され typecheck 通過。共有 integration ヘルパー2本（`application/__tests__/helpers.ts:171` / `adapters/d1/__tests__/helpers.ts:156`）と `pruneProcessedEvents.test.ts` の stub にも追加済み。
- **`wrangler.toml [env.pruner]` の R2 binding 整合（ADR-005 / AC-9）** — `[[env.pruner.r2_buckets]] binding="OBJECT_STORAGE"` + `[env.pruner.vars] R2_OBJECT_BUCKET_NAME` + retention vars（`EXPORT_JOBS_RETENTION_MS` / `TAG_MERGE_JOBS_RETENTION_MS` = `604800000`）を追加。`[env.consumer]` の OBJECT_STORAGE binding と同形。presign 3 secret は SOPS 注入前提とコメントで明記。retention 値は `DEFAULT_*_RETENTION_MS`（各7日）と一致。
- **purge 配線の実現可能性（AC-9）** — `runPruneTick`（`handlers.ts:166-173`）が purge 専用 `createRequestContainer(readRequestServerConfig(env))` を export-jobs prune の前段で best-effort 実行。`readRequestServerConfig` は欠落 env を条件付き spread で握りつぶし throw しない、`createRequestContainer` の各アダプタも欠落時フォールバック（objectStorage は presign 不揃いで unavailable）するため、pruner env でも purge コンテナ構築は失敗しない（silent throw で毎 tick no-op になる懸念なし）。best-effort 隔離も各 prune/purge ごとに独立 `try/catch`（AC-7）。
- **tuning（AC-6）** — `env.ts` の `pruneTuningSchema` に `exportJobsRetentionMs` / `tagMergeJobsRetentionMs`（`z.coerce.number().int().positive().default(DEFAULT_*)`）、`TuningEnv` に2 env、`readPruneTuning` でマップ。`DEFAULT_*` は usecase からインポート。ハードコードなし。

Round 1 で見送り済みの `returning({id})` 無制限 DELETE（既存パターン同一）は本レビューでも再掲しない。

---

## Blockers

なし。

---

## Warnings

なし。

---

## Notes

- **[N-001] 終端ステータス集合がドメイン union と型結合していない（型安全の限界）**
  - 場所: `app/core/adapters/d1/repositories/jobStatePruner.ts:28, 43`
  - 内容: `exportJobs.status` / `tagMergeJobs.status` は schema 上 `text("status")`（drizzle 型は `string`）であり、`inArray(..., ["failed","cancelled","expired"])` の終端集合はドメインの status union（`app/core/domain/export/valueObject.ts:62-68` の `ExportJobStatus`、tag/mergeJob の terminal 定義）と**コンパイル時に結合していない**。ドメインが status をリネームしてもこのアダプタは型エラーにならず、誤りは integration テストでのみ検出される。
  - 評価: 現状の終端集合は schema CHECK / ドメイン定義と一致し正しい。status を text 列で持つのは D1 アダプタ全体の既存規約で、本 PR 固有の劣化ではない。integration テスト（`jobStatePruner.integration.test.ts`）が各 status の保持/削除を網羅的に固定しており実害はない。将来の保守性観点での指摘に留める（任意対応）。

- **[N-002] pruner 経由の purge が発行するドメインイベントは即時 relay kick されない**
  - 場所: `app/worker/cloudflare/handlers.ts:167`（`createRequestContainer(readRequestServerConfig(env))` を `ctx` 無しで構築） / `wrangler.toml [env.pruner]`（`RELAY` service binding 無し）
  - 内容: `purgeExpiredExports` の `completed→expired` は UoW commit 時に `collectEvents` でドメインイベントを outbox に積む（`purgeExpiredExports.ts:47`）。pruner では `ctx`/`waitUntil` を渡さず、かつ `[env.pruner]` に `RELAY` service binding が無いため、`buildRelayTrigger(undefined, undefined, ...)` は `NoopRelayTrigger` を返す（`serverCloudflare.ts:521-523`）。よって即時 relay kick は行われず、これらのイベントは relay worker の safety-net cron（5分間隔）でのみ dispatch される。
  - 評価: outbox はトランザクショナルに永続化され at-least-once + cron フォールバックで配送されるため**機能的に正しい**（即時性のみ犠牲）。consumer 経路の即時 kick と異なる挙動だが、export.expired のような非対話イベントでは許容範囲。ADR-005 はこの relay-trigger の含意に触れていないため、認識として記録する（実装変更は不要）。

- **[N-003] `[env.pruner]` は `TEMP_FILES` r2 binding を持たない（consumer との非対称）**
  - 場所: `wrangler.toml [env.pruner]`（`[[env.consumer.r2_buckets]] binding="TEMP_FILES"` に相当する宣言が無い）
  - 内容: `createRequestContainer` は `TEMP_FILES` 欠落時 `createUnavailableTempFileStorage()` にフォールバックする（`serverCloudflare.ts:742-744`）。purge は `objectStorage` のみ使用し `tempFileStorage` に触れないため、この欠落は purge 動作に影響しない。
  - 評価: 正しい（purge に不要な binding を pruner に足さない判断は妥当）。ただし consumer env との非対称が wrangler コメントに記されておらず、将来「pruner にも TEMP_FILES が要るのでは」と誤解される余地がある。意図的省略である旨を一行コメントで残すと親切（任意）。

---

## 良い点

- 既存 prune アダプタ前例（`D1LlmCallLogRecorder` 等）と完全に同型の `constructor(db)` + `mapDbError` + `returning({id})` 構成で、worker prune パターンに厳密一致。
- ADR-006 の `ConsumerContainer` Pick 訂正が JSDoc（`types.ts:360-363`）+ `createConsumerContainer` のコメント（`:971-973`）で根拠付きで明記され、`ConsumerContainer ⊇ WorkerContainer` 不変条件が型で担保されている。
- integration テスト（`jobStatePruner.integration.test.ts`）が「古い completed export を保持（artifact orphan 回避）」「非終端保持」「lt 境界」「件数一致」「no-op」を網羅的に固定し、本変更で壊しやすい不変条件をピンポイントで押さえている。
- `wrangler.toml [env.pruner]` の retention vars / OBJECT_STORAGE binding に `DEFAULT_*` との一致・SOPS secret 注入・unavailable フォールバックの帰結まで含めた運用コメントが付き、operator 可視性が高い。
