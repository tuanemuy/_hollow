# PR #760 レビュー — Round 3（ゼロベース・フルレビュー）

対象: Application / Use Case 層
レビュー観点: ユースケースのオーケストレーション・ポート設計・best-effort 記録・DTO 射影・DI 配線・依存方向。Round 2 W-001（ADR-011 collect() の clock 1回読み注入）の妥当性を含む。

## Application / Use Case

### Blockers

なし。

Application 層は plan.md / adr.md（ADR-001〜012）の判断に忠実で、CLAUDE.md のヘキサゴナル + DDD・UoW・error 方針・依存方向に違反する箇所は見当たらない。`pnpm typecheck` clean。

### Warnings

なし。

Round 2 W-001（TOCTOU）の修正は適切に閉じている（下記 N-001 参照）。新規の Warning 級の問題は検出されなかった。

### Notes

- **N-001（ADR-011 W-001 修正の妥当性: 妥当）** 場所: `app/core/adapters/d1/repositories/usageMetricsProvider.ts` L44-63。`collect()` 冒頭で `const now = this.clock.now()` を1度だけ確定し、`collectUploadsHourly(now)` / `collectLlmCallsHourly(now)` / `collectLlmCallsToday(now)` へ引数注入。各メソッドは ambient な `this.clock` 読み出しをやめ、`windowStartIso(now)` / `fillBuckets(rows, now)` も同一 `now` を共有する。クラス内に残る `this.clock.now()` は L49 の1箇所のみ（確認済み）。これにより scalar の窓下限（L156 `gte(occurredAt, windowStartIso(now))`）と series の窓下限（L99）・bucket 列挙（L127-131）が**同一の `now`・同一の hour-aligned 窓**を参照し、集計の合間に hour 境界をまたいでも `scalar === sum(series)`（ADR-004）が構造的に成立する。TOCTOU は解消されている。理由/評価: 厳密に正しく、決定論性も上がる（fixedClock 1点で全経路固定可能）。指摘なし。

- **N-002（best-effort 記録の局所 try/catch: 妥当）** 場所: `previewPrompt.ts` L112-125 / `runIngestionJob.ts` L308-321（`recordLlmCall`）。両経路とも記録を独立した async ヘルパーに閉じ、内部 try/catch で握り潰して `logger.warn` のみ。記録呼び出し（`await recordLlmCall()`）は preview 成功路（L134/L158）・pipeline 各 LLM 成功直後（L400/L421）に配置。記録の throw は構造的に発生しない（catch 済み）ため、preview の `return` 直前・pipeline の `return` 経路に波及せず、`runIngestionJob` の本処理 catch（L181）や job 遷移とも混同しない。AC-5（記録失敗が本処理を壊さない）と arch[S-003]（本処理 throw 経路と分離）を満たす。CLAUDE.md「broad try/catch を避け、明示境界のみ」にも整合（best-effort 記録は明示境界）。

- **N-003（Stub 構造的非記録: 妥当）** 場所: `previewPrompt.ts` L105-167 / `runIngestionJob.ts` L301-421。記録を `await container.llmProvider.*` / `await deps.llm.*` の**成功直後（throw を抜けた後）**に置くことで、`StubLLMProvider`（両メソッド必ず throw）では記録地点に到達しない。preview 路は throw が L165 catch で `translateLLMError`→`llm_preview_unavailable` 化、consumer 路は throw が L181 catch で job 失敗となり、いずれも成功路（記録地点）に到達しない。明示的 Stub 判定フラグの引き回しは無く（`PipelineDeps` に Stub flag 無し・確認済み）、arch[S-001]・AC-1 但し書き（Stub 非記録）を構造的に保証。虚偽表示禁止（AC-4）整合。

- **N-004（記録粒度 2/1/0 の 1:1 対応: 妥当）** 場所: `runIngestionJob.ts`。structure 系（else 分岐 L376-408）は `structureToHtml` 成功後 L400 で1回 + 共通パス `suggestMetadata` 成功後 L421 で1回 = **2行**。html/markdown 分岐（L359-375）は `structureToHtml` を呼ばず共通パスのみ通るので **1行**。空 audio（L332-343）は早期 return で両方スキップ = **0行**。preview 路は各分岐で1行（metadata L134 / structure L158）。記録粒度「1 LLM API 呼び出し = 1行」（AC-1）と完全一致。

- **N-005（llmCallLog ポート設計: 妥当）** 場所: `app/core/application/llmCallLog/ports.ts` / `types.ts`。`LlmCallLogRecorder` は `recordCall` / `pruneOlderThan` の write/prune のみで read を持たず（arch[S-001]）、read は `D1UsageMetricsProvider` に閉じる。同一集計が2箇所に出る乖離リスクを排除。`LlmCallLogEntry` に `eventId` フィールド無し（ADR-008 同期 best-effort で冪等キー不要）。`provider: LLMProvider`（domain union、ADR-009）で型付けされ、`string` 由来の暗黙不整合を境界（`buildLlmProvider` の `(provider ?? "anthropic") as LLMProviderName`）に1度だけ寄せている。`LLM_CALL_LOG_RETENTION_HOURS = 48`（表示窓24h < 保持窓48h、AC-6）。ポートは application 層で定義され adapter が実装＝依存方向（内向き）遵守。JSDoc は判断（ADR-002/003/008）を正しく説明。

- **N-006（DI 配線・provider 真実源: 妥当）** 場所: `di/serverCloudflare.ts` L588-607 / L754-761 / L886-970 / L1235、`di/types.ts` L270-280/L335。`buildLlmProvider` は `{ provider, providerName }` を返し（ADR-006/009）、`createRequestContainer` が `llmProviderName: llm.providerName` を載せる。consumer 路は `resolveConsumerLlmConfig` 解決結果で override（L916-927）、`null` 時は spread 継承で request 側 `llmProviderName` を引き継ぐ（arch[S-002] / ADR-006 補足どおり）。`D1LlmCallLogRecorder` は RequestContainer（preview write）/ WorkerContainer（ingestion write + pruner）両方に配線（`D1ActivityLogRepository` 前例どおり）、`ConsumerContainer` は RequestContainer spread 継承で consumer write も賄う。`UnitOfWorkContext` には載せていない（preview は UoW 外）。`D1UsageMetricsProvider`（read）は RequestContainer のみ。`idGenerator` は SharedDeps（types.ts L101）なので両路で利用可。env 値そのままでなく実構築 provider 名を真実源とする方針が貫かれている。

- **N-007（pruner failure isolation: 妥当）** 場所: `app/core/application/workers/pruneLlmCallLog.ts` / `app/worker/cloudflare/handlers.ts` L106-122。`pruneLlmCallLog` は `pruneActivityLog` への相乗りでなく独立関数として新設され、`runPruneTick` 内で activity-log prune とは**別の try/catch ブロック**で呼ばれる（L116-122）。一方の失敗が他方・outbox prune をブロックしない（AC-6 / ADR-005 / arch[S-003]）。cutoff は `clock.now() - 48h`。CLAUDE.md「worker → root の per-row tolerance try/catch」に整合。

- **N-008（DTO 射影: 妥当）** 場所: `app/core/application/adminSettings/getUsageMetrics.ts` L67-73。`llmCallsHourly` を snapshot から `null` 透過しつつ Date → ISO8601 へ map（`uploadsHourly` と同型）。`llmCallsToday` はそのまま透過（scalar はラベル「回/24h」のまま実数化、ADR-004）。partial-failure 契約（per-metric null）を保持。`assertAdmin` は別 UoW で先行実施され、authz は維持されている。

- **N-009（occurredAt のクロック2度読み: 設計上許容、指摘ではない）** 場所: `previewPrompt.ts` L77 と L118。rate-limit 消費は L77 の `now`、記録 `occurredAt` は L118 の再読み（LLM 往復後）。これは provider の `scalar===sum(series)` 不変条件（記録**後**の read 集計が支配）には無関係で、`occurredAt` は実呼び出し時刻に近い記録時 now を採るのが妥当。pipeline 路（`runIngestionJob.ts` L314 `deps.clock.now()`）も同様に記録時読み。問題なし。記録のためメモ。

## 総評

Round 2 の W-001（ADR-011 collect() の clock 1回読み注入）は正しく実装され、scalar/series の窓ずれ（TOCTOU）は構造的に解消されている。llmCallLog ポート（write/prune 限定・read は provider 閉じ込め）、preview/runIngestionJob の局所 try/catch best-effort 記録（記録粒度 2/1/0・Stub 構造的非記録）、DTO 射影、DI 配線（provider 真実源・両路配線・UoW 非搭載）、pruner の failure isolation はいずれも plan / ADR / CLAUDE.md に忠実で、依存方向違反・ドメインロジック漏出・broad catch も無い。Application 層として Blocker / Warning なしで APPROVE 相当。
