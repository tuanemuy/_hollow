# PR #813 レビュー — Domain / Use Case 観点（Issue #788）

対象 PR: #813
レビュー観点: keyless 判定の SSOT 配置と依存方向、6 apiKey ゲートの keyless carve-out、REST 経路の非回帰、silently-drop の意図性、`*ErrorCode` 命名規約、不変条件・illegal state 排除。
参照: `.issue/788/plan.md`（設計節・DoD・テスト方針）/ `.issue/788/adr.md`（ADR-001/002/004）

総評: 計画（特に arch round-1/round-2 で確定した「keyless 述語を domain SSOT に置き 6 ゲートを同一述語で分岐」）に**忠実**。keyless 判定 `SpeechRecognitionConfig.requiresApiKey` は純粋なドメイン述語として `valueObject.ts` に置かれ、`Ai`/binding 型はドメインに一切漏れていない。6 箇所のゲート（domain service 1 + application 5）すべてに keyless carve-out が入り、いずれも REST 経路（openai/deepgram/gemini）を無改修に保っている。案 B により gemini+workers-ai の非合法状態はフラット union で構造的に排除。Blocker はなし。ドメイン層の不変条件の締め方に 1 点の Warning（手続き的正規化 vs VO 構造不変条件）を挙げるが、既存 `LLMConfig` パターンと一貫した意図的トレードオフである。

---

### Domain / Use Case

#### Blockers
- なし

#### Warnings
- **[W-001]** keyless 不変条件（keyless provider ⇒ `apiKeySource:'env'` かつ `apiKeyCiphertext:null`）が VO の構造不変条件ではなく usecase の手続き的正規化でのみ担保されている / 場所: `app/core/domain/adminSettings/valueObject.ts:318-387`（`SpeechRecognitionConfig.create`）+ `app/core/application/adminSettings/updateSpeechConfig.ts:89-99` / 理由: `SpeechRecognitionConfig.create({ provider:"deepgram-workers-ai", apiKeySource:"db", apiKeyCiphertext:"x" })` は現状**成功する**。keyless provider が db-ciphertext を担持する状態を VO が許すため、CLAUDE.md「make illegal states unrepresentable（型/VO で先に、ランタイム検査は後）」の理想からは一段緩い。実運用では `updateSpeechConfig` が必ず `env`/null に正規化し、`assertSpeechEnvOverride` の carve-out もこの前提の上に成立しているので**到達不能**だが、不変条件が「create で構造的」ではなく「usecase で手続き的」に置かれている点が残る。もし将来 keyless+db 行が別経路（直接 DB 投入・別 usecase）で生じると、`assertSpeechEnvOverride` の carve-out が db-source を verbatim で返し、`decryptSpeechApiKey`（`service.ts:78-85`）が keyless provider の ciphertext を復号しにいく。/ 提案: `SpeechRecognitionConfig.create` に「`requiresApiKey(provider)===false` のとき `apiKeySource` は `env` 固定・ciphertext は null でなければ `BusinessRuleError`（または env/null へ強制正規化）」の分岐を足すと、6 ゲートに依存せず VO 単体で keyless 不変を保証できる。ただし `LLMConfig` も provider×apiKeySource の交差不変条件を持たない既存パターンであり、ADR-004 が意図的に VO shape を据え置いた判断（#701 契約非改変・LLM 対称）とのトレードオフなので、**採用は任意**。見送るなら「keyless は usecase 層で正規化して担保する」旨を `SpeechRecognitionConfig` の JSDoc に 1 行残すと、将来の直接構築者への注意喚起になる。

#### Notes
- **[N-001]** keyless 述語の SSOT 配置が計画どおり正しく着地している。`SpeechRecognitionConfig.requiresApiKey`（`valueObject.ts:316-317`）が唯一の判定源で、domain service（`service.ts:105`）・usecase 2 本（`updateSpeechConfig.ts:75`, `testSpeechConnection.ts:84`）・DI 2 本（`serverCloudflare.ts:663,1254` 経由 `isWorkersAiSpeechProvider`）・tester（`speechConnectionTester.ts:47`）がすべて同一述語を参照。application/DI 側の `isWorkersAiSpeechProvider`（`serverCloudflare.ts:637-639`）は domain 述語へ委譲する薄いラッパで、binding 系コードから VO を直接触らせない意図が JSDoc 込みで明確。ドメイン → application の依存方向が保たれ、逆流なし。`Ai` 型・`env.AI`・binding はドメインの型/ロジックに一切現れず（JSDoc コメントの説明的言及のみ）、インフラ関心事の漏れなし。

- **[N-002]** 6 apiKey ゲートすべてに keyless carve-out が入り、いずれも `!keyless` / `requiresApiKey===true` 条件で **REST の apiKey 必須ロジックを不変に保っている**。特に免除が REST に波及しない設計が正しい:
  - domain service `assertSpeechEnvOverride`（`service.ts:105-107`）: keyless 時のみ先頭で `cfg` を verbatim 返却。REST は従来の env-source×env-key-missing throw を維持。
  - usecase `updateSpeechConfig`（`updateSpeechConfig.ts:81`）: `providerChanged && ciphertext===null && !keyless` で throw。keyless は免除しつつ draft を `env`/null に**明示正規化**（`:89-99` の第 1 三項分岐）し、arch round-1 [P-001] 追加問題（else 枝が旧 provider ciphertext を引き継ぐ）を回避。
  - usecase `testSpeechConnection`（`testSpeechConnection.ts:84-91`）: `!keyless && resolvedKey 空` のときのみ早期リターン。keyless は空鍵で ping に到達。
  - DI `buildSpeechRecognitionProvider`（`serverCloudflare.ts:663-676`）/ `resolveConsumerSpeechConfig`（`:1254-1257`）/ tester（`speechConnectionTester.ts:48`）も同型。
  keyless=`!requiresApiKey(effectiveProvider|cfg.provider)` で REST provider（openai/deepgram/gemini）は常に keyless=false になり、carve-out は構造的に発火しない。TC-regression（既存 REST の非回帰）と `service.test.ts` の「REST は throw を維持」ケースで固定済み。

- **[N-003]** keyless で apiKey を誤入力した場合の silently-drop が意図どおり実装・文書化されている。`updateSpeechConfig.ts:55-58` で UoW 前に `input.apiKeyPlain` を encrypt するが、keyless 分岐（`:89-99`）は暗号文を使わず `env`/null で draft 構築するため破棄される。JSDoc（`:38-43`）に「Any operator apiKey submitted for a keyless provider is silently dropped (encrypted then discarded) — it is never persisted」と明記、`service.test.ts` および usecase テストで固定。安全側（鍵を残さない）で妥当。なお encrypt を UoW 前に無条件実行するのは、`effectiveProvider`（従って keyless 判定）が env.provider ロック時に `current.speech.provider` へ依存し UoW 内でしか確定しないための構造的制約で、コメント（`:52-54`）で「cheap web-crypto call, simpler control flow」と根拠を残している。過剰計算だが admin-gated かつ軽量で許容範囲。

- **[N-004]** 案 B（フラット provider union）により非合法状態が型で排除されている。`SPEECH_PROVIDERS`（`valueObject.ts:274-279`）に `deepgram-workers-ai` を 1 値追加するのみで transport 軸を持たないため、ADR-001 が問題視した `gemini + workers-ai` の非合法組み合わせは構造的に表現不能。registry の `Record<SpeechProvider, SpeechAdapter>` によりコンパイル時網羅も担保。default-model INVARIANT コメント（`:258-273`）に `deepgram-workers-ai → "@cf/deepgram/nova-3"` を追記済みで、UI `PROVIDER_DEFAULT_MODEL` との同期注意も残っている。

- **[N-005]** `*ErrorCode` 命名規約は**遵守**（新規追加なし）。`app/core/domain/adminSettings/errorCode.ts` は main から diff ゼロで、本 PR は新規エラーコードを追加していない（既存の `SpeechProviderChangedRequiresApiKey` / `SpeechEnvOverrideMissingKey` を keyless 分岐で回避する方向で解決）。既存コードもキー PascalCase・値 lower_snake_case で規約準拠。エラーの `kind` タグ付けは `BusinessRuleError(AdminSettingsErrorCode.*, spec文言)` の既存パターンと整合。

- **[N-006]** 二重リスト不変条件テストが機能している。`SpeechRecognitionConfig.keylessProviders`（`valueObject.ts:308`）を public export し、`valueObject.test.ts:424` の drift テストで `["deepgram-workers-ai"]` を固定、`requiresApiKey` の REST=true / keyless=false も `:417-422` で固定。`service.test.ts:250-276` が domain service の keyless carve-out（round-2 [P-001] 回帰）と「env.apiKey が偶然セットされていても keyless は verbatim 返却」を両方カバー。`keylessProviders` と `requiresApiKey` の二表現併存は、この drift 検出のための意図的パターンであり dead code ではない。

- **[N-007]** `requiresApiKey(provider: string)` が生 string を受ける設計（`valueObject.ts:316`）は、DI/binding コードが `SpeechProvider` を構築せずに呼べるよう配慮したもので、未知 provider 文字列には `true`（鍵必須＝安全側）を返す。keyless carve-out が未知 provider に誤発火しないため、フォールバック方向として正しい。
