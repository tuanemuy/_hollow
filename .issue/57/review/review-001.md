# PR Review #001 — feat(issue-57): wire queue consumer to runIngestionJob / runExportJob

**PR:** #108
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 20+
- Notes: 多数（良い点）
- Verdict: **BLOCKED**

主要な指摘:
- **[B-001]** ADR-003 が謳う「`LLMRateLimitError → retry` が正しく機能する」は `runIngestionJob` の `isPending` ガード仕様により ingestion path で実質機能しない。post-dispatch stamp 化は必要条件だが十分条件ではない。

---

## Application / Use Case

### Blockers
なし

### Warnings

- **[W-001]** `LLMRateLimitError → retry` の end-to-end 経路が `runIngestionJob` 側のガードで実質遮断されている → B-001 と統合
- **[W-002]** `event.payload as Readonly<{ jobId: string }>` の境界外検証が relay decoder にしか担保されていない
- **[W-003]** `BusinessRuleError`（VO 構築失敗）が `retry` に分類され、永続データ不整合が DLQ まで 3 回試行される
- **[W-004]** `skipped` と `handled` を区別しているが consumer 側では同一扱い（distinct tag を保つ理由が JSDoc に無い）
- **[W-005]** `as unknown as IngestionJobIdDTO` キャストの理由がコメントに無い
- **[W-006]** `runExportJob` 内部 catch があるため `EXPORT_JOB_NOT_FOUND → handled` 分岐は実質デッドコード気味（防御コードと明記すべき）
- **[W-007]** `createConsumerContainer` が SSR-only な `config` を埋める設計は ADR-002 で言及されていない

## Adapter / Infrastructure

### Blockers
なし

### Warnings

- **[W-001-A]** `createConsumerContainer` で `getDatabase(env.DB)` が二重に呼ばれ、Drizzle ハンドルが 2 系統存在する
- **[W-002-A]** `[env.consumer]` に `RELAY` Service Binding が無く `NoopRelayTrigger` に縮退する事実が JSDoc に無い
- **[W-003-A]** `hasProcessed` integration test の 2 ケース目「並行性」を主張するテストが実体は逐次実行

## Worker / Integration

### Blockers

- **[B-001]** `runIngestionJob` の `LLMRateLimitError → retry` 経路は、ADR-003 で謳う「at-least-once + retry が正しく成立する」契約を実質的に満たしていない
  - 場所: `app/core/application/ingestion/runIngestionJob.ts:58-80` + `app/worker/cloudflare/handlers.ts:105-145`
  - 理由: 1 回目の配信で `pending → processing` を commit してから pipeline で throw する。redelivery 時の entry guard が `isPending` 固定のため、`processing` 状態の job は no-op で抜けて `handled` 扱いになる。stamp は確かに残らないが、retry の liveness（rate limit 解消後の自動再走）は機能しない。
  - 提案: スコープ拡張は困難（`runIngestionJob` の semantic 変更）。本 PR では ADR-003 / ADR-005 / dispatchDomainEvent JSDoc を「post-dispatch stamp は transient エラーの retry path を**塞がない**ことのみを保証する」と honest に書き換え、ingestion `processing` 後の rate limit は別 Issue で扱う旨を明記する。回帰防止のため `processing` 状態の job への redelivery が no-op になることを assert する integration test を追加。

### Warnings

- **[W-001-W]** 「acks redelivered without re-running」テストが `hasProcessed` 経路を実際に経由していることを assert していない
- **[W-002-W]** CPU/wall-clock 30s 制約への wrangler `max_batch_size` ガードが入っていない（out of scope）
- **[W-003-W]** payload を `as Readonly<{ jobId: string }>` で cast → 上 W-002 と統合
- **[W-004-W]** 外側 try/catch 内 `message.retry()` の責務範囲が JSDoc で明示されていない
- **[W-005-W]** retry path integration test の Stub spy（`StubTempFileStorage.get` + `StubLLMProvider.suggestMetadata`）が pipeline 内部の呼び出し順序に依存して壊れやすい

## Test

### Blockers
なし

### Warnings

- **[W-001-T]** `dispatchDomainEvent` の VO factory throw 経路（payload schema drift 検出）がテストされていない
- **[W-002-T]** retry 経路のテストが「次回 redelivery で本当に再 dispatch が走る」ことまでは観察していない
- **[W-003-T]** `LLMRateLimitError → retry` 後に job 行が `processing` のまま塩漬けになる事実がテストで明示されていない → B-001 で対応
- **[W-004-T]** dispatchDomainEvent の export 側 `LLMRateLimitError` 分類が unit test で touch されていない
- **[W-005-T]** `seedPendingExportJob` 内 `placeholderNoteId` が `jobSeq + 1` に依存している（読みづらい）

---

## Design Decisions

- ADR-003 の主張「LLMRateLimitError → retry が機能する」は誇張だったため、ADR を改訂する必要がある。post-dispatch stamp は「transient エラー (D1 一時障害、`hasProcessed` 自体の throw 等) で stamp が残らない」ことのみを保証する。ingestion job の `processing` 後の自動 retry は別 Issue。
- `BusinessRuleError`（VO 構築失敗）は永続的データ不整合なので `handled`（DLQ 不要、queue 上は完了扱い、log で運用通知）に分類すべき。
