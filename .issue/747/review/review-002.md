# PR Review #002 — feat(worker): #747 processed_events の刈り込み経路を新設

**PR:** #759
**Date:** 2026-06-18
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 13
- Verdict: **APPROVED**

## レイヤー別ファイル

- Application / Worker: review-002-app-worker.md（B: 0 / W: 0）
- Adapter / Persistence: review-002-adapter.md（B: 0 / W: 0）
- Test: review-002-test.md（B: 0 / W: 0）

## 確認結果

Round 1 の Warning 5件はすべて適切に処理された:

- [W-001 app-worker] observability 非対称 → `runPruneTick.test.ts` の swallow 経路テストで閉じた（error ログ発火を検証）
- [W-001 adapter] index 欠如 → ADR-003 で見送り。Round 2 adapter レビューが ADR の論拠（DELETE の正しさに無関係・手本の outbox prune も full scan・ホット INSERT への維持コスト回避）を批判的に再検証し、Blocker/Warning に格上げ不要と確認
- [W-001/W-002 test] swallow 経路・独立性の未テスト → `runPruneTick.test.ts` の4ケースで閉じた
- [W-003 test] cutoff リテラル直書き → `DEFAULT_PROCESSED_EVENTS_RETENTION_MS` 参照に修正

全レイヤーで Blocker / Warning ゼロ。完了条件（このラウンドで直すべき指摘ゼロ）を満たし APPROVED。

## レビューループ完了

- ラウンド数: 2
- 初回ブロッカー: 0 / Warning: 5
- 修正済み: 4（W-003 + swallow 経路テスト3観点）/ 見送り: 1（ADR-003 で記録）
- 最終ステータス: APPROVED
