# PR Review #002 — refactor(llm): provider-agnostic LLM adapter abstraction (#122)

**PR:** #130
**Date:** 2026-05-21
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 10
- Verdict: **APPROVED**

---

## Blockers
なし

## Warnings
なし

## Notes
- **[N-001]** すべての review-001 ブロッカー・警告が誠実に解消されている。新規 regression は検出されなかった。
- **[N-002]** W-A-002 の error message 分離 (`Unsupported LLM/OCR/PDF provider`) と並行して、`llmProviderFactory.test.ts` と `serverCloudflare.test.ts` の assertion を同期更新済み。
- **[N-003]** W-T-002 で追加した `readRequestServerConfig` describe ブロックは `Object.hasOwn(config, "adminLlmProvider")` で直接 `exactOptionalPropertyTypes` invariant を検証。`tsgo` typecheck も pass。
- **[N-004]** W-T-001 の補強で `createConsumerContainer` の env → readRequestServerConfig → factory chain regression が catch される。
- **[N-005]** B-C-001 の sync が完璧。`infra/templates/wrangler.{staging,production}.toml.tmpl` の `[vars]` と `[env.consumer.vars]` 両方、`renderWrangler.ts` の vars リテラル、4 箇所すべて同期。
- **[N-006]** `renderWrangler.ts` のコメントが checklist (LLM_PROVIDERS / factory / template) を集約しており ADR-008 と整合。
- **[N-007]** ADR-008 と ADR-007 補足追記が論理的に妥当。
- **[N-008]** W-A-001 の JSDoc rename がファイル内 2 箇所で完全。残存参照 grep 0 件。
- **[N-009]** W-C-002 の `LLM_PROVIDERS` コメントは invariant-first 表現に書き換え済み。CLAUDE.md「Dependencies point inward」と整合。
- **[N-010]** テスト数 1602 unit + 352 integration が前回 +3 unit と一致。`pnpm typecheck` も 0 error。

## review-001 解消状況

| 指摘 | 状態 | 詳細 |
|------|------|------|
| B-C-001 | ✓ | infra/templates 両ファイルの 2 sections + renderWrangler.ts vars リテラル、4 箇所同期 |
| W-A-001 | ✓ | llmProvider.ts:53 / :153 の "anthropicMessagesClient.ts" → "messagesClient.ts" 完了 |
| W-A-002 | ✓ | factory 3 関数の error message を LLM/OCR/PDF で識別子分離、test assertion も同期 |
| W-T-001 | ✓ | createConsumerContainer に env→factory chain throw test 追加 |
| W-T-002 | ✓ | readRequestServerConfig 直接 unit test 2 ケース追加（set/unset 経路） |
| W-C-002 | ✓ | LLM_PROVIDERS コメントを invariant 中心の表現に書き換え |
| W-D-001 | ✓ | ADR-007 に buildXxx 二段階 validation 境界追記 |
| W-A-003 | 後回し | YAGNI 採用済み、次の provider 追加 Issue で扱う領域 |

## Verdict

**APPROVED**

Round 1 で指摘した 1 ブロッカー・6 警告（W-A-003 を除く全件）が誠実に解消され、新規 regression は検出されなかった。`pnpm typecheck` clean、`pnpm test:unit` 1602 / 1602 PASS（+3）、`pnpm test:integration` 352 / 352 PASS。設計判断（ADR-008 追加、ADR-007 拡張）も論理的で完全。マージ可。
