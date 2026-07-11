# PR Review #004 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 4回目

## Summary

- Blockers: 0
- Warnings: 8
- Notes: 22
- Verdict: **BLOCKED**（修正対象 Warning 5 / 見送り 3）

## レイヤー別ファイル

- Domain: review-004-domain.md（B: 0 / W: 2）
- Use Case: review-004-usecase.md（B: 0 / W: 2）
- Infrastructure: review-004-infrastructure.md（B: 0 / W: 2）
- Test: review-004-test.md（B: 0 / W: 2）

## 指摘一覧

- [W-001] `updateProfile` の avatar 差し替えにも kind 未検査の attach 経路 — `updateProfile.ts:71-93`（Domain）→ 見送り: 構造的封鎖テーマ（reconcileRefs と同族）に束ねて別Issue
- [W-002] `finalizeUpload` の kind 無差別 re-stamp で sweep アンカーを先送り可能 — `finalizeUpload.ts:66-81`（Domain）→ 見送り: 同上（安全側 deferral・severity 低）
- [W-001] `UploadableMediaKind` 型封鎖が spec 未反映 — `spec/usecases/media.md`（Use Case）→ このPRで修正
- [W-002] finalizeUpload の re-stamp（Domain W-002 と同一） — （Use Case）→ 見送り: 同上
- [W-001] runbook の aws cli にリージョン指定なし — `docs/runtime_cloudflare.md`（Infrastructure）→ このPRで修正
- [W-002] purge コンテナ前提条件の列挙に `R2_OBJECT_BUCKET_NAME` 漏れ — `docs/runtime_cloudflare.md`（Infrastructure）→ このPRで修正
- [W-001] temp 欠損 skip パスが未テスト（row-insert 前の順序不変条件） — `commitIngestionPreview.ts`（Test）→ このPRで修正
- [W-002] id 昇順タイブレークの契約が曖昧（フェイクは主張・ポート JSDoc に記載なし） — （Test）→ このPRで修正（契約昇格）
