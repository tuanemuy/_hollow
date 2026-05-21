# 動作確認計画 — Issue #113: real OCR / PDF adapters (Anthropic)

**Issue:** #113
**作成日:** 2026-05-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載 (プロジェクト全体のセットアップは省略)。

### 検証環境の起動

ローカル開発サーバー (workerd + vite + miniflare)。`.dev.vars` に `ADMIN_LLM_API_KEY` (実 Anthropic key) と `wrangler.toml [vars]` の `ADMIN_LLM_MODEL` (claude-3-5-sonnet-latest がデフォルト) で OCR / PDF の実 adapter を wire する。

```bash
# 1. local D1 マイグレーション (既存運用、Issue #110 で確立済)
pnpm db:apply:local

# 2. .dev.vars に Anthropic key を投入 (Vision / document block 検証時のみ)
# .dev.vars に以下を追加:
#   ADMIN_LLM_API_KEY=sk-ant-xxxxx  (実 Anthropic key、課金注意)
# ADMIN_LLM_MODEL は wrangler.toml [vars] で配布済 (claude-3-5-sonnet-latest)

# 3. dev server 起動
pnpm dev
```

### デプロイ方法

Issue #113 は code-only 変更 (wrangler.toml / Pulumi / SOPS への変更なし)。既存 deploy フローをそのまま使用する。

```bash
# staging dry-run
pnpm deploy:staging:dry
pnpm deploy:staging:consumer:dry

# staging deploy (ops 担当)
pnpm deploy:staging
pnpm deploy:staging:consumer

# production も同手順
pnpm deploy:production:dry
pnpm deploy:production:consumer:dry
pnpm deploy:production
pnpm deploy:production:consumer
```

---

## 確認項目

### 1. 静的検証 (型 / lint / format)

- **目的:** 新規 adapter / helper / DI 拡張で既存型と矛盾が出ないこと
- **手順:**
  1. `pnpm typecheck`
  2. `pnpm lint`
  3. `pnpm format:check`
- **期待結果:** すべて 0 errors / 0 warnings
- **確認ポイント:** `AnthropicSharedConfig` の optional フィールドが `exactOptionalPropertyTypes` で違反しないこと、`OCRProvider` / `PDFExtractor` の port 契約 (戻り値 shape) が adapter 実装と一致していること

### 2. adapter unit テスト (fetch mock)

- **目的:** `AnthropicOCRProvider` / `AnthropicPDFExtractor` が Anthropic Messages API への正しい shape で fetch し、port 契約 (空文字許容 / `{ textual: true, pageImages: [] }`) を満たすこと
- **手順:**
  1. `pnpm test:unit app/core/adapters/llm/__tests__/ocrProvider.test.ts`
  2. `pnpm test:unit app/core/adapters/llm/__tests__/pdfExtractor.test.ts`
- **期待結果:** 全テスト pass。特に以下が緑:
  - happy path: 200 OK + text content → 期待 text が返る、fetch body が `messages[0].content[0]` の image / document block shape を満たす
  - HTTP 429 / 500 / 403 (permission_error) / timeout / `TypeError("fetch failed")` → `OCRFailureError` / `PDFParseError`
  - response に text block なし → OCR は `""`、PDF は `{ textual: true, text: "", pageImages: [] }`
  - OCR: 不正な mime (`application/octet-stream`) で fetch 呼ばずに `OCRFailureError`
  - OCR: 5MB 超画像で fetch 呼ばずに `OCRFailureError`
  - PDF: 32MB 超ファイルで fetch 呼ばずに `PDFParseError`
- **確認ポイント:** `afterEach(() => vi.unstubAllGlobals())` で fetch mock が他テストに漏れていないこと

### 3. DI 三項分岐 unit テスト (`serverCloudflare.test.ts`)

- **目的:** `adminLlmApiKey && adminLlmModel` の AND 条件で `AnthropicOCRProvider` / `AnthropicPDFExtractor` が wire され、不揃いでは Stub に倒れること
- **手順:**
  1. `pnpm test:unit app/core/application/di/__tests__/serverCloudflare.test.ts`
- **期待結果:** 全テスト pass。特に以下が緑:
  - `buildOcrProvider(apiKey, model)` → `AnthropicOCRProvider`
  - `buildOcrProvider(apiKey, undefined)` / `buildOcrProvider(undefined, model)` / `buildOcrProvider(undefined, undefined)` → `StubOCRProvider`
  - `buildPdfExtractor(...)` 同 4 ケース
  - `createRequestContainer({ adminLlmApiKey, adminLlmModel })` で `container.ocrProvider instanceof AnthropicOCRProvider` / `container.pdfExtractor instanceof AnthropicPDFExtractor`
  - `createRequestContainer(configWith())` (env なし) で `container.ocrProvider instanceof StubOCRProvider` / `pdfExtractor instanceof StubPDFExtractor`
  - `createConsumerContainer(envWithBindings({ ADMIN_LLM_API_KEY, ADMIN_LLM_MODEL }))` でも consumer 側で同様に instance がスレッディングされる
- **確認ポイント:** PR #112 review-002 で指摘されたトートロジー (三項分岐を経由しないテスト) を再発させないこと

### 4. 統合テスト (`runIngestionJob.integration.test.ts`)

- **目的:** 実 adapter (`AnthropicOCRProvider` / `AnthropicPDFExtractor`) 経由で `runIngestionJob` の image / pdfTextual シナリオが end-to-end で動くこと (Issue 完了条件「統合テスト」要件)
- **手順:**
  1. `pnpm test:integration app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts`
- **期待結果:** 全テスト pass。追加した 2 ケースが緑:
  - `image` シナリオ: fake fetch で Anthropic OCR + LLM structureToHtml + suggestMetadata の 3 リクエストをモックし、ingestion job が `succeeded` まで到達
  - `pdfTextual` シナリオ: 同じく fake fetch で `AnthropicPDFExtractor` 経由の text 抽出 → LLM structuring が動く
- **確認ポイント:** 既存 `Stub*` 経路のテストが破壊されていないこと

### 5. 既存テストの回帰確認

- **目的:** Issue #113 の変更で既存 ingestion / DI / adapter テストが壊れていないこと
- **手順:**
  1. `pnpm test`
- **期待結果:** 既存テストすべて緑のまま
- **確認ポイント:** `surfaces explicit BusinessRuleError from existing Stub providers` (env なしで Stub 経路) が依然として pass すること

### 6. local dev 起動 + 画像 ingestion smoke (実 Anthropic API)

- **目的:** `.dev.vars` に実 Anthropic key を投入し、image kind の ingestion が `AnthropicOCRProvider` → `AnthropicLLMProvider` 経路で end-to-end で `previewing` まで到達すること
- **手順:**
  1. `.dev.vars` に `ADMIN_LLM_API_KEY=sk-ant-xxxxx` を投入 (実 Anthropic key、課金注意)
  2. `pnpm dev` で server 起動
  3. ブラウザで admin にログイン (Issue #110 testing.md と同手順)
  4. 小サイズ PNG / JPEG 画像 (1MB 以下) を ingestion UI から投入
  5. log で `runIngestionJob` の `processing → previewing` 遷移を観測
- **期待結果:**
  - ingestion job が `previewing` に到達し、admin UI で preview HTML に OCR で抽出されたテキストが含まれる
  - log に `OCRFailureError` / `LLMUnavailableError` / `LLMRateLimitError` が出ないこと
- **確認ポイント:** Anthropic Vision API への課金が発生 (実画像 1 枚で約 $0.003 程度)、image MIME (`image/png` 等) が adapter で reject されないこと

### 7. local dev 起動 + PDF ingestion smoke (実 Anthropic API)

- **目的:** PDF kind の ingestion が `AnthropicPDFExtractor` → `AnthropicLLMProvider` 経路で end-to-end で `previewing` まで到達すること
- **手順:**
  1. `.dev.vars` の `ADMIN_LLM_API_KEY` 設定済 (上記 6 と同じ)
  2. `pnpm dev` で server 起動
  3. 小サイズ PDF (5MB 以下、テキスト主体) を ingestion UI から投入
  4. log で `runIngestionJob` の `pdfTextual` 分岐が通り、`previewing` に到達することを観測
- **期待結果:**
  - ingestion job が `previewing` に到達し、admin UI で preview HTML に PDF 本文が含まれる
  - log に `PDFParseError` / Anthropic API 4xx エラー (`anthropic-beta` header 不足など) が出ないこと
- **確認ポイント:**
  - Anthropic document block API への課金が発生
  - PDF 仕様確認 (Step 0 の prerequisite): `anthropic-beta` header が必要な場合は事前に対処済みであること
  - `maxTokens: 16384` で全文抽出が打ち切られていないこと (大きい PDF を試す場合)

---

## エッジケース・異常系

### 1. デフォルト config (env なし) で Stub に倒れる

- **目的:** `ADMIN_LLM_API_KEY` 未設定で OCR / PDF が `StubOCRProvider` / `StubPDFExtractor` に倒れること (回帰防止)
- **手順:**
  1. `.dev.vars` から `ADMIN_LLM_API_KEY` をコメントアウト
  2. `pnpm dev` で server 起動
  3. image / PDF を ingestion UI から投入
- **期待結果:** ingestion job が `failed` 状態 + error code が `unsupported_format` (Stub の `BusinessRuleError`) になる
- **確認ポイント:** server が `binding undefined` 等で起動失敗しないこと、`AnthropicOCRProvider` の constructor (apiKey 空チェック) で throw しないこと

### 2. `ADMIN_LLM_API_KEY` だけ設定 (`ADMIN_LLM_MODEL` 未設定) → Stub 維持

- **目的:** AND 条件の partial 欠落で Stub に倒れる安全動作
- **手順:**
  1. `.dev.vars` に `ADMIN_LLM_API_KEY` のみ投入
  2. `wrangler.toml [vars]` の `ADMIN_LLM_MODEL` をコメントアウト
  3. `pnpm dev` で起動
  4. image / PDF ingestion 投入
- **期待結果:** Stub 経由で `unsupported_format` failed
- **確認ポイント:** `AnthropicOCRProvider` の constructor で `model is empty` throw が出ないこと (三項分岐で Stub に落ちる前に短絡)

### 3. 不正な MIME での OCR (例: `image/svg+xml`)

- **目的:** Anthropic Vision 非対応 MIME で adapter が fetch せずに早期 reject すること
- **手順:** unit test (`ocrProvider.test.ts` の「不正な mime」ケース) で網羅。手動確認は不要。
- **期待結果:** `OCRFailureError` がメッセージに mime を含む形で throw され、Anthropic への課金リクエストが発生しないこと

### 4. PDF が 32MB を超える場合

- **目的:** size guard で early reject されること
- **手順:** unit test (`pdfExtractor.test.ts` の「32MB 超ファイル」ケース) で網羅。手動確認は不要。
- **期待結果:** `PDFParseError("pdf_too_large")` がメッセージに含まれ、Anthropic への課金リクエストが発生しないこと

---

## 既存機能への影響確認

- **既存 ingestion path (web 経由 / consumer 経由)**: `ADMIN_LLM_API_KEY` 未設定の本番 / staging では従来どおり Stub に倒れるため、既存挙動に変化なし。設定後は OCR / PDF kind の ingestion が初めて `previewing` に到達できるようになる (副作用というよりは Issue 完了条件)。
- **既存 LLM 経由 ingestion (html / markdown)**: `AnthropicLLMProvider` のコードに変更なし (helper 移行は本 Issue scope 外)。既存挙動に変化なし。
- **既存テスト群**: デフォルト config (env なし) では Stub 経路に落ちるため `runIngestionJob.integration.test.ts` の `Stub*` inject ケースは破壊されない。新規追加する `image` / `pdfTextual` 実 adapter ケースは別 case として並列に存在。
- **#57 ADR-003 既知制約 (LLMRateLimitError → processing 固定化)**: 本 Issue でも解消されない。挙動変化なし。

---

## 確認チェックリスト

- [ ] `pnpm typecheck` pass
- [ ] `pnpm lint` pass
- [ ] `pnpm format:check` pass
- [ ] `pnpm test:unit app/core/adapters/llm/__tests__/ocrProvider.test.ts` pass
- [ ] `pnpm test:unit app/core/adapters/llm/__tests__/pdfExtractor.test.ts` pass
- [ ] `pnpm test:unit app/core/application/di/__tests__/serverCloudflare.test.ts` pass
- [ ] `pnpm test:integration app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts` pass
- [ ] `pnpm test` 全体が pass (既存テスト回帰なし)
- [ ] `.dev.vars` 充足ケースで `pnpm dev` 起動成功 + image ingestion が `previewing` 到達 (Anthropic API 課金あり)
- [ ] `.dev.vars` 充足ケースで PDF ingestion が `previewing` 到達 (Anthropic API 課金あり)
- [ ] `.dev.vars` 空ケースで ingestion が `unsupported_format` failed (Stub 経路で回帰なし)
- [ ] `pnpm deploy:staging:consumer:dry` が binding 解決エラー無しで pass

## 要確認

- **Anthropic Messages API の document content block で `anthropic-beta: pdfs-2024-09-25` header が必要かどうか** — Step 0 で curl smoke で事前確認する。結果次第で plan / 実装に `betaHeader` を組み込む。
