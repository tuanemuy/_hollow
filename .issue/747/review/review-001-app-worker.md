# PR #759 レビュー — Application / Worker ロジック観点（round 1）

対象 PR: #759
実装計画: `.issue/747/plan.md` / 設計判断: `.issue/747/adr.md`
レビュー視点: Application / Worker ロジック（retention 正しさ・`runPruneTick` 制御フロー・薄いオーケストレータ・env 配線・CLAUDE.md 規約適合）

---

## 受け入れ基準の検証

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 retention 定数 + env 上書き、既定 ≥ 14日 | ✅ | `DEFAULT_PROCESSED_EVENTS_RETENTION_MS = 14 * 24 * 60 * 60 * 1000`（`pruneProcessedEvents.ts:14`）。`PROCESSED_EVENTS_RETENTION_MS` を `TuningEnv` / `ServerEnv` / `pruneTuningSchema` / `readPruneTuning` で配線。`serverCloudflare.test.ts` が default fallback / coerce / 独立 default / 非正・非数値 reject を網羅。 |
| AC-2 daily tick が cutoff より古い行を削除 | ✅ | `runPruneTick` が `pruneProcessedEvents` を同一 tick で呼ぶ（`handlers.ts:114-118`）。adapter は `lt(processedEvents.processedAt, olderThan)` で DELETE（`idempotencyStore.ts`）。 |
| AC-3 cutoff ≥ 再配信窓上限、新しい行は残す | ✅ | 既定 14日 = CF Queues message-retention 上限。`lt`（strictly-before）で cutoff ちょうどの行は保持。integration テスト `deletes only records stamped strictly before the cutoff` が境界を pin。 |
| AC-4 戻り値 rename・outbox 挙動不変・両テーブル同一 tick | ✅ | 戻り値 `{ outboxDeleted, processedEventsDeleted }`。`pruneOutbox` のロジック・引数は不変（`retentionMs: tuning.retentionMs`）。既存 outbox テストは `result.outboxDeleted` に更新のみで削除件数の期待値は不変。`sweeps outbox and processed_events in the same tick` で両刈り込みを検証。 |
| AC-5 削除件数を構造化ログ | ✅ | `pruneProcessedEvents.ts:18-22` が `logger.info` に `{ deleted, retentionMs, cutoff }`。`pruneProcessedEvents.test.ts` がログ内容・0件時のログを検証。 |

全 AC を満たしている。

---

### Application / Worker

#### Blockers

なし。

#### Warnings

- **[W-001]** processed-events prune 失敗が結果上は「削除0件」と区別不能（observability の曖昧さ）
  - 場所: `app/worker/cloudflare/handlers.ts:113-123`（および JSDoc `handlers.ts:100-101`）
  - 理由: best-effort catch の設計自体は妥当（outbox commit 後に prune 失敗で tick を巻き戻さない方針は正しい）。ただし catch 節で `processedEventsDeleted` は初期値 `0` のまま返るため、戻り値の `{ processedEventsDeleted: 0 }` が「刈る対象が0件だった（正常）」なのか「prune が例外で失敗した（異常）」なのかを呼び出し側・ログ集約側から判別できない。`processed_events` は冪等化の正しさに直結し、無制限増大の歯止めが本Issueの目的なので、「毎日 prune が静かに失敗し続けてテーブルが増え続ける」状態が `error` ログ1行だけで、daily の成功サマリ上は `0` として埋もれるのは検知性が弱い。outbox prune は失敗時に throw して tick 全体を落とす（= アラート可能）のと非対称。
  - 提案: 戻り値で失敗を表現できるようにする。例えば `processedEventsDeleted: number | null`（失敗時 `null`）にするか、`{ ok: boolean }` 相当のフラグを足す。最小対応なら、catch 時の `logger.error` を運用アラートが拾える明確な文言・メタにし、JSDoc の「surfaces as a `0` count」が「正常な0と区別できない」既知の制約であることを一言補足する。少なくとも本Issueの「無制限増大の歯止め」という目的に照らし、prune の継続失敗が可視化される経路を一つ確保したい。

#### Notes

- **[N-001]** best-effort try/catch の配置・順序が正しい。outbox prune を先頭・try 外に置き（commit 前なので throw 許容 = アラート可能）、processed-events と activity-log を後段で個別 try/catch するのは、CLAUDE.md「worker → root」の per-row 部分失敗耐性ポリシーに整合。processed-events 失敗が後続の activity-log prune を巻き込まないよう catch が独立しているのも適切。JSDoc（`handlers.ts:82-102`）が「なぜ outbox は throw 許容で後段は swallow か」を明示しており設計意図が追える。

- **[N-002]** worker が薄いオーケストレータに徹している。`pruneProcessedEvents`（`pruneProcessedEvents.ts`）は cutoff 計算 + adapter 呼び出し + ログのみで、`outboxPrune.ts` と完全対称。ドメインロジックの漏出なし。retention の安全性根拠（14日 = CF Queues 上限、outbox の監査猶予とは別目的）が定数直上のコメントに明記され、plan review round-1 の P-001（7日→14日修正）が正しくコードへ反映されている。

- **[N-003]** ポート配置が ADR-001 どおり。`pruneProcessed` を `IdempotencyStore`（`processed_events` 唯一の所有経路）に追加し、`OutboxRepository.pruneProcessed` と同一シグネチャ `(olderThan: Date) => Promise<{ deleted: number }>`。ポート JSDoc（`idempotencyStore.ts:20-26`）が「呼び出し側は再配信窓を超える cutoff を渡す責務」を明示し、冪等化破壊の前提条件を契約として残している。`WorkerContainer` は既に `idempotencyStore` を保持しており DI 追加なしという ADR の主張も実態と一致。

- **[N-004]** env 配線が網羅的・整合的。`TuningEnv`（`env.ts:20`）/ `ServerEnv`（`serverCloudflare.ts:324`）/ `pruneTuningSchema`（`processedEventsRetentionMs`、`z.coerce.number().int().positive().default(...)`）/ `readPruneTuning`（`env.PROCESSED_EVENTS_RETENTION_MS` を渡す）まで一貫。`PruneTuning = z.infer<typeof pruneTuningSchema>` なので新フィールドが型へ自動伝播し、`handlers.ts` の `tuning.processedEventsRetentionMs` 参照が型安全。`wrangler.toml` に加え `infra/templates/wrangler.{staging,production}.toml.tmpl` 両テンプレートにも `PROCESSED_EVENTS_RETENTION_MS = "1209600000"` を追加済みで、デプロイ stage 間の漏れがない。

- **[N-005]** 戻り値型変更の波及が想定どおりテストのみ。`grep -rn "runPruneTick"` で `pruner.ts`（`ctx.waitUntil` で戻り値未使用 = 本番経路無影響）と `handlers.integration.test.ts`（更新済み）のみ。`inlineRelayTrigger.test.ts` / `consumeIndexJob.test.ts` / `handleEvents.test.ts` / `outboxPrune.test.ts` / `processIndexJobs.test.ts` の `IdempotencyStore` モックにも `pruneProcessed` スタブを追加し、ポート拡張に伴う型コンパイル漏れを潰している。

- **[N-006]** （参考・非ブロッカー）`runPruneTick` の `override?: Partial<PruneOutboxOptions>` は従来 `...readPruneTuning(env), ...override` だったのが `retentionMs: tuning.retentionMs, ...override` に変わった。`PruneOutboxOptions` は `retentionMs` のみで `override` は引き続き outbox 側 retention を上書きできるため挙動は不変。`override` が processed-events / activity-log には届かない点は従来同様で、テスト用途（outbox 刈り込みの retention 注入）に閉じており問題なし。`pruneProcessedEvents` 側に override 注入経路がないことは現状のテストが既定 retention 前提で書かれているため許容。

---

## 総評

計画・ADR との整合性は高く、AC-1〜AC-5 すべて実装・テストでカバーされている。retention 14日 の冪等化正しさの論証は CF Queues 仕様に沿って正しく、plan review で指摘された 7日→14日 の誤りも修正済み。best-effort try/catch の配置・順序、薄いオーケストレータ化、ポート配置、env 配線、cross-layer catch policy すべて CLAUDE.md 規約に適合する。Blocker なし。唯一 W-001（prune 失敗の可視性が「0件」と区別不能）が無制限増大の歯止めという目的に照らして検知性が弱く、改善余地として残る。

- Blockers: 0
- Warnings: 1
- Notes: 6
