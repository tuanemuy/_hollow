# PR #813 レビュー — Adapter / DI / Infrastructure 観点（review-001）

対象: PR #813 / Issue #788（Cloudflare Workers AI ルート `deepgram-workers-ai` の registry 追加）
参照: `.issue/788/plan.md` / `.issue/788/adr.md`（ADR-001/002/005/006/007/008）
検証: `pnpm typecheck`（tsgo）green / `npx biome lint`（バンドルされた無関係修正）clean を実測。

## 総評

Adapter / DI / Infrastructure の観点では **実装は ADR に忠実で、blast radius（registry 契約変更 + binding の DI 配線）を漏れなく閉じている**。特に本 Issue の要である「request/consumer 両経路 + 接続テスト」の 3 経路すべてで `env.AI` binding が adapter まで届く配線が揃っており、沈黙 Stub 化の穴は見つからなかった。`SpeechAdapterConfig` は純データを維持し（ADR-002）、REST adapter 3 種は `deps?` optional のおかげで無改修。keyless ゲート 6 箇所のうち adapter/DI/tester 側（DI 2 + tester 1）は正しく domain SSOT 述語 `SpeechRecognitionConfig.requiresApiKey` に委譲している。wrangler/infra も ADR-008（ローカルに `[ai]` を置かない）に完全準拠。

Blocker はなし。以下は改善余地（Warning）と参考（Notes）。

---

### Adapter / DI / Infrastructure

#### Blockers
- なし

#### Warnings

- **[W-001]** keyless 判定ヘルパの命名が provider 固有で、ADR-003 が予告する将来の keyless provider 追加時にミスリードする / 場所: `app/core/application/di/serverCloudflare.ts:637`（`isWorkersAiSpeechProvider`）+ inline コメント `:1013-1016` / 理由: 実体は `!SpeechRecognitionConfig.requiresApiKey(provider)`＝「keyless か」の判定であり `KEYLESS_SPEECH_PROVIDERS`（`valueObject.ts:291`）が真の SSOT。しかし関数名・consumer コメント（"the keyless `deepgram-workers-ai` route needs the raw `env.AI` binding"）は Workers AI 固有語彙。ADR-003 は `openai-whisper-workers-ai` 等の追加余地を明記しており、その時点で「keyless だが workers-ai ではない」provider が現れると名前と意味が乖離する。SSOT（domain 述語・keyless 集合）は generic なのに DI ラッパだけ provider 名に固定されている非対称。 / 提案: `isKeylessSpeechProvider` へリネーム（domain 述語との対称性が上がり、将来 provider 追加で命名の嘘が生じない）。plan の命名を踏襲した結果なので必須ではないが、generic を志向する ADR と整合させる価値はある。

- **[W-002]** keyless provider を **DB 行から**解決する経路（＝ staging/production の実プロダクション経路）の DI unit テストが無い / 場所: `app/core/application/di/__tests__/createConsumerContainer.integration.test.ts:501-526, 617-633` / 理由: keyless の DI テストはいずれも `ADMIN_SPEECH_PROVIDER` **env override** で provider を注入している。しかし staging/production テンプレの `[env.consumer.vars]` に `ADMIN_SPEECH_PROVIDER` は**無い**（infra テンプレ確認済み）ため、実運用では provider は `dbRow.speechProvider`（`/admin/speech` 保存値）から来る。`resolveConsumerSpeechConfig` の `provider = env ?? dbRow.speechProvider` 分岐のうち keyless×DB-row の組み合わせだけ回帰網から漏れている。コードパスは共通なので現状バグは無いが、「consumer 経路の binding 配線＝E2E linchpin」という本 Issue の力点に対して最も現実的な構成が pin されていない。 / 提案: `seedInstanceSettings({ speechProvider: "deepgram-workers-ai", speechModel: "@cf/deepgram/nova-3", speechApiKeySource: "env" })` を seed し `ADMIN_SPEECH_PROVIDER` 未設定 + `AI: FAKE_AI` で `DeepgramWorkersAiSpeechRecognitionProvider` に解決されることを 1 ケース追加（test レイヤーレビューと重複可）。

#### Notes

- **[N-001]** binding 配線が 3 経路すべてで閉じている（本 Issue 最大の懸念に対する的確な対処）。request: `readRequestServerConfig` が `...(env.AI ? { aiBinding: env.AI } : {})`（`serverCloudflare.ts:427`）→ `createRequestContainer` で `buildSpeechRecognitionProvider(..., aiBinding)`（`:783`）と `new HttpSpeechConnectionTester(undefined, aiBinding)`（`:807-810`）。consumer: `speechOverrides` が `buildSpeechRecognitionProvider(..., env.AI)`（`:1016`）で raw binding を直接注入。tester: keyless のとき empty-key 短絡をスキップし `adapter.ping(cfg, "", timeoutMs, { ai })` へ（`speechConnectionTester.ts:47-49, 63-68`）。「audio 文字起こしは consumer で走る」要件どおり consumer に binding が届く。TC-3/TC-4 のブラウザ検証もゲート通過を実証。

- **[N-002]** `SpeechAdapterConfig` の純データ維持（ADR-002）が徹底されている。`registry.ts:27-39` で config は `{ apiKey, model }` のまま、binding は別 type `SpeechAdapterDeps = { ai?: Ai }` として `create`/`ping` の第2/第4引数に分離。`import type { Ai }`（値グラフ非汚染）も適切。REST barrel（`deepgram/index.ts:16` の `create: (cfg) => ...` arity 1）は `deps?` optional により無改修で `satisfies SpeechAdapter` を維持。契約変更が 1 点に集約されている。

- **[N-003]** transcript 抽出の REST/workers-ai 共有が型で担保されて重複ゼロ。`transcript.ts` に `extractDeepgramTranscript` を集約し、REST（`speechRecognitionProvider.ts:196`）と workers-ai（`workersAiSpeechRecognitionProvider.ts:98`）が同一関数を参照。`Ai_Cf_Deepgram_Nova_3_Output` と REST body の構造一致（ADR-006）を `tsgo` typecheck が担保していることを実測確認。

- **[N-004]** port 契約遵守が正確。binding 未注入 → `SpeechFailureError`（`workersAiSpeechRecognitionProvider.ts:68-72`）、`run()` reject → wrap（`:103-104`）、空/欠落 transcript → `""`（`transcript.ts:29-30`）、timeout は `Promise.race` + 自前タイマー（ADR-007）で REST の `AbortController`/`DOMException` 系統と混同せず、`finally { clearTimeout }` でリーク防止。`run()` を非キャンセル・課金継続の旨も JSDoc に明記済み（ADR-007 準拠）。ping は `run()` を呼ばず binding 存在のみで `ok:true`（`index.ts:45-48`・ADR-005）。

- **[N-005]** `ai.run("@cf/deepgram/nova-3", { audio: { body, contentType }, smart_format, language? })` の呼び出しが型付きモデルカタログに適合（typecheck green）。model literal をハードコードし `config.model` を意図的に無視する理由（typed overload が literal key 要求）を `:59-61` に明記しており、UI の model 欄取り違え（ADR/plan S-003 のリスク）に対しても adapter 側で安全に degrade する。

- **[N-006]** `env > db > stub` フォールバック不変条件が REST 経路で無傷。`resolveConsumerSpeechConfig` の early-return は `if (provider === null || model === null || (!keyless && apiKey === null))`（`serverCloudflare.ts:1255`）で、keyless のときのみ `apiKey === null` 条件を緩め `apiKey: apiKey ?? ""` を返す（`:1259`）。REST の apiKey 必須はそのまま。integration test が env-override/DB-decrypt/rotation/NullSecretBox-degrade の各枝を網羅しており REST 非回帰を担保。

- **[N-007]** wrangler/infra が ADR-008 に完全準拠。ローカル `wrangler.toml` には `[ai]` が**無く**、web worker（`:109-121`）と `[env.consumer]`（`:207-210`）の両方に「なぜ省くか + `wrangler login` して手動で足す手順」をコメントで明記。staging/production テンプレは web worker top-level `[ai] binding = "AI"`（接続テストの binding 存在確認に必要）と `[env.consumer.ai] binding = "AI"`（実文字起こし経路）の**双方**に宣言。TOML 構文（`[ai]` / `[env.consumer.ai]` テーブル + `binding` キー）も正当。生成物（非 .tmpl）の checked-in wrangler は存在せずドリフト懸念なし。

- **[N-008]** consumer 経路では requestContainer 内で一度 `buildSpeechRecognitionProvider(..., aiBinding)` が構築され（`readRequestServerConfig` 経由・多くは Stub）、その後 `speechOverrides` で上書きされる二重構築がある（`serverCloudflare.ts:779` → `:1009`）。無害な軽微オーバーヘッドで、LLM 側の `llmOverrides` と対称な既存パターン踏襲。修正不要だが記録。

- **[N-009]** バンドルされた無関係修正 2 件（`anthropic/__tests__/connectionPing.test.ts` の記述文字列、`email/__tests__/resendEmailSender.test.ts` の `biome-ignore` 削除）は `pnpm lint:fix`/`format` 由来と見られる。後者は `biome-ignore useThrowOnlyError` を削っても `throw "string"` が残るため lint 退行を疑ったが、`npx biome lint` clean（EXIT 0）を実測。問題なし。スコープ外の churn ではあるがレビュー的リスクは無い。
