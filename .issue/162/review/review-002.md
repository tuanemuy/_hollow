# PR Review #002 — feat(media): retry stuck `deleting` orphans in purge sweep

**PR:** #352
**Date:** 2026-05-30
**Round:** 2回目（fix 検証 + 敵対的再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 1（spec 同期の取りこぼし — review-001 のスコープ外で発覚）
- Notes: 少数（スタイルのみ）
- Verdict: **BLOCKED → 修正済み**（W-1 対応後 APPROVED 見込み）

---

## fix 検証（review-001 の指摘解消確認）

- **W-002**（`media.purged` 二重発火を ADR-003 に未記載）→ 解消。ADR-003 Consequences に追記。
- **W-1**（resume で `media.deleting` 再発火なし／`media.purged` 1回をテスト pin）→ 解消。`purgeOrphans.integration.test.ts` で outbox 行を `aggregateId` フィルタ付きで件数アサート。再 mark リグレッションが入れば fail する。
- **N-1**（testing.md 冪等性根拠誤記）→ 解消。(a) R2 delete が NotFound でも成功 / (b) 1st UoW の null ガード、の 2 点に訂正。
- **N-2**（`MediaService.purge` JSDoc の "swallowed" 誤記）→ 解消。「propagate」「storage delete を先に実行」に修正。

## 敵対的再レビュー（独立視点）

### Blockers
なし

### Warnings
- **[W-1]** spec 同期の不完全 / `spec/domains/media.md:61,71`, `spec/usecases/media.md:107` / 確信度: 高
  - 本 PR は `[spec-sync]` Issue。コードのリネーム（`findOrphansOlderThan`→`findPurgeableOlderThan`、`listOrphanCandidates`→`listPurgeCandidates`）が domain/usecase の spec に未反映で、旧名と旧フロー（deleting 再開なし）が残っていた。
  - → **対応済み**: 両ファイルを新名称・新フロー（`status IN ('orphan','deleting')`、deleting 行は markDeleting skip で再開、再試行上限なし）に更新。

### Notes
- **[N-1]** retry テストの `void orphanId` は不要（assert で使用）になったため除去済み。混在バッチテストの `void` は id 未使用のため file 既存スタイルどおり残置。
- **[N-2]** outbox アサートの `aggregateId` フィルタは単一行シナリオで正しく機能。
- ADR-003「猶予期間=リース」不変条件・failed/purged カウント・recoverable 分類・スキーマ整合・時刻計算、いずれも健全と独立確認。

---

## Design Decisions
- spec-sync の本旨に従い、testcases だけでなく domain/usecase spec のメソッド名・処理フローも実装に同期（W-1 対応）。
