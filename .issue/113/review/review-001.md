# PR Review #001 — feat(issue-113): real OCR / PDF adapters via Anthropic Messages API

**PR:** #117
**Date:** 2026-05-21
**Round:** 1 回目

---

## Summary

- Blockers: 0
- Warnings: 11
- Notes: 18
- Verdict: **APPROVED (Warnings 残り)** — Blocker 0 だが Warning が複数のため一旦修正ループへ

---

## Adapter Layer

### Blockers
なし

### Warnings

- **[A-W-001]** `extractTextContent` の `.trim()` でリーディング/トレイリング改行を破棄する可能性
  - 場所: `app/core/adapters/llm/anthropicMessagesClient.ts:114`
  - 理由: OCR / PDF の system prompt は "Preserve line breaks" を明示しているが、helper 内部で `parts.join("\n").trim()` するため先頭/末尾の whitespace が破棄される。port 契約 (空文字許容) との衝突はないが、忠実性が一段落ちる。
  - 提案: JSDoc に「先頭/末尾の whitespace は trim される」旨を明記する (副作用の明示)。既存 `AnthropicLLMProvider` と挙動を揃えるため動作は維持。

- **[A-W-002]** `DEFAULT_MAX_TOKENS = 4096` の export が現状ノーオペ
  - 場所: `app/core/adapters/llm/anthropicMessagesClient.ts:53`
  - 理由: OCR / PDF は constructor で 16384 を必ず代入するため fallback 分岐は到達不能。将来 LLMProvider が helper に移行したときに使われる前提だが、その意図を JSDoc に残しておかないと混乱の元。
  - 提案: `DEFAULT_MAX_TOKENS` 横にコメントで「intentionally conservative for LLM-mode callers; OCR/PDF override via constructor」を明記。

- **[A-W-003]** size guard が raw bytes 基準か encoded payload 基準か曖昧
  - 場所: `app/core/adapters/llm/ocrProvider.ts:24`, `app/core/adapters/llm/pdfExtractor.ts:18`
  - 理由: Anthropic Vision の 5MB / Document の 32MB が raw 基準なのか base64-encoded 基準なのか docs から自明でない。base64 は ~33% 膨張するため、raw 基準でないと early reject が一部失敗する。
  - 提案: コメントで「raw file bytes 基準」を明記。Anthropic docs を確認した結果 raw 基準なので動作は維持。

### Notes
- 全 7 件 (N-001 〜 N-007): error mapping injection / chunked base64 / constructor fail-fast / 型安全性 / ADR-002 の整合性 / 共通 helper の YAGNI 判断 / module-scoped const の GC 圧考慮

---

## DI / Wiring Layer

### Blockers
なし

### Warnings

- **[D-W-001]** `buildLlmProvider` だけ extract されておらず、3 つの同形 helper のうち 2 つだけ pure helper 化
  - 場所: `app/core/application/di/serverCloudflare.ts:371-377`
  - 理由: `llmProvider` のみ inline 三項分岐のまま残っている。スタイル不一致は plan.md ADR-002 で明示的に scope 外と決まっており、修正は本 PR スコープ外。
  - 提案: フォロー Issue 起票 (progress.md / Phase 4 で扱う)。

- **[D-W-002]** `createConsumerContainer` のテストが `ocrProvider` / `pdfExtractor` の存在を未検証
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:498-508`
  - 理由: env なし default 経路で consumer container が両 port を wire しているかの assertion がない。`createRequestContainer` 側は全 field ループだが consumer 側はマニュアル列挙のため、新 port 追加でカバレッジが落ちる構造。
  - 提案: `ocrProvider` / `pdfExtractor` の `toBeDefined()` を追加 (1 ファイル 2 行)。

- **[D-W-003]** `buildOcrProvider` / `buildPdfExtractor` テストが空文字ケースをカバーしていない
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:449-495`
  - 理由: テスト 4 ケースは `undefined` だが、JS の `&&` 短絡は `""` も falsy として扱う。helper が pure かつ export されている以上、外部 caller が `""` を渡したケースの挙動を test contract として固定すべき。
  - 提案: `buildOcrProvider("", "claude-...")` / `buildOcrProvider("sk-...", "")` / `buildOcrProvider("", "")` の 3 ケース追加 (PDF も同様)。

### Notes
- 全 6 件: ADR-009 パターン踏襲 / consumer container 経由の wire 反映 / exactOptionalPropertyTypes 遵守 / JSDoc plan 整合 / CI green / AND 条件の運用安全

---

## Test Layer

### Blockers
なし

### Warnings

- **[T-W-001]** integration test の fetch mock が URL フィルタではなく順序キュー
  - 場所: `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts:609-615, 676-682`
  - 理由: plan.md Step 7 で URL フィルタを推奨していたが `responses.shift()` の順序依存になっている。pipeline 内部実装の順序を暗黙の前提として固定するため、リファクタ脆弱。
  - 提案: WHY コメントで順序依存を明記する (1 行追加)。

- **[T-W-002]** 三項分岐テストが `it.each` でまとめられず重複
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:317-404, 449-495`
  - 理由: plan.md Step 5 で `it.each` 推奨と書かれているが、5 ブロック分の同型 4 ケースが手書き。
  - 提案: 可読性は保たれているので維持。記録のみ。

- **[T-W-003]** `arrayBufferToBase64` の chunked 実装 (8KB 境界) のテストカバーがない
  - 場所: `app/core/adapters/llm/anthropicMessagesClient.ts:124-133`
  - 理由: plan.md Step 8 で「実施するのは chunked encoding 境界を直接 verify したい場合のみ」と書かれていたが、helper の境界 (8191/8192/8193 byte) の round-trip 検証は将来の regression 防止に重要。
  - 提案: `anthropicMessagesClient.test.ts` を新規追加し、`arrayBufferToBase64` の境界テストを入れる (Step 8 を有効化)。

- **[T-W-004]** `OCRFailureError` / `PDFParseError` の `cause` チェーンが unit test で未検証
  - 場所: `app/core/adapters/llm/__tests__/ocrProvider.test.ts:103-171`, `pdfExtractor.test.ts:103-168`
  - 理由: helper は network error を `cause` として包んで返すが、テストでは `toBeInstanceOf` までしか assert していない。observability 観点で `cause` チェーンは重要。
  - 提案: TypeError ケースだけでも `expect((e as Error).cause).toBeInstanceOf(TypeError)` を追加 (1 ファイル 2 行)。

- **[T-W-005]** constructor guard の throw assertion が型/メッセージ未検証
  - 場所: `app/core/adapters/llm/__tests__/ocrProvider.test.ts:209-228`, `pdfExtractor.test.ts:183-202`
  - 理由: `.toThrow()` のみで、誤って別の理由で投げられても pass する。
  - 提案: `.toThrow(/apiKey is empty/)` の regex で意図を固定 (1 ケース 1 行修正)。

### Notes
- 全 7 件: `vi.unstubAllGlobals` cleanup / 実時間 timeout / port contract assertion / Stub 経路温存 / ヘルパー再利用 / suite 独立性 / CI green

---

## Design Decisions

このラウンドで新たに見つかった設計判断はなし。すべて plan.md / adr.md でカバー済の指摘か実装スタイルの軽微な改善提案。

---

## 対応状況

### 修正済 (9 件)

| ID | 内容 | 対応 |
|----|------|------|
| A-W-001 | `extractTextContent` の `.trim()` 副作用 | helper JSDoc に trim 副作用を明記 |
| A-W-002 | `DEFAULT_MAX_TOKENS = 4096` の意図不明 | OCR/PDF override 意図をコメント追記 |
| A-W-003 | size guard が raw / encoded どちらか曖昧 | OCR/PDF 両方の guard コメントに「raw file bytes 基準」追記 |
| D-W-002 | consumer container test で OCR/PDF 未検証 | `expect(...).toBeDefined()` 2 行追加 |
| D-W-003 | helper の空文字ケース未テスト | OCR/PDF 各 3 ケース (`""` 入力) 追加 |
| T-W-001 | fetch mock の順序依存が暗黙 | pipeline 順序を WHY コメントで明示 |
| T-W-003 | `arrayBufferToBase64` の境界テストなし | `anthropicMessagesClient.test.ts` 新規追加 (8191/8192/8193 byte + 100KB + Latin-1 byte) |
| T-W-004 | `cause` チェーン未検証 | TypeError ケースに `cause: expect.any(TypeError)` を追加 |
| T-W-005 | constructor guard が `.toThrow()` 一般 | `.toThrow(/apiKey is empty/)` / `.toThrow(/model is empty/)` で固定 |

### 見送り (2 件、Phase 4 で扱う / 可読性維持)

| ID | 内容 | 理由 |
|----|------|------|
| D-W-001 | `buildLlmProvider` の helper 非対称化 | plan.md ADR-002 で本 Issue scope 外と明示済み。→ Phase 4 でフォロー Issue 起票候補 |
| T-W-002 | `it.each` でテスト重複削減 | 現状の手書きは直接読めるメリットあり、リファクタコスト > 価値で見送り |

### 検証結果

- `pnpm typecheck`: PASS
- `pnpm lint:fix`: PASS (pre-existing 3 warnings は本 PR 外の `publication/__tests__/view.test.ts`)
- `pnpm format`: PASS
- `pnpm test`: PASS (unit 1531 / integration 352 = 1883 tests)
