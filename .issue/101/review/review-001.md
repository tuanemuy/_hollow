# PR Review #001 — feat(llm): wire real LLM providers (Anthropic + extensible) with admin-settings-driven resolution

**PR:** #138
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: **1**
- Warnings: **25**
- Notes: 多数（省略）
- Verdict: **BLOCKED**

5 レイヤー並列レビュー（Domain & Use Case / Adapter / Infrastructure / Frontend & Security / Test）の結果。Blocker は OpenAI PDF 機能の API 仕様違反 1 件。Warning は dispatcher / pingAnthropic のテスト欠落、schema 防御、ドキュメント不整合等。

---

## Domain & Use Case

### Blockers
なし

### Warnings

- **[W-D-001]** `LLMConfig.create` の `apiKeySource === "env"` 検証が `apiKeyCiphertext === null` のみで、空文字列を許容してしまう
  - 場所: `app/core/domain/adminSettings/valueObject.ts:231-237`
  - 理由: env source 時の不変条件「ciphertext が無い」だが、空文字列 `""` が漏れる。db 側 (220-223 行) は `trim().length === 0` を厳格にチェックしているのに対称性を欠く。
  - 提案: env 側でも空文字列 reject、または `null` 以外を一律 reject に統一。

- **[W-D-002]** `assertEnvOverride` の provider/baseURL carry-over invariant が JSDoc で明示されていない
  - 場所: `app/core/domain/adminSettings/service.ts:52-58`
  - 提案: JSDoc に「provider と baseURL は cfg をそのまま carry over、不整合は VO に責務委譲」を明記。

- **[W-U-001]** `testLLMConnection` の draftConfig 経由で `LLMConfig.create` が throw した場合、「常に struct を返す」契約が破れる
  - 場所: `app/core/application/adminSettings/testLLMConnection.ts:65-71`
  - 提案: `testLLMConnectionSchema` に provider × baseURL cross-field refine 追加。

- **[W-U-002]** `updateLLMConfig` で provider 据置 + env source + env 空時の `EnvOverrideMissingKey` throw が docstring に書かれていない
  - 場所: `app/core/application/adminSettings/updateLLMConfig.ts:100-111`
  - 提案: `UpdateLLMConfigInput` JSDoc に追記。

---

## Adapter

### Blockers

- **[B-A-001]** OpenAI PDF `file` content block が必須 `filename` field を欠落
  - 場所: `app/core/adapters/openai/pdfExtractor.ts:82-84`
  - 理由: OpenAI API は `{ filename: string, file_data: string }` を要求。`filename` 無しでは HTTP 400 で reject、`PDFParseError` で全 PDF 実行が失敗する。テストは body shape のみで API contract を見ていないため検知されなかった。
  - 提案: `{ type: "file", file: { filename: "document.pdf", file_data: dataURI } }` に修正。`pdfExtractor.test.ts` に `filename` field assertion 追加。

### Warnings

- **[W-A-001]** `HttpLLMConnectionTester` dispatcher の unit test 欠落
  - 場所: `app/core/application/di/llmConnectionTester.ts` （`__tests__` 無し）
  - 提案: `app/core/application/di/__tests__/llmConnectionTester.test.ts` 新規。provider switch / 戻り値正規化 / empty apiKey 早期 return / latencyMs / unknown provider 等。

- **[W-A-002]** `pingAnthropic` の unit test 欠落
  - 場所: `app/core/adapters/anthropic/connectionPing.ts`
  - 提案: openai / gemini と対称に `app/core/adapters/anthropic/__tests__/connectionPing.test.ts` を追加。

- **[W-A-003]** OpenAI `arrayBufferToBase64` の chunk boundary テストが shallow
  - 場所: `app/core/adapters/openai/__tests__/messagesClient.test.ts:366-376`
  - 提案: Gemini と同様 8KB chunk boundary（8191/8192/8193/100KB）を追加。

- **[W-A-004]** `OpenAISharedConfig.baseURL: string | undefined` vs `LLMConfig.baseURL: string | null` の impedance mismatch
  - 場所: `app/core/application/di/llmConnectionTester.ts:57-70`
  - 提案: helper 経由で coercion、または `OpenAISharedConfig` を `string | null | undefined` 許容に。

- **[W-A-005]** OpenAI PDF/OCR テストで `baseURL` 経由 URL の assertion が無い
  - 場所: `app/core/adapters/openai/__tests__/ocrProvider.test.ts`, `pdfExtractor.test.ts`
  - 提案: non-default baseURL での URL 組み立てテストを追加。

---

## Infrastructure

### Blockers
なし

### Warnings

- **[W-I-001]** `renderWrangler.ts` の checklist コメント ADR 参照が不正確（`Issue #101 ADR-008` → 実は `Issue #122 ADR-008`）
  - 場所: `infra/scripts/renderWrangler.ts:102`
  - 提案: `Issue #101 plan.md Step 10 (re #122 ADR-008)` に修正。

- **[W-I-002]** `infra/src/secrets.ts` のドキュメントが Anthropic ハードコード前提のまま
  - 場所: `infra/src/secrets.ts:34-36`
  - 提案: provider 横断の説明（Anthropic / OpenAI / Gemini）に書き換え。

- **[W-I-003]** `createRequestContainer` が `ADMIN_LLM_BASE_URL` env を完全に無視
  - 場所: `app/core/application/di/serverCloudflare.ts:227-278 / 439-455`
  - 提案: ADR-007「request path から LLM を直接呼ばない契約」を JSDoc に引用、または `adminLlmBaseURL` を request path にも貫通。

- **[W-I-004]** `createConsumerContainer` が LLM provider を 2 回構築する冗長性
  - 場所: `app/core/application/di/serverCloudflare.ts:543-589`
  - 提案: JSDoc で 2 重構築が意図的であることを明示。

- **[W-I-005]** env baseURL override の実効性確認テストが assertion 弱い（`instanceof OpenAILLMProvider` のみ）
  - 場所: `app/core/application/di/__tests__/createConsumerContainer.integration.test.ts:137-160`
  - 提案: resolveLLMConfigFromEnvAndDb pure function を抽出して直接 assertion、または fetch mock 経由で URL 検証。

---

## Frontend & Security

### Blockers
なし

### Warnings

- **[W-F-001]** `testLLMConnection` の draft 経路でクライアント供給の `apiKeyCiphertext` を受け付け
  - 場所: `app/core/application/adminSettings/testLLMConnection.ts:63-71`, `app/components/admin/schema.ts:46-54`
  - 提案: draft schema を `apiKeySource: z.literal("env")` + `apiKeyCiphertext: z.null()` に絞る。

- **[W-F-002]** `persistedProvider as ProviderId` cast が transport/domain drift をすり抜ける
  - 場所: `app/components/admin/LLMSettingsForm/index.tsx:78`
  - 提案: `isProviderId(...)` で defensive narrowing。

- **[W-F-003]** connectionPing error の生メッセージが UI に露出
  - 場所: `index.tsx:311`, `gemini/connectionPing.ts:97`
  - 提案: 既知 reason カテゴリへの sanitize、または `instanceof TypeError` 等に限定。

- **[W-F-004]** `apiKeyRequired` のサーバ side reject UI fallback が field-level でない
  - 場所: `index.tsx:285`
  - 提案: `ProviderChangedRequiresApiKey` 捕捉 → `setApiKeyError(...)` + `aria-invalid` 付与。

- **[W-F-005]** 「現在の状態」`role="status"` と「警告」`role="alert"` のアナウンス順序が不整合
  - 場所: `index.tsx:249-258`
  - 提案: 警告表示時は status を隠す、または aria-live を統一。

- **[W-F-006]** CSRF 対策が SameSite=lax のみ（明示的 token / Origin 検証無し、PR スコープ外）
  - 場所: `app/core/presentation/authMiddleware.ts:16-29`
  - 提案: 別 Issue で `Origin`/`Referer` 検証追加。

---

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** `HttpLLMConnectionTester` dispatcher の unit test 欠落（W-A-001 と重複、同じ問題）
- **[W-T-002]** `pingAnthropic` の unit test 欠落（W-A-002 と重複、同じ問題）
- **[W-T-003]** `testLLMConnection` の `useDraft: true` 経路が integration test で未実行
  - 場所: `adminSettings.integration.test.ts:432, 459`
  - 提案: useDraft true の draftConfig.baseURL passing をテスト追加。
- **[W-T-004]** transport schema (`schema.ts`) の `baseURLSchema` / `LLM_PROVIDERS_TRANSPORT` を直接検証するテストが存在しない
  - 提案: `app/components/admin/__tests__/schema.test.ts` 新規。
- **[W-T-005]** OpenAI `messagesClient` の "Unexpected error" 分岐（AbortError でも TypeError でもない throw、line 229-232）が未テスト
  - 提案: Gemini と対称に `RangeError` 等で投げる test 追加。

---

## Design Decisions

このラウンドで新たに発生した設計判断は無し。修正は既存 ADR-001〜009 の枠内で実施可能。
