# PR Review #001 — feat(worker): #747 processed_events の刈り込み経路を新設

**PR:** #759
**Date:** 2026-06-18
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 17
- Verdict: **BLOCKED**（Warning を仕分け・対応してから再レビュー）

## レイヤー別ファイル

- Application / Worker: review-001-app-worker.md（B: 0 / W: 1）
- Adapter / Persistence: review-001-adapter.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧と仕分け

- [W-001 app-worker] processed-events prune 失敗が「削除0件」と区別不能（observability の非対称） — `app/worker/cloudflare/handlers.ts:113-123`
  - → **このPRで対応**: 失敗時は既に `error` ログで可視化済み。さらに best-effort swallow 経路の unit test を追加して error ログ発火を検証（runPruneTick.test.ts）
- [W-001 adapter] `processed_at` に index なし → 刈り込み DELETE が full scan — `app/core/adapters/d1/schema.ts:48-51`
  - → **見送り（ADR-003 に記録）**: 手本の outbox prune も同方式。index 追加はマイグレーション＝スコープ超過、かつホットな markProcessed INSERT に維持コスト。実運用で問題化したら別Issueで outbox とまとめて対応
- [W-001 test] best-effort 失敗経路（processedEventsDeleted=0 の swallow）が未テスト — `app/worker/cloudflare/handlers.ts`
  - → **このPRで対応**: `app/worker/cloudflare/__tests__/runPruneTick.test.ts` を新規追加
- [W-002 test] activity prune と processed-events prune の独立性が未検証
  - → **このPRで対応**: runPruneTick.test.ts で各 swallow 分岐を検証
- [W-003 test] unit の cutoff がリテラル直書きで DEFAULT 定数未参照 — `pruneProcessedEvents.test.ts`
  - → **このPRで対応**: `DEFAULT_PROCESSED_EVENTS_RETENTION_MS` を参照に変更

## 対応サマリー

- 新規: `app/worker/cloudflare/__tests__/runPruneTick.test.ts`（happy / processed 失敗 swallow / activity 失敗 swallow / outbox 失敗 propagate の4ケース）
- 修正: `pruneProcessedEvents.test.ts` で DEFAULT 定数参照
- 記録: ADR-003（index 見送りの設計判断）
