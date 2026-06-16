# PR Review #002 — feat(admin): #595 P40 ダッシュボード 24h チャート + 最近のアクティビティ backend 新設

**PR:** #746
**Date:** 2026-06-17
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 22
- Verdict: **BLOCKED**（残 Warning 1 件 + ROI 高い Notes を直す要修正ラウンド）

## レイヤー別ファイル

- Domain: review-002-domain.md（B: 0 / W: 0）— 前回 W-001 解消確認
- Use Case / Application: review-002-usecase.md（B: 0 / W: 1）
- Adapter / Infrastructure: review-002-adapter.md（B: 0 / W: 0）— 前回 W-001/W-002/W-003 解消確認
- Frontend: review-002-frontend.md（B: 0 / W: 0）— 前回 N-001〜005 解消・Jobs 回帰なし確認
- Test: review-002-test.md（B: 0 / W: 0）— 前回 W-001/W-002/N 群 解消確認

## 指摘一覧

### Blockers
- なし

### Warnings（このPRで直す）
- [usecase W-001] `resetDesignTokens` の no-op ガードが dead code（ドメイン entity が常に新オブジェクト+version bump を返すため、override 無しで reset しても emit + 無駄 bump）— `app/core/domain/adminSettings/entity.ts:364` / `resetDesignTokens.ts`

### Notes（取り込む）
- [test N-001] projection ハンドラの AC-5 フォールバック分岐（failed/userCreated/export の target=raw id・detail 組み立て）が直接未検証 → fake で追加
- [test N-002] adminSettings eventDecoders の zod `.strict()` / settingKind enum round-trip テストが無い → 追加
- [frontend N-101] `RecentActivityRowDTO.severity` がフロント未消費（tone は kind 由来に変更済み）→ 記録用途である旨をコメントで意図固定

### Notes（見送り — 意図的挙動 / スコープ外、記録のみ）
- [usecase N-001] ingestion.created の activity decode が runIngestionJob 後段（jobId は先頭検証済みで実害なし）
- [usecase N-002] 常時 save 系 4 usecase は同値再保存でも emit（ADR「常に save→常に emit」と整合した意図的挙動）
- [usecase N-003 / domain N-006] speech-config DI は #595 別系統の混在（settingKind 整合は取れている）
- [adapter N-009] findOwnerBurst の時間述語なし全件読みは 24h prune で bound / `|| name` は dead branch（設計判断として妥当）
- [test N-003] createConsumerContainer の DI smoke は既存 WorkerContainer repo と同方針で本 PR 固有でない
