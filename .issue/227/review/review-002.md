# PR Review #002 — fix(llm): harden JSON envelope parsing with structured output + retry

**PR:** #234
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 11
- Verdict: **APPROVED**

---

## Combined Layer Review

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** **B-001 修正済み** — 3 アダプタすべての `invokeWithRetry` から try/catch を完全除去。2 回目 `await this.invoke(...)` が `LLMRateLimitError` / `LLMQuotaExceededError` / `LLMTimeoutError` を投げた場合は素通しする実装に変更。`runIngestionJob` の queue 再配信 / `markFailed` セマンティクスは保持される。
- **[N-002]** **W-A-001 修正済み** — `jsonEnvelope.ts` で `searchFrom` ベースのループに刷新。`findBalancedSlice` に searchFrom を追加し、初回 brace-balanced slice がパースできなかった場合は次の `{` 候補へ進む。
- **[N-003]** **W-A-002 修正済み** — `anthropic/messagesClient.ts` JSDoc に「current call shape is single-turn」「Multi-turn usage must preserve Anthropic's role-alternation rule」を明記。
- **[N-004]** **W-A-003 修正済み** — `anthropic/llmProvider.ts` で `startsWithBrace` 分岐を追加し無駄な計算を回避。
- **[N-005]** **W-A-004 修正済み** — OpenAI / Gemini 両方の class JSDoc に構造化出力フラグの model compatibility 注意書きを追加。
- **[N-006]** **W-T-001 修正済み** — 3 アダプタすべてに「suggestMetadata recovery」「LLMRateLimitError 伝播」テストを追加。B-001 のリグレッションガードとして機能。
- **[N-007]** **W-T-002 修正済み** — jsonEnvelope.test.ts に「prose 内擬似ブレース対 → 後続の本物 envelope を救う」「全 brace 候補パース失敗 → null」を追加。
- **[N-008]** ADR-001 に「リトライ呼び出し中の throw 伝播ルール (Review #001 B-001 で確定)」の補足が追記済み。実装と一致。
- **[N-009]** `pnpm typecheck` clean、`pnpm test:unit` で 2453 tests passed。
- **[N-010]** CLAUDE.md 原則準拠: WHY コメントのみ、既存スタイル踏襲、3 adapter の対称性保持。
- **[N-011]** 1 周目で指摘した 7 件（B-001 + W-A-001〜004 + W-T-001〜002）はすべて期待通り修正されており、修正に伴う退行は検出されなかった。

---

## Design Decisions

このラウンドで新しい設計判断はなし。Round #001 で追記した ADR-001 補足（リトライ伝播ルール）が実装に反映されていることを確認したのみ。
