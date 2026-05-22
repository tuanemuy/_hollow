# PR Review #002 — feat(llm): wire real LLM providers

**PR:** #138
**Date:** 2026-05-22
**Round:** 2回目

---

## Summary

- Blockers: **0**
- Warnings: **0**
- Notes: 確認事項多数（修正反映の verify）
- Verdict: **APPROVED**

Round 1 で指摘した Blocker 1 + Warning 21 件の修正と、見送り Warning 4 件の ADR-010 文書化が、両並列レビュー（Adapter+Test / Domain+Schema+Frontend+Infra）で全て確認された。1 ラウンドクリーンでレビューループ終了。

---

## Adapter & Test (Round 2)

### Blockers
なし

### Warnings
なし

### Notes（修正反映の確認）

- **B-A-001 (R2)**: `pdfExtractor.ts:84` に `{ filename: "document.pdf", file_data: dataURI }`、`pdfExtractor.test.ts:89` で assertion 確認済み
- **W-A-001 / W-T-001 (R2)**: `llmConnectionTester.test.ts` 244 行新規。constructor invariant / empty apiKey 早期 return / provider switch / envelope 正規化 / latencyMs 全カバー
- **W-A-002 / W-T-002 (R2)**: `anthropic/__tests__/connectionPing.test.ts` 120 行新規。openai / gemini と対称な観点
- **W-A-003 (R2)**: OpenAI messagesClient test に 8191/8192/8193/100KB chunk boundary
- **W-A-005 (R2)**: ocrProvider / pdfExtractor test に Azure 風 baseURL での URL 組み立て検証
- **W-T-003 (R2)**: adminSettings.integration.test.ts に useDraft=true / useDraft=true + draftConfig=null
- **W-T-005 (R2)**: messagesClient.test.ts に RangeError → UnavailableErr

---

## Domain & Schema & Frontend & Infra (Round 2)

### Blockers
なし

### Warnings
なし

### Notes（修正反映の確認）

- **W-D-001 (R2)**: env branch reject 設計を「`null` のみ許容」と更に厳格化、test で `null / "" / "   "` 網羅
- **W-D-002 (R2)**: assertEnvOverride JSDoc に provider/baseURL carry-over invariant 明記
- **W-U-001 (R2)**: testLLMConnectionSchema に cross-field refine、schema.test.ts で全パターン
- **W-U-002 (R2)**: updateLLMConfig JSDoc に EnvOverrideMissingKey throw 経路明記
- **W-F-001 (R2)**: draft env-only narrowing 完了、schema.test.ts で reject 確認
- **W-F-002 (R2)**: `isProviderId` defensive narrowing が 3 箇所で一貫適用
- **W-F-004 (R2)**: ProviderChangedRequiresApiKey の field-level error 表示
- **W-F-005 (R2)**: aria 整理（警告中は status 非表示）
- **W-I-001 (R2)**: renderWrangler.ts ADR 参照を `Issue #122 ADR-008` に訂正
- **W-I-002 (R2)**: infra/src/secrets.ts 多 provider 対応書き換え
- **W-I-003 / W-I-004 (R2)**: createRequestContainer / createConsumerContainer の JSDoc 明記
- **W-T-004 (R2)**: schema.test.ts 190 行新規

---

## Design Decisions

ADR-010 で見送り 4 件（W-A-004 / W-I-005 / W-F-003 / W-F-006）の理由とフォローアップ方針を文書化。Phase 4 でフォローアップ Issue を起票予定。

---

## 検証結果

- `pnpm typecheck` clean
- `pnpm test:unit` 1786 passed (112 files)
- `pnpm test:integration` 362 passed (32 files)
- `pnpm exec biome check` no issues
- 新たな回帰なし

---

## 結論

**APPROVED**。Round 1 修正が両並列レビューで完全に確認された。レビューループは Round 2 をもって終了（1 ラウンドクリーン完了条件達成）。Phase 4 へ進む。
