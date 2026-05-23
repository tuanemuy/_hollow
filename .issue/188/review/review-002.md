# PR Review #002 — fix(deploy): route relay workerId through IdGenerator port

**PR:** #189
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## General Review (Round 2)

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** W-001 完全解消。新規 `app/core/application/workers/__tests__/eventRelayWorker.test.ts` がフォールバック経路（`idGenerator.next()` 呼び出し + `claimPending` 引数が `FakeIdGenerator` の戻値 `ffffffff-ffff-7fff-8fff-000000000001` 一致）と明示指定経路（`workerId: "explicit-caller-id"` 優先 + `idSpy` 未呼出）の両方を `vi.spyOn` で正確にガードしている。`processOutboxEvents` を public API として直接叩く形なので、`processOutboxBatch` の内部実装をリファクタしても挙動契約は壊れない安定したアサーション。テストランも 119 ファイル / 2372 件全パス確認済み。
- **[N-002]** W-002 完全解消。option JSDoc は 4 行に圧縮され、Cloudflare 10021 の歴史的経緯はモジュール冒頭コメントに集約。CLAUDE.md "WHY is non-obvious" 原則と整合。
- **[N-003]** テストヘルパー（`buildContainerStub` / `buildNoopRepo`）は過剰抽象化していない。`as unknown as WorkerContainer` の 1 箇所のキャストは `WorkerContainer` の他フィールドを本テストでは触らないため妥当な絞り込み。`buildNoopRepo` の戻り型で `claimPending` / `finalize` の `vi.fn` 型を交差させてあるので `mock.calls[0]?.[0]` のアサーションが型安全。
- **[N-004]** テストファイル冒頭のコメントは「何をピン留めしているか」「Issue #188 への回帰ガードであること」を端的に説明しており、CLAUDE.md "WHY is non-obvious" に沿う。
- **[N-005]** APPROVED 妥当。1 ラウンド目の Warning 2 件は完全消化、新規追加分に Blocker / Warning ともなし。

---

## Design Decisions

特になし
