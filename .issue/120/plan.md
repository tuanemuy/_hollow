# 実装計画 — Issue #120: refactor(llm): migrate AnthropicLLMProvider to anthropicMessagesClient helper

**Issue:** #120
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

Issue #113 (PR #117) で導入された `anthropicMessagesClient.ts` (`callAnthropicMessages` helper) に `AnthropicLLMProvider.invoke()` を寄せて HTTP / timeout / status mapping の重複を解消する。あわせて DI 層に残る `llmProvider` のインライン三項分岐を `buildLlmProvider` pure helper として export し、既に export 済みの `buildOcrProvider` / `buildPdfExtractor` と非対称な状態 (review-001 D-W-001) を解消する。

挙動は完全等価維持。とくに **「空 response → `LLMUnavailableError`」** の意味論差は呼び出し側で再導入する (Issue #113 ADR-002 Consequences)。

`llmConnectionTester.ts` も「同様に helper に寄せられないか」を検討する — 結論は **寄せない** (理由は ADR-002 に記録)。

## スコープ

### 含まれるもの
- `AnthropicLLMProvider.invoke()` を `callAnthropicMessages` 経由に書き換え
- 重複コード (`invoke` / `throwForStatus` / `isAbortError` / `isTransientNetworkError` / `extractTextContent` / default 定数 / ローカル型) の削除
- LLM 4 種エラー (`LLMRateLimitError` / `LLMUnavailableError` / `LLMTimeoutError` / `LLMQuotaExceededError`) を mapper で inject
- 空 response → `LLMUnavailableError` を adapter 内 (`invoke` の後段) で再導入
- `serverCloudflare.ts` から `buildLlmProvider(adminLlmApiKey, adminLlmModel): LLMProvider` を export し、`createRequestContainer` から呼ぶ
- DI 層の対称テスト (`describe("buildLlmProvider", ...)` 7 ケース) を追加
- `AnthropicLLMProvider` の unit test を新規追加 (現状不在の状態を解消し、空 response → `LLMUnavailableError` 等の意味論差を直接 assert する)
- `llmConnectionTester.ts` 移行の検討結果を ADR に記録

### 含まれないもの
- `llmConnectionTester.ts` 本体の helper 化 (理由は ADR-002)
- `parseJsonEnvelope` / `requireString` / `requireStringArray` の helper 化 (LLM 固有のため adapter 内に留置)
- `app/core/adapters/llm/` → `app/core/adapters/anthropic/` への rename / provider 抽象化 (Issue #122 で扱う)
- helper の API contract (`AnthropicSharedConfig` / `AnthropicErrorMapper` / `callAnthropicMessages` シグネチャ) 変更
- `AnthropicLLMConfig` の export 廃止 (型エイリアスとして互換維持)

## 実装ステップ

### Step 1: `AnthropicLLMProvider` を helper 経由に書き換え

- **対象ファイル:** `app/core/adapters/llm/llmProvider.ts`
- **変更内容:**
  1. import 追加:
     ```ts
     import {
       type AnthropicErrorMapper,
       type AnthropicSharedConfig,
       callAnthropicMessages,
     } from "./anthropicMessagesClient";
     ```
  2. module-scope の重複定義を削除:
     - 定数 `DEFAULT_ENDPOINT` / `DEFAULT_API_VERSION` / `DEFAULT_TIMEOUT_MS` / `DEFAULT_MAX_TOKENS`
     - 型 `AnthropicContentBlock` / `AnthropicMessageResponse` / `AnthropicErrorBody`
     - 関数 `isAbortError` / `isTransientNetworkError` / `extractTextContent`
  3. class 内の `private async invoke` / `private throwForStatus` を削除
  4. `private readonly endpoint/apiVersion/timeoutMs/maxTokens` field を削除 (helper が `config` から default fallback で都度引く)
  5. `AnthropicLLMConfig` を **`AnthropicSharedConfig` の型エイリアスに置き換え** (export 互換維持)。JSDoc は helper の `AnthropicSharedConfig` を SSOT として参照する形にする (ADR-004):
     ```ts
     /**
      * Label type for LLM-mode Anthropic adapter config. Structurally
      * identical to {@link AnthropicSharedConfig} — see that type for
      * field-level documentation.
      */
     export type AnthropicLLMConfig = AnthropicSharedConfig;
     ```
  6. module-scope に mapper を定義 (OCR / PDF と同パターン):
     ```ts
     const llmErrorMapper: AnthropicErrorMapper = {
       rateLimit: (message, cause) => new LLMRateLimitError(message, cause),
       unavailable: (message, cause) => new LLMUnavailableError(message, cause),
       timeout: (message, cause) => new LLMTimeoutError(message, cause),
       quota: (message, cause) => new LLMQuotaExceededError(message, cause),
     } as const;
     ```
  7. constructor は API key / model の空チェックだけ残し、`this.config: AnthropicSharedConfig` を保持
  8. `invoke()` を helper 呼び出しに置き換え。inline コメントは恒久的に残す (将来 maintainer が helper の `extractTextContent` が `.trim()` 済みなのを理由に length check を冗長と誤解して削除するリスクを防ぐため):
     ```ts
     private async invoke(system: string, user: string): Promise<string> {
       const text = await callAnthropicMessages(
         this.config,
         system,
         [{ type: "text", text: user }],
         llmErrorMapper,
       );
       // OCR/PDF と異なり、LLM port の JSON envelope contract は
       // 空文字を許容しない。helper は OCR/PDF の「空 OK」契約に合わせて
       // "" を返す (anthropicMessagesClient.ts JSDoc "Empty-response
       // contract" / Issue #113 ADR-002) ため、LLM 側で再導入する。
       if (text.length === 0) {
         throw new LLMUnavailableError(
           "Anthropic response did not contain any text content",
         );
       }
       return text;
     }
     ```
  9. `parseJsonEnvelope` / `requireString` / `requireStringArray` / `build*SystemPrompt` / `build*UserMessage` はそのまま残す (LLM 固有)
  10. クラス JSDoc は「helper 経由 + 空 response の意味論差を adapter 側で吸収」の事実を反映するよう調整
- **理由:** 完了条件「invoke / throwForStatus 削除」「helper 経由で動く」「空 → `LLMUnavailableError` 維持」を満たす。OCR / PDF と完全に同型の構造に揃えるため、重複は helper に集約しつつ LLM 固有の制約 (空 response 拒否 + JSON envelope) は adapter 内に閉じ込める。

### Step 2: `buildLlmProvider` pure helper の export

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  1. `buildPdfExtractor` の直後に同シグネチャの helper を追加:
     ```ts
     /**
      * Build the request-time {@link LLMProvider}. Wires
      * `AnthropicLLMProvider` only when both `ADMIN_LLM_API_KEY` and
      * `ADMIN_LLM_MODEL` are present; either missing → fall back to
      * `StubLLMProvider`. Shares the env pair with `ocrProvider` /
      * `pdfExtractor` per ADR-003 of Issue #113.
      */
     export function buildLlmProvider(
       adminLlmApiKey: string | undefined,
       adminLlmModel: string | undefined,
     ): LLMProvider {
       return adminLlmApiKey && adminLlmModel
         ? new AnthropicLLMProvider({
             apiKey: adminLlmApiKey,
             model: adminLlmModel,
           })
         : new StubLLMProvider();
     }
     ```
  2. `LLMProvider` の型 import を追加 (`@/core/domain/ingestion/ports/llmProvider`)
  3. `createRequestContainer` 内 (L371-377) のインライン三項分岐を `llmProvider: buildLlmProvider(adminLlmApiKey, adminLlmModel)` に置換
- **理由:** ADR-009 で示された pure helper 化スタイルの統一、review-001 D-W-001 のフォロー、`instanceof` テストの容易性。

### Step 3: DI 対称テストの追加

- **対象ファイル:** `app/core/application/di/__tests__/serverCloudflare.test.ts`
- **変更内容:**
  1. import に `buildLlmProvider` を追加
  2. 既存 `describe("buildOcrProvider", ...)` と同形の `describe("buildLlmProvider", ...)` を追加 (合計 7 ケース):
     - `undefined, undefined` → `StubLLMProvider`
     - `undefined, "model"` → `StubLLMProvider`
     - `"key", undefined` → `StubLLMProvider`
     - `"key", "model"` → `AnthropicLLMProvider`
     - `"", "model"` → `StubLLMProvider`
     - `"key", ""` → `StubLLMProvider`
     - `"", ""` → `StubLLMProvider`
  3. 既存 `createRequestContainer` 経由の `llmProvider` 三項分岐テスト (L317-344) はそのまま残す (container 経由 + helper 直接の 2 重カバレッジ)
- **理由:** 3 helper の対称性をテスト面でも保証 (review-001 D-W-003 で OCR / PDF に既に追加済みの空文字エッジを LLM 側にも揃える)。

### Step 4: `AnthropicLLMProvider` の unit test を新規追加

- **対象ファイル (新規):** `app/core/adapters/llm/__tests__/llmProvider.test.ts`
- **変更内容:** `ocrProvider.test.ts` / `pdfExtractor.test.ts` のテンプレ (`vi.stubGlobal("fetch")` + `afterEach(vi.unstubAllGlobals)`) を踏襲し、最低限以下をカバー:
  1. **constructor guards:** `.toThrow(/apiKey is empty/)` / `.toThrow(/model is empty/)`
  2. **happy path:**
     - `structureToHtml`: 正常な `{html, titleSuggestion, directorySuggestion}` envelope が text block で返るときに parsed result を返す
     - `suggestMetadata`: 正常な `{tags, aliases}` envelope を返す
     - `directorySuggestion: null` / 空文字 / トリム後空 → `null` に正規化
     - code fence ストリップ (```` ```json {...} ``` ````)
  3. **helper への結線確認 (fetch payload shape):**
     - `structureToHtml` 呼び出し時に fetch が `{ model, max_tokens, system, messages: [{role: "user", content: [{type: "text", text}]}] }` shape で呼ばれていることを `toMatchObject` で 1 ケース assert
     - これにより「`callAnthropicMessages` 経由で動く」完了条件が unit レベルでも直接担保される
  4. **空 response → `LLMUnavailableError`** (本 Issue の最重要回帰ガード):
     - `content: []`
     - `content: [{type: "tool_use"}]` のみ
     - `content: [{type: "text", text: ""}]` のみ
  5. **error mapping** (mapper の 4 種 → LLM 4 種を直接 assert):
     - HTTP 429 → `LLMRateLimitError`
     - HTTP 500 → `LLMUnavailableError`
     - HTTP 403 + `error.type: "permission_error"` → `LLMQuotaExceededError`
     - HTTP 403 + `quota / credit / billing` を含む detail → `LLMQuotaExceededError`
     - HTTP 403 + その他 → `LLMUnavailableError`
     - `TypeError` (fetch failed) → `LLMUnavailableError` (`cause: expect.any(TypeError)`)
     - 非 TypeError / 非 AbortError の `unknown` 例外 → `LLMUnavailableError` ("Unexpected error..." 分岐)
     - `AbortError` (timeout) → `LLMTimeoutError`
  6. **JSON envelope / response body failures:**
     - HTTP 200 だが body が non-JSON (`response.json()` 失敗) → `LLMUnavailableError("Anthropic response was not valid JSON")`
     - text 自体は JSON 形式だが envelope shape 不正 → `LLMUnavailableError("Anthropic response was not a JSON envelope")`
     - 配列 / null envelope → `LLMUnavailableError`
     - 必須 key 欠落 (`html` がない / `titleSuggestion` がない) → `LLMUnavailableError`
     - `tags` / `aliases` が array でない → `LLMUnavailableError`
- **理由:** 現状 `AnthropicLLMProvider` の unit test は不在 (integration test 経由でしかカバーされていない)。helper 移行によって error mapper inject + 空文字 → `LLMUnavailableError` の上書きが正しく結線されていることを unit レベルで直接 assert する必要がある (ADR-002 で要求された意味論差の回帰防止)。

### Step 5: `llmConnectionTester.ts` の helper 寄せは見送り (判断記録のみ)

- **対象ファイル:** 変更なし
- **判断:** 寄せない (詳細は ADR-002)
- **理由 (要約):** `pingAnthropic` は ①never throws ②1-token / `content: "ping"` の特殊 payload ③latency 計測 ④401/404 を「provider 応答あり」として明示扱い ⑤将来の provider switch を持つ、と helper (must throw / `system` 必須 / mapper inject 前提) と契約が真逆。寄せると wrapper コードが増えて重複削減のメリットが消失。完了条件「検討」に対しては「検討して見送り」で要件充足、判断を ADR に残す。

### Step 6: 検証

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
pnpm test
# 新規ファイルが vitest に拾われているか単独実行で確認:
pnpm vitest run app/core/adapters/llm/__tests__/llmProvider.test.ts
```

特に注視するテスト:
- `runIngestionJob.integration.test.ts` (L600-739): `AnthropicLLMProvider` を直接利用する image / pdfTextual の 2 経路が緑のままであること (回帰なし)
- `serverCloudflare.test.ts` の 既存 `createRequestContainer` 経由 `llmProvider` 4 テスト + 新規 `buildLlmProvider` 7 テスト
- 新規 `llmProvider.test.ts`

git diff で `llmProvider.ts` から重複コード (invoke / throwForStatus / DEFAULT_* / 型定義 / isAbortError 等) が削除されていることも確認。

## 設計判断

詳細は `.issue/120/adr.md` を参照。主要な判断:

- **ADR-001:** 空 response → `LLMUnavailableError` の意味論差は helper にフラグを追加せず、`AnthropicLLMProvider.invoke()` の後段で再導入する (Issue #113 ADR-002 Consequences に沿う)
- **ADR-002:** `llmConnectionTester.ts` は helper に寄せない (契約が真逆、寄せても重複削減にならない)
- **ADR-003:** `llmErrorMapper` は module-scoped const (OCR/PDF と同パターン、毎 instance 生成回避)
- **ADR-004:** `AnthropicLLMConfig` 型は export 互換維持のため `AnthropicSharedConfig` の型エイリアスとして残す
- **ADR-005:** `parseJsonEnvelope` / `requireString` / `requireStringArray` は LLM 固有のため adapter 内に残置

## リスクと注意点

- **空 response 維持が最重要:** Step 1.8 の `if (text.length === 0) throw new LLMUnavailableError(...)` を必ず入れる。message は既存と完全に同一文字列 (`"Anthropic response did not contain any text content"`) を維持し、上位 (`runIngestionJob` の retry policy) の判定に変化を出さない。
- **default 値の意味的等価:** 既存 `llmProvider.ts` の `DEFAULT_MAX_TOKENS = 4096` ↔ helper の `DEFAULT_MAX_TOKENS = 4096` は同値。`DEFAULT_TIMEOUT_MS = 60_000` も同値。等価が保たれていることを diff で確認する。
- **error 順序:** 旧 `throwForStatus` は `429 → 403(quota) → 403(other) → 5xx → fallback unavailable` の順。helper の `throwForStatus` も完全同順なので等価。
- **`cause` チェーン:** 旧 `throwForStatus` は status-based の error には `cause` を渡していない。helper も同じ挙動 (`mapper.rateLimit(msg)` のように渡さない)。`TypeError` ケースのみ cause チェーン (`mapper.unavailable(msg, cause)`) — review-001 T-W-004 と同パターン。
- **integration test の fetch payload shape:** `runIngestionJob.integration.test.ts` の fetch mock は `toMatchObject` ベースで field order に依存しない。helper と既存実装で `model` / `max_tokens` / `system` / `messages[0].content[0]` のシェイプは完全に同一。
- **スコープクリープ防止:** rename (Issue #122)、provider 抽象化、`parseJsonEnvelope` の helper 化、`llmConnectionTester` の helper 化はすべて本 Issue から除外。レビューで指摘があってもフォロー Issue に記録する。

## テスト方針

### 新規追加

| ファイル | 内容 |
|---|---|
| `app/core/adapters/llm/__tests__/llmProvider.test.ts` (新規) | `AnthropicLLMProvider` の `vi.stubGlobal("fetch")` ベース unit test (Step 4 詳述、~20 ケース) |
| `app/core/application/di/__tests__/serverCloudflare.test.ts` | `describe("buildLlmProvider", ...)` 7 ケースを追加 |

### 既存テスト (回帰ガード、無変更想定)

| ファイル | 確認点 |
|---|---|
| `app/core/adapters/llm/__tests__/anthropicMessagesClient.test.ts` | helper 本体は無変更なので影響なし |
| `app/core/adapters/llm/__tests__/ocrProvider.test.ts` / `pdfExtractor.test.ts` | 無影響 |
| `app/core/application/di/__tests__/serverCloudflare.test.ts` の `createRequestContainer` 経由 `llmProvider` テスト (L317-344) | `buildLlmProvider` 経由でも `instanceof` で同じ assertion が通る |
| `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts` の image / pdfTextual パイプライン (L600-739) | helper 移行後も同じ 3-call fetch mock で完走する |

### 検証手順
1. `pnpm typecheck && pnpm lint:fix && pnpm format`
2. `pnpm test:unit`
3. `pnpm test:integration`
4. git diff で `llmProvider.ts` から `DEFAULT_*` / `isAbortError` / `isTransientNetworkError` / `extractTextContent` / `throwForStatus` / 既存 `invoke` 内 fetch ロジックが削除されていることを確認

## 完了条件チェック

- [ ] `AnthropicLLMProvider` が `callAnthropicMessages` 経由で動く (Step 1)
- [ ] 空 response → `LLMUnavailableError` 挙動が呼び出し側で維持 (Step 1.8 / ADR-001)
- [ ] `buildLlmProvider` を `serverCloudflare.ts` から export (Step 2)
- [ ] 既存 LLM 系 unit / integration テストが緑のまま (Step 6)
- [ ] `llmProvider.ts` から重複コード (invoke / throwForStatus) が削除される (Step 1)

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | △ (構造の骨格) | ○ (テスト戦略) | △ (最小変更の判断軸) |
| 取り込んだ点 | mapper の satisfies 構造、ADR-009 への参照、Step 4 unit test の必要性 | unit test 詳細 (~20 ケース)、各 ADR の選択肢比較、constructor guard の維持 | rename スコープ外の明示、`AnthropicLLMConfig` 型エイリアス維持、`llmConnectionTester` 見送り理由の整理 |

3 エージェントとも以下に収束:
- helper 移行は ocrProvider / pdfExtractor と同型に揃える
- 空 response は adapter 内で再導入 (helper API は触らない)
- `llmConnectionTester` は見送り (契約が真逆)
- `buildLlmProvider` の 7 ケース DI テストを追加
- 新規 `llmProvider.test.ts` を追加 (現状不在のテスト穴を埋める)

## レビュー反映

### 修正した点
- レビューで P-level の指摘なし (両エージェント 0 件)

### 取り込んだ改善提案
- **[S-001 coverage / S-001 feasibility]** Step 1.8 の inline コメントを「helper の `extractTextContent` が `.trim()` 済みで length check が冗長と誤解されないように」恒久的に残す方針を明文化、helper JSDoc "Empty-response contract" への参照を追加
- **[S-002 coverage]** Step 4 に「helper への結線確認 (fetch payload shape)」テストを追加 (`callAnthropicMessages` 経由で動く完了条件を unit でも直接担保)
- **[S-003 coverage / S-004 feasibility]** Step 1.5 で `AnthropicLLMConfig` 型エイリアスに JSDoc を明示 (helper `AnthropicSharedConfig` を SSOT として参照)
- **[S-002 feasibility]** Step 4 の error mapping に「非 TypeError / 非 AbortError の unknown 例外 → `LLMUnavailableError`」(helper の `Unexpected error...` 分岐) のケースを追加
- **[S-003 feasibility]** Step 4 の JSON envelope failures に「HTTP 200 だが body が non-JSON → `Anthropic response was not valid JSON`」のケースを追加
- **[S-005 feasibility]** Step 6 に新規 unit test file が vitest に拾われているかの単独実行確認を追加

### 見送った提案とその理由
- **[S-006 feasibility]** Issue #122 への相互リンク追記 — Phase 4 (スコープ外 Issue 起票) または PR description で対応する方が自然なので、計画段階では取り込まずに後段で扱う
