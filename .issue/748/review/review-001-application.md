# PR #760 レビュー — Application / Use Case 観点（review-001）

対象: PR #760 / Issue #748（LLM 呼び出しの永続記録源を新設し P40 ダッシュボードに LLM 時系列を追従）
計画: `.issue/748/plan.md` / `.issue/748/adr.md`
日付: 2026-06-18

検証した主要 application 層ファイル:
- `app/core/application/llmCallLog/ports.ts` / `types.ts`
- `app/core/application/ingestion/previewPrompt.ts`
- `app/core/application/ingestion/runIngestionJob.ts`（`runPipeline`）
- `app/core/application/adminSettings/getUsageMetrics.ts`
- `app/core/application/ports/usageMetricsProvider.ts`
- `app/core/application/di/types.ts` / `serverCloudflare.ts`
- `app/core/application/workers/pruneLlmCallLog.ts` / `app/worker/cloudflare/handlers.ts`
- 参照: `app/core/adapters/d1/repositories/{llmCallLogRecorder,usageMetricsProvider}.ts`、`previewPrompt.test.ts`

総評: plan / ADR の確定事項（直接ポート記録・best-effort 局所 try/catch・read/write 責務分離・解決済み provider 名を真実源・独立 try/catch prune・記録粒度 1 LLM 呼び出し=1 行）は application 層に忠実に実装されている。依存方向（presentation → application → domain、ポートは内側で定義し adapter が実装）も守られており、ドメインロジックの漏出も無い。Blocker は無し。後述 W-001（scalar と series の窓境界差）と W-002（adapter の `createdAt` 取り違え、application 由来の設計帰結）が要確認。

---

## Application / Use Case

### Blockers

なし

### Warnings

- **[W-001]** scalar `llmCallsToday` と hourly series で集計窓の下限が異なり、合計が一致しない場合がある
  - 場所: `app/core/adapters/d1/repositories/usageMetricsProvider.ts` — `collectLlmCallsToday()`（L137-152）の `windowStartIso = now - 24h`（exact sliding） vs `windowStartIso()`（L99-104）の `floorToHourUtc(now) - 23h`（hour-aligned, 現在の部分時 + 過去 23 時間）。`collectUploadsHourly` も同じ hour-aligned 窓。
  - 理由: 系列は「現在の部分時 + 直前 23 時間」を 24 本で返し、scalar は「正確に過去 24h」を数える。両者の下限が最大 1 時間ずれるため、境界時の行が一方に入って他方に入らないケースで「scalar = 系列合計」が成立しない。ADR-004 は scalar を `COUNT(*) WHERE occurred_at >= now-24h` と規定し、ADR-007 は系列を `substr` bucket（hour-aligned）と規定しており、両 ADR 単体では正しいが「scalar と系列が同一テーブル由来で一致」（ADR-001/004 の Consequences、TC-2 の判定根拠「LLM カード合計 7 と整合」）という前提は窓境界では崩れる。今回の手動テストはたまたまシードが境界に乗らず PASS しているだけで、本質的な不一致が残る。
  - 提案: いずれかに寄せて窓下限を一致させる。(a) scalar も `windowStartIso()`（hour-aligned）を使い「系列合計 = scalar」を厳密に成立させる（最も簡潔・ダッシュボードの 2 表示が常に一致）。(b) 一致させない設計を意図するなら、scalar は「直近 24h ローリング」・系列は「時間境界 24 本」と意味が異なる旨を `collectLlmCallsToday` / DTO JSDoc に明記し、ADR-004 にも「系列合計と scalar は窓定義が違うため一致しないことがある」と追記する。現状は両者が一致する前提でドキュメント・テストが書かれているため、実装か文書のどちらかを揃える必要がある。なお既存 `uploadsToday`（null 固定）はこの不整合に晒されていないので、本 PR が新規に持ち込む差異。

- **[W-002]** `recordCall` の `createdAt` に挿入時刻ではなく `occurredAt` を流用している（application が createdAt を渡さない設計の帰結）
  - 場所: `app/core/adapters/d1/repositories/llmCallLogRecorder.ts` L31-32（`occurredAt: entry.occurredAt.toISOString(), createdAt: entry.occurredAt`）。起点は application の `LlmCallLogEntry`（`types.ts` L29-34）が `occurredAt` のみを持ち `createdAt` を持たないこと。
  - 理由: 他の read-model（`activity_log` 等）では `createdAt` = 実挿入時刻という慣習があり、ここで `occurredAt` を流用すると「行の物理作成時刻」という列の意味がテーブル間で揃わない。本 PR では `occurredAt ≈ clock.now()`（記録は呼び出し直後）なので実害はほぼ無いが、列の意味としては不正確。`createdAt` はどの read 経路でも参照されていない（series/scalar はすべて `occurred_at` を引く）ため機能影響なし。
  - 提案: 厳密性を取るなら adapter 側で `createdAt: new Date()`（または `clock`）を使う。あるいは `created_at` を本テーブルで使わないなら、JSDoc に「`created_at` は監査用の物理作成時刻で read には使わない／本 read-model では `occurred_at` と近似」と 1 行添える。ADR-001 のカラム定義（`id`/`owner_id`/`provider`/`occurred_at`/`created_at`）に沿わせる意味でも `createdAt` の出所を明確化すべき。Application 観点としては `LlmCallLogEntry` に `createdAt` を持たせない判断自体は妥当（記録側の関心は occurredAt のみ）なので、これは adapter 側の補正で足りる。

### Notes

- **[N-001]** ポート責務分離（read/write）が plan / ADR-003 / arch[S-001] どおり厳格に実装されている。`LlmCallLogRecorder`（`ports.ts`）は `recordCall` / `pruneOlderThan` の write/prune のみで read メソッドを一切持たず、read（hourly series + 24h scalar）は `D1UsageMetricsProvider` 内の直 drizzle クエリに閉じている。同じ集計が 2 箇所に出る乖離リスクが構造的に排除されており、JSDoc（`ports.ts` L3-21）も意図を明記。良い設計。

- **[N-002]** Stub 非記録の「構造的保証」が両経路で正しく成立している。`previewPrompt`（L112-167）は `recordLlmCall()` を各 `await container.llmProvider.*` の成功直後・`return` 前に置き、Stub の throw は外側 catch で `llm_preview_unavailable` 化されるため記録地点に到達しない。`runPipeline`（runIngestionJob.ts L301-421）も同様に `await deps.llm.structureToHtml(...)` / `suggestMetadata(...)` の成功直後に `recordLlmCall()` を配置。いずれも明示的 Stub 判定フラグを `PipelineDeps` 等に持ち回しておらず、arch[S-001]（2周目で取り込んだ簡潔化）に完全準拠。`previewPrompt.test.ts` (i)（L342-365）が「失敗 throw → 記録地点に到達せず recordCall 未呼出」を検証しており、テストも方針と一致。

- **[N-003]** 記録粒度（1 LLM API 呼び出し = 1 行）が `runPipeline` の実構造と 1:1。structure 系は `structureToHtml`（L392-400）+ 共通パスの `suggestMetadata`（L417-421）で 2 行、html/markdown 分岐は `structureToHtml` をスキップして `suggestMetadata` のみで 1 行、空 audio は L332-343 で早期 return し両方スキップ＝0 行。AC-1 の「structure=2 / html・markdown=1 / 空 audio=0」を正確に満たす。`recordLlmCall` を各 LLM 呼び出し直後の局所 try/catch にしたことで、記録失敗が `runPipeline` の throw 経路（本処理失敗 → 呼び出し元 `runIngestionJob` の catch でジョブ失敗、L181-236）と混同されない（arch[S-003] / AC-5）。

- **[N-004]** best-effort 局所 try/catch が本処理に波及しない実装になっている。`previewPrompt` の `recordLlmCall`（L112-125）と `runPipeline` の `recordLlmCall`（L308-321）はいずれも内部で try/catch して `logger.warn` のみ。記録の `await` が解決しても throw しても呼び出し側のプレビュー結果・プレビュー組み立て・ジョブ遷移には一切影響しない。`previewPrompt.test.ts` (j)（L369-386）が「recordCall throw でも戻り値不変」を検証。AC-5 充足。

- **[N-005]** DTO 射影（`getUsageMetrics.ts` L67-73）が `uploadsHourly` と同型で `llmCallsHourly` を Date→ISO8601 へ map し、`null` をそのまま透過。partial-failure 契約（series 単位 null degrade）が snapshot → DTO で保たれている。scalar `llmCallsToday` は L59 で素通し（既存ロジックのまま実数 or null）。DTO 拡張は他フィールドの挙動に副作用なし（AC-7）。

- **[N-006]** provider 名の真実源（ADR-006 / ADR-009）が型レベルで保証されている。`buildLlmProvider`（serverCloudflare.ts L588-607）が `{ provider, providerName }` を返し、`providerName` は `LLMProviderName`（= domain の `LLMProvider` union）に narrow（L594 で `(provider ?? "anthropic") as LLMProviderName` を境界 1 回）。container の `llmProviderName`（types.ts L280）も同 union 型で、`recordCall` の `provider: container.llmProviderName`（previewPrompt L117）/ `deps.providerName`（runIngestionJob L313）へキャスト無しで通る。env の `ADMIN_LLM_PROVIDER` 生値を記録していない点が正しく実装されている。

- **[N-007]** DI 配線が 3 経路すべてで正しく成立。Request: `llmCallLogRecorder: new D1LlmCallLogRecorder(db)` / `llmProviderName: llm.providerName`（serverCloudflare.ts L760-761）。Worker: 同 recorder を L1235 で配線（pruner 用）。Consumer: `ConsumerContainer = RequestContainer & Pick<WorkerContainer, "outboxRepository"|"idempotencyStore"|"indexJobRepository">`（types.ts L351-355）で recorder/llmProviderName は RequestContainer から spread 継承し、`createConsumerContainer`（L904-941）が `resolveConsumerLlmConfig` 解決時に `llmProviderName` を `built.providerName` で上書き、`resolved===null` 時は request 側継承（arch[S-002] コメント L911-915 と一致）。`UnitOfWorkContext` には載せていない（preview は UoW 外）。前例 `D1ActivityLogRepository` の配置と整合。

- **[N-008]** pruner が独立 try/catch で failure isolation を達成（ADR-005 / arch[S-003]）。`runPruneTick`（handlers.ts L106-122）が `pruneActivityLog` と `pruneLlmCallLog` をそれぞれ別 try/catch で呼び、`pruneLlmCallLog`（workers/pruneLlmCallLog.ts）は `LLM_CALL_LOG_RETENTION_HOURS = 48` で cutoff 計算 → `llmCallLogRecorder.pruneOlderThan(cutoff)`。retention 定数は `llmCallLog/types.ts` に正しく配置。表示窓 24h < 保持窓 48h（AC-6）。

- **[N-009]** ドメインロジックの漏出なし。新規ドメイン概念・不変条件・ドメインイベントを増やさず、LLM call log を application 層の read-model として位置づけ（plan「ドメインモデルへの影響」どおり）。`provider` は既存ドメイン VO `LLMProvider` を再利用。`runPipeline` 内の bucket/集計ロジックは持たず、集計は adapter（`D1UsageMetricsProvider`）に閉じている。依存方向（application が domain VO に依存、adapter が application ポートを実装）は正しい。

- **[N-010]** 軽微（任意）: `previewPrompt` で関数冒頭の `now`（L77, rate limiter 用）と記録の `occurredAt`（`container.clock.now()` 再取得, L118）が別タイムスタンプ。記録の occurredAt は LLM 呼び出し後の時刻になり意味的に妥当だが、テスト（previewPrompt.test.ts L320 で `occurredAt` を assert）と整合していれば問題なし。指摘ではなく確認事項。
