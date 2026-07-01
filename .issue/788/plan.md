# 実装計画 — Issue #788: feat(speech): add Cloudflare Workers AI route (env.AI binding) transcription to the speech registry (#766 split)

**Issue:** #788
**作成日:** 2026-07-01
**複雑度:** 中〜大規模

---

## 目的

音声文字起こしを **Cloudflare Workers AI ルート（`env.AI` binding）** 経由でも呼べるようにし、API キー管理を Cloudflare 側に寄せられるようにする。#701 レジストリ契約（`SpeechAdapter` / `SpeechAdapterConfig`）に手を入れて `env.AI` binding を DI 経由でアダプターに届ける、通常の REST provider 追加より blast radius の大きい作業。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ | 検証環境 |
|---|---|---|---|---|
| AC-1 | 案（A/B）・`SpeechAdapterConfig` 拡張方針・`env.AI` の DI 配線方針を実装前に ADR（`.issue/788/adr.md`）に記録する | Issue AC / ADR-001〜006 | 完了（`.issue/788/adr.md`） | dev |
| AC-2 | Workers AI 経由が webm/opus を受理しレスポンス shape が REST と互換かを PoC 検証し結果を ADR に記録（実 binding 不可時は代替方針で） | Issue AC | ADR-006 / ステップ 12・13（静的契約検証は完了、webm/opus 受理は **staging で確定**） | staging（マージ後） |
| AC-3 | Workers AI 経由 provider（`deepgram-workers-ai`）が `speechProviderRegistry` に登録され、`/admin/speech` から選択・保存・接続テストできる | Issue AC | 1・2・3・4・5・7・9・10 | dev（保存・接続テストの単体/結線は dev、実疎通は staging） |
| AC-4 | 選んだ provider で audio → 文字起こし → 構造化 → プレビュー → ノート保存 のフルパスが E2E で動く | Issue AC | 3・7・8・12（実動の「動く」確認は **staging で確定**） | staging（マージ後） |
| AC-5 | `env > db > stub` フォールバックが動く。SecretBox 暗号化は workers-ai には非適用（該当しない）ことを明記 | Issue AC / ADR-004 | 4・7・8・13 | dev |
| AC-6 | 回帰テストが adapter 境界（2xx / 4xx / 5xx / timeout / **空の音声入力** / **空 transcript 出力** / binding 未注入）と registry ディスパッチをカバーし、既存 OpenAI / Deepgram と対称 | Issue AC | 11 | dev |
| AC-7 | `spec/adr/013-speech-provider.md` と `spec/domains/adminSettings.md` を更新する | Issue AC | 13 | dev |

> **注:** 表の全 AC にチェックが付いても本 Issue マージ = 完了ではない。AC-2/AC-4 の実機部分（および AC-3 の実疎通）は staging ゲート依存。DoD とクローズ条件は下記「Definition of Done とクローズ条件」を参照。

## Definition of Done とクローズ条件

本 dev 環境から実 `env.AI` binding に到達できない（ADR-006）ため、「マージしてよい条件」と「マージ後 staging で確定させる条件」を分離する。

**本 Issue マージの DoD（何が揃えばマージ可）:**
- ドメイン union / registry / adapter / usecase gate / DI 結線 / UI / wrangler / spec の diff が入り、`pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test`（下記テスト方針の dev で回るもの全て）が green。
- 静的契約検証（`Ai_Cf_Deepgram_Nova_3_Input/Output` への型適合）が typecheck で担保されている。
- adapter 境界・registry ディスパッチ・二重リスト不変条件・**6 つの apiKey ゲート**（domain service `assertSpeechEnvOverride` 1 + application 5: usecase 2 + DI 2 + tester 1）の keyless 分岐が unit テストで固定されている。ゲートの総数・内訳（domain service 1 + application 5）は ADR-004・リスク節・テスト方針と一致。
- 既定 provider は `openai` 据え置き（opt-in）で既存経路が無傷。

**staging 検証で確定させる項目（マージ後）:**
- AC-2: 実録音 webm/opus が Deepgram-via-WAI に受理され、adapter/ネットワーク層で **2xx + 非空 transcript** を返すこと（「ノート保存成功」では判定しない・ADR-006 の偽陽性注意）。
- AC-4: `deepgram-workers-ai` 選択で audio → 文字起こし → ノート保存のフルパスが実 binding で動くこと。
- AC-3 の実疎通: `/admin/speech` の接続テストが実 binding 存在下で `ok:true` を返すこと。

**クローズ条件:** マージ後 staging で AC-2（webm/opus 受理 + 非空 transcript）と AC-4 を確認できた時点で本 Issue を close。受理 NG なら実装コミットを `git revert`（spec/ADR 更新は別コミットで revert 対象外）し、NG 根拠（拒否 mime・status・エラー）を ADR-006 に追記のうえ本 Issue を再オープン（または録音 UI 変換の別 Issue へ引き継ぐ）。

## スコープ

### 含まれないもの
- **OpenAI gpt-4o-transcribe の Workers AI ルート**（ADR-003）。gpt-4o-transcribe は Workers AI パートナーモデルとして存在せず（型付きカタログは Whisper 系のみ）、Cloudflare 経由で呼ぶには AI Gateway プロキシが必要で別統合。E2E は Deepgram で満たす。**引き継ぎをアクション化する:** ステップ 13（spec 更新）で「OpenAI gpt-4o-transcribe（AI Gateway 経由 or Whisper 代替）の Workers AI ルートを別 Issue として起票し、`spec/adr/013` に issue 番号を残す」（下記「Phase 4」）。Issue タイトルが挙げる OpenAI ルートが「別 Issue」の言葉だけで宙に浮かないようにする。
- **transport 軸を config / DB に持たせる案 A**（ADR-001 で不採用）。マイグレーション・非合法状態を避けるため。
- **録音 UI 側の webm→ogg/opus 変換**。staging で webm/opus 受理 NG が確定した場合の対策で、本 Issue のスコープ外（ADR-006 引き継ぎ）。
- **Deepgram 専用 API キーのマスキングパターン追加**（#738 ADR-004 判断 2 と同じ扱い。workers-ai は鍵を持たないため無関係）。

## 調査結果

- 関連ファイル:
  - `app/core/adapters/speech/registry.ts` — `SpeechAdapterConfig` / `SpeechAdapter` / `speechProviderRegistry` / `lookupSpeechAdapter`。契約変更の中心。
  - `app/core/domain/adminSettings/valueObject.ts` — `SPEECH_PROVIDERS`（`["openai","deepgram","gemini"]`）/ `SpeechRecognitionConfig` / default-model INVARIANT。
  - `app/core/adapters/deepgram/{speechRecognitionProvider,speechConnectionPing,index}.ts` — REST Deepgram。transcript 抽出ロジック（`results.channels[0].alternatives[0].transcript`）を workers-ai でも流用可能。
  - `app/core/application/di/serverCloudflare.ts` — `ServerEnv`（`AI` binding 無し）/ `RequestServerConfig` / `buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` / `readInstanceSettingsSpeechRow`。DI 配線の中心。
  - `app/core/application/di/speechConnectionTester.ts` — `HttpSpeechConnectionTester`（`ai` binding 未注入）。
  - `app/components/admin/schema.ts` — `SPEECH_PROVIDERS_TRANSPORT` / `updateSpeechConfigSchema` / `testSpeechConnectionSchema`。
  - `app/components/admin/SpeechSettingsForm/index.tsx` — `PROVIDER_LABEL` / `PROVIDER_DEFAULT_MODEL` / `PROVIDER_API_KEY_PLACEHOLDER` / apiKey 必須ロジック。
  - `app/core/adapters/d1/schema.ts` L812-815 — `speech_provider`（テキスト、CHECK なし）/ `speech_model` / `speech_api_key_source`（CHECK: env|db）/ `speech_api_key_ciphertext`。
  - `wrangler.toml`（+ `wrangler.staging.toml` / `wrangler.production.toml`）— AI binding 未定義。`[env.consumer]` に speech vars。
  - `@cloudflare/workers-types` index.d.ts — `Ai` クラス（L10762）、`Ai_Cf_Deepgram_Nova_3_Input/Output`（L9251/9405）、`AiModels` に `@cf/deepgram/nova-3`（L10674）。

- あるべきアーキテクチャ:
  - Hexagonal + DDD。依存は内向き。config は純データ、クロスカッティング（binding）はポート / DI 注入経由（CLAUDE.md）。
  - speech registry は LLM registry と分離した専用 registry（`Record<SpeechProvider, SpeechAdapter>` でコンパイル時網羅・`spec/adr/013`）。
  - provider 追加 = 型駆動網羅パターン（domain union / transport list / registry / adapter / UI ラベル の diff）。#738 / #766 が確立。
  - `SpeechFailureError` のみ throw・空発話は `""`・workerd の `DOMException(AbortError)` を timeout 扱い の port 契約（`speechRecognitionProvider.ts`）。

- 既存実装の状態:
  - `SpeechAdapterConfig = { apiKey, model }` に transport 軸も binding 参照も無い。`create(c)` は config のみ受ける → binding を渡す口が無い（構造的ブロッカー、Issue 記載どおり裏取り済み）。
  - `ServerEnv` に `AI` binding 無し、`wrangler.toml` に `[ai]` 無し。
  - DI ゲートが API キー前提（`!adminSpeechApiKey → Stub`、`resolveConsumerSpeechConfig` は apiKey null → null）。workers-ai は鍵が無いため、このゲートが実質ブロッカー（ADR-004 で分岐）。
  - → いずれも本 Issue で是正。案 B + `deps.ai` 注入 + ゲート分岐で着地。

- 依存関係: `SpeechAdapter.create/ping` シグネチャ変更は openai/deepgram/gemini の 3 barrel（`index.ts`）と registry test・connectionTester test に波及。`ServerEnv` への `AI` 追加は request/consumer/worker の各 config リーダーに波及。

## 設計

### ドメインモデルへの影響
- `SPEECH_PROVIDERS` に `"deepgram-workers-ai"` を追加（union 1 値）。`SpeechRecognitionConfig.create` の provider 検証は既存ロジックで自動対応（リストに足すだけ）。default-model INVARIANT コメントに `deepgram-workers-ai → "@cf/deepgram/nova-3"` を追記。
- `SpeechRecognitionConfig` の形（`{provider, model, apiKeySource, apiKeyCiphertext}`）は**不変**。workers-ai は `apiKeySource: 'env'` 相当（鍵行を持たない）で表現でき、新フィールドは不要。transport は provider 識別子が担う（ADR-001）。
- **keyless-provider 述語をドメイン SSOT として追加する（arch レビュー round-1 [P-001] / round-2 [P-001] 反映・最重要）。** 「この provider は apiKey を要するか」は、真の domain service である `AdminSettingsService.assertSpeechEnvOverride`（`service.ts` — `apiKeySource:'env'` かつ env キー欠如で `SpeechEnvOverrideMissingKey` を throw）と、application usecase `updateSpeechConfig`（domain の `AdminSettingsErrorCode.SpeechProviderChangedRequiresApiKey` を使う不変条件）の**両方**の判定に使われるため、判定述語は application/DI ヘルパではなく domain（`valueObject.ts`）に置く。例: `SpeechRecognitionConfig.requiresApiKey(provider): boolean`（または keyless provider 集合 `KEYLESS_SPEECH_PROVIDERS = ["deepgram-workers-ai"]`）を SSOT として公開し、domain service `assertSpeechEnvOverride`・usecase・DI ゲート・tester が**同一述語**を参照する。domain service `assertSpeechEnvOverride` が application 層ヘルパに依存する逆流を避けるための配置（arch round-2 は、SSOT を domain に置いた判断が `assertSpeechEnvOverride` も同述語を参照できる点でむしろ補強されると評価）。application/DI 側の薄いラッパ `isWorkersAiSpeechProvider(provider: string)` はこの domain 述語へ委譲する（binding 系コードから domain VO を直接触らせないためのアダプト）。
- **層の精密化（arch round-2 [S-001]）:** `SpeechProviderChangedRequiresApiKey` の enforcement は application usecase `updateSpeechConfig` にある（domain の error code を使うが、provider 変更×鍵の関係を検査するのは usecase であり domain VO の `create` ではない）。真に domain 層で throw するゲートは `assertSpeechEnvOverride`（domain service）のみ。この 2 つを混同しないよう plan/ADR では「application usecase の不変条件（domain error code 使用）」と「domain service ゲート」を区別して記述する。
- ドメインは binding を知らない（binding は adapter/DI の関心事）。ドメイン層の追加は provider 1 値 + keyless 述語のみ。

### ユースケース / アプリケーションロジック

> **訂正（arch レビュー round-1 [P-001]/[P-002] + round-2 [P-001] 反映）:** 当初「usecase はロジック変更なし」としていたが**誤り**。実コード確認の結果、application 層に workers-ai の鍵なし経路をブロックする apiKey ゲートが **3 箇所**（usecase 2 + tester 1）あり、さらに **domain service `assertSpeechEnvOverride`（1 箇所）** も 6 番目のゲートとして keyless 保存を throw する。keyless 述語での分岐が必須。

- **`updateSpeechConfig`（`app/core/application/adminSettings/updateSpeechConfig.ts`）— 変更あり（application usecase の不変条件・domain error code 使用）。** L66-74 の `providerChanged && apiKeyCiphertext === null` ガードが `SpeechProviderChangedRequiresApiKey`（domain の `AdminSettingsErrorCode`）を throw する。既定 `openai` から `deepgram-workers-ai` へ切替時は必ず `providerChanged=true` かつ鍵なし（`apiKeyPlain=null → ciphertext=null`）になり、**保存が失敗する**。さらに else 枝（L84-89）は旧 provider の `apiKeySource`/`apiKeyCiphertext`（例 openai/db の ciphertext）を流用するため、免除だけでは workers-ai 行に旧鍵が残る。→ 対応: (a) keyless provider のとき `providerChanged-requires-apiKey` を**免除**、(b) draft を明示的に `apiKeySource: 'env', apiKeyCiphertext: null` へ正規化する分岐を追加。判定は domain SSOT 述語（`SpeechRecognitionConfig.requiresApiKey`）を参照。**(c) 重要（arch round-2 [P-001]）:** draft 作成直後（L91 付近）に呼ぶ domain service `AdminSettingsService.assertSpeechEnvOverride(draft, env)` が、(b) で正規化した `apiKeySource:'env'` かつ env キー欠如（workers-ai は `ADMIN_SPEECH_API_KEY` 不設定 → `env.apiKey===null`）の条件で `SpeechEnvOverrideMissingKey` を throw し、免除・正規化の**下流でもう一度**保存を落とす。この 6 番目のゲートの carve-out は domain service 側（下記）で行う。
- **`AdminSettingsService.assertSpeechEnvOverride`（`app/core/domain/adminSettings/service.ts` L94-114）— 変更あり（真の domain service・6 番目のゲート／arch round-2 [P-001]）。** `env.apiKey === null|"" && cfg.apiKeySource === "env"` で `SpeechEnvOverrideMissingKey` を throw する。この分岐は「apiKeySource が env なら env キーが必ず要る」という REST 前提の不変条件で、鍵が binding 側にある keyless とは前提が食い違う。→ 対応: 先頭に keyless carve-out を追加し、`SpeechRecognitionConfig.requiresApiKey(cfg.provider) === false` のとき env キー欠如でも throw せず `cfg`（`env`/null のまま）を返す。判定は round-1 で domain SSOT に置いた**同一述語**を参照するので依存方向は保たれる（`service.ts` は同じ `valueObject.ts` を import 済み）。
- **keyless で operator が apiKey を誤入力した場合（arch round-2 [S-002]）:** keyless を無条件に `env`/null 正規化する方針上、UI 抑制をすり抜けて `apiKeyPlain !== null` が来ても鍵は draft で無視され silently drop される（encrypt は走るが破棄される）。安全側で妥当だが、「keyless では入力鍵を silently drop する」旨を `updateSpeechConfig` の JSDoc に 1 行残し、テストで 1 ケース固定する（将来「鍵が保存されない」バグ報告との切り分けを早める）。
- **`testSpeechConnection`（同 `testSpeechConnection.ts`）— 変更あり。** L80-86 で `resolvedKey` が null/空のとき `speechConnectionTester.ping` を呼ばず `"No api key available"` を返す。workers-ai は env override も ciphertext も持たず `resolvedKey` は常に空 → ping に到達しない。→ 対応: keyless provider のとき鍵空でも tester へ空文字で dispatch を続行する分岐を追加。
- **`HttpSpeechConnectionTester.ping`（`app/core/application/di/speechConnectionTester.ts`）— 変更あり。** L36-39 で `trimmedKey.length === 0` のとき `adapter.ping` に到達する前に `"API key is empty"` で短絡。→ 対応: keyless provider（`cfg.provider` を domain 述語で判定）のとき empty-key 短絡をスキップし `adapter.ping(cfg, "", timeoutMs, { ai })` に進む。加えて `ai?: Ai` を注入し `deps` として渡す（ADR-005。workers-ai の ping は binding 存在確認）。
- workers-ai 判定ラッパ `isWorkersAiSpeechProvider(provider: string): boolean` を application/DI 共有ユーティリティとして追加し、domain SSOT 述語へ委譲（request/consumer/tester の 3 箇所で共有。binding 系コードから domain VO を直接触らせない薄いアダプト）。domain 層内（`assertSpeechEnvOverride`・`updateSpeechConfig`）はラッパを経由せず `SpeechRecognitionConfig.requiresApiKey` を直接参照する。

### アダプター / 永続化 / 外部連携
- `SpeechAdapterConfig` は据え置き。`SpeechAdapter` に `deps?: SpeechAdapterDeps`（`{ ai?: Ai }`）を `create`/`ping` の任意引数として追加（ADR-002）。
- 新規 `app/core/adapters/deepgram/workersAiSpeechRecognitionProvider.ts`（命名は既存対称性優先で調整可）:
  - `env.AI.run("@cf/deepgram/nova-3", { audio: { body: <bytes>, contentType: input.mime }, language, smart_format: true })` を型付きで呼ぶ。
  - 出力 `Ai_Cf_Deepgram_Nova_3_Output` の `results.channels[0].alternatives[0].transcript` を `.trim()`、空・欠落は `""`（既存 REST Deepgram の抽出ロジックを共有・型で担保）。
  - port 契約厳守: binding 未注入・実行失敗は `SpeechFailureError`、空発話は `""`。**timeout（S-001 訂正）:** `AiOptions`（`@cloudflare/workers-types` index.d.ts L10695）には `AbortSignal` も timeout フィールドも**無い**（`queueRequest`/`websocket`/tags/gateway のみ）。よって workers-ai の timeout は **`Promise.race` + 自前タイマーが `SpeechFailureError` を reject** する経路にする。REST の `AbortController`/`DOMException(AbortError)` 判定（`isAbortError`）は fetch 前提の**REST 専用で流用しない**（workers-ai は AbortController を張らないので AbortError は発生しない）。`Promise.race` は下層 `run()` を**キャンセルしない**（タイマー発火後もバック側は継続し課金され得る）旨を JSDoc に明記。
  - **webm/opus 時の `encoding`（S-002）:** `Ai_Cf_Deepgram_Nova_3_Input.encoding` は `"opus"` を受ける。本 Issue 実装は `audio.contentType` に mime を渡す形で据え置き、`encoding: "opus"` 明示指定は staging 受理 NG 時の保険策として ADR-006 の検証分岐に残す（下記リスク参照）。
  - apiKey は受け取っても**無視**（認証は Cloudflare 側）。
- 新規 workers-ai ping ラッパ（`speechConnectionPing.ts` 構成に合わせた薄い委譲。binding 存在で `ok:true`）。
- registry に `deepgram-workers-ai -> deepgramWorkersAiSpeechAdapter` を追加。DB スキーマ変更・マイグレーションは**不要**（`speech_provider` テキストカラムにそのまま乗る・ADR-001）。

### UI / プレゼンテーション
- `SPEECH_PROVIDERS_TRANSPORT`（schema.ts）に `"deepgram-workers-ai"` を追加。`updateSpeechConfigSchema` / `testSpeechConnectionSchema` は enum が広がるだけで自動対応。
- `PROVIDER_LABEL["deepgram-workers-ai"] = "Deepgram (Workers AI)"`、`PROVIDER_DEFAULT_MODEL["deepgram-workers-ai"] = "@cf/deepgram/nova-3"`、`PROVIDER_API_KEY_PLACEHOLDER` はダミー（下記のとおり非表示分岐）。
- API キー欄: workers-ai provider 選択時は「不要（Cloudflare が管理）」表示に分岐し、provider 変更時の apiKey 必須（`apiKeyRequired`）を workers-ai では抑制する（ADR-004。鍵不要のため）。**ただしクライアント側 `apiKeyRequired` 抑制だけでは不十分**でサーバ側 usecase ゲート（上記）も分岐しないと保存/接続テストが通らない点に注意。
- **`deepgram`(REST) と `deepgram-workers-ai` の 2 択が UI に並ぶ（S-003）。** `PROVIDER_LABEL` は "Deepgram" と "Deepgram (Workers AI)" になり、model 既定も `nova-3` vs `@cf/deepgram/nova-3` で紛らわしい。model 欄が自由入力だと typo で沈黙 Stub 化しうる。→ provider select の説明文に「Workers AI 版は Cloudflare アカウント認証・鍵不要」を明示し、model 取り違えリスクを緩和する注記を入れる。model 欄を編集可能にするかは実装時に一考（既定値の提示は必須）。

### DI / 配線（blast radius の本体）
- `ServerEnv` に `AI?: Ai`（`@cloudflare/workers-types`）を追加。`RequestServerConfig` に `aiBinding?: Ai` を追加し `readRequestServerConfig` で `...(env.AI ? { aiBinding: env.AI } : {})` を threading。
- `buildSpeechRecognitionProvider(provider, apiKey, model, ai?)`: ADR-004 ゲート分岐（現状 L630 `if (!adminSpeechApiKey || !adminSpeechModel) return Stub` を keyless 述語で分岐）。
  - keyless(workers-ai) provider（`isWorkersAiSpeechProvider(provider)`）→ `ai` 注入 & model あり で `adapter.create({apiKey: apiKey ?? "", model}, { ai })`、`ai` 未注入なら Stub。apiKey の有無は問わない。
  - REST provider → 従来どおり apiKey & model 必須。
- `resolveConsumerSpeechConfig`（S-004 具体化）: 現状 L1192 の early-return `if (provider === null || model === null || apiKey === null) return null;` が、apiKey 常時 null の workers-ai を必ず `null`（→ 沈黙 Stub）に落とす。`apiKey: ""` を返すだけでは不十分で、**この 3 項 early-return 条件自体を「keyless provider は apiKey null を許容」に分岐**させる（例: `const keyless = isWorkersAiSpeechProvider(provider ?? "")` を用い、`if (provider === null || model === null || (!keyless && apiKey === null)) return null;`、keyless 時は `apiKey: apiKey ?? ""` を返す）。consumer で `buildSpeechRecognitionProvider(..., env.AI)` を渡す。**audio 文字起こしは consumer で走る**ので consumer 経路の binding 配線が E2E の要。
- `createConsumerContainer` / `createRequestContainer` で `env.AI` を該当ビルダーへ渡す。
- `HttpSpeechConnectionTester` を `new HttpSpeechConnectionTester(timeoutMs, ai)` で構築（container から）。
- `wrangler.toml`（+ staging/production）に `[ai] binding = "AI"` を web worker と `[env.consumer]` に追加（consumer が実文字起こしを実行するため必須）。ローカル dev の AI binding は実アカウント認証依存である旨をコメントで明記。

## 実装ステップ

内側（ドメイン）→ 外側（DI/UI）の依存順。

### 1. ドメイン: provider union に `deepgram-workers-ai` を追加 + keyless 述語 SSOT
- **対象ファイル:** `app/core/domain/adminSettings/valueObject.ts`
- **変更内容:** `SPEECH_PROVIDERS` に `"deepgram-workers-ai"` を追加。default-model INVARIANT コメントに `deepgram-workers-ai → "@cf/deepgram/nova-3"` を追記。**keyless-provider 述語を SSOT として追加**（例: `KEYLESS_SPEECH_PROVIDERS = ["deepgram-workers-ai"] as const` と `SpeechRecognitionConfig.requiresApiKey = (p) => !(KEYLESS_SPEECH_PROVIDERS as readonly string[]).includes(p)`）。domain service `assertSpeechEnvOverride`・usecase・DI・tester が同一述語を参照する起点。
- **理由:** registry の `Record<SpeechProvider, SpeechAdapter>` 網羅を型で強制する起点。「鍵を要するか」の判定は真の domain service `assertSpeechEnvOverride`（`service.ts`）と application usecase の不変条件（`updateSpeechConfig`）の両方から参照されるため domain に置き、application 層への逆依存を避ける（arch round-1/round-2 [P-001]）。`service.ts` は既に同 `valueObject.ts` を import しているので述語を直接参照できる。既存 provider 検証ロジックはリスト追加のみで対応。

### 2. registry 契約: `SpeechAdapterDeps` を定義し `create`/`ping` に `deps` を追加
- **対象ファイル:** `app/core/adapters/speech/registry.ts`
- **変更内容:** `export type SpeechAdapterDeps = Readonly<{ ai?: Ai }>`（`Ai` を `@cloudflare/workers-types` から `import type`）。`SpeechAdapter.create`/`ping` の第 2/第 4 引数に `deps?: SpeechAdapterDeps` を追加。`SpeechAdapterConfig` は**変更しない**（ADR-002）。registry に `"deepgram-workers-ai": deepgramWorkersAiSpeechAdapter` を追加（ステップ 3 の barrel export に依存）。
- **理由:** binding を純データ config に混ぜず DI 依存として届ける口。#701 契約への最小の手入れ。

### 3. アダプター: Deepgram Workers AI provider + ping + barrel export
- **対象ファイル:** `app/core/adapters/deepgram/workersAiSpeechRecognitionProvider.ts`（新規）/ 同 `speechConnectionPing` 相当（新規 or 既存ファイルに追加）/ `app/core/adapters/deepgram/index.ts`
- **変更内容:** `env.AI.run("@cf/deepgram/nova-3", ...)` を呼ぶ provider を実装（設計節参照）。transcript 抽出は既存 REST Deepgram と共有。`deepgramWorkersAiSpeechAdapter satisfies SpeechAdapter` を `index.ts` から export（`create`/`ping` が `deps.ai` を読む）。REST 側の `deepgramSpeechAdapter` は `deps` を無視するよう据え置き（型上 `deps?` optional なので無改修）。
- **理由:** Workers AI ルートの実体。既存 Deepgram REST と対称構造・抽出ロジック共有で保守負荷を抑える。

### 4. ドメイン service + ユースケース: keyless 保存分岐（arch round-1 [P-001] / round-2 [P-001]）
- **対象ファイル:** `app/core/application/adminSettings/updateSpeechConfig.ts` / `app/core/domain/adminSettings/service.ts`
- **変更内容:**
  - **usecase（`updateSpeechConfig.ts`）:** provider が keyless（domain 述語 `SpeechRecognitionConfig.requiresApiKey(effectiveProvider) === false`）のとき、(a) L66-74 の `providerChanged && ciphertext === null → SpeechProviderChangedRequiresApiKey` throw を**免除**、(b) draft を `apiKeySource: 'env', apiKeyCiphertext: null` へ**明示正規化**（旧 provider の ciphertext を引き継がせない）。JSDoc に「keyless では operator 入力の apiKey を silently drop する」旨を 1 行追記（round-2 [S-002]）。REST provider の既存ロジックは無改修。
  - **domain service（`service.ts` の `assertSpeechEnvOverride` L94-114）— 6 番目のゲート（round-2 [P-001]）:** 先頭に keyless carve-out を追加し、`SpeechRecognitionConfig.requiresApiKey(cfg.provider) === false` のとき `env.apiKey===null|""` でも `SpeechEnvOverrideMissingKey` を throw せず `cfg` を返す。判定は同一 domain 述語を直接参照。これが無いと (b) の `apiKeySource:'env'` 正規化がこのゲートを踏み抜き keyless 保存が再度失敗する。
- **理由:** 既定 openai → deepgram-workers-ai 切替の保存が、application 不変条件（`SpeechProviderChangedRequiresApiKey`）と domain service（`SpeechEnvOverrideMissingKey`）の**両方**でブロックされるのを解消（AC-3「保存」の必須条件）。UI の `apiKeyRequired` 抑制だけでは通らない。

### 5. ユースケース: `testSpeechConnection` の keyless 分岐（arch [P-002]）
- **対象ファイル:** `app/core/application/adminSettings/testSpeechConnection.ts`
- **変更内容:** L80-86 の `resolvedKey` null/空 早期リターンを、keyless provider（domain 述語で `cfg.provider` を判定）のときスキップし、空文字で `speechConnectionTester.ping(cfg, "")` へ dispatch を続行する分岐を追加。REST provider は従来どおり「No api key available」。
- **理由:** workers-ai は鍵を持たず `resolvedKey` が常に空になり、この早期リターンで tester に到達しない（AC-3「接続テスト」の必須条件）。

### 6. DI: `ServerEnv` / `RequestServerConfig` に AI binding を追加し threading
- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `ServerEnv` に `AI?: Ai`、`RequestServerConfig` に `aiBinding?: Ai` を追加。`readRequestServerConfig` で threading。
- **理由:** binding を entry point から container まで運ぶ配線。

### 7. DI: `buildSpeechRecognitionProvider` のゲート分岐 + `deps.ai` 注入
- **対象ファイル:** `app/core/application/di/serverCloudflare.ts` + 共有ヘルパ `isWorkersAiSpeechProvider`（domain 述語へ委譲）
- **変更内容:** ADR-004 のゲート分岐。現状 L630 `if (!adminSpeechApiKey || !adminSpeechModel) return Stub` を keyless 述語で分岐し、keyless は binding+model 駆動（apiKey 不問）、REST は apiKey+model 駆動。`adapter.create(config, { ai })` で binding を渡す。`createRequestContainer` から `aiBinding` を渡す。keyless で binding 未注入なら Stub。
- **理由:** workers-ai を鍵無しで配線可能にする（Stub ブロッカー解消）。

### 8. DI: consumer 経路の speech 解決と binding 配線
- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `resolveConsumerSpeechConfig`（L1146〜）の L1192 early-return `if (provider === null || model === null || apiKey === null) return null;` を、keyless provider は apiKey null を許容するよう分岐（`const keyless = isWorkersAiSpeechProvider(provider ?? ""); if (provider === null || model === null || (!keyless && apiKey === null)) return null;`、keyless 時 `apiKey: apiKey ?? ""` を返す）。`createConsumerContainer` の `speechOverrides` で `buildSpeechRecognitionProvider(..., env.AI)` を渡す。
- **理由:** audio 文字起こしは consumer で走るため、E2E フルパス（AC-4）の要。early-return 沈黙 Stub を回避（arch [S-004]）。

### 9. presentation: `HttpSpeechConnectionTester` の binding 注入 + empty-key バイパス
- **対象ファイル:** `app/core/application/di/speechConnectionTester.ts` + `createRequestContainer` の構築箇所
- **変更内容:** コンストラクタに `ai?: Ai` を追加し `adapter.ping(cfg, apiKey, timeoutMs, { ai })` へ渡す。**L36-39 の `trimmedKey.length === 0 → "API key is empty"` 短絡を keyless provider（`cfg.provider` を domain 述語で判定）のときスキップ**し、`adapter.ping(cfg, "", timeoutMs, { ai })` に進める。container で `new HttpSpeechConnectionTester(DEFAULT_TIMEOUT_MS, aiBinding)`。
- **理由:** workers-ai の接続テスト（binding 存在確認・ADR-005）を成立させる。empty-key 短絡（coverage [P-001] / arch [P-002]）を緩和しないと ping に到達しない。

### 10. UI: transport list / ラベル / apiKey 欄の分岐
- **対象ファイル:** `app/components/admin/schema.ts` / `app/components/admin/SpeechSettingsForm/index.tsx`
- **変更内容:** `SPEECH_PROVIDERS_TRANSPORT` に `"deepgram-workers-ai"`。`PROVIDER_LABEL` / `PROVIDER_DEFAULT_MODEL` にエントリ追加。workers-ai 選択時は API キー欄を「不要（Cloudflare 管理）」表示にし `apiKeyRequired` を抑制。説明文に Workers AI を追記。
- **理由:** `/admin/speech` からの選択・保存・接続テスト（AC-3）。鍵不要 UX（ADR-004）。

### 11. テスト: adapter 境界 + registry ディスパッチ + usecase/DI ゲート
- **対象ファイル:** `app/core/adapters/deepgram/__tests__/`（新規 workers-ai adapter test）/ `app/core/adapters/speech/__tests__/registry.test.ts` / `updateSpeechConfig` / `testSpeechConnection` / `speechConnectionTester` / DI・schema の既存テスト
- **変更内容:** `Ai` binding のフェイク（`run` を差し替えたスタブ）で 2xx 相当（transcript 返却）/ 4xx・5xx 相当（`run` reject → `SpeechFailureError`）/ timeout / **空の音声入力（空 bytes 投入）** / **空 transcript 出力（`""`）** を別ケースとして / **binding 未注入 → `SpeechFailureError`（transcribe）・`ok:false`（ping）** を検証。registry に `deepgram-workers-ai` が登録されることを追加。二重リスト不変条件テスト（`valueObject.test.ts` の providers・`schema.test.ts` の transport）に新値を追加。**usecase / domain service ゲートの keyless 分岐テスト:** `updateSpeechConfig` が keyless provider 切替を鍵なしで保存成功し `apiKeySource:'env'`/ciphertext null に正規化すること・**`assertSpeechEnvOverride`（domain service）が keyless 切替を env キー無しで通し `SpeechEnvOverrideMissingKey` で落ちないこと（round-2 [P-001] 回帰固定）**・keyless で apiKey を誤入力しても silently drop される（保存値に鍵が残らない）こと（round-2 [S-002]）・`testSpeechConnection` が鍵なしでも tester へ到達すること・`HttpSpeechConnectionTester.ping` が **apiKey 空でも keyless + binding 有りなら `ok:true`**（empty-key ガード回帰固定）。**DI ゲート分岐:** `buildSpeechRecognitionProvider` が keyless を apiKey 無し+binding 有りで非 Stub・binding 無しで Stub、`resolveConsumerSpeechConfig` が keyless を apiKey 無しで解決すること。既存 OpenAI / Deepgram と対称（AC-6）。
- **理由:** 回帰カバレッジ。fetch モックではなく binding フェイクを使う点が REST provider テストとの構造差。**6 つの apiKey ゲート**（domain service `assertSpeechEnvOverride` 1 + application 5: usecase 2 + DI 2 + tester 1）の keyless 分岐を固定するのが本 Issue の要。

### 12. wrangler: AI binding 定義 + staging 受理検証準備
- **対象ファイル:** `wrangler.toml` / `wrangler.staging.toml` / `wrangler.production.toml`
- **変更内容:** web worker と `[env.consumer]` に `[ai] binding = "AI"` を追加（consumer が実文字起こしを実行するため必須）。ローカル dev では実アカウント認証依存であることをコメントで明記。staging で `ADMIN_SPEECH_PROVIDER = "deepgram-workers-ai"` を設定して webm/opus 受理検証（ADR-006）。
- **理由:** binding をランタイムに供給。ADR-006 の staging 検証の下地。

### 13. spec 更新 + OpenAI 引き継ぎ Issue 起票（Phase 4）
- **対象ファイル:** `spec/adr/013-speech-provider.md` / `spec/domains/adminSettings.md`
- **変更内容:** Workers AI ルート（`deepgram-workers-ai` / `@cf/deepgram/nova-3`）追記節を追加。案 B 採用・`SpeechAdapter.create/ping` の `deps.ai` 注入・API キー不要（SecretBox 非適用）・keyless 述語を domain SSOT に置き domain service `assertSpeechEnvOverride`/usecase/DI/tester の 6 ゲートが参照・ping は binding 存在確認・webm/opus 受理は staging 検証中、を記載。`SpeechProvider` 列挙と default-model INVARIANT に新値を反映。OpenAI gpt-4o-transcribe の Workers AI 非対応（スコープ外）も明記。**Phase 4（S-001）:** OpenAI gpt-4o-transcribe（AI Gateway 経由 or Whisper `@cf/openai/whisper-large-v3-turbo` 代替）の Workers AI ルートを別 Issue として起票し、`spec/adr/013` に issue 番号を残す。
- **理由:** AC-7。設計判断のドキュメント同期。OpenAI ルートの引き継ぎを宙に浮かせない（S-001）。

## 設計判断

- **案 B（別 provider エントリー）採用**（ADR-001）。非合法状態（gemini+workers-ai）を型で排除、マイグレーション不要、既存 diff-only パターンと対称。
- **config は純データ据え置き、binding は `deps.ai` として `create`/`ping` に別口注入**（ADR-002）。CLAUDE.md「config は純データ / binding は DI 注入」準拠。
- **本 Issue の実装対象は Deepgram Nova-3（`@cf/deepgram/nova-3`）のみ**（ADR-003）。OpenAI gpt-4o-transcribe は Workers AI 非対応（型付きカタログは Whisper のみ）でスコープ外。
- **workers-ai は API キー不要 → DI ゲートを binding 存在に分岐、SecretBox 非適用**（ADR-004）。
- **接続テストは binding 存在確認**（ADR-005）。
- **PoC は型契約の静的検証 + staging implement-then-verify/revert**（ADR-006）。

## リスクと注意点

- **実 `env.AI` binding へこの dev 環境から到達不可。** Workers AI はローカルモックを持たず、`wrangler dev` の AI binding も実アカウント認証で remote を叩く。→ webm/opus 受理は staging 検証に回す（ADR-006）。レスポンス shape 互換は型（`Ai_Cf_Deepgram_Nova_3_Output`）で静的に確定済み。
- **偽陽性（#766 と同型・重要）:** `runIngestionJob` は `SpeechFailureError` を握り潰し空 transcript で「成功」扱いする。webm/opus 受理判定は「ノート保存成功」では決めず、adapter/ネットワーク層で 2xx + 非空 transcript を直接確認する。
- **consumer 経路の binding 配線漏れ = 沈黙の Stub。** audio 文字起こしは consumer で走る。`[env.consumer]` の `[ai]` binding や `resolveConsumerSpeechConfig` の apiKey-optional 分岐が漏れると workers-ai 選択でも Stub に落ちて気づきにくい。DI unit テストで固める。
- **`env.AI.run` の timeout は REST の `AbortController` と別系統（S-001 確定）。** `AiOptions` に signal/timeout フィールドが無いことを型で確認済み。`Promise.race` + 自前タイマーで port の timeout 契約（`SpeechFailureError`）を満たす。ただし `Promise.race` は下層 `run()` をキャンセルせず、タイマー発火後もバック側は継続する（課金され得る）。REST の DOMException/AbortError 契約とは混ぜない。
- **apiKey ゲートの見落とし（今回の最大の発見・round-1/round-2 で計 6 箇所に確定）。** DI ゲート（`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig`）だけでなく、application usecase の `updateSpeechConfig`（provider-change-requires-key）・`testSpeechConnection`（no-api-key）・`HttpSpeechConnectionTester`（empty-key）、さらに **domain service `assertSpeechEnvOverride`（env-source×env-key-missing・round-2 [P-001] で追加発見）** の計 **6 箇所**が存在し、keyless 分岐しないと workers-ai の保存/接続テストがサーバ側でブロックされる。特に `assertSpeechEnvOverride` は plan 自身の `apiKeySource:'env'` 正規化が能動的に踏み抜くので必須。内訳: **domain service 1 + application 5（usecase 2 + DI 2 + tester 1）**。keyless 述語を domain SSOT に置き、6 箇所すべてを同一述語で一貫分岐させる。
- **staging 受理 NG 時の保険（S-002）。** webm/opus 受理 NG なら `encoding: "opus"` 明示指定 → 録音 UI の webm→ogg/opus 変換の順で次アクションを検討（本 Issue 実装は据え置き）。NG 根拠を ADR-006 に追記。
- **契約シグネチャ変更の波及。** `SpeechAdapter.create/ping` への `deps` 追加は 3 barrel + registry test + connectionTester に波及。`deps?` を optional にして REST 側を無改修に保つ。
- **OpenAI ルートを期待した利用者の齟齬。** Issue タイトルは OpenAI も挙げるが本 Issue では入らない（ADR-003）。別 Issue へ引き継ぎ、spec に明記。
- **staging 受理 NG 時の revert。** 実装は独立コミット化し、spec/ADR 更新は別コミットにして `git revert` を原子的に保つ（#766 ADR-003 の運用を踏襲）。

## テスト方針

- **adapter 単体（binding フェイク）:** `Ai.run` を差し替えたスタブで — 正常（transcript 返却・`.trim()`）/ **空の音声入力（空 bytes 投入）** と **空 transcript 出力（`""`）を別ケースとして** / `run` reject（`SpeechFailureError`）/ timeout（`Promise.race` タイマー経路）/ **binding 未注入（`SpeechFailureError`）** / 4xx・5xx 相当。既存 REST Deepgram テストと対称（AC-6）。
- **ping 単体:** binding 注入で `ok:true`、未注入で `ok:false`。**`HttpSpeechConnectionTester.ping` は keyless provider + apiKey 空 + binding 有りで `ok:true`**（empty-key 短絡の回帰固定・coverage [P-001]）。
- **domain service / usecase ゲート unit（arch round-1 [P-001]/[P-002] + round-2 [P-001]/[S-002]）:** `updateSpeechConfig` が openai→deepgram-workers-ai 切替を鍵なしで保存成功し、保存値が `apiKeySource:'env'`/ciphertext null に正規化されること（旧 ciphertext を引き継がない）。**`assertSpeechEnvOverride`（domain service）が keyless 切替を env キー無しで通過し `SpeechEnvOverrideMissingKey` を throw しないこと（round-2 [P-001] 回帰固定・6 番目のゲート）**、REST provider では従来どおり env-source×env-key-missing で throw することも回帰確認。**keyless で apiKey を誤入力しても保存値に鍵が残らず silently drop されること（round-2 [S-002]）。** `testSpeechConnection` が keyless で鍵なしでも `speechConnectionTester.ping` に到達すること（「No api key available」で落ちない）。REST provider は従来どおり鍵要求を維持することも回帰確認。
- **registry ディスパッチ:** 実 registry で `deepgram-workers-ai` が登録され `lookupSpeechAdapter` で解決されること（`registry.test.ts`）。
- **二重リスト不変条件:** `valueObject.test.ts`（`SpeechRecognitionConfig.providers` + keyless 述語）/ `schema.test.ts`（`SPEECH_PROVIDERS_TRANSPORT`）に新値を追加してドリフト検出。
- **DI 配線 unit:** `buildSpeechRecognitionProvider` が workers-ai を apiKey 無し + binding 有りで非 Stub、binding 無しで Stub にすること。`resolveConsumerSpeechConfig` が workers-ai を apiKey 無しで解決すること（3 項 early-return の keyless 分岐）。
- **静的契約検証（ADR-006 の PoC 前半）:** `env.AI.run("@cf/deepgram/nova-3", ...)` の呼び出しと出力抽出が `@cloudflare/workers-types` の型に適合すること（`tsgo` typecheck が担保）。
- **webm/opus 受理（ADR-006 の PoC 後半・staging）:** staging で `ADMIN_SPEECH_PROVIDER = "deepgram-workers-ai"` を設定し実録音 webm/opus で **adapter/ネットワーク層が 2xx + 非空 transcript** を返すことを直接確認。NG なら実装コミットを revert し ADR-006 に根拠を追記。
- 全体後: `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test`。

## レビュー履歴

### 1周目
**修正した点**:
- **[coverage P-001 / arch P-002]（接続テストの empty-key ガード）**: ステップ 9 に `HttpSpeechConnectionTester.ping` の L36-39 empty-key 短絡を keyless provider でスキップし `adapter.ping(cfg, "", timeoutMs, { ai })` に進める分岐を明記。テスト方針に「keyless + apiKey 空 + binding 有りで `ok:true`」ケースを追加。
- **[arch P-001]（`SpeechProviderChangedRequiresApiKey` 不変条件）— 最重要**: 「usecase 変更なし」の記述は誤りと訂正。ステップ 4 を新設し `updateSpeechConfig` の providerChanged-requires-apiKey 免除 + `apiKeySource:'env'`/ciphertext null 正規化を明記。keyless 述語を **domain SSOT**（`valueObject.ts`）に置き usecase/DI/tester が同一述語を参照する設計に変更（ステップ 1 拡張・設計「ドメインモデルへの影響」「ユースケース」節を全面改稿）。
- **[arch P-002]（`testSpeechConnection` の no-api-key ガード）**: ステップ 5 を新設し keyless で鍵なしでも tester へ dispatch する分岐を明記。
- **[arch S-004]（`resolveConsumerSpeechConfig` early-return）**: ステップ 8 に 3 項 early-return `if (provider===null||model===null||apiKey===null)` を keyless 許容へ分岐する具体式を明記。
- ステップを 11→13 に再構成（usecase 2 ステップ新設）し、受け入れ基準表の「対応ステップ」列を全 AC で整合。
- **[coverage P-002]（DoD 未定義）**: 「Definition of Done とクローズ条件」節を新設し、マージ DoD と staging 確定項目・クローズ/revert 条件を分離。AC 表に「検証環境」列と staging 依存注記を追加。

**取り込んだ改善提案**:
- **[coverage S-001]**: ステップ 13（Phase 4）に OpenAI gpt-4o-transcribe（AI Gateway or Whisper 代替）引き継ぎ Issue 起票をアクション化。スコープ節にも明記。
- **[coverage S-002]**: AC-6・テスト方針で「空の音声入力」と「空 transcript 出力」を別ケースに分離。
- **[coverage S-003]**: ADR-003 に `@cloudflare/workers-types@4.20260511.1`・確認日 2026-07-01 を追記。
- **[arch S-001]**: adapter 設計・リスク節の timeout 記述を訂正（`AiOptions` に signal/timeout 無しを型で確認、`Promise.race` は run() を非キャンセル、REST の DOMException 契約と混ぜない）。
- **[arch S-002]**: webm/opus 時の `encoding: "opus"` を staging 受理 NG 時の保険策として ADR-006 検証分岐に記載。
- **[arch S-003]**: UI 節に deepgram(REST)/deepgram-workers-ai の 2 択並びと model 取り違えリスクの注記を追加。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 2周目
**修正した点**:
- **[arch P-001]（`assertSpeechEnvOverride` が 6 番目の apiKey ゲート）— 最重要**: `service.ts` L94-114 の domain service を実コード確認。plan ステップ 4(b) の `apiKeySource:'env'` 正規化が、workers-ai は `env.apiKey===null` のためこの domain service の `env-source×env-key-missing` 分岐を能動的に踏み抜き `SpeechEnvOverrideMissingKey` で keyless 保存が再失敗することを確認。ステップ 4 に domain service `assertSpeechEnvOverride` への keyless carve-out（domain SSOT 述語 `SpeechRecognitionConfig.requiresApiKey` 参照）を追加。apiKey ゲート数を **5 → 6 箇所**（domain service 1 + application 5: usecase 2 + DI 2 + tester 1）に更新し、DoD 節・設計節・実装ステップ・リスク節・テスト方針・ADR-004 の全箇所で総数・内訳を一致させた。テスト方針に「keyless 切替を env キー無しで保存でき `SpeechEnvOverrideMissingKey` で落ちない」回帰ケースを追加。
- **[coverage S-002]（ゲート数の食い違い）**: DoD 節の「4 つの apiKey ゲート」を上記 6 箇所へ統一。ADR-004・リスク節・テスト方針との数え上げドリフトを解消。
- **[coverage S-001]（AC-3 トレーサビリティ）**: AC-3 の「対応ステップ」列に adapter/ping 実装ステップ 3 を追加（接続テストは `deepgramWorkersAiSpeechAdapter.ping` に依存するため）。

**取り込んだ改善提案**:
- **[arch S-001]（文言精度）**: `SpeechProviderChangedRequiresApiKey` の enforcement は application usecase `updateSpeechConfig`（domain error code 使用）であり、真の domain service は `assertSpeechEnvOverride` のみである点を plan/ADR で区別して記述。「application usecase の不変条件」と「domain service ゲート」を明確に分離。
- **[arch S-002]（keyless での apiKey 誤入力 silently-drop）**: keyless 選択時に operator が誤って apiKey を入力しても draft で無視され silently drop される挙動を、`updateSpeechConfig` の JSDoc に 1 行残しテストで 1 ケース固定する方針をステップ 4・テスト方針に追記。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 3周目
**両視点とも問題点ゼロで終了。** apiKey ゲート網羅性は 6 箇所（domain service 1 + application 5: usecase 2 + DI 2 + tester 1）で収束・打ち止めを実コードの網羅 grep で確認（7 番目なし）。過去2周の全指摘の反映とゲート数の内部整合を確認し、要件カバレッジ・アーキ整合性ともに承認（APPROVED）。
