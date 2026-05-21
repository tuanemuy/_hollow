# PR Review #002 — feat(issue-57): wire queue consumer to runIngestionJob / runExportJob

**PR:** #108
**Date:** 2026-05-21
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1 → 修正反映済み
- Notes: 多数（前 round からの解消確認）
- Verdict: **APPROVED**（W-001-A は本ラウンドで JSDoc 追記により解消）

---

## Application / Use Case

### Blockers
なし

### Warnings
なし — 前 round の W-002〜W-007 すべて解消（ADR / JSDoc / unit test で対応済み）

### Notes
- W-002 解消: VO factory throw の境界が JSDoc + コードコメントで明示
- W-003 解消: `isBusinessRuleError` 分岐 + `logger.warn` + unit test 2 ケース追加
- W-004 解消: `skipped` distinct tag の理由が JSDoc に明示
- W-005 解消: `as unknown as IngestionJobIdDTO` キャストのコメント追加
- W-006 解消: `EXPORT_JOB_NOT_FOUND` の防御コード性が ADR-005 + JSDoc で明示
- W-007 解消: `createConsumerContainer` の SSR config dead weight + RELAY missing が Implementation notes に明記

## Adapter / Infrastructure

### Blockers
なし

### Warnings
なし — 本ラウンドで `createConsumerContainer` の JSDoc に「2 つの drizzle handle が同一 D1 binding を share する」旨を追記して解消

### Notes
- W-001-A 解消（本 round）: createConsumerContainer JSDoc に "the two sub-builders each call `getDatabase(env.DB)` internally, yielding two `drizzle()` handles over the **same** D1 binding. Drizzle holds no per-handle connection state and D1 has no connection pool, so the request- and worker-side ports see the same store" を追記
- W-002-A 解消: RELAY missing も同 JSDoc に明示
- W-003-A: hasProcessed integration test の並行性ケース強化は scope 外 / 別 Issue 候補（前 round で defer 承認済み）

## Worker / Integration

### Blockers
なし — 前 round の B-001 は本 round で解消（ADR-003 / ADR-005 / handleQueue JSDoc / 統合テストの三方で limitation を encoding）

### Warnings
なし

### Notes
- B-001 解消: handleQueue JSDoc に "Known limitation" セクション追加。ADR-003 / ADR-005 に「既知の限界」明記。integration test (lines 617-668) が `processing` 状態に固定化される behavior を明示的に assert（redelivery で `suggestMetadata` が呼ばれないことを spy で確認）
- W-001-W 解消: `hasProcessedSpy` + `markProcessedSpy` で dedup branch traversal を verify

## Test

### Blockers
なし

### Warnings
なし

### Notes
- W-001-T 解消: BusinessRuleError / payload-drift unit test (ingestion + export) 追加
- W-002-T 解消: integration test に redelivery batch を追加し、dispatch 再エントリを verify
- W-003-T 解消: `jobs.status === "processing"` を retry 後 + redelivery 後の両方で assert
- W-004-T 解消: export 側 `LLMRateLimitError → retry` の unit test 追加
- W-005-T: `placeholderNoteId = jobSeq + 1` は minor のため Note 留め（scope 外）

---

## Design Decisions

- ADR-003 が「**既知の限界**」を encoding することで、本 PR のスコープと limitation が明確になった
- ADR-005 が `BusinessRuleError → handled` の分類を明示
- createConsumerContainer JSDoc が SSR config dead weight + missing RELAY binding + double drizzle handle の 3 つの実装上の妥協点を明示

---

## Verdict

**APPROVED**. すべての Blocker と Warning が解消された。残課題は別 Issue 候補:
- `hasProcessed` integration test の並行性ケース強化（W-003-A）
- `seedPendingExportJob` の placeholder noteId 改善（W-005-T）
- `runIngestionJob` の `processing` からの再エントリ可能化（B-001 が示した既知の限界の根本解消）
- `wrangler.toml [env.consumer]` への R2 / LLM / RELAY binding 追加（plan.md / ADR で別 Issue として明記済み）
