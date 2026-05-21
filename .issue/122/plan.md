# 実装計画 — Issue #122: refactor(llm): provider-agnostic LLM adapter abstraction (factory + adapters/anthropic/ rename)

**Issue:** #122
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

`app/core/adapters/llm/` という **port 単位** で切られている例外ディレクトリを、CLAUDE.md の「Adapters per provider」ルールに沿って **provider 単位** (`adapters/anthropic/`) に整理する。同時に application 層に provider-agnostic な factory (`createLLMProvider` / `createOCRProvider` / `createPDFExtractor`) を新設し、`createRequestContainer` の三項分岐から `new AnthropicLLMProvider(...)` の直接 new を排除する。`ADMIN_LLM_PROVIDER` env を追加して env 駆動で provider を切り替えられる構造を整え、Issue #118 (Whisper) / #119 (Office) / #101 Phase 3 (admin-settings-driven resolution) が自然な配置に入れる土台を作る。

## スコープ

### 含まれるもの

- `adapters/llm/` → `adapters/anthropic/` の rename（git mv で履歴維持）
- `anthropicMessagesClient.ts` → `messagesClient.ts` rename（ディレクトリで provider が表現済みなので prefix を落とす）
- Stub クラス（`StubLLMProvider` / `StubOCRProvider` / `StubPDFExtractor` / `StubOfficeExtractor` / `StubSpeechRecognitionProvider`）を `adapters/stub/` に集約
- `llmConnectionTester.ts` → `adapters/anthropic/llmConnectionTester.ts`（現状 Anthropic 専用 probe なので anthropic 配下で十分。将来 OpenAI 追加時に dispatcher を再抽出）
- application 層に `app/core/application/di/llmProviderFactory.ts` を新設し、`createLLMProvider` / `createOCRProvider` / `createPDFExtractor` を export
- `serverCloudflare.ts` の `buildLlmProvider` / `buildOcrProvider` / `buildPdfExtractor` を factory 経由に改修（signature に `provider` 引数追加）
- `ServerEnv.ADMIN_LLM_PROVIDER` / `RequestServerConfig.adminLlmProvider` 追加
- `readRequestServerConfig` での `exactOptionalPropertyTypes` 対応の conditional spread
- `wrangler.toml` の `[vars]` と `[env.consumer.vars]` 両方に `ADMIN_LLM_PROVIDER = "anthropic"` 追加
- `LLM_PROVIDERS` に拡張ガイドコメント追加
- factory の unit test 追加（`createXxx({provider: "anthropic", ...})` → 各 Anthropic adapter、未知 provider → throw）
- import path の全更新（6+ ファイル）

### 含まれないもの

- OpenAI / Gemini / Whisper 等の **具体的な他 provider** 実装（#118 / #119 / 別 Issue）
- 空 `adapters/openai/` / `adapters/gemini/` プレースホルダーディレクトリ作成（Issue 本文「判断」だが **作らない**: YAGNI）
- admin UI の provider 選択 dropdown（#101 Phase 3）
- admin-settings DB-stored ciphertext からの provider 解決（#101 Phase 3）
- `AnthropicSharedConfig` / `callAnthropicMessages` / `AnthropicErrorMapper` / `AnthropicContentBlock` の export 名整理（rename スコープ外）
- `cloudflare/r2*.ts` 内の `StubObjectStorage` / `StubTempFileStorage` 同居問題（別ドメイン）

---

## 実装ステップ

### Phase A: ディレクトリ rename と Stub 分離

#### A-1. `adapters/anthropic/` ディレクトリ新設と Anthropic ファイル移動

- **対象ファイル:**
  - 旧 `app/core/adapters/llm/anthropicMessagesClient.ts` → 新 `app/core/adapters/anthropic/messagesClient.ts`（**ファイル名 rename**）
  - 旧 `app/core/adapters/llm/llmProvider.ts` → 新 `app/core/adapters/anthropic/llmProvider.ts`（**`StubLLMProvider` は次ステップで分離 → ここでは Anthropic 実装のみ残す**）
  - 旧 `app/core/adapters/llm/ocrProvider.ts` → 新 `app/core/adapters/anthropic/ocrProvider.ts`（同様）
  - 旧 `app/core/adapters/llm/pdfExtractor.ts` → 新 `app/core/adapters/anthropic/pdfExtractor.ts`（同様）
  - 旧 `app/core/adapters/llm/llmConnectionTester.ts` → 新 `app/core/adapters/anthropic/llmConnectionTester.ts`（ファイル名そのまま）
  - 旧 `app/core/adapters/llm/__tests__/anthropicMessagesClient.test.ts` → 新 `app/core/adapters/anthropic/__tests__/messagesClient.test.ts`
  - 旧 `app/core/adapters/llm/__tests__/{llmProvider,ocrProvider,pdfExtractor}.test.ts` → 新 `app/core/adapters/anthropic/__tests__/{llmProvider,ocrProvider,pdfExtractor}.test.ts`
- **変更内容:** `git mv` 相当で移動。各ファイル内の相対 import (`./anthropicMessagesClient`) を `./messagesClient` に修正。中身のロジックは触らない
- **理由:** CLAUDE.md「Adapters per provider」厳守。Issue 本文で `anthropicMessagesClient.ts` → `messagesClient.ts` rename が明示要件

#### A-2. Stub クラスを `adapters/stub/` に集約

- **対象ファイル:**
  - 新規 `app/core/adapters/stub/llmProvider.ts` ← 旧 `llm/llmProvider.ts` の `StubLLMProvider` のみ
  - 新規 `app/core/adapters/stub/ocrProvider.ts` ← 旧 `llm/ocrProvider.ts` の `StubOCRProvider` のみ
  - 新規 `app/core/adapters/stub/pdfExtractor.ts` ← 旧 `llm/pdfExtractor.ts` の `StubPDFExtractor` のみ
  - 移動 `app/core/adapters/llm/officeExtractor.ts` → `app/core/adapters/stub/officeExtractor.ts`（中身は元から `StubOfficeExtractor` のみ）
  - 移動 `app/core/adapters/llm/speechRecognitionProvider.ts` → `app/core/adapters/stub/speechRecognitionProvider.ts`（中身は元から Stub のみ）
- **変更内容:** Stub クラスの中身は完全に等価維持（既存の `BusinessRuleError(IngestionErrorCode.UnsupportedFormat, ...)` 挙動）。`app/core/adapters/anthropic/{llmProvider,ocrProvider,pdfExtractor}.ts` から Stub 系 export を削除
- **理由:** Issue 完了条件「Stub クラスが provider 非依存の場所に配置されている」。`adapters/stub/` は fallback 実装を集約する場所として明示的。port 隣接（`domain/ingestion/ports/`）案は domain 層に adapter コードが入る設計違反になるので不採用

#### A-3. 旧 `adapters/llm/` ディレクトリ削除

- **対象:** `app/core/adapters/llm/` ディレクトリごと
- **変更内容:** 空になっているはず。ディレクトリを削除
- **理由:** 過渡的な空ディレクトリを残さない

---

### Phase B: factory の新設

#### B-1. `app/core/application/di/llmProviderFactory.ts` を新規作成

- **対象ファイル:** 新規 `app/core/application/di/llmProviderFactory.ts`
- **変更内容:** 以下 3 つの factory を export
  ```ts
  import type { LLMProvider } from "@/core/domain/ingestion/ports/llmProvider";
  // ... 他 port interface (OCRProvider, PDFExtractor) も import

  export type LLMFactoryConfig = Readonly<{
    provider: string;
    apiKey: string;
    model: string;
  }>;

  export function createLLMProvider(config: LLMFactoryConfig): LLMProvider {
    switch (config.provider) {
      case "anthropic":
        return new AnthropicLLMProvider({ apiKey: config.apiKey, model: config.model });
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }
  // createOCRProvider / createPDFExtractor も同様
  ```
- **理由:** Issue 完了条件「`createLLMProvider` / `createOCRProvider` / `createPDFExtractor` factory が application 層に存在し、`config.provider` で switch する」。`di/` 配下が composition root として既に `serverCloudflare.ts` で adapter を import している前例があるので整合的（`ports/` は port interface 置き場所っぽいので避ける）
- **設計判断:** factory は runtime 非依存にしておけば AWS Lambda 等の別 entry でも再利用可能（CLAUDE.md「To target a different runtime, add a new adapter group」と整合）
- **型設計:** `provider` フィールドは env 由来の生 string を受け取り、内部 switch で runtime check → 未知値は `default: throw` で早期失敗。**`LLMProviderName` literal union を受け取る `never` exhaustive 設計は不採用**: (1) `LLM_PROVIDERS` が単一要素 (`["anthropic"]`) の現状では switch case を全部覆った時点で `default` 内の `config.provider` 型は `never` になり、`as LLMProviderName` の二重 cast なしには test で未知値を投げられない、(2) env 由来の string を受け取る factory にとって runtime guard 中心の設計のほうが安全（typo 等の設定ミスも factory 内で表面化）。将来 provider が 2 つ以上になった時点で `LLMProviderName | (string & {})` のような branded union + exhaustive check を導入する（YAGNI）

#### B-2. factory の unit test 追加

- **対象ファイル:** 新規 `app/core/application/di/__tests__/llmProviderFactory.test.ts`
- **変更内容:**
  - `createLLMProvider({ provider: "anthropic", apiKey: "sk", model: "claude-3" })` → `AnthropicLLMProvider` の instance
  - `createOCRProvider({ provider: "anthropic", ... })` → `AnthropicOCRProvider`
  - `createPDFExtractor({ provider: "anthropic", ... })` → `AnthropicPDFExtractor`
  - 未知 provider (`{ provider: "openai", ... }`) で `Error` throw — `provider: string` シグネチャなので cast 不要でそのまま渡せる
- **理由:** factory の contract を独立して保証。runtime check の負経路を覆い、env からの typo 等の設定ミスが factory 内で早期失敗することを担保

---

### Phase C: DI helper を factory 経由に改修

#### C-1. `buildLlmProvider` / `buildOcrProvider` / `buildPdfExtractor` の signature 拡張

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`（line 299-351 周辺）
- **変更内容:** 各 helper を以下に改修
  ```ts
  export function buildLlmProvider(
    provider: string | undefined,
    adminLlmApiKey: string | undefined,
    adminLlmModel: string | undefined,
  ): LLMProvider {
    if (!adminLlmApiKey || !adminLlmModel) return new StubLLMProvider();
    return createLLMProvider({
      provider: provider ?? "anthropic",
      apiKey: adminLlmApiKey,
      model: adminLlmModel,
    });
  }
  // buildOcrProvider / buildPdfExtractor 同様
  ```
- **理由:** 既存の三項分岐パターン（apiKey/model 欠落 → Stub）を維持しつつ、`new AnthropicXxx(...)` 直接呼び出しを factory に委譲。Issue 完了条件「`createRequestContainer` の DI 三項分岐が factory 経由に変更されている」を満たす
- **default 規約:** `provider ?? "anthropic"` で env 未設定時の既存挙動を維持。factory に `string` を渡すので cast 不要

#### C-2. `ServerEnv` / `RequestServerConfig` / `readRequestServerConfig` 拡張

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - `ServerEnv` に `ADMIN_LLM_PROVIDER?: string` を追加（JSDoc で「default `"anthropic"`、`[vars]` で配布」を明記）
  - `RequestServerConfig` に `adminLlmProvider?: string` を追加（JSDoc 同様）
  - `readRequestServerConfig` 内で `...(env.ADMIN_LLM_PROVIDER ? { adminLlmProvider: env.ADMIN_LLM_PROVIDER } : {})` を追加（`exactOptionalPropertyTypes` 対応の既存パターン踏襲）
- **理由:** Issue Phase 3 要件。env 駆動で provider 選択を開く

#### C-3. `createRequestContainer` の destructure 追加

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`（`createRequestContainer` 関数内）
- **変更内容:**
  - destructure に `adminLlmProvider` を追加
  - `buildLlmProvider(adminLlmProvider, adminLlmApiKey, adminLlmModel)` 形に呼び出し変更（OCR / PDF も同様）
- **理由:** factory 経路に env の provider を渡す

---

### Phase D: env / wrangler / domain コメント

#### D-1. `wrangler.toml` への `ADMIN_LLM_PROVIDER` 配布

- **対象ファイル:** `wrangler.toml`
- **変更内容:**
  - top-level `[vars]` に `ADMIN_LLM_PROVIDER = "anthropic"` を追加（既存 `ADMIN_LLM_MODEL` の隣。これは `pnpm dev` / fetch worker / request path 用）
  - `[env.consumer.vars]` にも同じく `ADMIN_LLM_PROVIDER = "anthropic"` を追加（wrangler は named environment が `[vars]` を inherit しないため重複必須。consumer worker は LLM を呼ぶ）
- **配布範囲の明確化:** `[env.relay.vars]` / `[env.pruner.vars]` / `[env.dlq.vars]` には **追加しない**。これらの worker は LLM を呼ばないため不要（既存 `ADMIN_LLM_MODEL` も同じ理由でこれら 3 environment には配布されていない）
- **理由:** Issue 完了条件「`ADMIN_LLM_PROVIDER` env が `wrangler.toml [vars]` で配布されている」

#### D-2. `LLM_PROVIDERS` 拡張ガイドコメント追加

- **対象ファイル:** `app/core/domain/adminSettings/valueObject.ts`（line 119 付近）
- **変更内容:** `const LLM_PROVIDERS = ["anthropic"] as const;` の直上にコメントを追加
  ```ts
  // Extension guide: add new providers here (e.g. "openai", "gemini",
  // "azure-openai") and pair each with a `case` branch in the factories
  // at `app/core/application/di/llmProviderFactory.ts`.
  const LLM_PROVIDERS = ["anthropic"] as const;
  ```
- **理由:** Issue 完了条件「`LLM_PROVIDERS` の拡張ガイドラインがコメントで残っている」。CLAUDE.md「no comments unless WHY is non-obvious」の例外（WHERE を 1 箇所に集約する正当な理由）。factory 関数名の列挙は保守コスト（rename 時の修正漏れ）が高いので path のみ示す

---

### Phase E: import path の全更新

#### E-1. import path 一括置換

- **対象ファイル:**
  - `app/core/application/di/serverCloudflare.ts`
  - `app/core/application/di/__tests__/serverCloudflare.test.ts`
  - `app/core/application/di/types.ts`（JSDoc 内のディレクトリ言及があれば修正）
  - `app/core/application/__tests__/helpers.ts`
  - `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts`
  - `app/core/adapters/d1/__tests__/helpers.ts`
  - `app/worker/cloudflare/__tests__/handlers.integration.test.ts`
  - その他 grep で見つかったすべての `adapters/llm/` 参照箇所
- **変更内容（置換マップ）:**
  - `@/core/adapters/llm/anthropicMessagesClient` → `@/core/adapters/anthropic/messagesClient`
  - `@/core/adapters/llm/llmProvider` の `AnthropicLLMProvider` → `@/core/adapters/anthropic/llmProvider`
  - `@/core/adapters/llm/llmProvider` の `StubLLMProvider` → `@/core/adapters/stub/llmProvider`
  - `@/core/adapters/llm/ocrProvider` の `AnthropicOCRProvider` → `@/core/adapters/anthropic/ocrProvider`
  - `@/core/adapters/llm/ocrProvider` の `StubOCRProvider` → `@/core/adapters/stub/ocrProvider`
  - `@/core/adapters/llm/pdfExtractor` の `AnthropicPDFExtractor` → `@/core/adapters/anthropic/pdfExtractor`
  - `@/core/adapters/llm/pdfExtractor` の `StubPDFExtractor` → `@/core/adapters/stub/pdfExtractor`
  - `@/core/adapters/llm/officeExtractor` → `@/core/adapters/stub/officeExtractor`
  - `@/core/adapters/llm/speechRecognitionProvider` → `@/core/adapters/stub/speechRecognitionProvider`
  - `@/core/adapters/llm/llmConnectionTester` → `@/core/adapters/anthropic/llmConnectionTester`
- **検証:**
  - 最後に `grep -rn "adapters/llm" app/ infra/` で残存 0 件を確認（コード本体 + JSDoc のみ対象。`docs/` / `.issue/` / `spec/` 内の歴史的記録は更新対象外）
  - `grep -rn "AnthropicLLMProvider\|AnthropicOCRProvider\|AnthropicPDFExtractor" app/core/adapters/stub/` で 0 件（stub 側に Anthropic 残骸ナシ）
  - `grep -rn "StubLLMProvider\|StubOCRProvider\|StubPDFExtractor" app/core/adapters/anthropic/` で 0 件（anthropic 側に Stub 残骸ナシ）
- **理由:** rename に伴う必須メンテ。両方向の grep で「Adapters per provider」ルール準拠を機械検証

#### E-2. 既存 `serverCloudflare.test.ts` の helper 呼び出し更新

- **対象ファイル:** `app/core/application/di/__tests__/serverCloudflare.test.ts`
- **変更内容:**
  - 既存の `buildLlmProvider(key, model)` 呼び出しを `buildLlmProvider("anthropic", key, model)` に変更（OCR / PDF も同様）
  - 既存のフォールバックケース（apiKey / model 欠落）は `buildLlmProvider(undefined, undefined, undefined)` の形でカバー
  - **追加:** `buildLlmProvider(undefined, key, model)` でデフォルト `"anthropic"` 経路がカバーされることを確認するテスト 1 件
  - **追加:** `createRequestContainer` 経由の env→adapter mapping テストに `adminLlmProvider: "anthropic"` を含むケース 1 件
- **理由:** signature 変更への追随 + default fallback の動作確認

---

## 設計判断

詳細は `.issue/122/adr.md` を参照。要点:

- **ADR-001:** factory の置き場所を `app/core/application/di/llmProviderFactory.ts` に統一（`ports/` ではなく `di/`）
- **ADR-002:** Stub は `adapters/stub/` 新ディレクトリに全集約（同居維持案は Issue 完了条件と矛盾）
- **ADR-003:** factory のシグネチャを `{ provider, apiKey, model }` の単一 config object 受け取りに統一（将来 fields 追加の拡張性）
- **ADR-004:** `buildLlmProvider` の関数名は維持し signature 拡張のみ（リネームは差分肥大化なので不採用）
- **ADR-005:** `llmConnectionTester.ts` は当面 `adapters/anthropic/` 配下に置く（YAGNI; OpenAI 追加時に dispatcher を独立化）
- **ADR-006:** `anthropicMessagesClient.ts` → `messagesClient.ts` rename を実施（Issue 本文の明示要件）
- **ADR-007:** 未知 provider は factory 内 `default: throw` で早期失敗（exhaustive `never` + runtime guard）

---

## リスクと注意点

- **`exactOptionalPropertyTypes` の罠**: `RequestServerConfig.adminLlmProvider?: string` 追加時、`readRequestServerConfig` で `adminLlmProvider: env.ADMIN_LLM_PROVIDER ?? undefined` のような書き方は tsgo で型エラー。必ず conditional spread (`...(env.X ? { x: env.X } : {})`) パターンを踏襲。テスト fixture（`configWith` 等）でも同様
- **`LLM_PROVIDERS` 型と env string の整合性**: env から読んだ生 string を factory に渡すとき `as LLMProviderName` で narrow。未知値は factory 内 `default` で throw（早期失敗）
- **クラス名衝突**: domain の `LLMProvider` (string literal type) と port の `LLMProvider` (interface) は別物。factory 内では import alias (`LLMProvider as LLMProviderName`) で衝突回避
- **import path 漏れ**: 機械的だが、JSDoc 内の文字列言及 (`types.ts` の `app/core/adapters/llm/` 参照等) も忘れずに更新。最終 grep で `adapters/llm` 0 件を保証
- **PR の規模 / commit 粒度**: rename + 新規ファイル + 内容変更 + import 全更新が同 PR に混在。レビュー負荷大だが Issue 本文で「1 回の refactor で済ます」と明示されているので分割しない。git rename detection は `--find-renames` の閾値で動作するため「同一コミット内で内容も大幅に変える」と rename が検知されない可能性が高い。コミット粒度の推奨:
  - commit 1: 純粋 `git mv` のみ（中身変更なし、import 修正なし）
  - commit 2: Stub 分離（`adapters/stub/` 新設）+ Anthropic ファイルから Stub export 削除
  - commit 3: import path 全更新
  - commit 4: factory 新規追加 + factory unit test 追加
  - commit 5: `serverCloudflare.ts` の signature 拡張 + env 追加 + 既存 test 更新
  - commit 6: `wrangler.toml` 配布 + `LLM_PROVIDERS` コメント追加
- **git mv 履歴**: rename はファイル単位で `git mv` を使い rename detection を確実にする
- **Issue #120 との関係**: #120 (helper migration) は CLOSED 済み (`09fba74`)。本 Issue は #120 を前提とした続編として独立する
- **Phase 4 プレースホルダー**: Issue 本文で「判断」とあるが本計画では **空ディレクトリ作成しない** 方針（YAGNI）。port contract の厳格化（factory + exhaustive switch）で十分

---

## テスト方針

### 回帰防止（最優先）

- 既存 `app/core/adapters/anthropic/__tests__/{messagesClient,llmProvider,ocrProvider,pdfExtractor}.test.ts`（旧 `llm/__tests__/` から移動）が全件パス
- 既存 `app/core/application/di/__tests__/serverCloudflare.test.ts` の env→adapter mapping テスト（`AnthropicLLMProvider` 等の `instanceof` 検証）が緑
- 既存 integration test (`runIngestionJob.integration.test.ts`, `handlers.integration.test.ts`) が新 import path で動作

### 新規テスト

- `app/core/application/di/__tests__/llmProviderFactory.test.ts`（factory 3 種それぞれで anthropic / unsupported を覆う）
- `serverCloudflare.test.ts` に signature 変更追随 + default fallback テスト追加

### 実行コマンド

```bash
pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test
```

Issue 完了条件「既存の全テスト (1883 件) が緑のまま (回帰なし)」を最終ゲート

---

## 参考: エージェント比較

| 観点 | エージェント1 (アーキ) | エージェント2 (保守性) | エージェント3 (シンプル) |
|------|-----------------------|------------------------|--------------------------|
| ベース採用 | △ | ○（最も網羅的） | × |
| factory 配置 | `di/llmProviderFactory.ts` ← **採用** | `ports/llmProviderFactory.ts` | 既存 helper 昇格 |
| Stub 分離 | 全部 `stub/` ← **採用** | 全部 `stub/` ← **採用** | 同居維持（Issue要件違反） |
| `messagesClient.ts` rename | YES ← **採用** | YES ← **採用** | 見送り |
| factory test | 重視 | 詳細 ← **採用** | 省略可とする |
| `LLMProviderName` 型 alias | - | 衝突回避明記 ← **採用** | - |
| `llmConnectionTester.ts` | rename も検討 | 移動のみ ← **採用** | 移動のみ |

統合方針: エージェント2（保守性）をベースに、エージェント1の Phase 構造化とエージェント3の YAGNI 視点（空プレースホルダー作らない）を取り込む。

---

## レビュー反映

### 修正した点

- **P-001 (Critical)**: factory のシグネチャを `provider: LLMProviderName` (literal union) から `provider: string` (raw string) に変更。`never` exhaustive check を削除し runtime check 中心の設計に。理由: `LLM_PROVIDERS = ["anthropic"]` 単一要素では `default` 分岐の `const _: never = config.provider` 周辺が壊れやすく、test で未知 provider を投げるのに二重 cast (`as unknown as LLMProviderName`) が必要になる。env 由来 string を受け取る factory にとっては runtime guard が安全（typo 等の設定ミスも factory 内で表面化）。将来 provider が 2 つ以上になった時点で exhaustive check を再導入（YAGNI）
- **P-002**: `llmConnectionTester.ts` の dispatcher を `adapters/anthropic/` に置く構造的不整合を ADR-005 で明示。「Issue 自身が問題視している『ディレクトリ名と実態の乖離』と同種の妥協を受容する」ことを Consequences に記載
- **P-003**: `wrangler.toml` の配布範囲を明確化。「`[vars]` (top-level) + `[env.consumer.vars]` の 2 箇所」「relay/pruner/dlq には不要」と理由付きで記載

### 取り込んだ改善提案

- **S-002 (req-cov)**: `adapters/stub/` / `adapters/anthropic/` 双方向の grep 検証（Anthropic 残骸 / Stub 残骸の不在）を Phase E-1 に追加
- **S-003 (feasibility)**: PR コミット粒度の推奨を「リスクと注意点」に追加。git rename detection を確実にするため commit を 6 段階に分割
- **S-004 (feasibility)**: grep 対象範囲を「コード本体 + JSDoc のみ。docs/ / .issue/ / spec/ は対象外」と明記
- **S-005 (feasibility)**: `LLM_PROVIDERS` コメントから factory 関数名列挙を削除し path のみ示す形に変更（保守コスト軽減）
- **ADR 強化**: ADR-002 の Context に「Issue 本文が port 隣接案も許容している」ことを明示、ADR-005 の Consequences に「Issue 自身が問題視している乖離と同種の妥協」を明示

### 見送った提案とその理由

- **S-001 (req-cov)**: `adapters/stub/officeExtractor.ts` / `speechRecognitionProvider.ts` のヘッダ JSDoc に「#118 / #119 で実 provider 追加時の接続点」を注記する提案 — JSDoc 追加自体は害にならないが、CLAUDE.md「Default to no comments」の境界線上で議論が分かれそう。実装時に「ファイル先頭の既存コメントに自然に組み込める範囲なら追記」とし、強制要件にはしない
- **S-001 (feasibility)**: factory config に `endpoint` / `apiVersion` / `timeoutMs` / `maxTokens` を追加する提案 — 現状の `AnthropicLLMProvider` constructor は constructor 内 default で値が決まる。env override が必要になった時に signature 拡張すればよく、今は YAGNI で見送り
- **S-002 (feasibility)**: `adapters/stub/` の barrel export 方針 — file-per-class 方式を採用（既存 adapter ディレクトリも barrel を持たない）。Phase E-1 の置換 map で明示済み
