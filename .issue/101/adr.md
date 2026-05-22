# ADR — Issue #101: Wire real LLM providers (Anthropic + extensible)

Issue #122 で確立された provider 抽象化 / factory pattern を踏襲しつつ、**OpenAI-compatible + Google Gemini** の adapter を投入し、admin UI から provider 選択を可能にする本Issueでの設計判断を記録する。

---

## ADR-001: OpenAI-compatible endpoint は `baseURL` を **base URL（path 末尾の `/chat/completions` は adapter が自動付与）** として扱う

### Status

Proposed (1周目レビューで P-001 を受けて改訂)

### Context

OpenAI Chat Completions API 互換のエンドポイントを提供する provider は多岐にわたる:

- **OpenAI 本家** (`https://api.openai.com/v1`)
- **Azure OpenAI** (`https://<resource>.openai.azure.com/openai/deployments/<deployment>` + `?api-version=YYYY-MM-DD`)
- **Groq** (`https://api.groq.com/openai/v1`)
- **Together AI** (`https://api.together.xyz/v1`)
- **DeepInfra / vLLM / LM Studio / Ollama** など

`baseURL` の扱いには 2 つの解釈があり、初稿では「full URL or base URL の規約が曖昧」と混同していた。adapter 内で「endpoint 形式から provider 種別を推測して分岐する」実装は複雑化と特殊ケースの泥沼化を招くため、規約を一意に固定する必要がある。

### Decision

- `OpenAISharedConfig { apiKey, model, baseURL?, timeoutMs?, maxTokens? }` を採用し、`baseURL` には **base URL（path の末尾に `/chat/completions` を含まない部分）** を入れる運用に統一する
- adapter 側は `${baseURL}/chat/completions` を組み立てる（自動付与）。`baseURL` 未指定時は `https://api.openai.com/v1` を default
- 各 provider の `baseURL` 例:
  - OpenAI 本家: `https://api.openai.com/v1`（または未指定で default）
  - Groq: `https://api.groq.com/openai/v1`
  - Together AI: `https://api.together.xyz/v1`
  - DeepInfra: `https://api.deepinfra.com/v1/openai`
  - vLLM / LM Studio / Ollama: self-hosted endpoint の base
  - Azure: `https://<resource>.openai.azure.com/openai/deployments/<deployment>` を `baseURL` に入れ、`apiVersion` クエリは `baseURL` の query 部分 (`?api-version=...`) に**ユーザー側で付与してから保存**してもらう。adapter は `baseURL` を尊重しつつ末尾 path に `/chat/completions` を付与
- admin UI のヘルプテキストで以下を案内:
  - 「OpenAI 本家を使う場合は空欄で OK」
  - 「Azure / Groq / vLLM 等の場合は base URL（`/chat/completions` を含まないパスまで）を入力。Azure は `?api-version=...` を含めて保存してください」
- adapter の URL 組み立ては **`URL` クラスを使って query を保ったまま path を append する**:
  ```ts
  const u = new URL(baseURL ?? "https://api.openai.com/v1");
  u.pathname = u.pathname.replace(/\/$/, "") + "/chat/completions";
  return u.toString(); // query (?api-version=...) は保持される
  ```
  この実装なら Azure の `https://res.openai.azure.com/openai/deployments/dep?api-version=YYYY-MM-DD` も safely append できる

### Consequences

- 良い点: 規約が一意。`URL` クラス利用で Azure の `?api-version` クエリも保持される
- トレードオフ: 文字列連結ではなく `URL` クラスを使う規律が必要（messagesClient テストで URL 組み立てを明示的に検証）
- 将来 Azure 専用 `apiVersion` field を導入する余地は残す（YAGNI で本Issueでは追加しない）

---

## ADR-002: Google Gemini は OpenAI 互換ではないため独立 adapter とする / 認証は `x-goog-api-key` header を採用

### Status

Proposed (1周目レビューで P-002 を受けて改訂)

### Context

Gemini API は以下の点で OpenAI Chat Completions と異なる:

- **endpoint 形式**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **request schema**: `{ contents: [{ role, parts: [...] }], systemInstruction, generationConfig }`
- **認証**: 公式ドキュメント上、`?key=<apiKey>` query parameter または `x-goog-api-key` HTTP header のどちらでも受け付ける
- **content blocks**: `text` / `inlineData { mimeType, data }` 形式

これらの違いを OpenAI-compatible adapter に紛れ込ませると ADR-001 の「endpoint 分岐をしない」原則が破綻する。

加えて、認証方法の選択には security 上の検討が必要:

- `?key=` 方式は (a) Cloudflare 側 fetch ログ・中間 proxy・error reporting payload に key が混入する、(b) Anthropic / OpenAI の HTTP header 経由と比べて漏洩リスクが構造的に高い
- `x-goog-api-key` header 方式は他 provider と運用が揃い、ログ漏洩リスクを最小化できる

### Decision

- `app/core/adapters/gemini/` を独立 adapter group として新設し、Anthropic / OpenAI と並列に扱う（命名は ADR-009 参照）
- `messagesClient` / `llmProvider` / `ocrProvider` / `pdfExtractor` / `connectionPing` の 5 ファイル構成は Anthropic と同じ
- **認証は `x-goog-api-key` HTTP header を採用**。URL には API key を含めない
- `pingGemini` / `messagesClient` / Vision / PDF 全経路で同方針を適用
- Gemini は本Issueでは `baseURL` を **常に `null`** とする（VO invariant、ADR-004 参照）。将来 vertex AI proxy 等を扱う場合は別Issueで invariant を緩める

### Consequences

- 良い点: 各 adapter が単一 provider に集中でき、テスト・保守が容易。認証 header の統一でログ漏洩リスクを排除
- トレードオフ: adapter 数が増えるが Issue #101 のスコープ内で許容範囲。Phase 5 (factory DRY 化) で抽象を整理する余地を残す（ADR-005）

---

## ADR-003: `llmConnectionTester` dispatcher を application 層に昇格（Issue #122 ADR-005 解消）

### Status

Proposed

### Context

Issue #122 ADR-005 で、`HttpLLMConnectionTester` dispatcher を `app/core/adapters/anthropic/llmConnectionTester.ts` 内に置いたまま「OpenAI / Gemini 追加 Issue で application 層に昇格させる」と積み残した。本Issueがその Issue にあたる。

Phase 2/3 で provider が 3 つになると、dispatcher が「特定 adapter group の配下」に住むのは layering 上明確な乖離となる：dispatcher は全 provider を switch するため、Anthropic adapter 群への所属理由が無くなる。

### Decision

- 各 adapter group に `connectionPing.ts` を配置し、`pingAnthropic` / `pingOpenAI` / `pingGemini` 関数を export する
- dispatcher 本体 (`HttpLLMConnectionTester`) を `app/core/application/di/llmConnectionTester.ts` に移動する
- `app/core/adapters/anthropic/llmConnectionTester.ts` から dispatcher を撤去（`pingAnthropic` の薄いファイルだけ残すか削除）
- `serverCloudflare.ts` の import path を更新

### Consequences

- 良い点: layering が clean に。新 provider 追加時に「dispatcher も Anthropic 配下も触る」混乱が無くなる
- トレードオフ: 既存 import の更新が必要だが grep で機械的に対応可能

---

## ADR-004: `LLMConfig` に optional `baseURL: string | null` を追加し、provider × baseURL invariant を VO で enforce

### Status

Proposed (1周目レビューで S-003 を受けて改訂)

### Context

`baseURL` は OpenAI-compatible 経路（Azure / Groq 等の差し替え）でのみ意味を持ち、Anthropic / Gemini では使わない。

このフィールドをどこで持つかの選択肢:

- (A) `LLMConfig` VO に optional として持たせ、VO が provider × baseURL invariant を enforce
- (B) `OpenAIConfig` 等 provider 別の VO に分割する
- (C) `LLMFactoryConfig` だけが持ち、VO は知らない

### Decision

(A) を採用。`LLMConfig { provider, model, baseURL: string | null, apiKeySource, apiKeyCiphertext, ... }` とし、`LLMConfig.create` で以下を enforce:

- `provider === "openai"` の場合: `baseURL` は `null` または 長さ ≤500 / `https?://` で始まる URL
- `provider === "anthropic"` の場合: `baseURL === null` 必須
- `provider === "gemini"` の場合: `baseURL === null` 必須（ADR-002 で本Issue範囲を確定。将来 vertex 連携時は本 invariant を緩める）

### Consequences

- 良い点: 「illegal states unrepresentable」原則に従い、provider と baseURL の不整合を VO で防げる
- トレードオフ: (B) より柔軟性は高いが将来 provider 数が増えると provider 別の派生 VO が欲しくなる場面が来うる。その時に refactor すればよい (YAGNI)

---

## ADR-005: factory DRY 化（provider-registry pattern）は本Issueで見送り / 本PR マージ後にフォローアップ Issue を**必ず**起票する

### Status

Proposed (1周目レビューで S-001 を受けて改訂)

### Context

Phase 2/3 完了時点で、`llmProviderFactory.ts` の switch case は `createLLMProvider` / `createOCRProvider` / `createPDFExtractor` の 3 関数 × 3 provider = 9 case に膨らむ。Issue #122 の W-A-003 で「provider-registry pattern による DRY 化」を見送ったが、本Issueがその検討タイミングに当たる。

Issue #122 ADR-005 も「OpenAI 追加時の Issue で application 層に dispatcher を抽出する」と積み残したが、本Issueでようやく解消する形になっており、**「見送り ADR を残しただけだとずるずる先送りされる構造的リスク」がある**。

選択肢:

- (A) 本Issueで registry pattern を導入し、`adapters/<provider>/index.ts` から `{ llm, ocr, pdf, pingFn }` を export する規約に統一
- (B) 本Issueでは見送り、3 provider が安定動作した後の別Issueで registry 化を独立 PR として実施

### Decision

(B) を採用。本PR では `llmProviderFactory.ts` の switch を素直に拡張し、registry 化は別Issueに切り出す。

ただし**「本Issueマージ後の Phase 4（issue-implement スキル）でフォローアップ Issue を必ず起票する」** ことを明示。タイトル例: `refactor(llm): provider-registry pattern for adapter factories`。本Issueの完了条件にも「フォローアップ Issue 起票完了」を含める。

理由:

- 本PR の最優先は「動作する provider 追加」。registry 化を同梱すると「provider 追加」と「factory 構造変更」が同一 PR となり、回帰原因の切り分けが難しい
- registry pattern の最適な抽象は「3 provider が動いた状態」で初めて見えてくる。先に動かしてから抽象化するほうが over-engineering を避けられる
- 別Issueとして起票することで、Phase 4 完了後に「実装し終わった adapter 群を見てから最適形を設計」できる

### Consequences

- 良い点: 本PRの責務が「動作確認できる provider 拡張」に集中。回帰検証が clean
- トレードオフ: switch case の重複が一時的に増える（許容範囲）。別Issue起票で技術的負債として可視化

---

## ADR-006: transport schema の provider 列挙は domain から import せず、`LLM_PROVIDERS_TRANSPORT` を複製する

### Status

Proposed

### Context

`app/components/admin/schema.ts`（transport 境界の zod schema）で provider 候補を列挙する必要があるが、CLAUDE.md および既存規約では「transport 層は domain を import しない」のがルール（presentation / transport が domain depend するのは依存方向違反）。

選択肢:

- (A) transport schema に `LLM_PROVIDERS_TRANSPORT = ["anthropic", "openai", "gemini"] as const` を複製する
- (B) domain の `LLM_PROVIDERS` を import する
- (C) 共通定数を `app/lib/` 配下に移す

### Decision

(A) を採用。transport 側に literal union を複製し、VO 側で再検証する二段配置とする（ADR-008 の env sync 思想と同じ "duplicate by design"）。

理由:

- CLAUDE.md ルール準拠
- 入力 validation は transport（shape / DoS）と VO（business invariant）の二段が原則。同じリストを 2 箇所で持つコストより、依存方向を守るベネフィットが大きい
- 将来 provider を追加するとき「transport / VO 両方を更新」がチェックリストに入る（ADR-008 の wrangler sync と同じ）

### Consequences

- 良い点: layering 違反なし。transport と VO の二段 validation が両方とも provider 列挙を持つことで「未知 provider が来たら transport で reject、すり抜けても VO で reject」の安全網が冗長化
- トレードオフ: provider 追加時に 2 箇所更新が必要（plan.md / Phase 4 checklist で明示）

---

## ADR-007: DB resolution は **consumer 経路のみ async pre-step** として実装、`createRequestContainer` は同期維持

### Status

Proposed (1周目レビューで P-003 / S-003 / S-005 を受けて改訂)

### Context

Issue #101 完了条件のひとつ「admin が DB に保存した `encryptedApiKey` を `secretBox.decrypt` 経由で解決して factory に渡す」を実現する経路設計。

現状の `createRequestContainer` および `createConsumerContainer` は同期で構築され、`buildLlmProvider/Ocr/Pdf` も同期。一方 `secretBox.decrypt` は async（WebCrypto による復号）。

選択肢:

- (A) `createRequestContainer` を含めて全コンテナ構築を async 化
- (B) consumer worker 経路 (`createConsumerContainer`) のみ async 化し、request path は env override + Stub fallback のままに保つ
- (C) `llmProvider` を Promise / Lazy で公開し、利用側で `await`

### Decision

(B) を採用。`createConsumerContainer` を async 化し、以下のフローで LLM config を解決:

**env override > DB resolution > Stub fallback** の優先順位ルール（`AdminSettingsService.assertEnvOverride` のセマンティクスを worker 側で再現）:

1. `instance_settings` を読み出す
2. **provider**: `ADMIN_LLM_PROVIDER` env が set されていれば env を採用、無ければ DB の `llm.provider` を採用
3. **model**: `ADMIN_LLM_MODEL` env が set されていれば env を採用、無ければ DB の `llm.model` を採用
4. **baseURL**: `ADMIN_LLM_BASE_URL` env が非空文字列なら env を採用、それ以外（未指定または空文字）は DB の `llm.baseURL` を採用
5. **apiKey**:
   - `ADMIN_LLM_API_KEY` env が set されていれば env を採用（DB ciphertext は無視）
   - env 未設定 && DB に `llmApiKeyCiphertext` あり → `secretBox.decrypt` で復号
   - 復号失敗（`NullSecretBox` 等で `SecretBoxError(KeyUnavailable)`）→ catch して Stub adapter に縮退（warn ログ）
   - 復号成功 → plain text apiKey を factory に渡す
6. 解決済みの (provider, model, baseURL, apiKey) を `buildLlmProvider/Ocr/Pdf` (`LLMFactoryConfig`) に渡す

`createRequestContainer` は同期維持。理由は request path から LLM を直接呼ぶ経路が無い（ingestion job は consumer worker で実行される）から。

### 影響範囲（call site の `await` 化）

レビュー P-003 を受けて、async 化対象の caller を全て列挙:

- `app/worker/cloudflare/handlers.ts` の `handleQueue` 関数内 `createConsumerContainer(env, ctx)` 呼び出し（line 113 付近）
- `app/core/adapters/cloudflare/inlineRelayTrigger.ts` の `runOnce()` 内 `createConsumerContainer(consumerEnv)` 呼び出し（line 85 付近）
- `app/worker/cloudflare/consumer.ts` （`handlers.handleQueue` の re-export なので caller 修正は handlers.ts 側に集約）

**テスト mock の async 化も必要**:

- `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts` の `vi.fn<(env: ServerEnv) => unknown>()` → `vi.fn<(env: ServerEnv) => Promise<unknown>>()`
- `app/core/application/di/__tests__/serverCloudflare.test.ts` の `createConsumerContainer` 呼び出し（5 箇所）を全て `await` 化

### Consequences

- 良い点: request path の latency / 複雑度を増やさず DB resolution を実現。env override の優先順位ルールが明文化され、`baseURL` も含めて env による override が可能
- トレードオフ: もし将来 request path から LLM を呼ぶ機能（リアルタイム summarization 等）が増えた場合、改めて async 化が必要。その時に対応すればよい (YAGNI)
- 注意: `handlers.handleQueue` と `inlineRelayTrigger.runOnce` の caller を `await` 化。テスト mock の signature 変更も実装時に忘れずに

---

## ADR-008: provider 変更時の ciphertext 無効化ポリシー — `apiKeyPlain` の再入力を必須化

### Status

Proposed (1周目レビュー S-006 を受けて追加)

### Context

admin が provider を anthropic → openai に切り替えた瞬間、DB に保存された `llmApiKeyCiphertext` は Anthropic API key の暗号化値であり、OpenAI provider では使えない。UI に「プロバイダを変更すると API キーの再入力が必要です」と警告を出すだけだと、ユーザーが警告を無視して保存ボタンを押した場合に invalid state が永続化する。

選択肢:

- (A) `updateLLMConfig` usecase で provider 変更時に `apiKeyPlain` を必須にし、null だと `BusinessRuleError(ProviderChangedRequiresApiKey)` を throw
- (B) provider 変更時に既存 ciphertext を強制 null reset + `apiKeySource = "env"` に戻す（env が無ければ Stub 縮退）
- (C) DB 上は ciphertext を保持し、factory 側で provider mismatch を検出（adapter で reject）

### Decision

(A) を採用。provider が変わった場合は `apiKeyPlain` 入力を**必須**にする。

- `UpdateLLMConfigInput` に `provider` を追加し、現在の `LLMConfig.provider` と比較して変更を検出
- 変更ありかつ `apiKeyPlain === null` の場合は `BusinessRuleError(AdminSettingsErrorCode.ProviderChangedRequiresApiKey)` を throw（新しい error code を `errorCode.ts` に追加）
  - enum key: `ProviderChangedRequiresApiKey`
  - string value: `"ADMIN_SETTINGS_PROVIDER_CHANGED_REQUIRES_API_KEY"`（既存規約 PascalCase key + SNAKE_CASE value）
- 変更なしの場合は従来通り `apiKeyPlain` optional（既存挙動を保持）
- 変更ありかつ `apiKeyPlain` 入力ありの場合は `secretBox.encrypt(apiKeyPlain)` で新 ciphertext を生成、`apiKeySource = "db"` で保存
- UI 側は警告に加え、provider 変更時に `apiKeyPlain` 入力欄を「必須」マーキングに切り替える（required attribute / 視覚的バッジ）

### Consequences

- 良い点: provider × ciphertext の不整合が DB に永続化しない。usecase 層で invariant を enforce
- トレードオフ: provider 変更のたびに API key 再入力が必要だが、これは security 上適切（古い key を新 provider で誤使用するリスクを排除）

---

## ADR-009: ディレクトリ命名 `app/core/adapters/gemini/` を採用（Issue 本文の `google/` 案から変更）

### Status

Proposed (1周目レビュー S-007 を受けて追加)

### Context

Issue #101 本文では `app/core/adapters/google/` を提案しているが、Google には Gemini API（`generativelanguage.googleapis.com`）と Vertex AI（`{region}-aiplatform.googleapis.com`）の 2 系統があり、`google/` 配下に両方が同居すると adapter の責務境界が曖昧になる。

既存 adapter group 命名規約: `anthropic` / `stub` / `d1` / `cloudflare` / `security` / `export` / `markdown` / `sanitizer` — provider 名 / インフラ名がそのまま使われている。

選択肢:

- (A) `app/core/adapters/google/` を採用（Issue 本文通り）
- (B) `app/core/adapters/gemini/` を採用、将来 vertex は `app/core/adapters/vertex/` 等の別ディレクトリ

### Decision

(B) を採用。本Issueで実装する adapter は **Gemini Direct API** (`generativelanguage.googleapis.com`) であることを明確にし、ディレクトリ名から adapter のスコープが推測しやすい命名を選ぶ。

将来 vertex 連携を実装する場合は `app/core/adapters/vertex/` を別途新設し、`gemini/` は Direct API 専用として保つ。

### Consequences

- 良い点: adapter group の責務が明確。Provider list (`LLM_PROVIDERS = ["anthropic", "openai", "gemini"]`) と命名が一致
- トレードオフ: Issue 本文の指示と差分が出るが、PR 説明で本 ADR を引用すれば追跡可能

---

## レビューでの追加・更新

- 1周目（要件カバレッジ視点）: 問題点ゼロ、改善提案 3 件（S-001〜S-003）を ADR-007 / Step 11 / Step 7 に反映
- 1周目（アーキ・リスク視点）: 問題点 4 件（P-001〜P-004）を ADR-001 / ADR-002 / ADR-007 / Step 10 に反映、改善提案 9 件のうち S-001 を ADR-005 に、S-003 を ADR-004 / ADR-002 に、S-006 を ADR-008 に、S-007 を ADR-009 に追加
