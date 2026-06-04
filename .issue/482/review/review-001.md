# PR Review #001 — refactor(export): id 入力契約を string に統一する (#482)

**PR:** #488
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 10
- Verdict: **APPROVED**

複雑度「中〜大規模」に対し、Use Case 層・挙動保存 と Presentation 層・依存方向 の2レイヤーで並列レビュー。両レイヤーとも Blocker / Warning ゼロ。1ラウンドでクリーンのため完了。

---

## Use Case 層・挙動保存

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** 4 usecase の入力 `jobId: string` 化と内部 `findById(input.jobId as ExportJobIdBrand)` 橋渡しは基準 `retryExportJob` と完全一致。単一 `as`（`as unknown as` 不使用）。
- **[N-002]** `runExportJob.ts:74` で冒頭一度だけ `const jobId = input.jobId as ExportJobIdBrand` し、以降の `input.jobId` 参照を全て `jobId` に置換済み（参照漏れなし）。`transitionPendingToProcessing`/`failJob`/`assembleAndComplete` の型注釈は domain alias に統一。`assembleAndComplete` は `startedJob.id`（既存 brand）渡しで input 非依存。
- **[N-003]** 空 jobId 検証は worker（`dispatchDomainEvent.ts` の `ExportJobIdVO.create()`）に温存。worker・テストは diff 非対象で無変更。`dispatchDomainEvent.test.ts` の契約（空 exportJobId で runExportJob 未呼出・warn・handled）は維持。ADR-001 通り。
- **[N-004]** presentation 4 ファイルから domain `ExportJobId` import 除去を確認。全 entry の `jobId` は `z.string().min(1)` で transport 検証済みのため内部の単一 `as` 橋渡しは安全。挙動変更ゼロ。

## Presentation 層・依存方向

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** `@/core/domain/export/valueObject` の `ExportJobId` import と剥がしキャストは presentation 4 ファイルから完全除去（grep 空）。`$jobId.tsx` の `as unknown as ExportJobId` も `jobId={data.jobId}` に解消。
- **[N-002]** route → Page → loader の `jobId: string` チェーンが一貫し、`admin/Jobs/action.ts` の前例と完全整合。
- **[N-003]** `ExportForm/action.ts` のスコープ切り分けは妥当。`ExportJobId` のみ除去、`NoteId` import は正しく残存。
- **[N-005]** スコープ外の `loader.ts` の `UserId` import は計画で明示的にスコープ外（別 Issue 候補）。本 PR で新たな漏れは増やしておらず、依存方向は改善のみ。
- **[N-006]** `pnpm typecheck` クリーンパス確認。

---

## Design Decisions

特になし（計画時の ADR-001「runExportJob の空 jobId 検証を worker に残す」を実装が踏襲していることを再確認）。
