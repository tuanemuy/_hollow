# PR #792 レビュー — Issue #783（terminal job-state prune + purge 配線）

## Adapter / Infrastructure / DI

観点: D1 adapter の DELETE 述語・`mapDbError` 一貫性・ISO8601 text 比較・索引利用・DI 波及・wrangler R2 binding・型安全/トランザクション境界。
結論: **Blocker なし**。実装は既存 prune 群（outbox / processed-events / activity-log / llm-call-log）の確立パターンと完全に整合し、AC-2/3/4/8/9 の adapter/DI 面・R2 binding を満たす。`pnpm typecheck` クリーン。

### Blockers

なし

### Warnings

- **[W-001]** 終端 prune の `returning({ id })` は削除行 ID を全件メモリ展開して件数算出する（単一の無制限 DELETE）
  - 場所: `app/core/adapters/d1/repositories/jobStatePruner.ts:32`, `:47`
  - 理由 / 提案: これは `D1LlmCallLogRecorder.pruneOlderThan`（`llmCallLogRecorder.ts:45-47`）と**同一の確立パターン**であり設計上の逸脱ではない。ただし本 sweep は「これまで一度も prune されていない」`export_jobs` / `tag_merge_jobs` に**初回**走るため、デプロイ直後のバックログが大きいと「単一 DELETE + 全 ID の `returning`」が D1 のステートメント/メモリ上限に当たりうる点は llm-call-log 等の後発 prune と同じ潜在リスクを共有する。`runPruneTick` で best-effort `try/catch` 隔離されており失敗しても tick はクラッシュしないため Blocker ではないが、初回デプロイ時のバックログ規模を運用側で把握しておくのが望ましい。バッチ/`LIMIT` 化は本 PR スコープ外（全 prune 横断の別議論）。
  - **→ 見送り（本PR）:** 既存 prune 群（`D1LlmCallLogRecorder` / `D1IdempotencyStore` 等）と完全同一の確立パターンであり、本変更固有の回帰ではない。バッチ/`LIMIT` 化は全 prune 横断のパターン変更で本 Issue スコープ外。best-effort 隔離で tick はクラッシュしないため受容。

### Notes

- **[N-001]** DELETE 述語が AC を構造的に満たしている。export 終端集合 `['failed','cancelled','expired']` で `completed` を**構造的除外**（AC-2/8, ADR-003）、tag_merge `['completed','failed']`。両 status 文字列は `schema.ts` の `*_status_enum` CHECK（export: pending/processing/completed/failed/cancelled/expired、tag_merge: pending/processing/completed/failed）と**完全一致**。`pending`/`processing` を含めないため非終端不可侵（AC-3）も述語レベルで保証。`and(inArray(status, set), lt(updatedAt, cutoff.toISOString()))` の結合・`returning({ id })` 件数算出いずれも計画どおり。
  - 場所: `app/core/adapters/d1/repositories/jobStatePruner.ts:22-50`

- **[N-002]** `mapDbError("Failed to prune ...", async () => {...})` でのラップが既存 adapter（`llmCallLogRecorder.ts:43`）と完全一致。driver ネイティブエラーは `mapDbError`（`helpers.ts:98-116`）で `ConflictError` / `SystemError(DatabaseError)` に変換され、application 層へは provider-native エラーが漏れない（CLAUDE.md「adapter → application」準拠）。SQL は全て drizzle のパラメータ化バインドで構築され、インジェクションの余地なし。非トランザクショナルな bulk DELETE は ADR-001 の意図どおりで、集約ロード/OCC を伴わないため UoW 境界の懸念もない。

- **[N-003]** `updated_at` の ISO8601 UTC text 比較が `lt(updatedAt, cutoff.toISOString())` で機能する。`cutoff` は `new Date(clock.now().getTime() - retentionMs)`（usecase）で UTC 固定の `toISOString()` に正規化され、`findExpired` / llm prune と同じ lexicographic 比較前提を共有。`idx_export_jobs_updated_at` / `idx_tag_merge_jobs_updated_at`（ともに `(desc(updatedAt), desc(id))`）が `updated_at < cutoff` のレンジ境界を支える。`status IN (...)` は索引外の per-row フィルタになる（plan arch[S-003] の記述どおり）が、終端行は steady-state で日次に新規発生する分のみが対象でスキャン量は許容範囲、正確性に影響なし。

- **[N-004]** DI が ADR-005/006 どおりに配線されている。`createWorkerContainer` に `jobStatePruner: new D1JobStatePruner(db)` を追加（`serverCloudflare.ts:1245`）、`ConsumerContainer` の `Pick<WorkerContainer, ...>` に `"jobStatePruner"` を追加（`di/types.ts:371`）、`createConsumerContainer` で `jobStatePruner: workerContainer.jobStatePruner` を forward（`serverCloudflare.ts:974`、コメントで ADR-006 の根拠を明記）。これは `outboxRepository` / `idempotencyStore` / `indexJobRepository` という他の worker 専用ポート forward と同機構で、`ConsumerContainer ⊇ WorkerContainer` 不変条件（dispatch handler が `WorkerContainer` を要求）を復元する。`pnpm typecheck` がクリーンに通り、relay/dlq/indexer/consumer への予期せぬ波及がないことを型で確認。

- **[N-005]** purge 配線（ADR-005 案Y）が `WorkerContainer` を太らせず実装されている。`runPruneTick` 内で `createRequestContainer(readRequestServerConfig(env))` を別途構築し、export-jobs prune の**前段**で独立 `try/catch` 実行（`handlers.ts:166-173`）。purge / 各 prune が互いと outbox を巻き戻さない best-effort 隔離（AC-7/9）を満たし、返り値契約 `{ outboxDeleted, processedEventsDeleted }` も不変。`createRequestContainer` / `readRequestServerConfig` が throw しても try 内なので tick は継続する。

- **[N-006]** `wrangler.toml [env.pruner]` の R2 binding が `[env.consumer]` と整合。`[[env.pruner.r2_buckets]] binding = "OBJECT_STORAGE", bucket_name = "hollow-local-objects"`（`:291-293`）は consumer 側（`:182-184`）と同一 bucket・同一書式。`R2_OBJECT_BUCKET_NAME = "hollow-local-objects"` var（`:274`）も consumer（`:157`）と一致。presign 3 secret は SOPS 注入前提をコメントで明記。retention env var（`EXPORT_JOBS_RETENTION_MS` / `TAG_MERGE_JOBS_RETENTION_MS` = `604800000`）は既存 `OUTBOX_RETENTION_MS` 等と同形式で、`DEFAULT_*_RETENTION_MS`（各 `7*24*60*60*1000`）と数値一致し、コメントで対応定数ファイルを参照（AC-6）。`pruneTuningSchema` も `z.coerce.number().int().positive().default(DEFAULT_*)` で既存 2 フィールドと同一形（`env.ts:46-55`）。

- **[N-007]** ポート/usecase/adapter の JSDoc が不変条件（終端のみ・非終端不可侵・export completed 除外の根拠）を ADR 参照付きで明記しており、設計意図がコードに保存されている（`ports/jobStatePruner.ts:1-36`, `repositories/jobStatePruner.ts:7-18`）。CLAUDE.md の「why を残す」方針に沿った良質なコメント。
