# 実装計画 — Issue #140: refactor(llm): provider-registry pattern for adapter factories

**Issue:** #140
**作成日:** 2026-06-01
**複雑度:** 中〜大規模

---

## 目的

Issue #101 で 3 provider 体制（anthropic / openai / gemini）になった LLM adapter factory / dispatcher の構造リファクタ。`app/core/application/di/llmProviderFactory.ts` の `createLLMProvider` / `createOCRProvider` / `createPDFExtractor` × 3 provider = 9 case の switch を **provider-registry pattern** に DRY 化する。あわせて `.issue/101/adr.md` ADR-010 で先送りされた W-A-004（baseURL 型不整合）と W-I-005（`resolveConsumerLlmConfig` の test 可能化）を解消する。

純粋な構造リファクタであり、`LLMProvider` port 契約・factory の外部 API shape は不変、挙動は変わらない。

## スコープ

### 含まれるもの

- `app/core/adapters/<provider>/index.ts` から `ProviderAdapter`（`{ llm, ocr, pdf, ping }`）を export する registry 規約の策定
- `factoryProviderRegistry: Record<LLMProvider, ProviderAdapter>` の新設
- `llmProviderFactory.ts` の 9 case switch を registry lookup に置換
- `llmConnectionTester.ts` の dispatcher を同 registry に置換
- baseURL 型不整合（W-A-004）の境界での吸収・統一
- `resolveConsumerLlmConfig` の export 化と integration test での env override assertion（W-I-005）
- INVARIANT コメント / JSDoc の更新

### 含まれないもの

- 新 provider の追加
- adapter 内部ロジック（`*SharedConfig` 実体型・`pingXxx` の中身・`buildChatCompletionsURL` 等）の変更
- factory / dispatcher の外部 API signature 変更
- `resolveConsumerLlmConfig` の I/O 構造変更（D1 直読みの注入抽象化はスコープ外）
- 全 provider 横断 error sanitize layer（別 Issue: W-F-003）/ CSRF 強化（別 Issue: W-F-006）

## 実装ステップ

### 1. `ProviderAdapter` 型と registry を adapter 層に新設

- **対象ファイル:** `app/core/adapters/llm/registry.ts`（新規）
- **変更内容:**
  - `ProviderAdapterConfig = Readonly<{ apiKey: string; model: string; baseURL: string | null }>`（factory が渡す正規化済み config）を定義。`LLMFactoryConfig`（factory の外部 API 入力、`provider` を持つ）とは別型。factory が `provider` を剥がし `baseURL: config.baseURL ?? null` で正規化して `ProviderAdapterConfig` を作って渡す。型の重複を嫌うなら `LLMFactoryConfig` を `provider` + `ProviderAdapterConfig` の合成で表現してもよい（実装時に clean な方を選ぶ）。
  - `ProviderPingResult = { ok: boolean; error?: string }` を定義。
  - `ProviderAdapter` 型を定義:
    ```ts
    export type ProviderAdapter = Readonly<{
      llm: (config: ProviderAdapterConfig) => LLMProvider;   // domain port (ingestion)
      ocr: (config: ProviderAdapterConfig) => OCRProvider;
      pdf: (config: ProviderAdapterConfig) => PDFExtractor;
      ping: (cfg: LLMConfig, apiKey: string, timeoutMs: number) => Promise<ProviderPingResult>;
    }>;
    ```
  - `factoryProviderRegistry: Record<LLMProvider, ProviderAdapter>` を定義（`LLMProvider` は `adminSettings/valueObject.ts` の literal union を import。port の `LLMProvider` interface と名前衝突するため import alias 必須）。各 provider barrel の `*Adapter` を import して登録。
- **理由:** registry は provider 固有 class への直接参照を束ねる adapter 層の知識。`adapters/llm/` は既存の provider 横断共有置き場（`jsonEnvelope.ts` / `prompts.ts`）で慣習一致。`Record<LLMProvider, ProviderAdapter>` により「union に provider 追加 → registry 未登録は型エラー」を保証し、INVARIANT をコンパイル時化する。

### 2. 各 provider の barrel `index.ts` を新設し `xxxAdapter` を export

- **対象ファイル:** `app/core/adapters/{anthropic,openai,gemini}/index.ts`（各新規）
- **変更内容:** 各 provider の class / ping を import し、`ProviderAdapter` を満たす定数を `satisfies ProviderAdapter` で export。barrel は **名前付き export のみ**（`export const xxxAdapter = ...`）とし `export *` は使わない。既存コードは `@/core/adapters/openai/llmProvider` 等の明示パス import を続けるため、barrel 新設と共存し re-export 衝突を避ける。
  - **anthropic:** `llm/ocr/pdf` は `new XxxProvider({ apiKey: c.apiKey, model: c.model })`（baseURL 無視）、`ping` は `pingAnthropic`（既に `(cfg, apiKey, timeoutMs) => {ok, error?}` で一致）をほぼ素通し。
  - **openai:** `toOpenAIConfig(c): OpenAISharedConfig` で `baseURL: string | null` → `baseURL?: string`（null/空文字は field 省略、`exactOptionalPropertyTypes` 厳守）に変換して各 class へ。`ping` は現 dispatcher にある `cfg.baseURL !== null` の ternary をここへ移動し、`pingOpenAI(...)` の `reason` → `error` 変換を実施。
  - **gemini:** `llm/ocr/pdf` は `{ apiKey, model }`、`ping` は `pingGemini({ apiKey, model: cfg.model, timeoutMs })` の `reason` → `error` 変換。
  - **`reason` → `error` 変換の挙動不変:** 現 dispatcher は `result.ok ? { ok: true } : { ok: false, error: result.reason }`。barrel のラッパでも同一 shape を維持する（`reason` が undefined の場合の `error` field の有無を現状と完全に揃える。`exactOptionalPropertyTypes` 下で意図せず `{ error: undefined }` を作らないこと）。
- **理由:** Issue の「`adapters/<provider>/index.ts` から `{ llm, ocr, pdf, ping }` を export する規約」を満たす。provider 固有の引数整形（baseURL 吸収・ping 引数組み立て・reason→error 変換）を各 barrel に閉じ込め、factory/dispatcher を provider 非依存にする。

### 3. `llmProviderFactory.ts` を registry lookup に置換

- **対象ファイル:** `app/core/application/di/llmProviderFactory.ts`
- **変更内容:**
  - 3 つの switch を撤去。`createLLMProvider` / `createOCRProvider` / `createPDFExtractor` は registry lookup → `adapter.llm(normalizedConfig)` 等を呼ぶ実装に。
  - unsupported provider 時の throw 挙動を維持（registry に key が無い場合 `Unsupported LLM/OCR/PDF provider: ${provider}` を関数ごとの prefix で throw — 既存テストが種別別メッセージを期待）。
  - **`noUncheckedIndexedAccess` 対応:** `factoryProviderRegistry[config.provider]` は型上 `ProviderAdapter | undefined`（`config.provider` は `string`）。lookup 結果を `if (adapter === undefined) throw new Error(...)` で明示ガードし、これが unsupported provider の throw を兼ねる。
  - `LLMFactoryConfig.baseURL` を `string | null`（または `string | null | undefined` を吸収）に統一し、`baseURL: config.baseURL ?? null` で `ProviderAdapterConfig` へ正規化。`buildOpenAIConfig` は barrel 側へ移すため削除。
  - 9 個の adapter class import を撤去し registry import に置換。
- **理由:** 受け入れ基準「switch を registry lookup に置換しコード重複排除」「baseURL 型不整合解消」。外部 signature は維持し既存呼出（`serverCloudflare.ts`）とテストを不変に。

### 4. `llmConnectionTester.ts` の dispatcher を registry 経由に置換

- **対象ファイル:** `app/core/application/di/llmConnectionTester.ts`
- **変更内容:**
  - `switch (cfg.provider)` を `const adapter = factoryProviderRegistry[cfg.provider]` の lookup に置換。`outcome = await adapter.ping(cfg, trimmedKey, this.timeoutMs)`。
  - provider 別の baseURL ternary / reason→error 変換は barrel 側（ステップ2）へ移動済みなので dispatcher から消える。残すのは: 空 apiKey ガード、latency 計測、`maskSecrets` の defense-in-depth、`{ ok, latencyMs, error? }` への組み立て。
  - **`noUncheckedIndexedAccess` 対応:** `cfg.provider` は closed union だが `factoryProviderRegistry[cfg.provider]` は型上 `ProviderAdapter | undefined`。現 dispatcher の `default` ブロック（`never` exhaustiveness + `Unsupported LLM provider` outcome）の役割を保つため、`if (adapter === undefined)` ガードを残して同じ `{ ok: false, error: "Unsupported LLM provider: ..." }` 相当の outcome を返す（挙動不変）。
  - 3 つの `pingXxx` 直 import を撤去。
- **理由:** 受け入れ基準「dispatcher も同 registry を使う」「shape 統一」。

### 5. `resolveConsumerLlmConfig` を pure function として export 抽出

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - `resolveConsumerLlmConfig` を `export async function` に（signature 不変）。`ResolvedConsumerLlmConfig` 型も export。
  - `createConsumerContainer` 内の呼出は不変。
- **理由:** 受け入れ基準「`resolveConsumerLlmConfig` が export され integration test で env override 実効性 assertion」。W-I-005 は「`OpenAILLMProvider` の baseURL が private で検査不可」→ pure function を直接呼んで `resolved.baseURL` を assert することで解消。

### 6. テスト更新・追加

- **対象ファイル:**
  - `app/core/application/di/__tests__/llmConnectionTester.test.ts` — ping のラップ位置が barrel に移るため、モック方法と「dispatcher に渡る引数」期待値を実装に合わせて調整。最終挙動（`{ok,latencyMs,error}` への正規化、baseURL null→省略、error 無し→field 無し、maskSecrets）の assertion は不変に保つ。
  - `app/core/application/di/__tests__/createConsumerContainer.integration.test.ts` — 既存 instanceof 検証は維持し、`resolveConsumerLlmConfig` を直接 import して env baseURL override が `resolved.baseURL` に反映されることを assert する新規ケースを追加（W-I-005 主目的）。
  - `app/core/application/di/__tests__/llmProviderFactory.test.ts` — 外部 signature 不変なので原則そのまま PASS。unsupported メッセージ prefix（LLM/OCR/PDF）維持を確認。
  - 新規（任意）: `app/core/adapters/llm/__tests__/registry.test.ts` — 各 provider entry が正しい port 実装を生成し ping が統一 shape を返すことを検証。
- **理由:** 受け入れ基準「既存 1786 unit + 362 integration tests 全件 PASS（挙動不変）」+ W-I-005 の新規 assertion。

### 7. INVARIANT コメント・JSDoc 更新

- **対象ファイル:** `app/core/domain/adminSettings/valueObject.ts`（`LLM_PROVIDERS` の INVARIANT コメント）、`llmProviderFactory.ts` / `llmConnectionTester.ts` の JSDoc。
- **変更内容:** 「factory の switch に matching case が必要」→「`factoryProviderRegistry` に matching entry が必要（`Record<LLMProvider, ProviderAdapter>` でコンパイル時保証）」へ。新 provider 追加手順を「`adapters/<provider>/index.ts` で `ProviderAdapter` を export → registry に登録」に統一。
- **理由:** あるべき姿の自己文書化。registry によって INVARIANT が型保証に格上げされた事実を反映。

### 8. 品質ゲート

- **対象:** 全体
- **変更内容:** `pnpm typecheck`、biome（MEMORY: `./node_modules/.bin/biome` で直接 format/lint 確認）、`pnpm test:unit` / `pnpm test:integration` 全件 PASS。
- **理由:** 受け入れ基準の全件 PASS。

## 設計判断

詳細は `.issue/140/adr.md` を参照。要点:

- **ADR-001:** `ProviderAdapter` 型と registry は `app/core/adapters/llm/registry.ts`（adapter 層）に置く。domain にも di にも置かない。
- **ADR-002:** registry の値は class 直参照でなく `(config) => Port` のファクトリ関数。provider 間の引数整形の非対称（baseURL 有無・ping 引数差・reason→error）を barrel に吸収するため。
- **ADR-003:** ping の統一 signature は `(cfg: LLMConfig, apiKey, timeoutMs) => Promise<{ok, error?}>`。dispatcher を provider 非依存にする。
- **ADR-004:** baseURL 型統一は「factory boundary を `string | null` に」＋「barrel で null/空文字を field 省略に変換」。`OpenAISharedConfig.baseURL?: string`（adapter 内部実体型）は変更しない（最小侵襲）。

## リスクと注意点

- **`LLMProvider` 名前衝突:** domain port `LLMProvider`（interface, ingestion）と adminSettings `LLMProvider`（literal union）が同名。registry.ts / barrel で両方を使うため import alias 必須（例: union を `LLMProviderId` として import）。`Record` のキーは union 側。
- **`llmConnectionTester.test.ts` のモック前提変更:** ping ラップが `connectionPing.ts` から barrel に移ると、`vi.mock` の効き方と期待引数が変わる。barrel が `pingXxx` を import して呼ぶ構造なら既存モックは効くが、引数組み立て / reason→error が barrel に移ったぶん期待値の見直しが必要。
- **挙動不変の厳守:** baseURL の null/空文字/undefined の扱い、ping の `error` 省略時挙動、unsupported throw メッセージ prefix（LLM/OCR/PDF 別）など、テストが固定する細部を崩さない。
- **循環 import 注意:** `registry.ts` → 各 barrel → 同 provider の adapter class の一方向に保つ。barrel が registry.ts を import するのは `ProviderAdapter` 型のみ（`import type`）に留め値の循環を作らない。
- **`satisfies` の使い方:** ファクトリ関数を値に持つため `as const` の効果は限定的。`satisfies ProviderAdapter` での型チェックと `Record<LLMProvider, ProviderAdapter>` の網羅性で provider 漏れを compile-time 検出する。
- **スコープ厳守:** adapter 内部ロジック・新 provider 追加・API 変更は禁止。

## テスト方針

- 自動テストで全担保。新規ネットワーク I/O は無いため手動確認は原則不要。
- 既存 1786 unit + 362 integration を全件 PASS させ挙動不変を証明。`llmProviderFactory.test.ts`（instanceof + unsupported throw）と `llmConnectionTester.test.ts`（ping 呼出・shape 正規化）が registry 化後も緑であることが回帰の主防波堤。
- 新規: (a) `resolveConsumerLlmConfig` を直接呼ぶ integration テストで `resolved.baseURL`（env override 優先）を assert（W-I-005）。(b) 任意で `registry.test.ts`。
- 品質ゲート: `pnpm typecheck`、biome 直接実行、`pnpm test:unit` / `pnpm test:integration`。

## レビュー履歴

### 1周目（要件カバレッジ視点 / アーキ・リスク視点 並列）

両視点とも本筋の問題点ゼロ。両者が共通指摘した型レベルの懸念を計画に反映した。

**修正した点:**
- **[P-001]（両視点が共通指摘）** `noUncheckedIndexedAccess: true`（tsconfig 確認済み）下では `factoryProviderRegistry[provider]` が `ProviderAdapter | undefined` になり「lookup は常に hit」前提が型レベルで崩れる → ステップ3（factory）・ステップ4（dispatcher）に明示 undefined ガードの方針を追記。factory はガードが unsupported throw を兼ね、dispatcher は現 `default` ブロックの outcome を保つ（挙動不変）。

**取り込んだ改善提案:**
- **[S-001/S-002]** barrel の `reason`→`error` 変換で `reason` undefined 時の `error` field 有無を現 dispatcher と完全に揃える（`exactOptionalPropertyTypes` 厳守）旨をステップ2に追記。
- **[S-001（アーキ視点）]** `ProviderAdapterConfig` と `LLMFactoryConfig` の関係（別型 / 合成）をステップ1に明確化。
- **[P-002（アーキ視点）]** barrel は名前付き export のみ（`export *` 不使用）で既存明示パス import と共存する旨をステップ2に追記。

### 2周目

両視点とも問題点ゼロで終了。

**取り込んだ改善提案（実装時の留意点として反映）:**
- dispatcher の `adapter === undefined` ガードは closed union のため到達不能。「型を通すための guard であり削除しないこと」を実装時にコメントで明示する。
- `registry.ts` ↔ barrel の相互参照は `ProviderAdapter` 型のみ（`import type`）に限定し値の循環を作らない旨を実装時コメントで残す。
- `llmProviderFactory.test.ts` の 3 種別 unsupported メッセージ prefix（LLM/OCR/PDF）が registry 化後も維持されることをテスト確認項目とする。
