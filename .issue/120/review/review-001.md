# PR Review #001 — refactor(llm): migrate AnthropicLLMProvider to anthropicMessagesClient helper

**PR:** #126
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 22+
- Verdict: **BLOCKED** (Warning 修正で完了予定)

---

## Adapter

### Blockers
なし

### Warnings

- **[A-W-001]** `AnthropicLLMConfig` の JSDoc 主張に少し誇張がある
  - 場所: `app/core/adapters/llm/llmProvider.ts:20-27`
  - 理由: JSDoc は「future LLM-only fields (e.g. `temperature?`) can be layered on without churning every call site」と述べているが、現状は `export type AnthropicLLMConfig = AnthropicSharedConfig;` の単純なエイリアスのため、LLM 専用フィールドを「追加する」には interface に切り替えるか intersection (`AnthropicSharedConfig & { temperature?: number }`) に変更する必要がある。エイリアスのままでは call site 側で LLM 専用フィールドを書いても `AnthropicSharedConfig` の型に吸収されるだけで「追加された」とは言えない。後方互換目的のエイリアスであることは妥当だが、JSDoc の主張は誤解を招く。
  - 提案: JSDoc を「Retained as a named alias so existing callers stay stable and LLM-mode grep hits remain meaningful. If future LLM-only fields become necessary, this alias should be promoted to an intersection or interface at that time.」のようなトーンに調整。

- **[A-W-002]** インラインコメントが日本語で、ファイル内の他 JSDoc / コメントの英語と混在している
  - 場所: `app/core/adapters/llm/llmProvider.ts:151-157`
  - 理由: 6 行のコメントが日本語で書かれているが、クラス JSDoc (38-67 行) / `parseJsonEnvelope` の comment (167-169 行) は英語。WHY 内容自体は残す価値が十分にある。
  - 提案: コメントを英語に統一する。

### Notes
- **[A-N-001]** 構造的に `ocrProvider.ts` / `pdfExtractor.ts` と完全に同型。
- **[A-N-002]** error mapper の 4 関数が LLM 4 種エラークラスに 1:1 対応、helper の HTTP → mapper マッピングは旧 `throwForStatus` と完全等価。
- **[A-N-003]** 全エラーメッセージ文字列が旧実装と完全一致 (10 種の message 個別チェック済み)。
- **[A-N-004]** 空 response → `LLMUnavailableError` の意味論差を adapter 側で正しく再導入。テストで 3 発生源を直接 assert。
- **[A-N-005]** `parseJsonEnvelope` / `requireString` / `requireStringArray` は LLM 固有のため adapter 内に留置、振る舞い未変更。
- **[A-N-006]** 重複コード (DEFAULT_* 定数 4 / ローカル型 3 / pure 関数 3 / private method 2 / private field 4) の削除が完了。
- **[A-N-007]** `llmConnectionTester.ts` は touch されておらず ADR-002 通り。
- **[A-N-008]** `StubLLMProvider` (220-250 行) は無変更で挙動維持。
- **[A-N-009]** DI 層に `buildLlmProvider` を export し非対称解消。
- **[A-N-010]** `pnpm typecheck` / `pnpm vitest run` で関連テスト全 green を確認済み。

---

## Application / DI

### Blockers
なし

### Warnings
なし

### Notes
- **[D-N-001]** `buildLlmProvider` のシグネチャ・三項分岐構造が `buildOcrProvider` / `buildPdfExtractor` と完全に同型。review-001 D-W-001 (Issue #113) の非対称性を完全に解消。
- **[D-N-002]** JSDoc が ADR-003 参照 + pure helper パラグラフ付きで `buildOcrProvider` と同様の充実度。
- **[D-N-003]** `LLMProvider` 型 import が他 port type と同位置・アルファベット順で揃っている。
- **[D-N-004]** インライン三項分岐の削除完了。引数順 `(adminLlmApiKey, adminLlmModel)` も統一。
- **[D-N-005]** ADR-009 (`buildRelayTrigger` pure helper パターン) と完全整合。
- **[D-N-006]** CLAUDE.md の依存方向 (presentation → application → domain) に準拠。
- **[D-N-007]** `RequestServerConfig` / `ServerEnv` の関連フィールドコメントとも一貫。

---

## Test

### Blockers
なし

### Warnings

- **[T-W-001]** JSON envelope 失敗ケースで `cause` チェーンが検証されていない
  - 場所: `app/core/adapters/llm/__tests__/llmProvider.test.ts:380-418`
  - 理由: `LLMUnavailableError("Anthropic response was not valid JSON", cause)` と `"... was not a JSON envelope", cause)` はどちらも `cause` を保持する設計だが、テストは message のみ検証。Plan Step 4 の「cause チェーン」の質要件のうち TypeError ケースだけが `cause` を検証している。helper が `cause` を落とすリグレッションを検知できない。
  - 提案: 少なくとも 1 ケース (例: non-JSON body) で `await expect(...).rejects.toMatchObject({ cause: expect.any(Error) })` を追加する。

- **[T-W-002]** `directorySuggestion` が「string でも null でもない」型混入ケースが未カバー
  - 場所: `app/core/adapters/llm/__tests__/llmProvider.test.ts:149-192`
  - 理由: 実装は `typeof directorySuggestionRaw === "string" && trim().length > 0` で判定し、それ以外は null に落とす。`null` / `""` / `"   "` の 3 ケースは検証されているが、`directorySuggestion: 42` のような型異物が null に正規化されることを直接保証していない。
  - 提案: 1 ケース追加 (`directorySuggestion: 42` → `null`)。

- **[T-W-003]** Happy path の payload-shape 検証で HTTP ヘッダー (`x-api-key` / `anthropic-version`) と URL (`endpoint`) を検証していない
  - 場所: `app/core/adapters/llm/__tests__/llmProvider.test.ts:119-131`
  - 理由: helper が `config.apiVersion` / `config.endpoint` を default fallback で引く責務を持つが、テストは body の `model` / `max_tokens` / `system` / `messages` のみを `toMatchObject` で検証している。`x-api-key` が正しく渡っているか直接 assert するテストが 1 件は欲しい (helper の anthropicMessagesClient.test.ts でカバーされているなら不要)。
  - 提案: payload shape テストに header / URL の assertion を追加するか、anthropicMessagesClient.test.ts で既にカバーされていることを確認。

### Notes
- **[T-N-001]** Plan Step 4 で要求された全カテゴリが網羅 (constructor 2 / happy 7 / empty 3 / error 8 / envelope 8)。Plan 要求カウントを上回るカバレッジ。
- **[T-N-002]** OCR/PDF テストとテンプレが正しく統一 (`setFetch` / `jsonResponse` / `makeProvider` / `afterEach(vi.unstubAllGlobals)`)。
- **[T-N-003]** `buildLlmProvider` DI テストが `buildOcrProvider` / `buildPdfExtractor` と完全同型 (7 ケース)、既存 4 ケース (`createRequestContainer` 経由) も維持。
- **[T-N-004]** 既存 integration test (`runIngestionJob.integration.test.ts`) への悪影響なし、全 352 ケース green を確認済み。
- **[T-N-005]** 空 response → `LLMUnavailableError` の意味論差を 3 発生源で直接 assert (ADR-001 の回帰ガード)。
- **[T-N-006]** CLAUDE.md の "Error handling / cross-layer catch policy" に整合。

---

## Design Decisions

このラウンドで見つかった設計判断: 特になし (すべての判断は Phase 1 の adr.md で記録済み)。
