# ADR — Issue #122: refactor(llm): provider-agnostic LLM adapter abstraction

## ADR-001: factory の置き場所 — `application/di/` vs `application/ports/`

### Status
Proposed

### Context

provider-agnostic な `createLLMProvider` / `createOCRProvider` / `createPDFExtractor` を application 層のどこに置くか:

- 案A: `app/core/application/di/llmProviderFactory.ts`
- 案B: `app/core/application/ports/llmProviderFactory.ts`
- 案C: `app/core/application/di/serverCloudflare.ts` に同居

### Decision

**案A** (`app/core/application/di/llmProviderFactory.ts`) を採用。

### Consequences

- 良い点:
  - `di/` 配下は既に `serverCloudflare.ts` で composition root として adapter を import している前例があり、factory も adapter を組み立てる役割なので整合的
  - runtime 非依存にすれば AWS Lambda 等の別 entry でも再利用可能（CLAUDE.md「To target a different runtime, add a new adapter group」と整合）
  - serverCloudflare.ts から独立させることで cloudflare 固有設定との混同を回避
- トレードオフ:
  - `ports/` 名のディレクトリが既に port interface 置き場所として暗黙的に使われているため、factory を `ports/` に置くと意味的混乱を招く
  - serverCloudflare.ts 同居案（案C）は最小変更だが、将来 runtime 切り替え時の共通化が見えにくくなる

---

## ADR-002: Stub の置き場所 — 同居維持 vs `adapters/stub/`

### Status
Proposed

### Context

`StubLLMProvider` / `StubOCRProvider` / `StubPDFExtractor` を rename 後にどう配置するか:

- 案A: `adapters/anthropic/` 配下に Anthropic 実装と同居（既存 `cloudflare/r2*.ts` での `StubObjectStorage` 同居パターン踏襲）
- 案B: `adapters/stub/` を新設し provider 非依存 Stub を集約
- 案C: port 定義の隣（`domain/ingestion/ports/`）に置く

Issue #122 本文では案B と案C を選択肢として明示している（「もしくは port 定義の隣 (`app/core/domain/ingestion/ports/` 配下) に置く」）。本ADRはこのうち案Bを正式採用するもの。

### Decision

**案B** (`adapters/stub/` 新設) を採用。

### Consequences

- 良い点:
  - Issue 完了条件「Stub クラスが provider 非依存の場所に配置されている」を満たす
  - CLAUDE.md「Adapters per provider」ルールに **完全準拠**（同居案は anthropic ディレクトリに provider 非依存コードが混ざる）
  - `StubOfficeExtractor` / `StubSpeechRecognitionProvider` は Anthropic 実装が存在しないので同居先がなく、`adapters/stub/` で受け皿が必要
- トレードオフ:
  - `cloudflare/r2*.ts` の `StubObjectStorage` / `StubTempFileStorage` 同居や `export/` の `StubPdfRenderer` 同居とは整合しないが、これらは別ドメイン（infrastructure binding 不在の fallback）なのでスコープ外
  - port 隣接案（案C）は domain 層に adapter コードが入る設計違反

---

## ADR-003: factory のシグネチャ — `{ provider, apiKey, model }` 単一 config

### Status
Proposed

### Context

factory の引数形式:

- 案A: 単一 config object `createLLMProvider({ provider, apiKey, model })`
- 案B: 引数分離 `createLLMProvider(provider, apiKey, model)`
- 案C: domain の `LLMConfig` をそのまま渡す（apiKeySource / apiKeyCiphertext 含む）

### Decision

**案A** (`{ provider, apiKey, model }` 単一 config) を採用。

### Consequences

- 良い点:
  - 将来 fields（temperature / topP 等）を増やすときに signature 破壊変更を避けられる
  - 呼び出し側の可読性が高い（key-value で意図が明確）
  - domain の `LLMConfig` (encryption 関心を含む) を渡さないことで factory が secret 復号関心を持たずに済む
- トレードオフ:
  - case 数が増えても引数構造が安定しているため、provider 別の特殊な引数（OpenAI の organization id 等）を追加する場合は別 field を生やす必要がある（YAGNI: 必要時に追加）

---

## ADR-004: `buildLlmProvider` の関数名維持

### Status
Proposed

### Context

`serverCloudflare.ts` の既存 `buildLlmProvider` を:

- 案A: 関数名そのまま、signature 拡張のみ（provider 引数追加）
- 案B: `createLLMProvider` にリネームし、provider-agnostic factory に統合

### Decision

**案A** (関数名維持、signature 拡張のみ) を採用。

### Consequences

- 良い点:
  - 呼び出し側（`createRequestContainer` 内 3 箇所 + テスト）の rename 差分を回避
  - `buildRelayTrigger` 系の既存 pure helper パターンとの命名整合
  - **「factory」と「DI helper」を意味的に区別**: `buildXxx` は env 値の有無を判定して Stub fallback も含むが、`createXxx` factory は provider-aware な構築に専念
- トレードオフ:
  - `buildLlmProvider` 内で `createLLMProvider` を呼ぶ二段構造になるが、責務分離としてはむしろ明快

---

## ADR-005: `llmConnectionTester.ts` の置き場所

### Status
Proposed

### Context

`HttpLLMConnectionTester` は `switch (cfg.provider)` で provider-agnostic dispatcher として書かれているが、現状 `case "anthropic"` のみで実体は `pingAnthropic` のみ。

- 案A: `adapters/anthropic/llmConnectionTester.ts` に移動（YAGNI）
- 案B: `adapters/llm/` をディレクトリとして残し dispatcher を保持
- 案C: dispatcher を application 層に、各 provider の `pingXxx` を `adapters/<provider>/connectionPing.ts` に分離

### Decision

**案A** (`adapters/anthropic/llmConnectionTester.ts` に移動) を採用。

### Consequences

- 良い点:
  - 現状 Anthropic のみが実 provider で dispatch が形骸化しているため、anthropic 配下に同居が自然
  - Issue 完了条件「`adapters/llm/` が `adapters/anthropic/` に rename」を素直に満たす
  - YAGNI: OpenAI 等が追加されるとき dispatcher を別レイヤーに切り出せばよい
- トレードオフ:
  - 「dispatcher の本体が `adapters/anthropic/` に居る」のはディレクトリ命名規則と微妙に不整合（ただし dispatch 構造は exhaustive `never` で守られているので将来の OpenAI 追加時に表面化する）
  - 将来 OpenAI 等が追加されるときに 1 度移動が必要（その時点で別 ADR で扱う）
  - **本Issue 自身が「`adapters/llm/` というディレクトリ名が provider-agnostic を装っているのに中身は Anthropic 固定」という乖離を是正している**のに、本判断は「`adapters/anthropic/` 配下に provider-agnostic dispatcher が居る」という同種の軽度な乖離を新たに生む。これは YAGNI 採用で意図的に受容しており、将来 OpenAI 追加時の Issue で dispatcher を application 層に抽出する形で解消する

---

## ADR-006: `anthropicMessagesClient.ts` → `messagesClient.ts` rename

### Status
Proposed

### Context

ディレクトリが `adapters/anthropic/` になればファイル名の `anthropic` prefix は冗長。

- 案A: rename して `messagesClient.ts` に
- 案B: ファイル名は維持

### Decision

**案A** (rename) を採用。

### Consequences

- 良い点:
  - Issue 本文で明示要件（「`anthropicMessagesClient.ts` → `messagesClient.ts` (ディレクトリ名が provider なので prefix 不要)」）
  - ディレクトリと冗長な prefix を排除し可読性向上
- トレードオフ:
  - test ファイル名も `anthropicMessagesClient.test.ts` → `messagesClient.test.ts` に rename が必要（diff 増加）
  - 内部 export 名（`callAnthropicMessages` / `AnthropicSharedConfig` / `AnthropicErrorMapper`）は維持（rename スコープ外、別 Issue 対象）

---

## ADR-007: 未知 provider の扱い — factory 内 `default: throw`（runtime guard 中心）

### Status
Proposed

### Context

env 由来の `ADMIN_LLM_PROVIDER` 文字列が `LLM_PROVIDERS` literal union に含まれない値（typo 等）だった場合の挙動:

- 案A: factory 内 `default: throw new Error(...)` で早期失敗（runtime guard 中心、シグネチャは `provider: string`）
- 案B: 上位 DI (`buildLlmProvider` / `createRequestContainer`) で先回り検証
- 案C: 未知値は `"anthropic"` にフォールバック
- 案D: factory のシグネチャを `provider: LLMProviderName` (literal union) にして `default: const _: never = config.provider` で compile-time exhaustive check + runtime guard 併用

### Decision

**案A** (factory 内 throw、シグネチャ `provider: string`) を採用。**案D の exhaustive check は不採用**。

### Consequences

- 良い点:
  - 設定ミスを早期に表面化（silent fallback による隠れた挙動変更を回避）
  - factory が単一責任を保つ（validation も factory 内に集中）
  - **`provider: string` シグネチャにより test で未知 provider を投げる際に cast 不要**: `createLLMProvider({ provider: "openai", ... })` がそのまま書ける
  - env 由来 string を受け取る factory にとって runtime guard が最も自然
- トレードオフ:
  - 起動時の env 読み込み段階ではなく、最初の LLM 呼び出し時点で発覚する（lazy validation）。ただし `createRequestContainer` 内で factory を eagerly 呼ぶので実質起動時と差はない
  - compile-time exhaustive check（案D）は将来 provider が 2 つ以上になり literal union が複数要素になった時点で導入する余地を残す（YAGNI）
  - 案C のフォールバック案は寛容だが「provider 切り替え」の意図を曖昧にするので不採用

### 案D を不採用とした理由（補足）

- `LLM_PROVIDERS = ["anthropic"] as const` の現状では `LLMProviderName = "anthropic"` 単一 literal となる
- `switch (config.provider) { case "anthropic": ... default: ... }` で全 case を覆った時点で `default` 内の `config.provider` 型は `never` に narrow される
- これ自体は型エラーにならないが、**test で未知 provider を投げる場合に `{ provider: "openai" as unknown as LLMProviderName }` の二重 cast が必要**になり可読性が低下する
- 将来 `LLM_PROVIDERS = ["anthropic", "openai"] as const` になれば exhaustive check の compile-time 価値が初めて生まれる。その時点で signature を `provider: LLMProviderName` に絞る
