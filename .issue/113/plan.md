# 実装計画 — Issue #113: feat(llm): real OCR / Office / PDF / SpeechRecognition adapters

**Issue:** #113
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

Issue #110 (PR #112) で `[env.consumer]` への bindings 配布までは完了しているが、`app/core/adapters/llm/` の 4 つの port (`OCRProvider` / `OfficeExtractor` / `PDFExtractor` / `SpeechRecognitionProvider`) は依然として Stub のままで `BusinessRuleError("unsupported_format")` を throw する状態。本 Issue では「指定された LLM (Anthropic) にファイルを直接投げるだけ」のアプローチで OCR と PDF の実 adapter を投入し、`createRequestContainer` の DI 三項分岐を `llmProvider` と同じ env 条件で wire する。

## スコープ

### 含まれるもの

- `AnthropicOCRProvider` の新規実装 — Anthropic Messages API の image content block を使った OCR
- `AnthropicPDFExtractor` の新規実装 — Anthropic Messages API の document content block を使った PDF テキスト抽出 (`textual: true` 固定 / `pageImages: []`)
- Anthropic Messages API の共通呼び出しロジックを `anthropicMessagesClient.ts` として helper モジュール化 (新規 adapter 2 つで共有)
- `createRequestContainer` 内の三項分岐を `buildOcrProvider` / `buildPdfExtractor` の pure helper として export (ADR-009 の `buildRelayTrigger` 同パターン)
- DI 三項分岐 + 各 helper の unit test
- adapter unit test (fetch を `vi.stubGlobal` でモック; happy path + 主要 error mapping)
- 既存 `runIngestionJob` の port 経由テストはローカル Stub に閉じているため変更なし

### 含まれないもの

- **`SpeechRecognitionProvider` の実 adapter** — Anthropic は ASR を提供しないため、Whisper など別 provider を要する。ユーザー指示により「音声は現時点で未対応」として Stub のまま据え置き。Phase 4 で別 Issue を起票。
- **`OfficeExtractor` の実 adapter** — Anthropic は Office 文書を直接サポートしない (PDF と画像のみ)。docx/xlsx/pptx パーサライブラリの Workers 互換性確認とライセンス検討が別途必要。ユーザー指示により「Office も現時点で未対応」として Stub のまま据え置き。Phase 4 で別 Issue を起票。
- **既存 `AnthropicLLMProvider` の helper 移行リファクタ** — `invoke()` / `throwForStatus()` を共通 client に移すリファクタは破壊リスクが本 Issue scope を超えるため、フォロー Issue (LLMProvider のテスト整備と合わせて) で対応する。本 Issue では新規 helper を OCR / PDF だけが利用する形に留める。
- **DB-stored ciphertext 経由の LLM 設定動的解決** — Issue #110 ADR-002 で別 Issue 化済み。本 Issue では env override (`ADMIN_LLM_API_KEY` / `ADMIN_LLM_MODEL`) 経路のみ対応。

## 実装ステップ

### 0. 着手前の前提確認 (prerequisite)

- **Anthropic Messages API の `document` content block の現行仕様確認**: 2026-05-21 時点で `anthropic-version: 2023-06-01` のみで PDF が動くか、`anthropic-beta: pdfs-2024-09-25` 等の beta header が必要か、`api.anthropic.com/v1/messages` への curl で smoke (最小 PDF 1 枚) で事前確認する。
  - 結果が「beta header 不要 (GA)」なら、`AnthropicSharedConfig.betaHeader` は optional で残し、PDF adapter からは渡さない。
  - 結果が「beta header 必須」なら、PDF adapter は `betaHeader: "pdfs-2024-09-25"` を hard-code で `AnthropicSharedConfig` に渡す。helper 側はこの値があれば `anthropic-beta` header に乗せる。
- これは実装着手前に curl で 1 回だけ確認すれば足る。後の Step 1 / Step 3 で確認結果を踏まえて helper / PDF adapter を実装する。

### 1. `anthropicMessagesClient.ts` の新規追加

- **対象ファイル:** `app/core/adapters/llm/anthropicMessagesClient.ts` (新規)
- **変更内容:**
  - `AnthropicSharedConfig` 型を export (`{ apiKey, model, endpoint?, apiVersion?, timeoutMs?, maxTokens?, betaHeader? }`)。既存 `AnthropicLLMConfig` と structurally compatible。
  - `DEFAULT_ENDPOINT` / `DEFAULT_API_VERSION` / `DEFAULT_TIMEOUT_MS` を export (既存 `llmProvider.ts` の値と一致させる)。`DEFAULT_MAX_TOKENS` は LLM 用の `4096` を維持しつつ、OCR / PDF からは constructor 経由で **`16384` 以上を明示的に渡す** (理由: PDF 全文抽出 / OCR 出力の打ち切り回避。`max_tokens` のデフォルトを変えると LLM 側の cost / behavior が変わるので OCR / PDF だけ上書き)。
  - `AnthropicContentBlock` 型 (text / image / document のタグ付き union) を export。
  - `arrayBufferToBase64(buf: ArrayBuffer): string` を export — Workers 互換の chunked encoding。実装ノート: V8 系 (Workers / Node) で `String.fromCharCode(...args)` の引数上限が 65535 程度なので、8KB チャンク (`8 * 1024`) で十分安全。Latin-1 として byte → string 変換 → `btoa` の経路。JSDoc に「Latin-1 1byte=1char セマンティクス、UTF-8 ではない」旨を明記。
  - `AnthropicErrorMapper` 型 (`{ rateLimit, unavailable, timeout, quota }: each (msg: string, cause?: unknown) => Error`) を export。
  - `callAnthropicMessages(config, system, content, mapper): Promise<string>` を export — fetch + AbortController + status mapping + text 抽出を内包し、最終的に投げる Error class は `mapper` で provider 別に差し替え可能。**重要: response に text block が無い (`content` が空 / text block が無い) 場合は `""` を返す (例外にしない)**。既存 `AnthropicLLMProvider.invoke` は同条件で `LLMUnavailableError` を throw するが、OCR / PDF の port 契約 (空文字許容 = 「テキスト未検出」) に合わせるため helper では空文字を返す。将来 helper を LLMProvider に移行する場合は呼び出し側で「空文字 → `LLMUnavailableError` 変換」を再導入する必要がある (ADR-002 参照)。
- **理由:** OCR / PDF / 既存 LLM の 3 者で HTTP 部分が完全に同型のため、3 つ目を作る前に共通化しないと負債が増殖する。エラー型を injection することで port 契約 (OCR: `OCRFailureError` 唯一許容 / PDF: `PDFParseError` 唯一許容) を破らない。
- **既存 `AnthropicLLMProvider` は本 helper を使わない** — 既存挙動の壊滅リスクを避けるため、別 PR で段階的に helper へ寄せる。重複は一時的に許容、ADR で明示。

### 2. `AnthropicOCRProvider` の追加

- **対象ファイル:** `app/core/adapters/llm/ocrProvider.ts`
- **変更内容:**
  - 既存 `StubOCRProvider` は温存 (DI fallback 用)。
  - 新規クラス `AnthropicOCRProvider implements OCRProvider`:
    - constructor は `AnthropicSharedConfig` を受け、`apiKey` / `model` の空チェック (既存 LLMProvider 同パターン)。
    - `extractText({ imageBytes, mime })`:
      1. `mime` が Anthropic Vision 対応形式 (`image/jpeg` / `image/png` / `image/gif` / `image/webp`) かを早期検証。それ以外なら `OCRFailureError("unsupported_image_mime: <mime>")` を throw (fetch は呼ばない)。
      2. `imageBytes.byteLength > 5 * 1024 * 1024` (Anthropic Vision 1 image 上限) なら `OCRFailureError("image_too_large")` で早期 fail。
      3. `arrayBufferToBase64(imageBytes)` で base64 化。
      4. system prompt: `"You are an OCR engine. Extract all visible text from the image verbatim. Preserve line breaks. If no text is present, return an empty string. Do not add commentary."`
      5. `callAnthropicMessages(this.config, system, [{ type: "image", source: { type: "base64", media_type: mime, data: <base64> } }], ocrErrorMapper)` を呼ぶ。
      6. `ocrErrorMapper`: 全 transient / permanent failure を `OCRFailureError` に集約 (port 契約上唯一許される throw 型)。
      7. 返された text をそのまま返す (空文字許容 — port 契約: 「テキスト未検出 = 空文字」)。
- **理由:** Issue 完了条件「OCRProvider 実 adapter 実装」を最小コストで満たす。Vision の MIME / サイズ guard は外部 API 4xx を待たずに早期に明確な error を返すための defensive 実装。

### 3. `AnthropicPDFExtractor` の追加

- **対象ファイル:** `app/core/adapters/llm/pdfExtractor.ts`
- **変更内容:**
  - 既存 `StubPDFExtractor` は温存。
  - 新規クラス `AnthropicPDFExtractor implements PDFExtractor`:
    - constructor は `AnthropicSharedConfig` を受ける。
    - `extract({ bytes })`:
      1. `bytes.byteLength > 32 * 1024 * 1024` (Anthropic document block の上限) なら `PDFParseError("pdf_too_large")` で早期 fail。
      2. `arrayBufferToBase64(bytes)` で base64 化。
      3. system prompt: `"Extract the full text content of the PDF document verbatim, preserving paragraph order and line breaks. Output only the extracted text, without commentary, page numbers, headers, or footers. If the PDF has no readable text, return an empty string."`
      4. `callAnthropicMessages(this.config, system, [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: <base64> } }], pdfErrorMapper)` を呼ぶ。
      5. `pdfErrorMapper`: 全 failure を `PDFParseError` に集約。
      6. 返り値: `{ textual: true, text, pageImages: [] }` の固定 shape。`maxTokens` は constructor で `16384` を渡す (Step 1 参照)。
- **理由:** ユーザー指示通り「LLM にファイルを投げるだけ」を最小コストで実現。`textual: true` + 非空 `text` で `runIngestionJob.extractText()` の `pdfTextual` 分岐 (`runIngestionJob.ts:275`) は OCR ループに落ちず素直に `text` を使う。**LLM が "no text" を返した場合 (`text === ""`)** は `text.trim().length > 0` 条件不成立 → 既存 pipeline は `pageImages` を OCR にループするが、`pageImages: []` のため空配列 `Promise.all` → `join("\n\n") === ""` で空文字が下流に渡る (実害なしの dead path、既存挙動と整合)。後続 Issue で本物の PDF parser を入れる場合に `pageImages` の意味論を再設計する余地は ADR-001 で記録。

### 4. DI 三項分岐の pure helper 化と配線

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - import に `AnthropicOCRProvider` / `AnthropicPDFExtractor` を追加。
  - `buildOcrProvider(adminLlmApiKey, adminLlmModel): OCRProvider` を export — 中身は `adminLlmApiKey && adminLlmModel ? new AnthropicOCRProvider({ apiKey, model }) : new StubOCRProvider()`。
  - `buildPdfExtractor(adminLlmApiKey, adminLlmModel): PDFExtractor` を同パターンで export。
  - `createRequestContainer` 内の該当行を helper 呼び出しに置換:
    - `ocrProvider: buildOcrProvider(adminLlmApiKey, adminLlmModel),`
    - `pdfExtractor: buildPdfExtractor(adminLlmApiKey, adminLlmModel),`
    - `speechRecognitionProvider: new StubSpeechRecognitionProvider(),` (変更なし)
    - `officeExtractor: new StubOfficeExtractor(),` (変更なし)
  - JSDoc コメントを更新: 既存「OCR / Office / PDF / SpeechRecognition remain `Stub*` because no real adapters exist yet (ADR-003 of Issue #110)」を「OCR / PDF wire `Anthropic*Provider` via the same `ADMIN_LLM_*` env pair when present (Issue #113). Office / SpeechRecognition remain `Stub*` (フォロー Issue 起票済み)」に書き換え。
  - `createConsumerContainer` は `createRequestContainer` 経由なので追加変更不要。
- **理由:** ADR-009 (`buildRelayTrigger` を pure helper として切り出し instanceof 検証可能にする) と同型のパターンに揃える。三項分岐がテスト内のトートロジーで pass する PR #112 review-002 の問題を再発させない。`buildLlmProvider` の helper 化は本 Issue ではやらない (既存 LLMProvider に手を入れない方針と整合)。

### 5. DI 単体テストの追加

- **対象ファイル:** `app/core/application/di/__tests__/serverCloudflare.test.ts`
- **変更内容:**
  - 既存 `describe("buildRelayTrigger", ...)` の隣に `describe("buildOcrProvider", ...)` と `describe("buildPdfExtractor", ...)` を追加。各 4 ケース (`it.each` でも可):
    - apiKey + model 両方 truthy → `Anthropic*Provider` の instance
    - apiKey のみ → `Stub*` の instance
    - model のみ → `Stub*` の instance
    - 両方 missing → `Stub*` の instance
  - 既存 `describe("createRequestContainer — env → adapter mapping")` の `llmProvider` セクション直下に `ocrProvider` / `pdfExtractor` の 4 ケース ずつを追加 (container 経由でも instanceof が正しいことを再確認)。
  - 既存 `surfaces explicit BusinessRuleError from existing Stub providers` テスト (212-254 行) はデフォルト config (env なし) で Stub 経路に落ちる前提なのでそのまま動作 — 修正不要。
  - 既存 `createConsumerContainer — env / ctx → adapter mapping` の `threads ServerEnv R2 + LLM bindings through to the right adapters` テスト (402-418 行) に `expect(container.ocrProvider).toBeInstanceOf(AnthropicOCRProvider)` と `expect(container.pdfExtractor).toBeInstanceOf(AnthropicPDFExtractor)` を追加。
- **理由:** Issue 完了条件「DI で env 揃ったら実 adapter に切り替わる三項分岐」をトートロジーなしの直接 assertion で網羅する。

### 6. adapter unit テストの新規追加 (fetch mock)

- **対象ファイル:** `app/core/adapters/llm/__tests__/ocrProvider.test.ts` (新規), `app/core/adapters/llm/__tests__/pdfExtractor.test.ts` (新規)
- **変更内容:** 各テストで `vi.stubGlobal("fetch", vi.fn())` で global fetch をモックし `afterEach(() => vi.unstubAllGlobals())` で確実に cleanup する (リポジトリに `stubGlobal` の先例がないため明示)。以下を verify:
  - **happy path**: `200 OK` + `{ content: [{ type: "text", text: "..." }] }` で fetch が応答 → 期待 text が返る。fetch mock の引数 (body / headers) を parse して `messages[0].content[0]` の shape を `expect(...).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } })` の形でピンポイント assert (`data` フィールドは「string であること」のみ assert、base64 round-trip は helper 側に閉じる)。
  - **HTTP 429** → `OCRFailureError` / `PDFParseError`。
  - **HTTP 500** → 同上。
  - **HTTP 403 + `error.type: "permission_error"`** → 同上 (quota mapper 経由)。
  - **timeout** (短い `timeoutMs` を渡し fetch mock を `new Promise(() => {})` で hang させる) → 同上。
  - **`TypeError("fetch failed")`** → 同上。
  - **response に text block 無し** → OCR は `""` を返す (空文字許容)、PDF は `{ textual: true, text: "", pageImages: [] }` を返す。
  - **OCR 固有: 不正な mime** (`application/octet-stream`) → fetch を呼ばずに `OCRFailureError`。エラーメッセージに mime を含める (`unsupported_image_mime: application/octet-stream`)。
  - **OCR 固有: 5MB 超画像** → fetch を呼ばずに `OCRFailureError`。
  - **PDF 固有: 32MB 超ファイル** → fetch を呼ばずに `PDFParseError`。
- **理由:** port contract を adapter レベルでロックして、後で helper 内 error mapping を変更したときに breakage が即検知される。既存 `AnthropicLLMProvider` には unit test がないが、本 Issue では OCR / PDF だけに留め、LLM テスト整備は follow-up Issue に分離。

### 7. 統合テスト追加 (runIngestionJob 経由)

- **対象ファイル:** `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts` (拡張)
- **変更内容:** Issue 完了条件「統合テストで実 adapter 経由の ingestion が動くこと」を満たすため、以下 2 ケースを追加:
  - **`image` シナリオ**: `AnthropicOCRProvider` 実 instance を inject、`vi.stubGlobal("fetch", ...)` で Anthropic API レスポンスを mock。OCR fetch + LLM `structureToHtml` fetch + LLM `suggestMetadata` fetch の合計 3 リクエストが順に呼ばれ、最終的に `runIngestionJob` が preview を生成して `IngestionJob` を `succeeded` 状態にまで進めることを assert。fetch mock は URL でフィルタしてテストごとに別のレスポンスを返す。
  - **`pdfTextual` シナリオ**: `AnthropicPDFExtractor` 実 instance + `AnthropicLLMProvider` 実 instance を inject、同じく fetch mock で end-to-end を verify。`{ textual: true, text: <抽出>, pageImages: [] }` を返したあと LLM structuring に渡る経路まで通る。
- **cleanup**: 各 case の `afterEach` で `vi.unstubAllGlobals()` を呼び、他テストへの fetch mock 漏洩を防ぐ。
- **理由:** Issue 完了条件「統合テスト」を素直に満たす。既存テストは `Stub*` 経路のみで pipeline を担保しているため、実 adapter 経由のテストはここで初めて入る。Anthropic 実 API は叩かず fake fetch で済ませることで CI 実行コストを抑える (Issue #110 のテスト戦略と整合)。

### 8. helper 単体テスト (オプション)

- **対象ファイル:** `app/core/adapters/llm/__tests__/anthropicMessagesClient.test.ts` (新規)
- **判断基準:** Step 6 / Step 7 のテストで helper の動作 (status mapping / base64 encoding / text 抽出) が結果として verify される。**実施するのは以下のいずれかが満たされた場合のみ**:
  - `arrayBufferToBase64` を 8KB チャンク境界 (例: 8191 / 8192 / 8193 byte) で round-trip 検証したい
  - helper の error mapper 切り替えを provider 非依存に直接 verify したい
- 実施しない場合は plan / progress.md で「Step 6 / Step 7 の adapter テストで十分なため省略」と記録。
- **理由:** 実装初期は不要、後で必要になれば追加で十分 (YAGNI)。

## 設計判断

詳細は `.issue/113/adr.md` を参照。本 Issue で記録する主な設計判断:

- **ADR-001**: `AnthropicPDFExtractor` が `pageImages: []` を固定で返すことの帰結
- **ADR-002**: 共通 `anthropicMessagesClient.ts` を新規追加するが、既存 `AnthropicLLMProvider` の移行は本 Issue scope 外
- **ADR-003**: OCR / PDF の DI 三項分岐は `llmProvider` と同じ `adminLlmApiKey && adminLlmModel` 条件を共有
- **ADR-004**: error mapping は port 固有エラー (`OCRFailureError` / `PDFParseError`) に集約 (LLM 系エラーを漏らさない)
- **ADR-005**: Speech / Office を本 Issue で据え置く理由とフォロー Issue 起票方針

## リスクと注意点

- **Anthropic API のレート制限・コスト**: 既存 `LLMProvider` と同じ API key を共有するため、ingestion job 経由の OCR / PDF 呼び出しが LLM 呼び出しとレートを取り合う。本 Issue の実装下では `pageImages: []` 固定なので OCR が per-page で並列呼び出しされる経路は発火せず、リスクは低い。
- **`max_tokens` 上限**: OCR / PDF は constructor で `maxTokens: 16384` を渡す。これでも超大型 PDF (100 ページ級) では応答が途中で打ち切られる可能性あり。打ち切られた場合、下流の LLM structuring は不完全な text を扱う形になるが、これは Issue 完了条件 (実 adapter として動作) には抵触しない。改善余地はフォロー Issue に持ち越し。
- **base64 のメモリ**: 32MB PDF を base64 化すると約 42MB の string になり、Workers の 128MB メモリ上限内ではあるが余裕は小さい。同時実行 multiple で枯渇するリスクは hard-stop (32MB 上限) で抑える。
- **Anthropic document block の API バージョン**: 着手前に Step 0 で curl smoke で確認する。万一 `anthropic-beta: pdfs-2024-09-25` 系の header が必要なら `AnthropicSharedConfig.betaHeader` を経由して PDF adapter だけ追加する (helper 側で `betaHeader` がセットされていれば送出するロジックを用意)。
- **Vision の MIME 制約**: `IngestionService.detectKind` は `image/*` を一括して `image` 分類するため、Anthropic 非対応 MIME (例: `image/svg+xml`, `image/avif`) が入る可能性あり。adapter 内 guard で早期 reject する設計で吸収。エラーメッセージに mime を含めることで上流ログから原因が判別できるようにする (UI 表示時の文言改善は別 Issue)。
- **既存テストの破壊**: デフォルト config (env なし) では引き続き Stub に落ちるため、`runIngestionJob.integration.test.ts` (`Stub*` inject 経路) と `surfaces explicit BusinessRuleError from existing Stub providers` は破壊されない。三項分岐パターン採用の最大のメリット。
- **`buildLlmProvider` を helper 化しないことのスタイル不一致**: 本 Issue では新規 OCR / PDF のみ helper 化。既存 `llmProvider` のインライン三項分岐はそのまま残るため一時的に不揃いになる。これは別 PR で `AnthropicLLMProvider` の helper 移行と合わせて解消する想定 (ADR-002 参照)。
- **`vi.stubGlobal` 漏洩**: 既存テストに `stubGlobal` 先例なし。新規追加する全 test file で `afterEach(() => vi.unstubAllGlobals())` を必ず置き、別 test file (例: `llmConnectionTester.ts` の将来テスト) への fetch mock 漏洩を防ぐ。

## テスト方針

### Unit (Vitest)

- `app/core/adapters/llm/__tests__/ocrProvider.test.ts` (新規) — `AnthropicOCRProvider` の fetch shape + error mapping + mime/size guard + 空文字契約
- `app/core/adapters/llm/__tests__/pdfExtractor.test.ts` (新規) — `AnthropicPDFExtractor` の fetch shape + error mapping + size guard + `{ textual: true, pageImages: [] }` 契約
- `app/core/application/di/__tests__/serverCloudflare.test.ts` (拡張) — `buildOcrProvider` / `buildPdfExtractor` の単独テスト + container 経由 instanceof + consumer 経路 instanceof

### Integration (Vitest pool workers + miniflare)

- `runIngestionJob.integration.test.ts` に `image` / `pdfTextual` 各 1 ケース追加 (Step 7) — 実 adapter (`AnthropicOCRProvider` / `AnthropicPDFExtractor`) を fake fetch でモックして end-to-end 検証。
- DI smoke は `serverCloudflare.test.ts` の consumer ケースで instanceof 確認 (実 API は叩かない — billing / secret 配布リスク回避)。

### 手動確認 (オプション)

- `.dev.vars` に実 Anthropic API key を設定し `pnpm dev` でローカル起動 → image / PDF を ingestion UI から流して preview 生成までの end-to-end smoke。詳細は `testing.md` に記載。

### 検証コマンド

```
pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test
```

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | × | ○ (ベース) | × |
| 取り込んだ点 | size / mime guard, chunked base64, ADR 構造 | 共通 helper 化, pure helper 化 (ADR-009 パターン), unit test 規約 | YAGNI: `AnthropicLLMProvider` 移行は本 PR から除外、`buildLlmProvider` helper 化は見送り |

## レビュー反映

### 修正した点

- **[P-001 (要件カバ)] 統合テストの追加**: Issue 完了条件「統合テスト」を満たすため、Step 7 を新設。`runIngestionJob.integration.test.ts` に `image` / `pdfTextual` の各 1 ケースを追加し、実 adapter (`AnthropicOCRProvider` / `AnthropicPDFExtractor`) を fake fetch でモックして end-to-end 経路を verify する。
- **[P-002 (要件カバ) / P-004 (実現可能性)] ADR-001 と pipeline 挙動の整合**: Step 3 の説明を「`text` が非空なら OCR ループに落ちず素直に `text` を使う。空のときは空 `pageImages` の空 OCR ループを通り空文字が下流に渡る (実害なしの dead path)」に修正。ADR-001 Consequences と一致させた。
- **[P-001 (実現可能性)] helper の空文字契約を Step 1 で明記**: 既存 `AnthropicLLMProvider.invoke` は空文字レスポンスを `LLMUnavailableError` でハンドルするが、helper は OCR / PDF の port 契約に合わせて空文字を返す挙動に統一。将来 LLMProvider に helper を移行する際に呼び出し側で再導入する必要があることを ADR-002 にも追記。
- **[P-002 (実現可能性)] `anthropic-beta` header 事前確認**: Step 0 を新設し、実装着手前に Anthropic Messages API の document content block 仕様を curl smoke で確認する prerequisite として明示。
- **[P-003 (実現可能性)] `vi.stubGlobal` cleanup**: Step 6 / Step 7 のテスト方針に `afterEach(() => vi.unstubAllGlobals())` を明記。リスク欄にも「先例なし」「漏洩防止」を追記。

### 取り込んだ改善提案

- **[S-002 (実現可能性)] OCR / PDF の `max_tokens` 引き上げ**: Step 1 / Step 3 / リスク欄で OCR / PDF だけは `maxTokens: 16384` を constructor 経由で渡す方針に変更。`DEFAULT_MAX_TOKENS = 4096` は LLM 側に維持。
- **[S-002 (要件カバ)] Step 8 (helper 単体テスト) の判断基準を明確化**: 「Step 6 / Step 7 で結果として verify される」「実施するのは chunked encoding 境界 / mapper 切り替えを直接 verify したい場合のみ」と decision rule を明示。
- **[S-005 (実現可能性)] テスト assertion の粒度**: shape assertion は `toMatchObject` 推奨に変更、`data` フィールドは「string であること」のみ assert する方針を Step 6 に追記。
- **[S-001 (要件カバ)] Phase 4 のフォロー Issue 起票を明文化**: ADR-005 で既に方針記載済み、Phase 4 タスクとしてタスクリスト管理。
- **[S-004 (実現可能性)] OCR エラーメッセージに mime を含める**: Step 6 のテストケースとリスク欄に「`unsupported_image_mime: <mime>`」を明示。

### 見送った提案とその理由

- **[S-004 (要件カバ)] system prompt の `PromptResolver` 経由化**: 将来検討事項として ADR-006 に追加するが、本 Issue scope 内では hard-code を維持。理由: 現状 OCR / PDF 用の prompt entry が `PromptResolver` の DB schema に存在せず、追加するなら別 Issue。
- **[S-003 (実現可能性)] テスト名 `remain on Stub providers when admin LLM env is unset`**: scope 外の名前変更。既存テスト名はそのまま、現テスト内容 (env なしで Stub 経路) は依然有効。
