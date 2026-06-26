# PR Review #001 — feat(tag): #580 タグ統合を非同期ジョブ化し determinate 進捗バナーを供給

**PR:** #782
**Date:** 2026-06-26
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 10
- Notes: 26
- Verdict: **BLOCKED**（Blocker は無いが、修正対象の Warning が残るため次ラウンドへ）

## レイヤー別ファイル

- Domain: review-001-domain.md（B: 0 / W: 1）
- Application: review-001-application.md（B: 0 / W: 2）
- Adapter/Infra: review-001-adapter.md（B: 0 / W: 1）
- Frontend: review-001-frontend.md（B: 0 / W: 3）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧と仕分け

### 直す（このPR）
- [Domain W-001] `recordProgress` が processed 前進のみを強制しない — `entity.ts:125-139` / `valueObject.ts:63-86`
- [Adapter W-001] リーダ不在の `idx_tag_merge_jobs_owner_status`（owner 非列挙設計と矛盾） — `schema.ts:680` / `0021_tag_merge_jobs.sql:38`
- [Frontend W-001] 実行中にダイアログを閉じると完了が一覧へ反映されず source タグ残留 — `MergeTagDialog.tsx:228-230` / `TagList.tsx:159-163`
- [Frontend W-002] ポーリング一過性エラーで即打ち切り＋誤エラー表示（IngestionQueue は transient を許容） — `MergeTagDialog.tsx:116-122`
- [Frontend W-003] ポーリングに give-up/タイムアウト上限が無く processing 固着で無期限 — `MergeTagDialog.tsx:89-136`
- [Test W-001] 複数バッチの中間進捗（AC-2 核心: 0<processed<total・中間 commit）が未検証 — `runTagMergeJob.ts` / `tagMergeJob.integration.test.ts`
- [Test W-002] runner 失敗パス（catch→failJob→status=failed, AC-6 バックエンド）未検証 — `runTagMergeJob.ts:90-98,281-301`
- [Test W-003] enqueue 時の `tag.merge.requested` outbox 発火（AC-1 起点）未アサート — `tag.integration.test.ts`

### 見送り（意図的・記録済み）
- [Application W-001] 並走二重ジョブの note-save OCC→terminal failed（source-delete のみ冪等寛容）。ADR-007#3 で意図的・低確率。ADR 注記を補強して維持。
- [Application W-002] 他オーナー拒否が Unauthorized(422) で plan の「NotFound/Forbidden」文言と差。`getExportJob` と完全同形・機密漏洩なし・UUIDv7 で jobId 列挙不可。確立パターン整合のため維持（ADR 注記）。
