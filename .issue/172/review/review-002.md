# PR Review #002 — perf(d1): cap selectInChunks concurrency with a bounded worker pool

**PR:** #179
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 20
- Verdict: **APPROVED**

---

## Adapter / Infrastructure

### Blockers
- なし

### Warnings
- なし

### Notes
- **[A-N-001]** `[A-W-001]` の修正は正しく機能する。`while (!aborted)` のループガード + `try/catch (e) { aborted = true; throw e; }` の組み合わせで、`Array.from` による全 worker 同期スピンアップ → `cursor++` の同期 claim → `await runner(...)` で suspend → 例外時に `aborted` を立てて再 throw、というシーケンスが完成している。`Promise.all(workers)` は first rejection で外側 await を reject させる一方、in-flight worker は当該 `await runner(...)` 完了後にループ先頭で `!aborted === false` を観測して exit するため、JSDoc の「already-claimed chunks complete and settle; unclaimed chunks are never started」と完全一致
- **[A-N-002]** `results.flat()` の不変条件コメント（`_chunks.ts:111-115`）は `[P-W-002]` の指摘どおり「全 worker 成功時のみ到達 → sparse スロットなし」を明示しており、CLAUDE.md「WHY-only」原則に沿う
- **[A-N-003]** JSDoc fan-out 注意書き（`_chunks.ts:59-61`）で `[P-W-003]` に対応。`N × maxConcurrency` の caller-side 多重呼び出し挙動が明示
- **[A-N-004]** `cursor++` の atomicity コメントと `aborted = true; throw e` の順序保証コメントの双方が「JS シングルスレッドセマンティクスに依存した非自明な不変条件」を語っており、コメントポリシーと整合
- **[A-N-005]** `let aborted = false` は単純な mutable flag だが、依存追加なし、20→25 行に収まる、JSDoc 既存記述と一致するためトレードオフ妥当
- **[A-N-006]** 新たな regression や副作用なし

---

## Test

### Blockers
- なし

### Warnings
- なし

### Notes
- **[T-N-001]** `[T-W-001]` 修正確認: `expect(peak).toBe(DEFAULT_MAX_CONCURRENCY)` に強化（plan は `>=` を提案したが採用は `toBe` で更に厳しい等値固定）。200 chunks × 1ms 遅延で確実に飽和するため flake リスクなし
- **[T-N-002]** `[T-W-002]` 修正確認: `callCount` 変数とその expect 文をすべて削除済み、`runner.mock.calls.length` に一本化
- **[T-N-003]** `[T-W-003]` 修正確認: `expect(runner.mock.calls.length).toBe(maxConcurrency)` で等値固定。Array.from 同期ループの不変条件を明示
- **[T-N-004]** `[T-W-003]` 強化部分（`await setTimeout(30)` + 再 assert）の安全性: 20ms hold より 10ms 余裕、CI flake しにくい。仮に CI が 30ms 内に timer を消化できなくても worker は suspend 状態のままで pass する両ケース耐性あり
- **[T-N-005]** `[T-W-004]` は Follow-up で見送り済み、本ラウンドでの判断妥当
- **[T-N-006]** `rejects with the first runner failure` テストの semantics: worker 0 が同期 throw → catch で `aborted=true; throw` → Promise.all reject → 外側 await resolve。microtask の rejection 伝播 ≪ macrotask の setTimeout のため calls.length は確実に 3
- **[T-N-007]** 全テスト 12/12 pass を 5 回連続で確認、flake なし

---

## Performance

### Blockers
- なし

### Warnings
- なし

### Notes
- **[P-N-001]** `[P-B-001]` (worker abort) の修正は正しく機能する。`aborted` フラグは catch ブロックで `throw` 前にセットされ、兄弟 worker は次のループ反復先頭 (`while (!aborted)`) で観測する。`while` 条件チェック → `cursor++` → `chunks[i]` 取得 → `runner(chunks[i])` 起動はすべて同期で、`await` で初めて yield するため競合なし
- **[P-N-002]** `[P-B-002]` の ADR 修正は実コード（`noteRepository.ts:472-531`）と整合。`listWithCount` の chunk 経路は `selectInChunks` 1 回 + `count = sorted.length` の単一スキャンであり、`loadChildren` の `3 × maxConcurrency = 24` の主張は `noteRepository.ts:233-252` で確認
- **[P-N-003]** `[P-W-002]` の sparse slot 不変条件コメントは厳密に正しい
- **[P-N-004]** `[P-W-003]` の JSDoc fan-out 注意書きは適切
- **[P-N-005]** `[P-W-001]` 観察ログは ADR Follow-up 項目に明示記録済み、本ラウンド見送りは合理的判断
- **[P-N-006]** 新規問題の混入なし
- **[P-N-007]** テスト強化（30ms macrotask 待機後の再 assert）で abort フラグの回帰検出が十分に守られている

---

## Design Decisions

このラウンドで見つかった設計判断: 特になし
