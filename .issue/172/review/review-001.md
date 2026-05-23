# PR Review #001 — perf(d1): cap selectInChunks concurrency with a bounded worker pool

**PR:** #179
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 8
- Notes: 17
- Verdict: **BLOCKED**

---

## Adapter / Infrastructure

### Blockers
- なし

### Warnings

- **[A-W-001]** JSDoc の "unclaimed chunks are never started" は実装と乖離している
  - 場所: `app/core/adapters/d1/repositories/_chunks.ts:64-69` および `_chunks.ts:16-18`
  - 理由: worker 関数は `cursor++` で次の chunk を取得するループ内に「他の worker がエラーを起こしたか」を観測する仕組みを持っていない。1 個の worker が `runner` で例外を投げて当該 worker promise が reject すると、`Promise.all(workers)` は即時 reject して呼び出し側へ伝播するが、**他の worker は止まらない**。残りの worker は自身の `await runner(...)` が settle 次第 while ループを継続し、`cursor` を更新して未取得の chunk を引き続き runner に渡し続ける。**Performance B-001 と同根**
  - 提案: shared `let aborted = false` フラグを導入し、worker のループ先頭で `if (aborted) return;` し、`await runner(...)` を `try/catch` して catch 内で `aborted = true; throw e;`

### Notes
- [A-N-001] `cursor++` の atomicity inline コメントは「WHY-only」原則に沿った正しい使い方
- [A-N-002] `chunkSize <= 0` / `maxConcurrency <= 0` の対称 throw が boundary validation として綺麗
- [A-N-003] options object 形式への移行は 12 呼び出しすべて第3引数省略のため後方互換
- [A-N-004] `new Array(chunks.length)` index 書き戻し + `flat()` で順序保証している実装が簡潔
- [A-N-005] `Math.min(maxConcurrency, chunks.length)` で空 worker promise を作らない
- [A-N-006] 定数 JSDoc が `.issue/172/adr.md` ADR-001 を参照していて将来の読み手が rationale を辿れる
- [A-N-007] ファイルヘッダ / 関数 / 定数の 3 層 JSDoc が一貫して bounded worker pool semantics を伝える
- [A-N-008] ADR-001 fan-out 補足が plan / adr 双方に明記、helper 単体のガード範囲外を意識的に未対応として記録

---

## Test

### Blockers
- なし

### Warnings

- **[T-W-001]** `defaults to DEFAULT_MAX_CONCURRENCY when not specified` テストの assert が「上限」のみで「実値」をロックできていない
  - 場所: `__tests__/_chunks.test.ts:173-174`
  - 理由: `peak <= DEFAULT_MAX_CONCURRENCY` と `peak > 0` の組み合わせは default が `1` などに後退した場合でも素通りする
  - 提案: 200 chunks × 1ms 遅延であれば確実に飽和する。`expect(peak).toBe(DEFAULT_MAX_CONCURRENCY)` で等値固定するか、`peak >= DEFAULT_MAX_CONCURRENCY` で下限を縛る

- **[T-W-002]** `rejects with the first runner failure` テストの `callCount` が `runner.mock.calls.length` と同義で冗長
  - 場所: `__tests__/_chunks.test.ts:100, 102, 116`
  - 理由: 同じ事象を 2 通りに数えており、テスト意図が不明瞭
  - 提案: `let callCount = 0; callCount++;` と `expect(callCount)...` をすべて削除して `runner.mock.calls.length` に統一

- **[T-W-003]** `rejects` テストの「未開始 chunk は呼ばれない」assert が境界として弱い
  - 場所: `__tests__/_chunks.test.ts:115-119`
  - 理由: `runner.mock.calls.length <= maxConcurrency` は worker spinup が一斉に立ち上がらない回帰を素通りさせる
  - 提案: `expect(runner.mock.calls.length).toBe(maxConcurrency)` で等値固定する。Array.from 同期ループで全 worker が即座に cursor を取得する不変条件を明示

- **[T-W-004]** タイミング依存テストの flake リスクが完全には排除されていない（低優先度）
  - 場所: `__tests__/_chunks.test.ts:106, 130, 149, 166`
  - 理由: CI のタイマー解像度が荒い環境で `setTimeout(1)` が 0〜10ms にぶれることがある
  - 提案: `vi.useFakeTimers()` で決定論化、または `await Promise.resolve()` 連鎖で microtask 化。優先度低、後回しで OK

### Notes
- [T-N-001] 既存 6 ケースの options 形式書き換えに見落としなし
- [T-N-002] `DEFAULT_MAX_CONCURRENCY` を test から直接 import して「定数値直値埋め込み」を避ける plan.md 意図を素直に満たす
- [T-N-003] peak counter (L125-132) が JS シングルスレッド前提で race-free、最小コストで bounded 性を観測
- [T-N-004] `rejects` テストが ids.length=30 で十分に大きく取り、「全 chunk が偶然呼ばれた」と区別がつく
- [T-N-005] `preserves input chunk order under bounded concurrency` (L144-157) と既存の out-of-order resolve ケース (L84-95) で bounded 前後の順序保証を分離
- [T-N-006] JSDoc とテスト contract が一致
- [T-N-007] plan.md で要求された新規 4 ケースはすべて揃っている

---

## Performance

### Blockers

- **[P-B-001]** First-rejection 後に worker が停止せず、追加の D1 subrequest が発火し続ける
  - 場所: `app/core/adapters/d1/repositories/_chunks.ts:91-107`
  - 理由: `Promise.all(workers)` は最初の rejection が伝播した時点で外側の await が reject するだけで、残りの worker async function 自体は走り続ける。`while (true)` ループに「他の worker のエラー」を観測する仕組みがないため、別 worker は `await runner(...)` 完了後にループへ戻り `cursor++` で **追加の chunk を claim して runner を呼び続ける**。ADR-001 の「保守的安全マージン」の主旨に逆行し、**失敗ケースでこそ subrequest を浪費する**設計
  - 提案: 共有 `aborted` フラグまたは `AbortController` で worker ループを停止させる。Adapter W-001 と同じ。
  - 最小修正:
    ```ts
    let aborted = false;
    const workers = Array.from(
      { length: Math.min(maxConcurrency, chunks.length) },
      async () => {
        while (!aborted) {
          const i = cursor++;
          if (i >= chunks.length) return;
          try {
            results[i] = await runner(chunks[i]);
          } catch (e) {
            aborted = true;
            throw e;
          }
        }
      },
    );
    ```

- **[P-B-002]** ADR-001 §「fan-out 呼び出しでの実効並列度」第 3 項の `listWithCount` 記述が現在のコード実態と整合しない
  - 場所: `.issue/172/adr.md` 該当節 / `app/core/adapters/d1/repositories/noteRepository.ts:472-531`
  - 理由: ADR には「`Promise.all([findByOwner, countByOwner])` で `2 × maxConcurrency = 16` 並列」と書かれているが、PR #170/#173 統合後の `listWithCount` は二重発火を廃止し chunk 経路では `selectInChunks` 1 回 + `sorted.length` で count を導出する単一スキャン。`Promise.all` の fan-out は存在しない
  - 提案: ADR-001 第 3 項を、`findByOwner` chunk path → `loadChildren` 3 並列が `await` で直列遷移する点を明示する形に書き換える

### Warnings

- **[P-W-001]** デフォルト 8 並列導入による既存ホットパスの実測レイテンシ悪化が観測点ゼロで導入される
  - 場所: `_chunks.ts:38` / `.issue/172/adr.md` Follow-up
  - 理由: ADR Follow-up「chunk 経路レイテンシ計測ログを別 Issue で検討」は文言通り検討段階で、運用で問題顕在化時の遡及確認手段がない
  - 提案: 最小限の `logger.debug` を入れるか、Follow-up を「Issue #XXX で対応」に格上げ。**Phase 4 で別 Issue 起票を検討**

- **[P-W-002]** worker ループ内に rejection 後の cursor 過大消費後の `results.flat()` で末尾 undefined を含む sparse スロットが生じうる
  - 場所: `_chunks.ts:91-107`
  - 理由: B-001 修正方針次第で `results.flat()` への到達経路が変わる。`results.flat()` は全 worker 成功時のみ到達する不変条件を明示しないと将来の修正で壊れやすい
  - 提案: B-001 修正と合わせて「`results.flat()` は全 worker 成功後にのみ到達する」不変条件をコメント or テストで明示

- **[P-W-003]** `maxConcurrency > chunks.length` の上限が fan-out 想定との整合性を JSDoc が触れていない
  - 場所: `_chunks.ts:45-70`
  - 理由: caller 側 `Promise.all` で同一 helper を多重呼び出しすると合計並列度は和算されるが、JSDoc からその点が読み取れない
  - 提案: JSDoc に 1 文追加: `Caller-side fan-out is not bounded by this helper: N concurrent calls to selectInChunks observe up to N × maxConcurrency in-flight runners. See .issue/172/adr.md ADR-001 §fan-out.`

### Notes
- [P-N-001] `cursor++` の race-safety コメントが JS シングルスレッドセマンティクスを正しく要約
- [P-N-002] options object 化が将来 `signal?: AbortSignal` 追加にも素直に拡張できる
- [P-N-003] ADR §「実測ベンチを行わない理由」が Issue 本文の要求に対する明示的応答として透明性高

---

## Design Decisions

このラウンドで見つかった設計判断:

1. **first-rejection 後の worker 停止セマンティクスの明示** (P-B-001 / A-W-001) — `aborted` フラグでの停止 vs `AbortController` 導入のトレードオフ。**`aborted` フラグ採用**: 依存追加なし、20→25 行の増加に収まる、JSDoc 既存記述と一致

## 修正方針

### このラウンドで修正する（即時修正）

- [P-B-001 / A-W-001] worker-pool に `aborted` フラグ + try/catch を導入し、first-rejection 後に未開始 chunk の runner を呼ばない実装に修正
- [P-B-002] ADR-001 §fan-out 第 3 項を実コード実態に合わせて書き換え（`listWithCount` の二重発火廃止を反映）
- [T-W-001] `defaults to DEFAULT_MAX_CONCURRENCY` テストを `peak >= DEFAULT_MAX_CONCURRENCY` で下限固定
- [T-W-002] `callCount` を削除し `runner.mock.calls.length` に統一
- [T-W-003] `runner.mock.calls.length === maxConcurrency` で等値固定
- [P-W-002] `results.flat()` の不変条件コメントを追加（B-001 修正に統合）
- [P-W-003] JSDoc に fan-out 注意書きを 1 行追加

### Follow-up（別 Issue 起票・後回し）

- [T-W-004] 低優先度。本ラウンドでは見送り（fake timers 導入は本 PR スコープを広げる）
- [P-W-001] ADR-001 Follow-up に既存記載あり。本 PR では対応しない。Phase 4 で別 Issue 起票を検討
