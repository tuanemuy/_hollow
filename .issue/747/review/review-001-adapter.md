# レビュー #759 — Adapter / Persistence 観点

対象: PR #759 / Issue #747（`processed_events` の刈り込み経路を新設）
レビュー範囲: `D1IdempotencyStore.pruneProcessed` および永続化まわりの整合性

## サマリー

`D1IdempotencyStore.pruneProcessed` は `outboxRepository.pruneProcessed` の手本を忠実に踏襲しており、DELETE のセマンティクス・件数取得・`mapDbError` ラップ・ポート契約準拠のいずれも正しい。Blocker はなし。性能（index）に関する Warning が 1 件、その他は Note。

---

## Adapter / Persistence

### Blockers

なし。

### Warnings

- **[W-001]** `processed_events.processed_at` に index が無く、刈り込み DELETE が full table scan になる
  - 場所: `app/core/adapters/d1/schema.ts:48-51`（`processedEvents` 定義）/ DELETE 述語は `idempotencyStore.ts:43`（`lt(processedEvents.processedAt, olderThan)`）。migration 0000_initial.sql:34-37 でも `id` PK のみで `processed_at` への index は無い。
  - 理由: `DELETE FROM processed_events WHERE processed_at < ?` は `processed_at` に index が無いため全行スキャンになる。plan のリスク節が指摘する通り `processed_events` は `user.created` / `ingestion.*` / `note.*` など高頻度イベント**全件**を積むテーブルで、初回 sweep 時の行数オーダーは `outbox_events`（dispatch 済みのみ・quarantine 除外）より大きくなりうる。スキャン対象が大きいほど D1 の単一文 DELETE の実行時間・サブリクエスト制限に当たるリスクが高い。
  - 補足（手本との比較）: `outboxRepository.pruneProcessed`（`outboxRepository.ts:213-226`）も述語は `processed_at < olderThan` で、既存の partial index `idx_outbox_pending`（`schema.ts:42-44`、`WHERE processed_at IS NULL AND failed_at IS NULL`）は **pending 行専用**であり「processed 済みかつ古い行」を絞る用途には効かない。つまり outbox 側も prune は index 非効率という意味では同条件で、本実装が「手本と同方式」である点は一貫している。ただし `processed_events` は積み上がる絶対量が大きいぶん影響が出やすい。
  - 提案: schema 変更なし方針は plan の判断として支持するが、(a) `processed_at` への index 追加を別 Issue として残す、または (b) 初回 sweep を段階的に流す運用注意を docs（`docs/runtime_cloudflare.md` の pruner 節）かリスク節に一行残しておくと運用引き継ぎが安全。本 PR をブロックする必要はない。

### Notes

- **[N-001]** DELETE のセマンティクス・件数取得・エラー翻訳はすべて正しい。
  - 場所: `idempotencyStore.ts:39-47`。
  - `lt(processedEvents.processedAt, olderThan)` は strictly-before（`<`）で、ポート JSDoc（`ports/idempotencyStore.ts:21-27`「Deletes rows stamped strictly before `olderThan`」）と一致。cutoff ちょうどの行は保持される。これは AC-3（再配信され得る新しい行 = cutoff 以降は削除しない）を満たす。境界挙動は integration test で `new Date(50_000)` の行が残ることを明示検証済み（diff の `idempotencyStore.integration.test.ts:516-531`）。
  - `.returning({ id: processedEvents.id })` の `rows.length` で件数取得 → `{ deleted: number }`。`outboxRepository.pruneProcessed` と完全同型。
  - `mapDbError("Failed to prune processed events", …)` でラップしており、driver ネイティブエラー（D1/SQLite）は application 層に漏れず `SystemError(DatabaseError)` / `ConflictError` に翻訳される。adapter→application の catch ポリシーに準拠。

- **[N-002]** ポート実装契約への準拠が完全。
  - 戻り値型 `Promise<{ deleted: number }>` はポート `IdempotencyStore.pruneProcessed`（`ports/idempotencyStore.ts:27`）と一致し、`OutboxRepository.pruneProcessed`（`ports/outboxRepository.ts` 同シグネチャ）と対称。ADR-001 の「同一シグネチャで対称性を保つ」判断どおり。例外契約も `mapDbError` 経由の `ApplicationError` サブクラスのみで、ポート利用側（`pruneProcessedEvents` worker）は driver 例外を意識しなくてよい。

- **[N-003]** timestamp_ms ⇔ Date のマッピングは正しい。
  - 場所: `schema.ts:50`（`processedAt: integer("processed_at", { mode: "timestamp_ms" }).notNull()`）。drizzle の `timestamp_ms` モードは `Date` ⇔ epoch ミリ秒 INTEGER を双方向変換するため、`lt(processedEvents.processedAt, olderThan)` に渡す `olderThan: Date` は `olderThan.getTime()` 相当の INTEGER として比較され、列の格納値（同じく ms INTEGER）と整合する。`markProcessed` 側も `processedAt: this.clock.now()`（Date）で書いているため格納と比較の単位が一致しており、ms/秒の取り違えは無い。integration test も `new Date(1_000)` 等の Date リテラルで挿入・比較しており、マッピングを実 DB で検証している。
  - `processed_at` は `notNull` なので、`outboxRepository.pruneProcessed` が必要とする `isNotNull(processedAt)` ガードは `processed_events` では不要。plan / ADR の「quarantine 列なし → 除外条件不要、`lt` 単体でよい」判断は schema と一致しており正しい。

- **[N-004]** import の追加は最小（`eq` → `eq, lt`）で過不足なし。`and` / `isNotNull` は不要なので入れていない点も適切（`idempotencyStore.ts:1`）。

- **[N-005]** 大量 DELETE の負荷についてはバッチ分割せず単一文方式で `outbox` に揃える判断は、パターン一貫性の観点から支持できる。W-001 と重複するが、定常運用（初回後の daily 増分）では軽微である一方、初回 sweep のみ注意が要る、という温度感は plan のリスク節に既に記載済み。
