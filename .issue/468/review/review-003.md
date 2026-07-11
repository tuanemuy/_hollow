# PR Review #003 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 3回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 30
- Verdict: **BLOCKED**（修正対象 Warning あり — いずれも軽量）

## レイヤー別ファイル

- Domain: review-003-domain.md（B: 0 / W: 0）
- Use Case: review-003-usecase.md（B: 0 / W: 1）
- Infrastructure: review-003-infrastructure.md（B: 0 / W: 2）
- Test: review-003-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] ADR-004 の sweep 安全性前提（pending source は commit フロー内でのみ生成）が transport 境界の zod のみで守られている — `UploadMedia(Presigned)Input` の kind を `Exclude<MediaKind, "source">` に型レベル封鎖（Use Case）→ このPRで修正
- [W-001] secrets.ts の ADR-007 コメントが pruner 除外後の実態と不一致 — `infra/src/secrets.ts:77-81`（Infrastructure）→ このPRで修正
- [W-002] runPruneTick JSDoc のステップ列挙に media hygiene ペアが未反映 — `app/worker/cloudflare/handlers.ts:123-131`（Infrastructure）→ このPRで修正
- [W-001] tag-merge 失敗分離テストが media hygiene ペアの後続実行を assert していない — `runPruneTick.test.ts`（Test）→ このPRで修正
- 参考: [N-003] runbook の `r2 object delete` に `--config` 欠落（Infra）/ [N-005] `expect(uowRuns).toBe(3)` 追加（Test）/ [N-006] batchSize パススルー assert（Test）→ 軽微なので同時に対応
