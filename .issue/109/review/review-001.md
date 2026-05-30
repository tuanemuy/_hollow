# PR Review #001 — feat(issue/109): auto-re-drive ingestion jobs after LLMRateLimitError

**PR:** #346
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 3
- Notes: 多数（良好）
- Verdict: **BLOCKED**

3レイヤー（Domain / Use Case・Worker配線 / Test）を並列レビュー。Domain・UseCase は Blocker ゼロ。Test 層で rollback catch の防御分岐が未カバーの Blocker を検出。

---

## Domain層

### Blockers
なし

### Warnings
- **[W-D1]** `rollbackToPending` が `retry` の持つ `tempStorageKey === null` 不変条件を型でもガードでも持たない非対称性。
  - 場所: `app/core/domain/ingestion/entity.ts`
  - 理由: `retry` は `failed` ジョブの key reclaim 済みを `NoTempStorageForRetry` で弾くが、`rollbackToPending` は同等ガードが無い。
  - 提案: `processing` 中は key が常に non-null（commit/discard のみ reclaim し、両者は processing を抜ける）という不変条件をコメントで明記。

### Notes
- 状態機械の型整合・ガード・version・event 非 emit すべて既存遷移と一貫。errorCode 命名規約適合。

## Use Case / Worker配線

### Blockers
なし

### Warnings
- **[W-U1]** rollback の UoW catch が OCC 競合・D1 障害・リハイドレーション失敗を一律 `logger.warn` に畳むため、「正常な並行遷移ノイズ」と「要観測の D1 障害」がログ上区別できない。
  - 場所: `app/core/application/ingestion/runIngestionJob.ts`
  - 理由: ADR-003 が「rate-limit rollback の唯一の観測点」と位置づけるため、OCC 競合で常時 warn を吐くとシグナルが薄まる。
  - 提案: 任意。`isSystemError && conflict` を info に落とす分岐。レビュアー自身が「スコープ判断として見送るのも妥当」と付記。

### Notes
- rollback UoW ブロック（findById → isProcessing → rollbackToPending → save(expectedVersion)）・元エラー必ず rethrow・skip 分岐・dispatch outcome 不変・JSDoc 切り分けすべて要求通り。収束経路（ADR-001）と一致し無限ループにならない。

## Test

### Blockers
- **[B-T1]** `runIngestionJob` の rollback catch に追加された2分岐（並行遷移 skip / save 失敗 logger.warn）がどのテストでもカバーされていない。`testing.md` 自身がエッジケースに挙げた「並行遷移時の rollback skip」も未実装。バグが入っても全テスト green のまま通過する（false negative）。
  - 場所: `app/core/application/ingestion/runIngestionJob.ts`
  - 提案: usecase integration test に最低「並行遷移時の skip → rethrow」、可能なら「save 失敗 → logger.warn → rethrow」を追加。

### Warnings
- **[W-T1]** domain unit test の「非 processing からの拒否」が `pending`/`previewing` の2状態のみで `failed` 等が未検証。
- **[W-T2]** worker integration test に redelivery 後の version 検証が無い（OCC 単調増加の回帰検知力）。

### Notes
- integration test の偽陽性耐性は良好（rollback 削除で `toHaveBeenCalledTimes(2)` と `toBe("previewing")` が確実に fail）。kind="html" で suggestMetadata のみ呼ぶ前提も正しい。

---

## 対応

| 指摘 | 対応 |
|---|---|
| **[B-T1]** | `runIngestionJob.integration.test.ts` に rate-limit rollback の usecase test 3本を追加: ①rollback → pending + rethrow（happy）、②並行 discard 時の skip → 状態不変 + rethrow、③rollback save 失敗（UoW spy）→ `logger.warn("ingestion.rateLimitRollback.persistence_failed")` + rethrow。`RateLimitLLMProvider`（`onBeforeThrow` フック付き）を追加。spy リーク防止に `afterEach` へ `vi.restoreAllMocks()` を追加。 |
| **[W-D1]** | `entity.ts` の `rollbackToPending` private 関数に「`processing` は key を常に保持（commit/discard のみ reclaim）。`retry` がガードを持つのは `failed` の key reclaim 済みケースのため」という不変条件コメントを追記。 |
| **[W-T1]** | `entity.test.ts` の非 processing 拒否テストに `failed` 状態のケースを追加（retry と rollback の入口が排他であることを明示）。 |
| **[W-T2]** | `handlers.integration.test.ts` に rollback 後・redelivery 後の version 単調増加 assertion を追加。 |
| **[W-U1]** | 見送り（won't-fix）。`isProcessing` の事前再確認で並行遷移の大半は save 前に skip され、save 時点の OCC 競合は極めて稀。稀な競合を `warn` に出すコストよりも、`isSystemError && conflict` 判定の分岐追加でロジックを複雑化するデメリットが上回る。追加した save-失敗テストにより warn の発火は検証済みで、観測点としては機能する。レビュアーも「見送り妥当」と付記。 |

## Design Decisions

このラウンドで新たな ADR 級の設計判断はなし。W-U1 の見送り判断は本レビューファイルに記録（ADR 化するほどの構造判断ではない）。
