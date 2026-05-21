# PR Review #002 — PR #125 / Issue #66

**PR:** #125
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 16
- Notes: 多数
- Verdict: **BLOCKED**（Warnings 多数のため修正を要する）

---

## DI / Adapter

### Blockers
なし

### Warnings

- **[W-DA-001]** `runOnce()` の `createWorkerContainer` と `createConsumerContainer` が二重に D1 ハンドルを構築（プロダクションと同等だが、毎 kick ごとに新規構築）
  - 場所: `app/core/adapters/cloudflare/inlineRelayTrigger.ts:75-80`
  - 提案: 一本化、もしくは「dev 用途のため毎 kick で container 再構築する」コメント追記。

- **[W-DA-002]** `options` スプレッド順序により dev 用デフォルトが呼び出し側で全て上書き可能
  - 場所: `app/core/adapters/cloudflare/inlineRelayTrigger.ts:109-114`
  - 提案: `{ ...this.options, maxIterations: 1, batchSize: 25, workerId: "inline-dev" }` の順に並べ替える。

- **[W-DA-003]** `stripRelayBinding` の JSDoc コメントがロジックと一致していない（"strip" は undefined 代入を含意するが、実体は destructure でキー除去）
  - 場所: `app/core/adapters/cloudflare/inlineRelayTrigger.ts:120-124`
  - 提案: コメント修正。

- **[W-DA-004]** `RequestServerConfig.relayTriggerOverride` が型上 consumer 経路にも漏れている（実際は `readRequestServerConfig` が返さないので安全だが、型でリスクを表現できていない）
  - 場所: `app/core/application/di/serverCloudflare.ts:333-348` + テスト
  - 提案: JSDoc / コメントで「`readRequestServerConfig` は `relayTriggerOverride` を返さないので consumer 経路では実質常に undefined」を明記。

### Notes (抜粋)
- N-001: `import.meta.env.DEV` 1 ヶ所閉じ込めによる dead-code elimination の信頼性確保
- N-002〜N-005: 全体的にレビュー指摘事項を吸収した綺麗な設計（review-001 の P-003 修正の結果）

---

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** `dispatchDomainEvent` の `kind: "skipped"` 経路のテストカバレッジ欠落（dev で頻発する `note.*` イベントは大半が skipped に落ちるため重要）
  - 場所: `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:161-184`
  - 提案: `it.each` パラメタライズもしくは独立 `skipped` ケース追加。

- **[W-T-002]** "schedules the drain via waitUntil and returns synchronously" テストが `waitUntil` の Promise を flush しない（他テストへの干渉リスク）
  - 場所: `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:150-159`
  - 提案: `pending` でキャプチャして flush するか、`waitUntil.mock.calls.length === 1` で同期性を担保。

- **[W-T-003]** "schedules the drain..." テストの「同期 return」検証が間接的すぎる
  - 場所: 上記同位置
  - 提案: 「kick の前後で `dispatchDomainEvent` / `markProcessed` が呼ばれていない」を即時アサート。

- **[W-T-004]** RELAY-stripping テストの検証経路が間接的（`mocks.capturedConsumerRelay` 中継）
  - 場所: `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:75-98, 310-329`
  - 提案: `expect(mocks.createConsumerContainer.mock.calls[0]?.[0].RELAY).toBeUndefined()` に統一。

- **[W-T-005]** "regression baseline" テストが `serverCloudflare.test.ts` の領域と DRY 違反
  - 場所: `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:331-350`
  - 提案: 削除またはコメントで意図明示。

- **[W-T-006]** retry 経路で「`processOutboxEvents` に failure が伝わって `attempts++`」が（mock のため）検証されない
  - 場所: `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:186-214`
  - 提案: コメントで意図 narrow を明記（既存 integration test が attempts 担保）。

- **[W-T-007]** `_innerRelayTrigger` がデッドコード
  - 場所: `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:75-93`
  - 提案: 削除。

- **[W-T-008]** dispatch debug ログ (`logger.info("[relay-trigger] inline dispatch drained ...")`) が呼ばれることをどのケースでも検証していない
  - 場所: テストファイル全体
  - 提案: 少なくとも 1 ケースで `logger.info` 呼び出しを assert。

### Notes (抜粋)
- N-001: `vi.hoisted` + `vi.mock` の正しい使い方
- N-002〜N-006: production zero-impact / 決定性 / 既存テスト無破壊 すべて担保

---

## Presentation Entry / Documentation

### Blockers
なし

### Warnings

- **[W-PE-001]** `pnpm start` (`wrangler dev` 直叩き) で `import.meta.env.DEV` が `TypeError` でクラッシュする可能性が未検証
  - 場所: `app/server.cloudflare.ts:51`、`docs/runtime_cloudflare.md:54`
  - 理由: wrangler は Vite を経由しないため `import.meta.env` は undefined。`import.meta.env.DEV` で throw する。
  - 提案: optional chaining でガード（`(import.meta.env?.DEV ?? false)` のような形）。

- **[W-PE-002]** options スプレッド順序の問題（W-DA-002 と同じ）

- **[W-PE-003]** docs/testing.md の `grep` コマンドが `dist/` 不在時に誤判定する
  - 場所: `docs/runtime_cloudflare.md:52`, `.issue/66/testing.md:28,73-76`
  - 提案: `test -d dist/ && grep ... && echo "FAIL" || echo "OK"` の形にする。

- **[W-PE-004]** `.issue/66/.manual-test/results/summary.md` の TC-001/TC-002 が PARTIAL/SKIP のまま
  - 場所: `.issue/66/.manual-test/results/summary.md:14-19`
  - 提案: 直接 outbox に行を挿入して drain させる迂回検証、もしくは unit test で完全担保していることを再確認して PARTIAL の意味を明記。

### Notes (抜粋)
- N-001〜N-007: 1 ヶ所閉じ込め、型解決、DCE、stripRelayBinding の hack 回避、docs 詳細、HMR 互換、二重防御 すべて positive

---

## Design Decisions

特になし（review-001 で網羅済み）

---

## 修正方針

Warnings 全 16 件を以下の優先度で対応:

**高（実害あり）:**
- W-DA-002 / W-PE-002 (options 順序反転)
- W-PE-001 (`pnpm start` クラッシュガード)
- W-T-001 (skipped カバレッジ)

**中（品質向上）:**
- W-DA-001 (コメント追加)
- W-DA-003 (コメント修正)
- W-DA-004 (コメント追加)
- W-T-002/T-003 (テスト改善)
- W-T-004/T-007 (テスト直接化・デッドコード削除)
- W-T-005 (regression baseline 移動 or コメント)
- W-T-006 (テスト意図 narrow コメント)
- W-T-008 (logger.info 検証追加)
- W-PE-003 (grep コマンド改善)

**注釈で対応:**
- W-PE-004 (manual-test PARTIAL の意味明記)
