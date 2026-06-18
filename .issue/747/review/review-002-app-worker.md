# PR Review #002 — Application / Worker（再レビュー）

**PR:** #759
**Date:** 2026-06-18
**Round:** 2回目（Round 1 修正後）
**観点:** Application / Worker ロジック

## サマリー

- Blockers: 0 / Warnings: 0 / Notes: 4
- Verdict: **APPROVED**（Application / Worker 観点）

Round 1 の W-001（observability の非対称）は `runPruneTick.test.ts` の追加で適切に閉じた。AC-1〜AC-5 はすべて充足。ADR-001/002/003 の設計判断も妥当。

---

## Application / Worker

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** W-001（observability 非対称）の閉じ方が適切 — `app/worker/cloudflare/__tests__/runPruneTick.test.ts:98-111`
  Round 1 の指摘は「processed-events prune の失敗（swallow）が `processedEventsDeleted=0` と区別できない」。本実装の回答は「count は 0 のままだが `error` ログで区別する」（`handlers.ts:119-123`）であり、新規 unit test がまさにこの契約を検証している（rejection 時に `processedEventsDeleted===0` **かつ** `error` ログ1件が `/processed-events prune failed/` にマッチ、さらに下流 activity prune が独立に走る）。observability は error ログで担保され、テストがそれを固定した。W-001 は正しく閉じている。

- **[N-002]** 新規テストの mock 設計が実装契約を正しく検証している — `app/worker/cloudflare/__tests__/runPruneTick.test.ts:46-71`
  内側 prune 関数を partial mock（`importOriginal` で実 export を温存し prune 関数のみ差し替え）にしている点が正しい。`env.ts` が `DEFAULT_*` retention 定数をこれらのモジュールから import するため、full mock だと定数が消えて `readPruneTuning` のスキーマ default が壊れる。コメント（43-45行）にこの理由が明記されており、partial mock の必然性が将来の読み手に伝わる。4ケース（happy / processed 失敗 swallow / activity 失敗 swallow / outbox 失敗 propagate）が `runPruneTick` の best-effort オーケストレーション契約を漏れなくカバーし、特に「outbox throw 時は post-commit prune が一切走らない」（129-130行の `not.toHaveBeenCalled()`）まで検証している。real-DB happy path は `handlers.integration.test.ts` に分離されており、層の切り分けも妥当。

- **[N-003]** best-effort 境界の設計が CLAUDE.md「worker → root」ポリシーと整合 — `app/worker/cloudflare/handlers.ts:95-131`
  outbox prune を先頭に置き（commit 前なので throw 可＝tick が loud に失敗）、その後の processed-events / activity prune を best-effort swallow にする順序設計が、コミット済み outbox delete を未確定の D1 失敗で巻き戻させないという意図に正しく対応している。JSDoc（96-101行）がこの「commit 前は propagate、commit 後は swallow」の境界と「swallow は 0 count として表面化する」契約を明示しており、worker の per-row tolerance ポリシーに沿う。pruner エントリ（`pruner.ts:15`）は `ctx.waitUntil(runPruneTick(env))` で戻り値を使わないため、戻り値型変更（`{deleted}` → `{outboxDeleted, processedEventsDeleted}`）の本番経路への波及がなく、AC-4 の「outbox 挙動不変」も満たす。

- **[N-004]** retention の意味分離と境界配置が筋良く設計されている — `pruneProcessedEvents.ts:1-33`, `env.ts:31-74`, `idempotencyStore.ts:20-27`
  worker は cutoff 計算（`clock.now() - retentionMs` を一度だけ）+ port 呼び出し + 構造化ログに徹し、ドメインロジックの漏出がない（薄いオーケストレータ）。`pruneTuningSchema` で `processedEventsRetentionMs` を `z.coerce.number().int().positive().default(DEFAULT_...)` として transport 境界で検証し、usecase は static type を信頼する CLAUDE.md の input-validation 方針に沿う。`DEFAULT_PROCESSED_EVENTS_RETENTION_MS=14日` の安全論拠（markProcessed は dispatch 成功直後に書かれ、必要な最長窓 = Queue `message_retention_period`、CF 上限14日）がコメントと port JSDoc に正しく記録され、AC-3 の冪等化正しさ（cutoff ≥ 再配信窓上限）を満たす。ADR-002 の「outbox 監査猶予と processed_events 冪等化境界の意味分離」がコード・wrangler・docs・infra テンプレートまで一貫して反映されている。

---

## AC 充足確認

| # | 基準 | 判定 | 根拠 |
|---|------|------|------|
| AC-1 | retention が定数化＆env で上書き可、既定14日 | OK | `DEFAULT_PROCESSED_EVENTS_RETENTION_MS=1209600000`（`pruneProcessedEvents.ts:14`）、`PROCESSED_EVENTS_RETENTION_MS` を `env.ts:69-74` でパース、`wrangler.toml` / infra テンプレートに設定 |
| AC-2 | daily tick が cutoff より古い行を削除 | OK | `runPruneTick`（`handlers.ts:113-118`）→ `pruneProcessedEvents` → `idempotencyStore.pruneProcessed`、integration test（`handlers.integration.test.ts:296-314`）で検証 |
| AC-3 | cutoff ≥ 再配信窓上限（14日）、新しい行は保持 | OK | 既定14日 = CF Queues 上限、`lt(processedAt, olderThan)` で strict、integration test が古い行のみ削除・新しい行保持を検証 |
| AC-4 | 戻り値 rename・outbox 挙動不変・両テーブル同一 tick | OK | 戻り値 `{outboxDeleted, processedEventsDeleted}`、`pruner.ts` は戻り値未使用、既存 outbox テスト非回帰、`handlers.integration.test.ts:316-337` で両テーブル同一 tick 検証 |
| AC-5 | 削除件数が構造化ログに残る | OK | `pruneProcessedEvents.ts:27-31` で `logger.info` に `{deleted, retentionMs, cutoff}` |

## 設計判断の妥当性

- **ADR-001**（刈り込みを `IdempotencyStore` ポートに置く）: 妥当。`processed_events` の所有ポートに GC 能力を持たせる選択は `OutboxRepository.pruneProcessed` と対称で、`WorkerContainer` に既存の `idempotencyStore` を使うため DI 配線追加が不要。port JSDoc も atomic claim 中心の説明に GC メソッドの責務補足が加わり整合。
- **ADR-002**（retention を outbox と独立）: 妥当。意味（監査猶予 vs 冪等化境界）が異なる2値を別 env var にする判断はコメント・docs まで一貫して根拠が記録されている。
- **ADR-003**（index 見送り）: Application / Worker 観点では追加コメントなし（adapter 観点の判断）。worker 側は日次1回の scan を許容する前提で、ホットな markProcessed INSERT に維持コストを乗せない取引は worker の負荷特性とも整合。
