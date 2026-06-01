# ADR — Issue #140: provider-registry pattern for adapter factories

## ADR-001: `ProviderAdapter` 型と registry を adapter 層（`app/core/adapters/llm/registry.ts`）に置く

### Status
Proposed

### Context
provider-registry pattern を導入するにあたり、`ProviderAdapter` 型と `factoryProviderRegistry` をどの層に置くかを決める必要がある。registry は `OpenAILLMProvider` 等の provider 固有 class への直接参照を含む。選択肢:
- (A) `app/core/adapters/llm/registry.ts`（adapter 層・provider 横断置き場）
- (B) domain port 配下
- (C) `app/core/application/di/` 配下

### Decision
(A) を採用。`app/core/adapters/llm/` は既に 3 adapter が共有 import する provider 横断の置き場（`jsonEnvelope.ts` / `prompts.ts`）であり慣習一致。

理由:
- registry は具体 adapter class を束ねる adapter 層の知識。(B) は domain が具体 adapter を import する逆流になり依存方向違反。
- (C) は factory が registry を import する依存方向（di → adapters）自体は正しいが、Issue が明示する「`adapters/<provider>/index.ts` から export する規約」と型の所有者がチグハグになる。型の所有は adapter 側が自然。

### Consequences
- 良い点: 依存方向が clean（di → adapters → domain port）。慣習一致。
- トレードオフ: なし（最小侵襲）。

---

## ADR-002: registry の値は class 直参照でなく `(config) => Port` のファクトリ関数

### Status
Proposed

### Context
Issue 例は `llm: OpenAILLMProvider` のような class 直参照を挙げる。しかし provider 間でコンストラクタへ渡す引数の整形に非対称がある:
- OpenAI のみ `baseURL` を使う。Anthropic / Gemini は無視。
- `baseURL` は境界で `string | null`、OpenAI adapter 実体型は `baseURL?: string`（`exactOptionalPropertyTypes` 下で `undefined` field を作れない）。
- ping は引数形（`pingAnthropic(cfg, apiKey, timeoutMs)` vs `pingOpenAI(SharedConfig)`）も戻り値（`{ok,error?}` vs `{ok,reason?}`）も非対称。

### Decision
registry の `llm/ocr/pdf/ping` は class 直参照ではなく `(config) => Port` のファクトリ関数で束ね、provider 固有の引数整形を各 `adapters/<provider>/index.ts`（barrel）に閉じ込める。

これにより factory / dispatcher は完全に provider 非依存になり、baseURL 統一・ping shape 統一が barrel 1 箇所に集約される。Issue 例の class 直参照は理想形のスケッチであり、型整合上ファクトリ関数化が現実解。

### Consequences
- 良い点: factory / dispatcher が provider 非依存。整形ロジックが barrel に集約され重複排除。
- トレードオフ: `as const` の網羅性効果は限定的になるため、`satisfies ProviderAdapter` の型チェックと `Record<LLMProvider, ProviderAdapter>` の網羅性に依存して provider 漏れを compile-time 検出する。

---

## ADR-003: ping の統一 signature を `(cfg: LLMConfig, apiKey, timeoutMs) => Promise<{ok, error?}>` とする

### Status
Proposed

### Context
3 つの ping は引数も戻り値も非対称（ADR-002 参照）。dispatcher（`HttpLLMConnectionTester`）は現状この非対称を switch 内の ternary と `reason`→`error` 変換で吸収している。registry 化でこれを barrel に移したい。

### Decision
`ProviderAdapter.ping` の統一 signature を `(cfg: LLMConfig, apiKey: string, timeoutMs: number) => Promise<{ ok: boolean; error?: string }>` とする。Anthropic ping は既にこの形。OpenAI / Gemini は barrel でこの形にラップ（`cfg.model` / `cfg.baseURL` から config 組み立て + `reason`→`error`）する。

戻り値を `error`（`reason` でなく）に寄せるのは domain の `LLMConnectionPingResult` が `error` を使うため。結果 dispatcher は lookup → latency 計測 → maskSecrets → `{ok,latencyMs,error?}` 組み立て のみの provider 非依存コードになる。

### Consequences
- 良い点: dispatcher が provider 非依存に。shape 正規化が barrel に集約。
- トレードオフ: `llmConnectionTester.test.ts` の mock 前提（`pingXxx` を vi.mock）と期待引数の見直しが必要。

---

## ADR-004: baseURL 型統一は境界で吸収、adapter 内部実体型は変更しない

### Status
Proposed

### Context
W-A-004: `OpenAISharedConfig.baseURL: string | undefined`（adapter 実体型は `baseURL?: string`）vs `LLMConfig.baseURL: string | null` の mismatch。これを統一したい。`OpenAISharedConfig.baseURL` 自体を `string | null` に変えると `buildChatCompletionsURL(baseURL: string | undefined)` や adapter unit test に波及する。

### Decision
- factory boundary の `LLMFactoryConfig.baseURL` と registry の `ProviderAdapterConfig.baseURL` を `string | null` に統一。
- barrel の `toOpenAIConfig` で `null` / 空文字 / `undefined` → field 省略（`baseURL?: string`）の変換を 1 箇所に集約。`exactOptionalPropertyTypes` を守り `{ baseURL: undefined }` を作らない。
- `OpenAISharedConfig.baseURL?: string`（adapter 内部実体型）は変更しない。

### Consequences
- 良い点: 境界で型を統一しつつ adapter 内部・テストへの波及ゼロ。最小侵襲で W-A-004 解消。
- トレードオフ: 「境界 `string | null` / 内部 `?: string`」の 2 表現が残るが、変換が barrel 1 箇所に閉じるため実害なし。

---

## ADR-005: `resolveConsumerLlmConfig` は export するが I/O 構造は維持

### Status
Proposed

### Context
W-I-005: `createConsumerContainer.integration.test.ts` の env baseURL override テストが `instanceof OpenAILLMProvider` のみで、`baseURL` が private state のため override の実効性を assert できない。

### Decision
`resolveConsumerLlmConfig` を export し、integration test から直接呼んで `resolved.baseURL` 等を assert する。関数自体は既に純粋（env + secretBox + DB row → resolved config）なので export のみで test 可能になる。D1 直読みの引数注入抽象化等は追加せず（スコープ外）。

### Consequences
- 良い点: env override の優先順位を直接 assert 可能に。W-I-005 解消。
- トレードオフ: なし。
