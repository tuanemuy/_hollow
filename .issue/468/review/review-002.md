# PR Review #002 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 25
- Verdict: **BLOCKED**（修正対象 Warning あり）

## レイヤー別ファイル

- Domain: review-002-domain.md（B: 0 / W: 2）
- Use Case: review-002-usecase.md（B: 0 / W: 1）
- Infrastructure: review-002-infrastructure.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 3）

## 指摘一覧

- [W-001] ポート契約「oldest-first」をフェイクが未実装 — `app/core/domain/media/__tests__/service.test.ts:84` ほか（Domain）→ このPRで修正
- [W-002] `findAbandonedSourceIntakes` の戻り型を `PendingMedia[]` に絞る — `app/core/domain/media/ports/mediaAssetRepository.ts:65`（Domain）→ このPRで修正
- [W-001] sweep JSDoc の並行安全性論証が厳密には偽（reconcileRefs 経由の attach 経路が存在） — `app/core/application/media/sweepAbandonedSourceIntakes.ts:22`（Use Case）→ このPRで JSDoc の論証を正確化。構造的封鎖（reconcileRefs で pending/source attach 拒否）は見送りテーマに束ねて別Issue
- [W-001] 手動リコンサイル runbook のコマンドが wrangler 4.90.1 に実在しない — `docs/runtime_cloudflare.md:337`（Infrastructure）→ このPRで修正
- [W-001] main UoW の `SystemError(DataIntegrityError)` ガードが未テスト・spec 行なし — `app/core/application/ingestion/commitIngestionPreview.ts:261-266`（Test）→ このPRで修正
- [W-002] rollback / put 失敗テストが outbox 無汚染を assert していない — `ingestion.integration.test.ts:815-830`（Test）→ このPRで修正
- [W-003] 放棄 pending 行が残った状態での再 commit 成功が未 exercise — `ingestion.integration.test.ts:832`（Test）→ このPRで修正
