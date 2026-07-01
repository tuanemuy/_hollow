# PR #813 レビュー round-2 — Backend（Domain / Use Case / Adapter / DI）（Issue #788）

対象: PR #813（branch `issue/788/speech-workers-ai-route`） / round-1 修正後の最新差分
参照: `.issue/788/plan.md` / `.issue/788/adr.md`（ADR-001〜008） / `.issue/788/review/review-001-domain-usecase.md`, `review-001-adapter-di.md`
検証: `pnpm typecheck`（tsgo）green を実測。`git show 463b51ae`（round-1 修正コミット）と現行ソースを突き合わせ。

## 総評

round-1 で挙がった backend の指摘は**すべて適切に反映**されている。keyless 判定ヘルパは `isWorkersAiSpeechProvider → isKeylessSpeechProvider` にリネームされ、リポジトリ全体で旧名の残存はゼロ（grep 確認）。DI ラッパの JSDoc（`serverCloudflare.ts:631-644`）が「domain SSOT 述語 `SpeechRecognitionConfig.requiresApiKey` の否定を binding 系コード向けに再表現した薄い委譲であり、SSOT は domain 側」という役割分担を明記し、命名も generic（ADR-003 の将来 keyless provider 追加に耐える）。W-002 の「DB 行から keyless を解決する実プロダクション経路」の DI 統合テストも 2 ケース追加（解決成功 + binding 無し Stub フォールバック）。domain W-001（VO が keyless+db を構造的に許す点）は「見送り」で、6 ゲート carve-out により到達不能なため妥当な判断。

新規の目でのフル再レビューでも、依存方向（ドメインは `Ai`/binding を一切知らない）・keyless SSOT 述語の純粋性・6 ゲートの keyless carve-out・REST 経路の非回帰・port 契約・`env.AI.run` 型適合、いずれも問題なし。round-1 修正が新たな問題を生んだ形跡もない。**Blocker はなし。** 唯一、domain W-001 見送りに際して round-1 が提案した「代替の JSDoc 一行」が未反映な点を低優先の Warning として残す。

---

### Backend (Domain / Use Case / Adapter / DI)

#### Blockers
- なし

#### Warnings

- **[W-001]** domain round-1 W-001 の「見送り」に伴う代替 JSDoc 注記が未反映 / 場所 `app/core/domain/adminSettings/valueObject.ts:318-387`（`SpeechRecognitionConfig.create`） / 理由: round-1 domain W-001 は「keyless provider ⇒ `apiKeySource:'env'`/`apiKeyCiphertext:null` の不変条件が VO の `create` では構造的に強制されず（`create({provider:"deepgram-workers-ai", apiKeySource:"db", apiKeyCiphertext:"x"})` は成功する）、usecase の手続き的正規化でのみ担保される」ことを指摘し、VO 分岐追加は「採用は任意（`LLMConfig` 対称・ADR-004 の VO shape 据え置き判断とのトレードオフ）」として**見送り**た。ここまでは妥当。ただし round-1 は「見送るなら『keyless は usecase 層で正規化して担保する』旨を `SpeechRecognitionConfig` の JSDoc に 1 行残す」ことを代替緩和策として提案しており、これも反映されていない（`create` の JSDoc は keyless に無言、`KEYLESS_SPEECH_PROVIDERS` コメント `:282-290` と `requiresApiKey` の JSDoc `:309-315` はあるが「create は keyless+db を弾かない／正規化は usecase 層」の注意喚起はない）。現状 6 ゲート carve-out で到達不能なので実害はないが、将来 keyless+db 行を別経路（直接 DB 投入・別 usecase）で作った者への注意標識が欠ける。 / 提案: `SpeechRecognitionConfig.create` もしくは型定義に「keyless provider の env/null 正規化は usecase 層（`updateSpeechConfig`）の責務で、`create` は構造的に強制しない」旨を 1 行 JSDoc で残す（VO 分岐追加までは不要・round-1 の任意判断を踏襲）。必須ではない。

#### Notes

- **[N-001]** round-1 adapter-di W-001（ヘルパ改名）が完全反映。`isKeylessSpeechProvider`（`serverCloudflare.ts:642`）へリネームされ、旧名 `isWorkersAiSpeechProvider` は app 配下に 1 件も残存しない（grep 実測 NONE）。呼び出し 2 箇所（`:668` request gate / `:1259` consumer gate）も新名。JSDoc（`:631-644`）が「domain SSOT `requiresApiKey` の否定の純粋な再表現・transport/binding 知識を持たない・SSOT は domain 側・命名は generic で将来 keyless provider に耐える」と役割差を明記し、ドメイン述語との役割分担が曖昧さなく整理されている。ADR-003 が予告する `openai-whisper-workers-ai` 等の追加時も命名の嘘が生じない。

- **[N-002]** round-1 adapter-di W-002（DB 行 keyless の DI テスト）が反映。`createConsumerContainer.integration.test.ts` に「keyless from DB row: no env override, provider=deepgram-workers-ai in the DB + AI binding → wires the Workers AI provider」（:532）と「keyless from DB row Stub fallback: ... no AI binding → Stub」（:555）を追加。staging/production テンプレに `ADMIN_SPEECH_PROVIDER` var が無く実運用では provider が `dbRow.speechProvider` 由来である点（本 Issue の E2E linchpin）が pin された。`resolveConsumerSpeechConfig` の `provider = env ?? dbRow` 分岐の keyless×DB-row が回帰網に入った。

- **[N-003]** keyless 述語の SSOT 配置と依存方向が保たれている。判定源は `SpeechRecognitionConfig.requiresApiKey`（`valueObject.ts:316`）唯一で、domain service（`service.ts:105`）・usecase 2 本（`updateSpeechConfig.ts:75` / `testSpeechConnection.ts:84`）・DI 2 本（`serverCloudflare.ts:668,1259` 経由 `isKeylessSpeechProvider`）・tester（`speechConnectionTester.ts:47`）が同一述語を参照。`Ai` 型・`env.AI`・binding はドメインの型/ロジックに一切現れず（説明的 JSDoc のみ）、ドメイン → application の逆流なし。

- **[N-004]** 6 apiKey ゲートすべてに keyless carve-out が正しく入り、REST（openai/deepgram/gemini）は無改修。①domain service `assertSpeechEnvOverride`（`service.ts:105-107` 先頭で keyless は `cfg` verbatim 返却、REST は env-source×key-missing throw 維持）②usecase `updateSpeechConfig`（`:81` `providerChanged && ciphertext===null && !keyless` で throw、keyless は `:89-99` で `env`/null 明示正規化して旧 ciphertext 引き継ぎを回避）③usecase `testSpeechConnection`（`:85` `!keyless && 空鍵` のみ早期リターン）④DI request `buildSpeechRecognitionProvider`（`:668-681` keyless は binding+model 駆動・apiKey 無視、binding 無し Stub）⑤DI consumer `resolveConsumerSpeechConfig`（`:1260` `(!keyless && apiKey===null)` へ緩和、`:1264` `apiKey ?? ""`）⑥tester `HttpSpeechConnectionTester.ping`（`:48` `!keyless && 空鍵` のみ短絡）。keyless=`!requiresApiKey(...)` により REST は常に keyless=false で carve-out は構造的に不発火。

- **[N-005]** 7 番目のゲートは無い（round-1 の「6 箇所で打ち止め」を再確認）。application/DI/domain-service の speech apiKey ガードを全 grep した結果、上記 6 箇所以外に speech の null-key ブロックは存在しない。`serverCloudflare.ts:1149` の `apiKey === null` early-return は `resolveConsumerLlmConfig`（LLM 経路・keyless 概念なし）であり speech とは無関係。

- **[N-006]** binding が request/consumer/tester の 3 経路すべてで adapter まで届く（沈黙 Stub 化の穴なし）。request: `readRequestServerConfig` `...(env.AI ? { aiBinding: env.AI } : {})`（`:427`）→ `createRequestContainer` で `buildSpeechRecognitionProvider(..., aiBinding)`（`:788`）と `new HttpSpeechConnectionTester(..., aiBinding)`（`:814`）。consumer: `speechOverrides` が `buildSpeechRecognitionProvider(..., env.AI)`（`:1021`）で raw binding 直注入（「audio 文字起こしは consumer で走る」要件どおり）。tester: keyless で empty-key 短絡をスキップし `adapter.ping(cfg, "", timeoutMs, { ai })`（`speechConnectionTester.ts:47-49,63-68`）。

- **[N-007]** port 契約遵守が正確。binding 未注入 → `SpeechFailureError`（`workersAiSpeechRecognitionProvider.ts:68-72`）、`run()` reject → wrap し cause 保持（`:103-104`）、空/欠落 transcript → `""`（`transcript.ts:29-30`）、timeout は `Promise.race`+自前タイマーで `SpeechFailureError` を reject し `finally { clearTimeout }` でリーク防止（ADR-007。REST の `AbortController`/`DOMException` 系統と非混同・`run()` 非キャンセル/課金継続を JSDoc 明記）。ping は `run()` を呼ばず binding 存在のみで `ok:true`（`deepgram/index.ts:45-48`・ADR-005）。

- **[N-008]** `SpeechAdapterConfig` の純データ維持（ADR-002）と `env.AI.run` 型適合。config は `{ apiKey, model }` のまま、binding は別型 `SpeechAdapterDeps = { ai?: Ai }`（`import type` で値グラフ非汚染）として `create`/`ping` の第2/第4引数に分離（`registry.ts:27-62`）。REST barrel は `deps?` optional により無改修で `satisfies SpeechAdapter` 維持（`deepgram/index.ts:15-29`）。`ai.run("@cf/deepgram/nova-3", { audio:{ body, contentType }, smart_format, language? })` は型付きモデルカタログに適合（typecheck green）。model literal をハードコードし `config.model` を意図的に無視する理由（typed overload が literal key 要求）も `:59-61` に明記され、UI の model 取り違え（S-003）に対し adapter 側で安全に degrade。transcript 抽出は `extractDeepgramTranscript` に集約し REST/workers-ai で共有（重複ゼロ・`Ai_Cf_Deepgram_Nova_3_Output` と REST body の構造一致を typecheck が担保）。

- **[N-009]** keyless の silently-drop が意図どおり実装・文書化。`updateSpeechConfig.ts:55-58` で UoW 前に `apiKeyPlain` を encrypt するが keyless 分岐（`:89-99`）は暗号文を使わず `env`/null で draft 構築するため破棄される。JSDoc（`:38-43`）に「Any operator apiKey submitted for a keyless provider is silently dropped」と明記。UoW 前の無条件 encrypt は `effectiveProvider`（keyless 判定）が env.provider ロック時に UoW 内でしか確定しない構造的制約由来で、コメント（`:52-54`）に根拠あり。admin-gated かつ軽量で許容範囲。
