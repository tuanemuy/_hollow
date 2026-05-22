# 実装計画 — Issue #101: feat(llm): wire real LLM providers (Anthropic + extensible) with admin-settings-driven resolution

**Issue:** #101
**作成日:** 2026-05-22
**複雑度:** 中〜大規模

---

## 目的

Issue #122 で完了した provider 抽象化と Anthropic 実装をベースに、**OpenAI-compatible** および **Google Gemini** の実 adapter を投入し、admin UI から provider を切り替え可能にする。さらに DB に保管された暗号化 API キーを `secretBox.decrypt` 経由で解決する経路を consumer worker に配線する。

## スコープ

### 含まれるもの

- **Phase 2**: OpenAI-compatible adapter 群（`messagesClient` / `llmProvider` / `ocrProvider` / `pdfExtractor` / `connectionPing`）
  - `baseURL` 差し替えで OpenAI 本家 / Azure OpenAI / Groq / Together / DeepInfra / vLLM 等の互換エンドポイントに対応
- **Phase 3**: Google Gemini adapter 群（OpenAI 互換ではない独立 adapter）
- **Phase 4**:
  - admin UI に provider 選択 dropdown 追加、provider 別の conditional フォーム（OpenAI 時のみ `baseURL` 入力）
  - admin が保存した `encryptedApiKey` を `secretBox.decrypt` 経由で解決して factory に渡す経路を **consumer worker** で配線
  - 接続テストが全 provider で動作
- factory の switch を 3 provider に拡張
- `LLM_PROVIDERS` に `["anthropic", "openai", "gemini"]` を並べる
- `llmConnectionTester` dispatcher を application 層に昇格（Issue #122 ADR-005 の積み残し解消）
- `instance_settings` 表に `llm_base_url` カラム追加 + migration
- wrangler env vars `ADMIN_LLM_BASE_URL` の同期（ADR-008 通り）

### 含まれないもの

- **Phase 5（factory DRY 化 / provider-registry pattern）** — Phase 2-4 で実 adapter が 3 つ動作確認できた後、別Issueでクリーンに評価する（本Issue内では見送り ADR を残す）
- per-call `secretBox.decrypt` キャッシュ（LRU 等）— 素朴な毎回 decrypt に留め、性能改善は別Issue
- LLM provider 横断のレートリミット / cost tracking
- prompt template の provider 別最適化
- streaming response 対応
- Office / SpeechRecognition の provider 別実装

## 調査結果

### 関連ファイル

- **設計**: `CLAUDE.md`, `.issue/122/adr.md`, `.issue/96/adr.md`, `spec/adr/004-llm-provider-single-fixed.md`, `spec/domains/adminSettings.md`, `spec/usecases/adminSettings.md`
- **factory / DI**: `app/core/application/di/llmProviderFactory.ts`, `app/core/application/di/serverCloudflare.ts`
- **Anthropic adapter（参考 pattern）**: `app/core/adapters/anthropic/{messagesClient,llmProvider,ocrProvider,pdfExtractor,llmConnectionTester}.ts`
- **Stub adapter**: `app/core/adapters/stub/{llmProvider,ocrProvider,pdfExtractor}.ts`
- **domain**: `app/core/domain/adminSettings/valueObject.ts` (`LLM_PROVIDERS`, `LLMConfig`), `service.ts`, `ports/secretBox.ts`, `entity.ts`
- **application**: `app/core/application/adminSettings/{updateLLMConfig,testLLMConnection,getInstanceSettings,view}.ts`
- **adapter DB**: `app/core/adapters/d1/schema.ts`, `repositories/instanceSettingsRepository.ts`
- **presentation**: `app/routes/admin/llm.tsx`, `app/components/admin/LLMSettingsForm/{Page,index,action}.tsx`, `app/components/admin/schema.ts`, `app/core/application/dto/adminSettings.ts`
- **infra**: `wrangler.toml`, `infra/templates/wrangler.{staging,production}.toml.tmpl`, `infra/scripts/renderWrangler.ts`

### あるべきアーキテクチャ

- Hexagonal + DDD: domain → application → adapters の依存方向
- `adapters/<provider>/` 1 ディレクトリ = 1 外部リソースが分割ルール
- `LLMProvider` ポートを介して domain は provider 非依存。`LLM_PROVIDERS` literal union が SSOT で、factory は switch で adapter を解決
- secret 復号は **application 層責務**（`SecretBox` port を application が消費）。adapter は plain text の `apiKey` のみ受け取る
- transport 境界（server fn の `inputValidator`）と value-object の二段 validation。`serverData` は internal-only でスキーマレス
- env sync は4箇所（`wrangler.toml [vars]` × 2 block + templates × 2 + `renderWrangler.ts`）に明示同期（ADR-008）

### 既存実装の状態（Issue #101 範囲での乖離）

1. `LLM_PROVIDERS = ["anthropic"] as const` のみ — OpenAI / Gemini が居ない
2. factory の switch case は anthropic のみ
3. DTO の provider 型が `"anthropic"` ハードコード
4. admin UI: provider 選択 dropdown なし、`ADMIN_PROVIDER_LITERAL = "anthropic" as const` で固定、画面コピーが「Anthropic Claude のみ」
5. `updateLLMConfig` usecase は `current.llm.provider` を保持して provider 変更を受け付けない
6. `createRequestContainer` 経路は env のみで、DB に保管された `encryptedApiKey` を `secretBox.decrypt` して factory に渡すフローが無い
7. `llmConnectionTester` dispatcher が `adapters/anthropic/` 配下に残存（ADR-005 の積み残し）

### 依存関係

- ingestion 経路（`runIngestionJob`）は `container.llmProvider/ocrProvider/pdfExtractor` を透過的に消費するため、provider 切替は DI のみで完結（usecase 側変更不要）
- consumer worker は `createConsumerContainer` を経由するので、DB resolution の async 化は consumer worker 側に限定可能
- DB schema (`instance_settings.llm_provider`) は既に provider 名カラムを持つため migration は `llm_base_url` 追加のみ
- `secretBox` (`WebCryptoSecretBox` / `NullSecretBox`) は Issue #96 で配線済み

## 実装ステップ

### Step 0: ADR 起票

1. `.issue/101/adr.md` を作成（詳細は別ファイル参照）
   - ADR-001: OpenAI-compatible client の `baseURL` 規約（base URL を入れる、adapter が `/chat/completions` を自動付与）
   - ADR-002: Gemini 独立 adapter 採用、認証は `x-goog-api-key` header
   - ADR-003: `llmConnectionTester` dispatcher を application 層に昇格（Issue #122 ADR-005 解消）
   - ADR-004: `LLMConfig` に optional `baseURL: string | null`、provider × baseURL invariant（Gemini も `null` 必須）
   - ADR-005: factory DRY 化見送り + フォローアップ Issue 必須起票
   - ADR-006: transport schema の provider 列挙は domain から import せず複製（CLAUDE.md ルール準拠）
   - ADR-007: DB resolution は **consumer 経路のみ async pre-step**、env override 優先順位明文化、`createRequestContainer` 同期維持
   - ADR-008: provider 変更時の ciphertext 無効化ポリシー（`apiKeyPlain` 再入力必須）
   - ADR-009: ディレクトリ命名 `gemini/` を採用（Issue 本文の `google/` から変更）

### Step 1: domain 拡張

2. `app/core/domain/adminSettings/valueObject.ts`
   - `LLM_PROVIDERS = ["anthropic", "openai", "gemini"] as const` に拡張
   - `LLMConfig` に optional `baseURL: string | null` を追加
   - `LLMConfig.create` で provider × baseURL invariant: `provider === "openai"` 以外は `baseURL === null`、`provider === "openai"` 時は optional（`null` または `https?://` で始まる長さ ≤500 の URL）
   - `LLM_BASE_URL_MAX_LENGTH = 500` 定数追加
3. `app/core/domain/adminSettings/entity.ts`
   - `defaultLLM()` に `baseURL: null` 追加
   - `reconstruct` の loose input 型に `baseURL?: string | null` 追加
3.5. `app/core/domain/adminSettings/service.ts` の `assertEnvOverride` を修正（2周目 P-001）
   - `LLMConfig.create` 呼び出しに `baseURL: cfg.baseURL` を追加して既存値を carry over
   - これを忘れると env override が走るたびに admin が保存した `baseURL` が `null` にリセットされる
3.6. `app/core/domain/adminSettings/errorCode.ts` に新 error code 追加（ADR-008）
   - `ProviderChangedRequiresApiKey: "ADMIN_SETTINGS_PROVIDER_CHANGED_REQUIRES_API_KEY"` を `AdminSettingsErrorCode` enum に追加（既存規約 PascalCase key + SNAKE_CASE value）
4. `app/core/adapters/d1/schema.ts`
   - `llm_base_url` カラム追加（`text` nullable）
5. migration ファイル新設 `app/core/adapters/d1/migrations/0010_add_llm_base_url.sql`（既存最新は 0009）
6. `app/core/adapters/d1/repositories/instanceSettingsRepository.ts`
   - `toEntity` / `save` で `baseURL` を read/write

### Step 2: OpenAI-compatible adapter 実装

7. `app/core/adapters/openai/messagesClient.ts` 新規
   - `callOpenAIMessages(config, system, content, mapper)` 関数 + `OpenAISharedConfig { apiKey, model, baseURL?, timeoutMs?, maxTokens? }`
   - Chat Completions schema: `{ model, messages: [{ role: "system", content }, { role: "user", content: [...] }], max_tokens }`
   - content blocks: `{ type: "text", text }` / `{ type: "image_url", image_url: { url } }` / PDF は base64 data URI 経由（model 未対応なら error mapper で `PDFParseError`）
   - error mapper: 429 → rateLimit, 5xx → unavailable, 401/403 → quota, AbortError → timeout
   - URL 組み立て: `baseURL ?? "https://api.openai.com/v1"` を base として `${base}/chat/completions` を append。Azure 用に `?api-version=...` のクエリが既に含まれる場合は URL クラスで safe に処理（ADR-001）
8. `app/core/adapters/openai/llmProvider.ts` 新規 — `OpenAILLMProvider implements LLMProvider`
9. `app/core/adapters/openai/ocrProvider.ts` 新規 — Vision API（`image_url` block + base64 data URI）
10. `app/core/adapters/openai/pdfExtractor.ts` 新規 — `gpt-4o` 系のみ動作前提、`MAX_PDF_BYTES` ガード、失敗時 `PDFParseError`
11. `app/core/adapters/openai/connectionPing.ts` 新規 — `pingOpenAI` 関数を export
12. `app/core/adapters/openai/__tests__/{messagesClient,llmProvider,ocrProvider,pdfExtractor}.test.ts` 新規

### Step 3: Gemini adapter 実装（ディレクトリ命名は `gemini/`、ADR-009 参照）

13. `app/core/adapters/gemini/messagesClient.ts` 新規
    - `callGeminiGenerate(config, system, parts, mapper)` + `GeminiSharedConfig { apiKey, model, timeoutMs?, maxTokens? }`（本Issueでは `baseURL` 未使用、ADR-002）
    - endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`（URL に apiKey を含めない）
    - 認証: `x-goog-api-key: ${apiKey}` HTTP header で送信（ADR-002、ログ漏洩リスク回避）
    - body: `{ contents: [{ role: "user", parts: [...] }], systemInstruction: { parts: [{ text: system }] }, generationConfig: { maxOutputTokens } }`
    - response: `candidates[0].content.parts[].text` を結合
14. `app/core/adapters/gemini/llmProvider.ts` 新規 — `GeminiLLMProvider`
15. `app/core/adapters/gemini/ocrProvider.ts` 新規 — `parts: [{ inlineData: { mimeType, data } }]` で Vision
16. `app/core/adapters/gemini/pdfExtractor.ts` 新規 — Gemini は `application/pdf` mime をネイティブサポート
17. `app/core/adapters/gemini/connectionPing.ts` 新規 — `pingGemini` 関数（`x-goog-api-key` header 経由で probe）
18. `app/core/adapters/gemini/__tests__/...` 新規

### Step 4: factory 拡張

19. `app/core/application/di/llmProviderFactory.ts`
    - `LLMFactoryConfig` に optional `baseURL?: string` 追加
    - `createLLMProvider` / `createOCRProvider` / `createPDFExtractor` の switch に `case "openai"` / `case "gemini"` 追加
    - JSDoc 更新（"Anthropic is currently the only backend" → 3 provider 対応）

### Step 5: connection tester dispatcher の application 層昇格（ADR-005 解消）

20. `app/core/adapters/anthropic/connectionPing.ts` 新規 — `pingAnthropic` を独立 export
21. `app/core/adapters/anthropic/llmConnectionTester.ts` から dispatcher 本体を撤去
22. `app/core/application/di/llmConnectionTester.ts` 新規（or 既存 di フォルダ内）— `HttpLLMConnectionTester` を移動、switch で 3 provider に dispatch
23. `serverCloudflare.ts` と `__tests__` の import path 更新
24. JSDoc に ADR-005 解消の経緯を記載

### Step 6: schema / DTO 更新

25. `app/components/admin/schema.ts`
    - `ADMIN_PROVIDER_LITERAL = "anthropic" as const` を撤去（grep 確認の結果、参照は `schema.ts` 内のみ）
    - `LLM_PROVIDERS_TRANSPORT = ["anthropic", "openai", "gemini"] as const` を新設（domain から import せず複製、ADR-006）
    - `updateLLMConfigSchema` に `provider: z.enum(LLM_PROVIDERS_TRANSPORT)` と `baseURL: z.string().trim().max(500).url().nullable()` を追加
    - `testLLMConnectionSchema.draftConfig.provider` を `z.string()` 緩い型から `z.enum(LLM_PROVIDERS_TRANSPORT)` に絞り（S-002）、`baseURL` も同様
26. `app/core/application/dto/adminSettings.ts`
    - DTO 型の `provider: "anthropic"` を `provider: LLMProviderName` literal union に拡張
    - `baseURL: string | null` を DTO 型に追加
    - `toInstanceSettingsDTO` 内で `baseURL` を渡す

### Step 7: usecase 更新

27. `app/core/application/adminSettings/updateLLMConfig.ts`
    - `UpdateLLMConfigInput` に `provider: LLMProviderName` と `baseURL: string | null` を追加
    - **既存の `current.llm.provider` 保持ロジックを撤去し、`input.provider` を採用する**（S-001）
    - draft 構築時 `LLMConfig.create({ provider: input.provider, model, baseURL, apiKeySource, apiKeyCiphertext })` を実行
    - **provider 変更時の ciphertext 無効化チェック（ADR-008）**:
      - `input.provider !== current.llm.provider` && `input.apiKeyPlain === null` の場合 → `BusinessRuleError(AdminSettingsErrorCode.ProviderChangedRequiresApiKey)` を throw
      - 上記 error code を `AdminSettingsErrorCode` enum に新規追加
      - `apiKeyPlain` 入力あり → `secretBox.encrypt(apiKeyPlain)` で新 ciphertext 生成、`apiKeySource = "db"` で保存
28. `app/core/application/adminSettings/testLLMConnection.ts`
    - `TestLLMConnectionDraft` に `baseURL: string | null` を追加
    - `LLMConfig.create({ provider, model, apiKeySource, apiKeyCiphertext })` の呼び出しに `baseURL: input.draftConfig.baseURL` を渡す（2周目 S-001 反映、漏れ防止）

### Step 8: UI 更新

29. `app/components/admin/LLMSettingsForm/index.tsx`
    - 「プロバイダ」セクションを dropdown 化（`<select name="provider">`）
    - `LLM_PROVIDERS_TRANSPORT` を import して option を描画
    - `provider === "openai"` のとき conditional に `baseURL` 入力フィールドを表示
      - inline help: 「OpenAI 本家は空欄、Azure / Groq / vLLM 等は base URL（`/chat/completions` を含まないパスまで）」「Azure は `?api-version=...` を含めて保存」（ADR-001）
    - 「Anthropic Claude のみ」文言を provider 横断に書き換え
    - **provider 変更時の警告**: 「プロバイダを変更すると API キーの再入力が必要です」をエラーバナー化（ADR-008）。`apiKeyPlain` 入力欄に `required` attribute を動的に付け、視覚的バッジで強調
    - **OpenAI 選択時の inline help**: 「PDF 取り込みには `gpt-4o` 系のモデル指定が必要です」（S-004）
    - form action（`action.tsx`）でも `provider` / `baseURL` を渡す
    - 接続テストボタンは `useDraft: true` 経路で provider / model / baseURL を draft として送信
30. `app/components/admin/LLMSettingsForm/Page.tsx`
    - DTO 拡張に追従するのみ

### Step 9: DI / DB resolution の async pre-step（consumer 経路のみ）

31. `app/core/application/di/serverCloudflare.ts`
    - `createConsumerContainer` を **async 化**（ADR-007 の env override > DB resolution > Stub fallback 優先順位を実装）:
      1. `instance_settings` を読み出す
      2. provider: `ADMIN_LLM_PROVIDER` env > DB の `llm.provider`
      3. model: `ADMIN_LLM_MODEL` env > DB の `llm.model`
      4. baseURL: `ADMIN_LLM_BASE_URL` env が非空文字 > DB の `llm.baseURL`
      5. apiKey: `ADMIN_LLM_API_KEY` env > `secretBox.decrypt(llmApiKeyCiphertext)`
      6. 復号失敗（`NullSecretBox` 等）→ Stub adapter に縮退（warn ログ）
    - 解決済み config を `buildLlmProvider/Ocr/Pdf` (`LLMFactoryConfig`) に渡す
    - `createRequestContainer` は同期維持（request path から LLM は呼ばれない）
32. **call site の `await` 化**（P-003 の影響範囲を反映）:
    - `app/worker/cloudflare/handlers.ts` の `handleQueue` 関数内 `createConsumerContainer(env, ctx)` 呼び出し（line 113 付近）を `await` 化
    - `app/core/adapters/cloudflare/inlineRelayTrigger.ts` の `runOnce()` 内 `createConsumerContainer(consumerEnv)` 呼び出し（line 85 付近）を `await` 化
    - `app/worker/cloudflare/consumer.ts` は `handlers.handleQueue` の re-export のみのため、修正は handlers.ts 側で完結
33. **テスト mock の async 化**（P-003、2周目で行数訂正）:
    - `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts` の `createConsumerContainer` mock signature を `Promise<unknown>` 返却に変更（line 39 / 72 付近）
    - `app/core/application/di/__tests__/serverCloudflare.test.ts` の `createConsumerContainer` 呼び出し **6 箇所**（line 744 / 762 / 768 / 794 / 819 / 829 付近）を全て `await` 化
    - 同時に当該 `it("...", () => { ... })` の callback を `async () => { ... }` に変更（await が使えるように）

### Step 10: infra sync（P-004: 計 7 箇所同期）

既存 `ADMIN_LLM_MODEL` / `ADMIN_LLM_PROVIDER` env vars は以下 7 箇所に同期配置されており、`ADMIN_LLM_BASE_URL` も同じ 7 箇所に追加する:

34. `wrangler.toml` の `[vars]` ブロック（line 24 付近）に `ADMIN_LLM_BASE_URL = ""` 追加
35. `wrangler.toml` の `[env.consumer.vars]` ブロック（line 110 付近）に同上
36. `infra/templates/wrangler.staging.toml.tmpl` の `[vars]` ブロック（line 19 付近）に `ADMIN_LLM_BASE_URL = "${ADMIN_LLM_BASE_URL}"` 追加
37. `infra/templates/wrangler.staging.toml.tmpl` の `[env.consumer.vars]` ブロック（line 78 付近）に同上
38. `infra/templates/wrangler.production.toml.tmpl` の `[vars]` ブロック（line 19 付近）に同上
39. `infra/templates/wrangler.production.toml.tmpl` の `[env.consumer.vars]` ブロック（line 78 付近）に同上
40. `infra/scripts/renderWrangler.ts` の `vars` リテラル（line 99 付近）に `ADMIN_LLM_BASE_URL: ""` 追加。provider 追加 checklist のコメントを更新

**検証**: 実装後に `grep -rn "ADMIN_LLM_BASE_URL" wrangler.toml infra/` で 7 ヒットすることを確認

### Step 11: テスト

41. unit test:
    - `adapters/openai/__tests__/` — `messagesClient` の fetch mock 全分岐 / `llmProvider` JSON envelope / `ocrProvider` MIME guard / `pdfExtractor` size guard / URL 組み立て（`baseURL` 末尾 `/` 有無、Azure の `?api-version` クエリ保持）
    - `adapters/gemini/__tests__/` — 同上、`x-goog-api-key` header が付与されること / URL に apiKey が含まれないことの確認
    - `application/di/__tests__/llmProviderFactory.test.ts` — 3 provider × 3 port = 9 case + 未知 provider throw
    - `valueObject.ts` の provider × baseURL invariant（openai のみ baseURL 許容、anthropic / gemini は null 必須）
    - `connectionPing.{anthropic,openai,gemini}` 個別 + dispatcher
    - `updateLLMConfig.test.ts` — provider 変更時 `apiKeyPlain` 必須化 (ADR-008) / provider 据置時の `apiKeyPlain` optional 維持
42. integration test:
    - `createConsumerContainer` の 3 path: env override / DB ciphertext + secretBox / NullSecretBox fallback
    - env override の優先順位（`ADMIN_LLM_BASE_URL` 設定時 DB 値を上書き）
    - `D1InstanceSettingsRepository` round-trip で `baseURL` カラム

### Step 12: 手動テスト

43. `.issue/101/testing.md` に以下のテストケースを記述:
    - TC-1: admin UI で provider dropdown 切替（anthropic → openai → gemini）
    - TC-2: OpenAI 本家で接続テスト + ingestion 動作
    - TC-3: **非本家 OpenAI 互換 endpoint**（例: Groq の無料枠 / vLLM ローカル）で `baseURL` 差し替え動作確認（S-002）
    - TC-4: Gemini で接続テスト + ingestion 動作
    - TC-5: provider 変更時の API key 再入力必須化（ADR-008 の UX 確認）
    - TC-6: DB key 経路（`ADMIN_LLM_API_KEY` env unset、DB ciphertext + `secretBox.decrypt`）
    - TC-7: NullSecretBox fallback（`SECRET_BOX_MASTER_KEY` 未設定 → Stub 縮退）
    - TC-8: Anthropic regression check（env override + Anthropic Claude で従来通り動く）

## 設計判断

- **Phase 5（factory DRY）は本Issue見送り** — 動作する provider 追加を優先。registry 化は 3 provider が安定動作した後に別 Issue でクリーンに評価（ADR-005）
- **connection tester dispatcher を application 層に昇格** — Phase 2/3 で provider が 3 つになる時点で「dispatcher が `adapters/anthropic/` に住む」乖離が露呈するため、本PR で ADR-005 解消（ADR-003）
- **OpenAI-compatible client 1 つで Azure / Groq 等をカバー** — `baseURL` に full URL を入れる運用。adapter 内で endpoint 形式分岐は行わない（ADR-001）
- **Gemini は独立 adapter** — `generateContent` endpoint / `contents/parts` schema / API key を query param で渡す違いを OpenAI 互換層に紛れ込ませない（ADR-002）
- **DB resolution は consumer 経路のみ async pre-step** — request path は LLM を直接呼ばないため `createRequestContainer` 同期維持（ADR-007）
- **`LLMConfig.baseURL` を VO に含める** — provider × baseURL invariant を VO で enforce（ADR-004）
- **transport schema の provider 列挙は domain から import せず複製** — CLAUDE.md の domain import 禁止ルール準拠、二段 validation（ADR-006）

## リスクと注意点

- **既存 Anthropic 経路の互換性**: factory switch / DTO / UI の provider 拡張は anthropic 値で従来挙動を保つ
- **wrangler template sync 漏れ（Issue #122 ADR-008 再発リスク）**: `ADMIN_LLM_BASE_URL` を **計 7 箇所**（`wrangler.toml [vars]` + `[env.consumer.vars]` + `wrangler.staging.toml.tmpl [vars]` + `[env.consumer.vars]` + `wrangler.production.toml.tmpl [vars]` + `[env.consumer.vars]` + `renderWrangler.ts vars`）に同期追加。レビューで `grep -rn "ADMIN_LLM_BASE_URL" wrangler.toml infra/` の 7 hit を確認
- **DB migration**: `instance_settings.llm_base_url` カラム追加。既存行 default `NULL`。Drizzle migration を `pnpm` で生成し、staging で適用順序を検証
- **secretBox fallback**: master key 未設定（`NullSecretBox`）で DB resolution を呼ぶと `SecretBoxError(KeyUnavailable)` が throw。`createConsumerContainer` 内で catch → Stub adapter に縮退（ログ警告）。env override がある場合は decrypt パスを通らない
- **OpenAI `baseURL` 規約**: base URL を入れる運用、adapter が `/chat/completions` を自動付与（ADR-001）。Azure の `?api-version` クエリ保持に注意
- **Gemini 認証方法**: `x-goog-api-key` HTTP header を採用、URL に apiKey を含めない（ADR-002、ログ漏洩リスク回避）
- **OpenAI の PDF サポートが model 依存**: `gpt-4o` 系のみ。Stub 縮退ではなく `PDFParseError` を投げる。admin UI のヘルプ文言で吸収（S-004）
- **connection tester dispatcher 移動の import path 破壊**: `serverCloudflare.ts` と `__tests__` の caller を全部 update。grep で確認
- **provider 切替時の ciphertext 無効化**: `updateLLMConfig` usecase で provider 変更時に `apiKeyPlain` を必須化（ADR-008）。`AdminSettingsErrorCode.ProviderChangedRequiresApiKey` を新規追加
- **async 化の影響範囲**: `createConsumerContainer` async 化に伴い `handlers.handleQueue` と `inlineRelayTrigger.runOnce` を `await` 化、テスト mock も async signature に変更（P-003）
- **フォローアップ Issue 必須起票**: 本Issueマージ後の Phase 4 で `refactor(llm): provider-registry pattern for adapter factories` を起票（ADR-005）

## テスト方針

- **unit test**: provider × port × エラー分岐をマトリクスで網羅。fetch mock 共通化は次Issueで検討
- **integration test**: `createConsumerContainer` の 3 path / `D1InstanceSettingsRepository` round-trip
- **manual test** (`testing.md`): admin UI 操作 → 接続テスト → ingestion 動作 / provider 切替 / env override / NullSecretBox fallback / Anthropic regression

## レビュー履歴

### 1周目

**要件カバレッジ視点**: 問題点ゼロ、改善提案 3 件

- S-001: `current.llm.provider` 保持ロジック撤去を Step 7-27 に明示
- S-002: `testing.md` で非本家 OpenAI 互換 endpoint（Groq / vLLM 等）を Step 12-43 TC-3 として追加
- S-003: ADR-007 で env override > DB の優先順位ルールを明文化

**アーキ・リスク視点**: 問題点 4 件、改善提案 9 件のうち 4 件取り込み

- **修正した点**:
  - P-001: ADR-001 の `baseURL` 規約を「base URL + adapter が `/chat/completions` 自動付与」に統一
  - P-002: ADR-002 で Gemini 認証を `x-goog-api-key` HTTP header に変更（query parameter の log 漏洩リスク回避）
  - P-003: `createConsumerContainer` async 化の影響範囲を `handlers.ts` / `inlineRelayTrigger.ts` / 既存テスト mock に拡大、Step 9 を 31-33 に分割
  - P-004: wrangler env sync 箇所数を `5 → 7` に訂正（`[vars]` + `[env.consumer.vars]` × 3 file + renderWrangler.ts）
- **取り込んだ改善提案**:
  - S-001 (ADR-005 フォローアップ Issue 必須起票): ADR-005 に明記、Phase 4 で起票
  - S-003 (Gemini も baseURL null 必須): ADR-002 / ADR-004 をすり合わせ
  - S-006 (provider 変更時 ciphertext 無効化): ADR-008 を新規追加、Step 7-27 に validation 追加
  - S-007 (`google/` → `gemini/` 命名): ADR-009 を新規追加、Step 3 のパスを書き換え
  - S-002 (`ADMIN_PROVIDER_LITERAL` 撤去明示): Step 6-25 に grep 確認結果を明記
  - S-004 (OpenAI + PDF model UI 警告): Step 8-29 に inline help 追加
  - S-008 (migration 番号 0010 確定): Step 1-5 に明記
- **見送った提案**:
  - S-005 (env override セマンティクスの関数化 `resolveLLMConfigFromEnvAndDb`): ADR-007 で優先順位を明文化することで吸収。関数抽出は実装段階で判断
  - S-009 (factory JSDoc に anthropic ignores baseURL): 実装段階で JSDoc に明記、計画書には不要

### 2周目

**要件カバレッジ視点**: 問題点ゼロ、改善提案 1 件

- S-001 (完了条件 ↔ Step traceability matrix): 必須ではないため見送り（plan.md 構造で十分追跡可能）

**アーキ・リスク視点**: 問題点 3 件、改善提案 5 件のうち主要 2 件取り込み

- **修正した点**:
  - P-001: `service.ts` の `assertEnvOverride` で `LLMConfig.create` に `baseURL` 渡し漏れ → Step 1-3.5 として明示。これを忘れると env override 時に admin が保存した `baseURL` が `null` リセットされる重大バグ
  - P-002: ADR-001 の URL 組み立てスニペットを文字列連結から `URL` クラス利用に変更。Azure の `?api-version` クエリ保持を担保
  - P-003: `serverCloudflare.test.ts` の async 化箇所を 5 箇所 → **6 箇所**（line 829 漏れ）に訂正、`it` callback も `async () => {}` 化する旨を Step 9-33 に明記
- **取り込んだ改善提案**:
  - S-001 (`testLLMConnection.ts` の `LLMConfig.create` に `baseURL` 渡し): Step 7-28 に明示
  - S-002 (ADR-008 error code の string 値定義): ADR-008 / Step 1-3.6 に明記（`ADMIN_SETTINGS_PROVIDER_CHANGED_REQUIRES_API_KEY`）
- **見送った提案**:
  - S-003 (`createConsumerContainer` の override 戦略の事前選定): 実装段階で既存 `createRequestContainer` の wiring を読みながら判断（plan で戦略固定すると実装の自由度を奪う）
  - S-004 (wrangler.toml の line 番号 → block 名指示): grep 7 hit 確認で代替済み、軽微
  - S-005 (Step 8 に client/server validation 二段の説明追加): plan.md 全体でその構造は明示済み、コメントは不要

### 3周目

**両視点とも問題点ゼロで終了**。

- 要件カバレッジ視点: 問題点ゼロ、改善提案ゼロ。2周目修正（Step 1-3.5 / 1-3.6 / 7-28 / 9-33、ADR-001 URL クラス、ADR-008 error code 値）はすべて要件カバレッジを**強化する方向**であり、Issue 完了条件達成を阻害する要素は無い
- アーキ・リスク視点: 問題点ゼロ、改善提案ゼロ。最終判定 APPROVE
- レビューループは 3周目をもって終了。実装フェーズに進む準備完了
