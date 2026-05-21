# 実装進捗 — Issue #113

## 完了ステップ

- **Step 0 (前提確認)**: Anthropic PDF document content block は GA、`anthropic-version: 2023-06-01` のみで動作。`anthropic-beta` header は不要。事前確認結果に従い `betaHeader` フィールドは YAGNI で `AnthropicSharedConfig` から削除した。
- **Step 1**: `app/core/adapters/llm/anthropicMessagesClient.ts` を新規作成。`AnthropicSharedConfig` / `arrayBufferToBase64` (8KB チャンク) / `callAnthropicMessages` / `AnthropicContentBlock` union を export。空 response (`""` を返す) の挙動は plan.md / ADR-002 に準拠。
- **Step 2**: `AnthropicOCRProvider` を `ocrProvider.ts` に追加。MIME guard (`image/jpeg|png|gif|webp`) と 5MB サイズ guard、`maxTokens: 16384` を constructor で設定。`StubOCRProvider` は温存。
- **Step 3**: `AnthropicPDFExtractor` を `pdfExtractor.ts` に追加。32MB サイズ guard、`maxTokens: 16384`、返り値 `{ textual: true, text, pageImages: [] }` 固定。`StubPDFExtractor` は温存。
- **Step 4**: `buildOcrProvider` / `buildPdfExtractor` を `serverCloudflare.ts` から export。三項分岐を helper 呼び出しに置換。JSDoc コメントを更新。
- **Step 5**: DI unit テスト追加。`describe("buildOcrProvider", ...)` / `describe("buildPdfExtractor", ...)` 各 4 ケース、`createRequestContainer — env → adapter mapping` 配下に OCR / PDF 各 4 ケース、`createConsumerContainer — env / ctx → adapter mapping` の `threads ServerEnv R2 + LLM bindings ...` テストに `AnthropicOCRProvider` / `AnthropicPDFExtractor` の instanceof 検証を追加。既存 `surfaces explicit BusinessRuleError from existing Stub providers` テストは env なしで Stub 経路に落ちる前提のため変更不要。
- **Step 6**: adapter unit テスト新規追加 (`ocrProvider.test.ts` / `pdfExtractor.test.ts`)。happy path / HTTP 429 / 500 / 403+permission_error / timeout (abort) / TypeError / 空 text block / pre-flight guard (MIME / サイズ) / constructor guard を網羅。`vi.stubGlobal("fetch", ...)` + `afterEach(() => vi.unstubAllGlobals())` で全テスト隔離。
- **Step 7**: 統合テスト追加 (`runIngestionJob.integration.test.ts`)。`image` シナリオは `AnthropicOCRProvider` + `AnthropicLLMProvider` を inject し fake fetch で 3 リクエスト (OCR → structureToHtml → suggestMetadata) を順に応答、`pdfTextual` シナリオは `AnthropicPDFExtractor` + `AnthropicLLMProvider` で同様。最終的に `previewing` 状態と preview HTML 内容を verify。

## スキップしたステップ

- なし — Step 0 〜 Step 8 まで全て対応済み (Step 8 は review-001 T-W-003 への対応として有効化、`anthropicMessagesClient.test.ts` を新規追加)。

## 設計判断の追加

- 追加 ADR なし。`betaHeader` の YAGNI 削除は Step 0 prerequisite 結果に基づく決定で、ADR-002 (helper の scope) の範囲内。

## 検証結果

```
$ pnpm typecheck    # PASS
$ pnpm lint:fix     # PASS (既存の noTemplateCurlyInString warnings は無関係箇所)
$ pnpm format       # PASS
$ pnpm test:unit    # 95 files / 1519 tests passed
$ pnpm test:integration  # 31 files / 352 tests passed
```

## 既知の制限

- 既存 `AnthropicLLMProvider` は helper に移行していない (ADR-002 に明示済み)。
- Speech / Office は Stub のまま据え置き (ADR-005)。

## Phase 4 フォロー Issue (起票済み)

- **#118** feat(llm): real SpeechRecognitionProvider adapter (Whisper / Workers AI)
- **#119** feat(llm): real OfficeExtractor adapter (docx / xlsx / pptx)
- **#120** refactor(llm): migrate AnthropicLLMProvider to anthropicMessagesClient helper
