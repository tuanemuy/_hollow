# PR #760 Round 3 レビュー — Adapter / Infrastructure 観点（ゼロベース・フル）

対象: PR #760 / Issue #748。実装計画 `.issue/748/plan.md` / 設計判断 `.issue/748/adr.md`（ADR-001〜012）を前提に、Adapter / Infrastructure 層をゼロベースで再レビューした。Round 2 修正（ADR-011 clock 注入 / ADR-012 setup.ts SSOT クリーン集約）反映済みであることを確認。

検証範囲:
- `app/core/adapters/d1/repositories/usageMetricsProvider.ts`
- `app/core/adapters/d1/repositories/llmCallLogRecorder.ts`
- `app/core/adapters/d1/schema.ts`（`llmCallLog`）/ `migrations/0020_llm_call_log.sql`
- `app/core/application/llmCallLog/{ports,types}.ts`
- `app/core/application/workers/pruneLlmCallLog.ts` / `app/worker/cloudflare/handlers.ts`（`runPruneTick`）
- `app/core/application/di/serverCloudflare.ts` / `di/types.ts`（DI 配線・provider 名真実源）
- `app/core/adapters/d1/__tests__/{llmCallLogRecorder,usageMetricsProvider}.integration.test.ts` / `__tests__/setup.ts`
- `pnpm typecheck`（pass）

---

### Adapter / Infrastructure

#### Blockers
なし。

#### Warnings
なし。

#### Notes

- **N-001（情報 / migration 採番の競合確認）** — 場所: `migrations/0020_llm_call_log.sql`。理由: directory ベースの D1 migration（`wrangler.toml` の `migrations_dir`）なのでファイル自体は自動検出され登録漏れは無い。最新 `0019` の次番として `0020` は妥当。提案: main マージ時点で他 PR が `0020` を先取りしていないかだけ最終確認（採番衝突は内容ではなく順序の問題のため、レビュー指摘ではなくマージ時チェック項目）。

- **N-002（設計妥当性の確認 / recorder の `createdAt` が `occurredAt` 再利用）** — 場所: `llmCallLogRecorder.ts` L37 `createdAt: entry.occurredAt`。理由: `created_at` は NOT NULL（schema / migration 一致）。recorder に clock 依存を持たせず `occurredAt` を流用している。ADR-011 の clock 注入は `D1UsageMetricsProvider.collect()` の hour 境界 TOCTOU 対策であり、recorder には適用対象外。`created_at` は系列/scalar 集計から一切読まれない診断専用列であり（集計は全て `occurred_at`）、同期 best-effort 記録で書き込み時刻 ≈ occurredAt のため再利用は妥当。JSDoc に WHY が明記されており適切。Blocker/Warning ではない。

- **N-003（schema ↔ migration ↔ 集計の整合確認）** — 場所: `schema.ts` L878-889 / `0020_llm_call_log.sql` / `usageMetricsProvider.ts`。理由: カラム（`id` text PK / `owner_id` text NOT NULL / `provider` text NOT NULL / `occurred_at` text NOT NULL / `created_at` integer ts_ms NOT NULL）と index `idx_llm_call_log_occurred_at` が schema・migration で完全一致。`event_id` / unique index は両方とも不在で ADR-008 と整合。`occurred_at` ISO8601 text により `collectLlmCallsHourly` の `substr(occurred_at,1,13)` bucket がアップロード系列（`ingestion_jobs.created_at`）と同型で流用でき、range 述語 `gte(occurred_at, windowStartIso)` が `idx_llm_call_log_occurred_at` で 24h 窓にバインドされる（ADR-007 / ADR-001 通り）。問題なし。

- **N-004（UTC bucket / 境界一致の確認）** — 場所: `usageMetricsProvider.ts` `fillBuckets` / `windowStartIso` / `hourBucketKey`。理由: `hourBucketKey` の `toISOString().slice(0,13)` が SQL `substr(...,1,13)`（"YYYY-MM-DDTHH"）と一致。`floorToHourUtc` は `getTime()` の floor で UTC 純粋（ローカルタイムゾーン非依存）。窓は「現在の部分時 + 過去 23 完全時間」= 24 本で、`windowStartIso = floorToHourUtc(now) - 23h`。scalar も同一 `windowStartIso` 下限を共有し `scalar === sum(series)` がテスト（L222-242）で検証されている。両系列の hourStart 列一致もテスト（L207-210）で担保。ADR-004 / ADR-007 / ADR-010 通り。問題なし。

- **N-005（ADR-011 clock 注入の実装確認）** — 場所: `usageMetricsProvider.ts` L44-63。理由: `collect()` 冒頭で `const now = this.clock.now()` を 1 度だけ確定し、`collectUploadsHourly(now)` / `collectLlmCallsHourly(now)` / `collectLlmCallsToday(now)` / `windowStartIso(now)` / `fillBuckets(rows, now)` へ引数注入。各メソッドから ambient な `this.clock.now()` 読み出しが消えており、hour 境界 TOCTOU が構造的に排除されている。テストは `fixedClock(NOW)` 1 点で全経路を固定。ADR-011 通り。問題なし。

- **N-006（ADR-012 setup.ts SSOT クリーン集約の確認）** — 場所: `__tests__/setup.ts` L18 `["llm_call_log", "DELETE FROM llm_call_log"]`。理由: `CLEAN_STATEMENTS`（SSOT）に登録済みで `ingestion_burst_log` 等の先例と対称。Round 1 で入れていた per-file `beforeEach(delete)` は両 integration テストから撤去されている（`grep` で `DELETE FROM llm_call_log` / `delete(llmCallLog)` がテストファイルに残存しないことを確認）。FK 制約上 `llm_call_log` は他テーブルに依存しない（`owner_id` に FK 無し）ので削除順序の問題も無い。ADR-012 通り。問題なし。

- **N-007（null degrade / 0 埋めの確認）** — 場所: `usageMetricsProvider.ts` 各 try/catch / テスト L148-161, L213-220, L244-262。理由: クエリ失敗時は当該系列/scalar のみ `null` へ degrade（never throw）、行 0 件は 0 埋め（`0` は実データ）。`brokenDb`（`select()` throw）注入テストで `llmCallsHourly === null` かつ `llmCallsToday === null` を検証。partial-failure 契約をアップロード系列と同一に踏襲。問題なし。

- **N-008（他 scalar 不変 / AC-7 の確認）** — 場所: `usageMetricsProvider.ts` L54-57。理由: `userCount` / `storageDurableObjectBytes` / `storageR2Bytes` / `uploadsToday` は `null` 固定維持。テスト L163-178 で検証。`llmCallsToday` のみ実データ化（ADR-004）で AC-7 と整合。問題なし。

- **N-009（SQL インジェクション / 型安全の確認）** — 場所: `usageMetricsProvider.ts` / `llmCallLogRecorder.ts`。理由: `substr(${col},1,13)` の `${col}` は drizzle のカラム参照（識別子バインド）で外部入力を含まない。`gte`/`lt` の右辺は `windowStartIso(now)` / `cutoff.toISOString()`（クロック由来の固定文字列、bound parameter）。`recordCall` の値は `.values({...})` 経由で全てパラメータ化。ユーザ入力を文字列連結で SQL に注入する箇所は皆無。ISO8601 text は辞書順 = 時刻順なので範囲比較も正しい。問題なし。

- **N-010（provider 名真実源 / DI 配線の確認, ADR-006/009）** — 場所: `serverCloudflare.ts` `buildLlmProvider`（L588-607）/ `createRequestContainer`（L760-761）/ consumer override（L916-927）/ `di/types.ts`（L280 `llmProviderName: LLMProviderName`）。理由: `buildLlmProvider` が `{ provider, providerName: LLMProviderName }`（domain union）を返し、env 由来 `string` を `(provider ?? "anthropic") as LLMProviderName` で境界 1 回 narrow（ADR-009）。request は `llm.providerName`、consumer は `resolveConsumerLlmConfig` 解決結果由来の名前で override、null 時は request 側 `llmProviderName` を spread 継承（ADR-006 arch[S-002]）。Stub フォールバック時の名前は記録に使われない（Stub は throw して記録地点に到達しない, ADR-002）。`D1LlmCallLogRecorder` は Request / Worker 両 container に載り（L760 / L1235）、`D1UsageMetricsProvider`（read）は Request のみ（L754, clock=`SystemClock` 注入）。配線は plan ステップ 11 / ADR 通り。問題なし。

- **N-011（pruner failure isolation の確認, ADR-005）** — 場所: `handlers.ts` `runPruneTick` L106-122 / `pruneLlmCallLog.ts`。理由: `pruneActivityLog` と `pruneLlmCallLog` がそれぞれ独立した try/catch で呼ばれ、双方向にブロックしない（outbox prune も別段で先行）。`pruneLlmCallLog` は `LLM_CALL_LOG_RETENTION_HOURS = 48` で cutoff 計算 → `pruneOlderThan`、`lt(occurred_at, cutoff)`（cutoff より厳密に過去のみ削除）で表示窓 24h < 保持窓 48h を満たす。retention 定数は `llmCallLog/types.ts` に SSOT 配置。recorder の prune 境界テスト（L79-83, deleted=2）で `lt` 挙動を検証。ADR-005 / AC-6 通り。問題なし。

---

#### 総評
Adapter / Infrastructure 層に Blocker / Warning なし。Round 2 修正（ADR-011 clock 1 度読み + 全集計注入、ADR-012 setup.ts SSOT クリーン集約 + per-file beforeEach 撤去）は妥当かつ正しく反映されている。schema ↔ migration ↔ 集計（substr UTC bucket / 24 本 0 埋め / scalar=系列合計 / 他 scalar null 固定 / null degrade）が整合し、UTC 純粋性・ISO8601 辞書順比較・型安全（LLMProvider union）・SQL インジェクション無しを確認。provider 名真実源（ADR-006/009）と pruner failure isolation（ADR-005）も設計通り。`pnpm typecheck` pass。Adapter 観点では APPROVE。
