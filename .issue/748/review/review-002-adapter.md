# PR #760 レビュー (Round 2 / ゼロベース) — Adapter / Infrastructure

対象: Adapter / Infrastructure 層
範囲: `llmCallLogRecorder` / `usageMetricsProvider` / migration 0020 + schema.ts / D1 integration テストのクリーン戦略
判定: **Blocker なし**。Round 1 の指摘（scalar の `windowStartIso` 統一など）は反映済みで、`scalar === sum(series)` が成立している。

検証実績:
- `pnpm typecheck` → green
- `pnpm test:integration usageMetricsProvider llmCallLogRecorder` → 12 passed

---

## Adapter / Infrastructure

### Blockers

なし。

### Warnings

#### W-001: `llm_call_log` がグローバル `setup.ts` の `CLEAN_STATEMENTS` に登録されていない（確立パターンからの逸脱）

- 場所: `app/core/adapters/d1/__tests__/setup.ts`（本 PR では未変更）/ 補填として `usageMetricsProvider.integration.test.ts:99-101`・`llmCallLogRecorder.integration.test.ts:26-28` に per-file `beforeEach(delete)` を追加。
- 理由: 全 integration テストの共有 setupFile（`vitest.config.integration.ts:85`）である `setup.ts` の `CLEAN_STATEMENTS` には高頻度 append テーブルが列挙され、先例 `ingestion_burst_log` は L17 に登録済み（24h 保持の同種テーブル）。今回新設した同種の `llm_call_log` は登録されておらず、代わりに新規テスト 2 ファイルが各自で `beforeEach` 全削除を持つ。同テーブルへ書き込む他のテスト（`runIngestionJob.integration.test.ts` の recording ブロック、`handlers.integration.test.ts` の prune isolation テスト）は global cleanup に依存しているため、行が isolate 内に蓄積し続ける（singleWorker・per-file isolate のため越境はしないが、ファイル内では truncate されない）。
- 現状で致命傷にならない理由: 当該テスト群のアサーションがすべて `ownerId`（毎テスト一意採番）または特定 `id` でスコープされているため、leak しても COUNT がずれない。よって **テストは通るが、確立した「高頻度テーブルは setup.ts に登録する」規約から外れ、将来 owner 非スコープの集計アサーションを足すと leak で flaky 化する**。これは設計の堅牢性の問題で機能バグではない。
- 提案: `setup.ts` の `CLEAN_STATEMENTS` に `["llm_call_log", "DELETE FROM llm_call_log"]` を 1 行追加し（`ingestion_burst_log` の隣が自然）、新規 2 ファイルの per-file `beforeEach(delete)` を撤去して規約を一本化する。少なくとも「setup.ts 未登録なのは意図的（per-file delete で代替）」である旨を `setup.ts` 側に残す手もあるが、先例との非対称が解消されないため登録を推奨。

### Notes

#### N-001: `recordCall` の `createdAt = entry.occurredAt` 再利用は妥当（why コメント明快）

- 場所: `llmCallLogRecorder.ts:32-37`。
- `created_at` は診断専用で系列/scalar の集計から一切読まれない（read は `occurred_at` のみ）。同期 best-effort 記録で occurredAt ≈ 記録時刻のため clock 依存をアダプタに引き込まずに済ませる判断。why コメントが制約（read されない・同期記録）を正しく説明しており、CLAUDE.md のコメント方針（WHY を残す）に合致。`occurredAt`(Date) を `timestamp_ms` mode カラムへ、ISO 文字列を text カラムへ渡す型運用も drizzle 仕様どおりで正しい。

#### N-002: `pruneOlderThan` の境界（strict `<`）が仕様・テストと一致

- 場所: `llmCallLogRecorder.ts:46`（`lt(occurredAt, cutoff.toISOString())`）/ `llmCallLogRecorder.integration.test.ts:53-90`。
- cutoff 同値行は削除されない（strict less-than）ことがテストで保証済み。`pruneLlmCallLog.ts` は `now - 48h` で cutoff を計算し、表示窓 24h < 保持窓 48h（AC-6）を満たす。ISO8601 辞書順 = 時刻順なので text 比較の範囲削除は正しく働く。`mapDbError` で driver エラーを共有契約へ変換しており、best-effort の握り潰しは呼び出し側（usecase）に正しく委譲されている（アダプタは throw、call-site が swallow）。

#### N-003: `usageMetricsProvider` の LLM hourly / scalar が Round 1 指摘どおり `windowStartIso()` に統一され `scalar === sum(series)` が成立

- 場所: `usageMetricsProvider.ts:90`（hourly の `gte`）/ `:146`（scalar の `gte`）— いずれも同一 `windowStartIso()`（= `floorToHourUtc(now) - 23h`）を下限に使用。
- Round 1 W-001 で指摘された「scalar が exact `now-24h` sliding だと系列下限と最大 1h ずれて合計不一致」は解消。`collectLlmCallsToday()` と `fillBuckets()` が同じ hour-aligned 下限を共有するため、境界条件によらず scalar と系列合計が一致する。integration テスト（`usageMetricsProvider.integration.test.ts:229-249`）が `windowStartIso` 直上/直下の境界行と `scalar === seriesTotal` を明示検証しており、ADR-004 の不変条件をカバー。

#### N-004: substr UTC bucket・0 埋め・null degrade が upload 系列と同型で正しい

- 場所: `usageMetricsProvider.ts:79-130`。
- `substr(occurred_at,1,13)`（"YYYY-MM-DDTHH"）が `hourBucketKey`（`toISOString().slice(0,13)`）と桁一致。`fillBuckets` で 24 本連続 UTC hour bucket を 0 埋め（ADR-010 のヘルパー集約で upload/LLM 両系列の bucket 境界が必ず一致、テスト L214-217 で検証）。partial-failure は try/catch で当該値のみ `null` degrade・他値は維持（テスト L258-269）。他 scalar（userCount/storage*/uploadsToday）は `null` 固定維持（AC-7、テスト L170-184）。SQL は drizzle のカラム参照（識別子）+ `gte` のパラメータ化で組み立てられ、ユーザ入力経路が無いため SQL インジェクションの懸念なし。

#### N-005: migration 0020 と schema.ts が完全一致・UTC/型/idempotency が設計どおり

- 場所: `migrations/0020_llm_call_log.sql` / `schema.ts:878-889`。
- カラム（`id` PK text / `owner_id` text / `provider` text / `occurred_at` text / `created_at` integer）と index（`idx_llm_call_log_occurred_at`）が DDL と drizzle 定義で一致。`event_id` / unique 制約なし（ADR-008、同期 best-effort で冪等キー不要）。`IF NOT EXISTS` 付き手動 migration は先例 0018（activity_log / ingestion_burst_log）と同パターンで一貫。occurred_at の ISO8601 text 化で UTC を表現（DDL は静的 DDL なのでインジェクション無関係）。最新採番 0019 の次として 0020 で衝突なし。

---

## まとめ

- Round 2 ゼロベースで再点検した結果、**Blocker なし**。実装・migration・テストは plan / ADR（特に ADR-004/005/007/008/010）に忠実で、Round 1 の scalar 窓統一も反映済み。typecheck + 対象 integration テストは green。
- 唯一の改善余地は W-001（`llm_call_log` を global `setup.ts` に登録し per-file delete を一本化）。機能には影響しないが、高頻度テーブルのクリーン規約の非対称を解消し将来の flaky を予防するため、マージ前または fast-follow での対応を推奨。
