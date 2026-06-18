# PR Review #002 — feat(worker): #747 processed_events の刈り込み経路を新設

**PR:** #759
**Date:** 2026-06-18
**Round:** 2回目（再レビュー）
**観点:** Adapter / Persistence

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4

ゼロベースで再レビューした。DELETE の正しさ・`mapDbError` 翻訳・ポート契約準拠はいずれも問題なし。ADR-003 で見送った index 判断も、データ破壊・明確な障害リスクには当たらず Blocker / Warning に値しない。

---

### Adapter / Persistence

#### Blockers

なし。

#### Warnings

なし。

ADR-003（`processed_at` index 見送り）を Blocker に格上げできる新しい根拠は見つからなかった。批判的に検証した結論は以下のとおり:

- **データ破壊リスクはない。** index の有無は DELETE の *正しさ* には一切影響しない（scan か seek かの違いだけ）。`lt(processedEvents.processedAt, olderThan)` の述語は index がなくても同じ行集合を削除する。冪等化の正しさを左右するのは cutoff の値であって index ではない。よって「データ破壊・明確な障害リスク」という Blocker の閾値を満たさない。
- **手本との一貫性の主張は事実として正しい。** `outbox_events` 唯一の index `idx_outbox_pending` は `WHERE processed_at IS NULL AND failed_at IS NULL` の**部分 index**（`schema.ts:42-44`）であり、prune の述語（`processed_at IS NOT NULL AND processed_at < cutoff`、`outboxRepository.ts:217-222`）は部分 index の対象外。したがって既存 outbox prune も実際に full scan で運用されており、ADR-003 の「手本も index なし full scan」は虚偽ではない。両者を別方式にしないという判断は一貫している。
- **ホットパス影響の見立ても妥当。** `markProcessed` の INSERT（`idempotencyStore.ts:28-37`）は高頻度経路で、index を1本増やせば全 INSERT がその維持コストを負う。日次1回の scan を避けるためにホットパスを恒常的に重くする取引は、現時点では割に合わないという判断は合理的。`processed_at` が単調増加で append-mostly な点も、仮に将来 index を張る場合の維持コストが小さいことを示すが、それは「今張るべき」根拠にはならない。
- 実運用で肥大が問題化した場合の出口（別Issueで outbox と合わせて index + バッチ分割）も Consequences に明記されており、見送りの判断・撤回条件・撤回時の作業範囲がすべて文書化されている。投機的最適化を避けるという判断はこのプロジェクトのスコープ規律（plan.md「スキーマ変更・マイグレーションなし」）とも整合する。

#### Notes

- **[N-001]** DELETE 述語が strict `<`（`lt(processedEvents.processedAt, olderThan)`、`idempotencyStore.ts:43`）で、ポート JSDoc の "stamped strictly before `olderThan`"（`ports/idempotencyStore.ts:21-27`）と integration test の cutoff 境界ケース（`idempotencyStore.integration.test.ts:94-115`、cutoff ちょうどの行は保持）が三者一致している。境界の扱いが契約・実装・テストで揃っており、再配信窓の上限を「以上」で保証する AC-3 の安全側（cutoff ちょうどの行を消さない）に倒れている。

- **[N-002]** `mapDbError("Failed to prune processed events", …)`（`idempotencyStore.ts:40`）で DELETE をラップし、driver 例外を `SystemError(DatabaseError)` / `ConflictError` に翻訳している。`outboxRepository.pruneProcessed`（`outboxRepository.ts:214`）と同型で、adapter → application のエラー契約（CLAUDE.md「adapter → application」）を守っている。`.returning({ id })` の長さで削除件数を返す方式も手本と完全に対称。

- **[N-003]** `outbox_events` には quarantine（`failed_at`）概念があるため prune に `isNotNull(processedAt)` 条件が要るが、`processed_events` は成功 dispatch 後にのみ INSERT される（`markProcessed` 唯一の書き込み経路）ため `processed_at` は常に notnull（`schema.ts:48-51`）。よって prune 述語から `isNotNull` を正しく省いている。手本を機械的にコピーせず、テーブルのセマンティクス差を踏まえた適切な逸脱。

- **[N-004]** ポート契約準拠が良好。`IdempotencyStore.pruneProcessed(olderThan: Date): Promise<{ deleted: number }>`（`ports/idempotencyStore.ts:27`）は `OutboxRepository.pruneProcessed` と同一シグネチャで、JSDoc に「queue の最大再配信窓を超える cutoff を渡す責務は caller 側」と冪等化の正しさを壊さない前提を明記。adapter 実装はこの契約を過不足なく満たし、cutoff 計算（再配信窓との比較）を application 層（`pruneProcessedEvents.ts:25`）に正しく押し上げている。`processed_at` が timestamp_ms（`schema.ts:50`）で、drizzle が `Date` を ms 整数に変換する点も既存 `outbox_events` と整合。
