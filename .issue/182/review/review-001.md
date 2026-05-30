# PR Review #001 — perf(ops): observe user.deleted fan-out latency (Issue #182)

**PR:** #347
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 9
- Verdict: **BLOCKED**（Warning 残のため。Step 7 = Blocker 0 かつ Warning 0 で完了）

---

## Application層・正確性

### Blockers
なし

### Warnings
- **[W-001]** `durationMs` は成功完了時のみ計測される（ハンドラ throw 時は外側 catch に落ち未計測）
  - 場所: `app/core/application/workers/dispatchDomainEvent.ts`（user.deleted case）
  - 理由: ADR の観測目的（CPU/wall 上限近接 = 重い heavy user で kill/throw されうるケース）からすると、最も観測価値の高い「重くて落ちた」ケースのログが欠落する。候補4軽量版の意図的割り切りであり機能バグではない。
  - 提案: ADR のトリガー条件に「成功完了時のみ観測される」旨を補足。
  - **対応:** ✅ adr.md に「観測の限界（運用者向け注記）」を追記。失敗時は `[queue] dispatch retry` / DLQ / invocation kill メトリクスで間接観測する旨を明記。

### Notes
- N-001〜N-006: `startedAt` の validation 後配置（ADR-005 遵守）、`.getTime()` 差分の型安全、`container.clock` の DI 配線実在、既存 fan-out 挙動の不変、`userId` raw payload 使用の規約一貫性、スコープ遵守（候補1/2/3 混入なし）をいずれも確認・良好。

## テスト・ドキュメント

### Blockers
なし

### Warnings
- **[W-001(test)]** `durationMs > 0` 検証が fake clock の単調増加に依存。将来 case 内に別の `clock.now()` が混入すると計測区間と無関係に値がズレてもテストが緑のまま通りうる。
  - 場所: `dispatchDomainEvent.test.ts`（新規テスト）
  - 提案: `clock.now` を spy 化し「ちょうど2回呼ばれる」ことを併せて assert。
  - **対応:** ✅ `clockNow` を `vi.fn` 化して `makeStubContainer` から返し、`expect(clockNow).toHaveBeenCalledTimes(2)` を追加。
- **[W-002(test)]** 「fan-out が空でもログが出る」専用テストが明示的に無い（既存新規テストがデフォルトモック = 空フットプリント相当でカバー済みだが意図が暗黙）。
  - 提案: 空フットプリントをカバーしている意図をテストコメントに残す。
  - **対応:** ✅ 新規テストに「Default mocks ... empty footprint ... the log must still fire」のコメントを追加。

### Notes
- N-001〜N-004: 既存3ケースの diff 無変更・全53ケース PASS、fake clock の他 case 非干渉、docs 是正の Cloudflare 実仕様一致（visibility_timeout_ms pull 専用 / push 上限 15分・30秒 / per-message ack）、ADR 事実主張の裏取り（limits ブロック非存在・OUTBOX_LEASE_MS=300000）をいずれも確認・良好。

---

## Design Decisions

- 失敗 fan-out を計測しない割り切りを ADR に明文化（候補4軽量版のスコープ。`try/finally` 計測は採らない）。重要な新規アーキテクチャ判断ではなく既存方針の補足のため、ADR-001 内への注記に留める。
