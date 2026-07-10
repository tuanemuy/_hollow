# PR Review #001 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 1回目

## Summary

- Blockers: 1
- Warnings: 8
- Notes: 22
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Domain: review-001-domain.md（B: 0 / W: 2）
- Use Case: review-001-usecase.md（B: 0 / W: 2）
- Infrastructure: review-001-infrastructure.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 1 / W: 2）

## 指摘一覧

- [B-001] put 失敗経路が commitIngestionPreview 経由で無テスト — `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:736`（Test）→ このPRで修正
- [W-001] `SourcePersist.mediaId` raw string + `as MediaAssetId` cast — `app/core/application/ingestion/commitIngestionPreview.ts:258-259,370-372`（Domain）→ このPRで修正
- [W-002] `PendingMedia` JSDoc に updatedAt の新セマンティクス未反映 — `app/core/domain/media/entity.ts:36-43`（Domain）→ このPRで修正
- [W-001] sweep fresh ガードの安全根拠が未文書化 — `app/core/application/media/sweepAbandonedSourceIntakes.ts:86`（Use Case）→ このPRで修正（文書化）
- [W-002] `uploadMedia` JSDoc の虚偽記述未修正 + ADR-002 の記載精緻化 — `app/core/application/media/uploadMedia.ts:36`（Use Case）→ このPRで修正
- [W-001] purge 回収スループットが 100行/日で頭打ち — `app/worker/cloudflare/handlers.ts:224`（Infrastructure）→ 見送り（別Issue、運用強化テーマ）
- [W-002] malformed 行 1 件で候補列挙が丸ごと throw — `app/core/adapters/d1/repositories/mediaAssetRepository.ts:197`（Infrastructure）→ 見送り（別Issue、同テーマに束ねる）
- [W-001] limit テストが通るだけ — `app/core/domain/media/__tests__/service.test.ts:364-376`（Test）→ このPRで修正
- [W-002] rollback E2E が temp blob 保全を assert していない — `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:777-791`（Test）→ このPRで修正
