# PR Review #002 — perf(ops): observe user.deleted fan-out latency (Issue #182)

**PR:** #347
**Date:** 2026-05-30
**Round:** 2回目（確認ラウンド）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## 最終確認

1周目の Warning 3件の修正がすべて正しく反映され、新たな問題（型エラー・テスト破壊・スコープ逸脱・コメントノイズ）の混入なしを確認。

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 3修正すべて指摘どおり反映済み。実装は `startedAt` を `UserId.create` 後・ハンドラ呼出前に取得、`durationMs` は2回目 `clock.now()` との `.getTime()` 差分、ログ meta は `{ eventId, userId, durationMs }`。
- **[N-002]** `pnpm typecheck` クリーン、ユニットテスト全2820件 PASS（既存 user.deleted 3ケース + BusinessRuleError 含む）。fake clock は user.deleted case のみ参照で他ブランチに inert。
- **[N-003]** スコープ逸脱なし（候補1/2/3・limits.cpu_ms 変更の混入なし）。コメントは WHY 中心でノイズ過多でない。docs の「Push consumer redelivery semantics」節も plan/ADR と一致。
- **[N-004]** `expect(clockNow).toHaveBeenCalledTimes(2)` が計測区間外の `now()` 混入リグレッションを封じている。

---

## Design Decisions

特になし（round 1 で記録した「失敗 fan-out 非計測」の ADR 注記以降、新規の設計判断なし）。
