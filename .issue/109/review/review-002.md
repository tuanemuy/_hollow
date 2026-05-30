# PR Review #002 — feat(issue/109): auto-re-drive ingestion jobs after LLMRateLimitError

**PR:** #346
**Date:** 2026-05-30
**Round:** 2回目（再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: round 1 指摘の解消確認
- Verdict: **APPROVED**

---

## 再レビュー結果

round 1 の Blocker [B-T1] と全 Warning（W-D1 / W-T1 / W-T2）が適切に解消され、W-U1 は見送り（根拠は review-001 に記録）。新たなバグ・regression・スタイル違反なし。

### 解消確認

- **[B-T1] 解消** — `runIngestionJob.integration.test.ts` の rate-limit rollback test 3本が rollback catch の全分岐を実証。
  - happy rollback: `rejects(LLMRateLimitError)` + `status="pending"` + `version=2` + `tempStorageKey not null`。ミューテーション検証で rollback の save を削ると確実に FAIL（偽陽性でない）。
  - 並行 skip: `onBeforeThrow` で promote 後・pipeline 中に raw discard → `isProcessing` 再確認で skip。`status="discarded"` + `version=9` 不変が「save が一切走らなかった」証明。
  - save 失敗: UoW spy が run#2（rollback）のみ reject。run 呼び出し順序（run#1=promote / run#2=rollback、attachPreview run は成功時のみ）を確認し、spy が rollback の save だけを狙えていることを検証。`warn("ingestion.rateLimitRollback.persistence_failed", {jobId})` + 最終 `status="processing"`（二段構え収束）を assert。
- **[W-D1] 解消** — `tempStorageKey: null` 代入は `commit`/`discard` のみで `processing` には作用しないことを実コードで確認。不変条件コメントは正確。
- **[W-T1] 解消** — `markFailed` で `failed` を作り `InvalidStateForRollback` reject を assert。retry/rollback 入口の排他を実証。
- **[W-T2] 解消** — version 単調増加 assertion は seed 非依存の相対比較で堅牢。
- **[W-U1]** 見送り（won't-fix）— 根拠は review-001。妥当。

### Notes

- レビュアー注記: review-001 の「afterEach に restoreAllMocks 追加」の記述位置説明はやや不正確だが、`setupTestContainer` が `beforeEach` で container（=UoW/logger インスタンス）を毎テスト再生成するため spy の機能的リークは無く、ブロッカーではない。
- `pnpm typecheck` PASS / domain 46件 PASS / usecase integration 19件 PASS / worker handlers integration 17件 PASS / errorCodeNaming PASS。
- handlers.ts / dispatchDomainEvent.ts のコメント更新は rate-limit 限定部分のみで、admin manual-retry / DLQ の一般記述を保持。
- plan.md / adr.md / testing.md と実装は整合。

---

## Design Decisions

新たな設計判断なし。

## 完了

1ラウンドクリーン（Blocker 0 / Warning 0）で完了条件達成。PR を Ready for review に切り替える。
