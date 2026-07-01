# ADR — Issue #788: Cloudflare Workers AI ルート（env.AI binding）文字起こしプロバイダを registry に追加する

> 本 Issue は `.issue/738/adr.md` ADR-003（Workers AI ルートはスコープ外・案 A/B 提示）の「別 Issue」にあたる。
> ADR-003 が積み残した「案 A（create 分岐）/ 案 B（別エントリー）」の決着と、`SpeechAdapterConfig` の扱い・`env.AI` の DI 配線をここで確定する。

---

## ADR-001: 案 B（別 SpeechProvider エントリー）を採用する

### Status
Accepted（実装方式の判断。実機での webm/opus 受理可否＝ADR-006 とは独立）

### Context
`.issue/738/adr.md` ADR-003 は Workers AI ルートを 2 案に整理した。

- **案 A（create 内で分岐）**: `SpeechAdapterConfig` に transport 軸（`rest | workers-ai`）を足し、`create` 内で分岐する。provider 集合（`SPEECH_PROVIDERS`）は据え置き。
- **案 B（別エントリー）**: `deepgram-workers-ai` 等を別々の `SpeechProvider` 値として registry に登録する。create のシグネチャは単純なまま、provider 集合が増える。

実態調査で判明した決定打:

1. **provider × transport には非合法な組み合わせがある。** Workers AI の型付きモデルカタログ（`@cloudflare/workers-types`）に音声モデルとして存在するのは `@cf/deepgram/nova-3`（Deepgram パートナーモデル）と `@cf/openai/whisper*`（Whisper）のみ。**Gemini は Workers AI 音声モデルを持たない**。案 A の `transport` 軸は `gemini + workers-ai` という非合法状態を型に許してしまい、CLAUDE.md「make illegal states unrepresentable」に反する（ランタイムガードでの後始末が必要になる）。案 B は実在する組み合わせだけを列挙するので非合法状態が構造的に生じない。

2. **案 A は DB スキーマ変更（マイグレーション）を伴う。** transport をデータとして持たせると `instance_settings.speech_transport` カラム追加・ドメイン VO フィールド追加・`ADMIN_SPEECH_TRANSPORT` env・UI の transport セレクタが要る。案 B は transport を既存の `speech_provider` テキストカラム（`app/core/adapters/d1/schema.ts` L812、CHECK 制約なし）にそのまま乗せられ、**マイグレーション不要**・既存 `ADMIN_SPEECH_PROVIDER` env で完結する。

3. **案 B は既存の diff-only 追加パターンと対称。** #738（Deepgram REST）/ #766（Gemini）が確立した「provider 追加 = domain union 1 値・transport list 1 値・registry 1 行・adapter ディレクトリ・UI ラベル」の型駆動網羅パターンにそのまま乗る。案 A は直交軸を足してこのパターンを崩す。

### Decision
**案 B** を採る。Workers AI ルートは `deepgram-workers-ai` という独立した `SpeechProvider` 値として `speechProviderRegistry` に登録する。`SpeechAdapterConfig` に transport 軸は足さない（provider 識別子そのものが transport を担う）。

- `SPEECH_PROVIDERS` に `"deepgram-workers-ai"` を追加（`app/core/domain/adminSettings/valueObject.ts`）。default-model INVARIANT は `deepgram-workers-ai → "@cf/deepgram/nova-3"`。
- registry に `deepgram-workers-ai -> deepgramWorkersAiSpeechAdapter` を 1 行追加。
- 既定プロバイダは `openai` 据え置き（`defaultSpeech()` 不変）。既存 openai/deepgram/gemini 経路は無傷。

### Consequences
- 良い点: 非合法状態が構造的に生じない。マイグレーション不要。既存 diff-only パターンと対称で回帰リスクが局所化。opt-in（明示選択時のみ作動）。
- トレードオフ: provider 集合と UI ラベルが 1 つ増える（PROVIDER_LABEL / PROVIDER_DEFAULT_MODEL / PROVIDER_API_KEY_PLACEHOLDER の 3 マップに 1 エントリずつ）。REST Deepgram（`nova-3`）と Workers AI Deepgram（`@cf/deepgram/nova-3`）が別プロバイダとして 2 つ並ぶ（利用者から見て「Deepgram」が 2 択になる）。

---

## ADR-002: `SpeechAdapterConfig` は純データのまま据え置き、`env.AI` binding は `create` / `ping` へ別口の DI 依存として注入する

### Status
Accepted

### Context
Issue のリファイン案:「生の `env.AI` binding を純データである `SpeechAdapterConfig` に混ぜず、binding は DI 注入の依存として `create` に別口で渡す」。CLAUDE.md も「クロスカッティングはポート経由」「config は純データ」を要求する。現状 `SpeechAdapter.create: (c: SpeechAdapterConfig) => SpeechRecognitionProvider` は config だけを受け取り、binding を渡す口がない。これが #701 レジストリ契約に手を入れる最小・必須の変更点（blast radius の本体）。

### Decision
`SpeechAdapterConfig`（`= { apiKey: string; model: string }`）は**一切変更しない**。代わりに `SpeechAdapter.create` / `SpeechAdapter.ping` に**注入依存オブジェクト** `deps: SpeechAdapterDeps` を第 2 引数として追加する。

```ts
export type SpeechAdapterDeps = Readonly<{ ai?: Ai }>; // Ai は @cloudflare/workers-types
export type SpeechAdapter = Readonly<{
  create: (c: SpeechAdapterConfig, deps?: SpeechAdapterDeps) => SpeechRecognitionProvider;
  ping: (cfg, apiKey, timeoutMs, deps?: SpeechAdapterDeps) => Promise<SpeechPingResult>;
}>;
```

- REST アダプター（openai/deepgram/gemini）は `deps` を**無視**する（既存挙動そのまま）。
- `deepgramWorkersAiSpeechAdapter` だけが `deps.ai` を読む。binding 未注入時は `SpeechFailureError`（transcribe）/ `ok:false`（ping）に落とす。
- binding は純データではないので config には**入れない**。DI が env 由来の `Ai` を `deps` として渡す。

### Consequences
- 良い点: config が純データを保つ（CLAUDE.md 準拠）。契約変更が `deps` 追加の 1 点に集約され、REST 側は `deps` 省略で無改修。
- トレードオフ: `create`/`ping` のシグネチャ変更は #701 レジストリ契約への手入れ（Issue が警告した blast radius）。呼び出し側（DI の `buildSpeechRecognitionProvider`、`HttpSpeechConnectionTester`）の配線更新が必要。

---

## ADR-003: 本 Issue の Workers AI 実装対象は Deepgram Nova-3（`@cf/deepgram/nova-3`）に限定し、OpenAI gpt-4o-transcribe の Workers AI ルートはスコープ外とする

### Status
Accepted（実態調査に基づくスコープ判断）

### Context
Issue の前提は「OpenAI `gpt-4o-transcribe` / Deepgram Nova-3 は Workers AI パートナーモデルとしても呼べる」。しかし `@cloudflare/workers-types` の型付きモデルカタログ（`AiModels`、index.d.ts L10655 付近）を裏取りした結果（**裏取り元: `@cloudflare/workers-types@4.20260511.1`（`package.json` の `^4.20260511.1`）、確認日 2026-07-01**。Workers AI カタログは随時拡張されるため、後日この版より新しい型定義でカタログが変わった場合はこの ADR を再評価する）:

- Deepgram Nova-3 は **`@cf/deepgram/nova-3`** として実在（`Ai_Cf_Deepgram_Nova_3_Input/Output` 型あり）。
- OpenAI の Workers AI 音声モデルは **Whisper 系のみ**（`@cf/openai/whisper` / `@cf/openai/whisper-large-v3-turbo` / `@cf/openai/whisper-tiny-en`）。**`gpt-4o-transcribe` は Workers AI モデルとして存在しない**。gpt-4o-transcribe を Cloudflare 経由で呼ぶには AI Gateway のプロバイダープロキシ（`env.AI.gateway(id)` + REST パススルー）が必要で、これは env.AI binding の `run()` とは別系統の重い統合になる。

Issue の受け入れ基準は provider 非依存（「選んだプロバイダーで…フルパスが動く」）なので、Deepgram 単独で AC を満たせる。

### Decision
本 Issue は **`deepgram-workers-ai`（`@cf/deepgram/nova-3`）のみ**を実装し、E2E の対象プロバイダーとする。OpenAI gpt-4o-transcribe の Workers AI ルートは以下の理由でスコープ外とし、別 Issue へ送る:

- gpt-4o-transcribe は Workers AI パートナーモデルとして存在せず、Issue の前提が実態と食い違う。
- AI Gateway プロキシ経由（gpt-4o-transcribe REST を Cloudflare で中継）は env.AI binding とは別の統合で、blast radius がさらに大きい。
- Whisper（`@cf/openai/whisper-large-v3-turbo`）で代替する案もあるが、REST の gpt-4o-transcribe とはモデル同一性・精度・出力 shape（`{text}` は同じだが品質特性が別物）が異なり「OpenAI を Cloudflare 側に寄せる」という Issue の狙いと一致しない。

ただし ADR-001/002 の設計（別エントリー + `deps.ai` 注入）は provider 追加に対して generic なので、将来 `openai-workers-ai`（Whisper もしくは AI Gateway 経由）を足す余地は残る。

### Consequences
- 良い点: 実在し型付き契約のある Deepgram に集中でき、Issue 前提の誤り（gpt-4o-transcribe が WAI 非対応）に足を取られない。E2E の確実性が上がる。
- トレードオフ: Issue タイトルが挙げる OpenAI ルートは本 Issue では入らない（別 Issue に明記して引き継ぐ）。
- 引き継ぎ: OpenAI を Cloudflare 側で呼びたい場合は AI Gateway プロキシ Issue を別途起票。Whisper で妥協するなら `openai-whisper-workers-ai` provider として同じ generic 配線に乗せられる。

---

## ADR-004: Workers AI provider は API キー不要 — DI フォールバックゲートを「binding 存在」に切り替え、SecretBox は非適用とする

### Status
Accepted

### Context
Workers AI パートナーモデルは認証を Cloudflare 側（アカウント / binding）で解決する。これが Issue の狙い「API キー管理を Cloudflare 側に寄せる」の核。しかし **apiKey 前提のゲートは DI だけでなく application usecase・domain service の複数層に存在する**（当初は DI ゲートのみ想定していたが、plan round-1 / round-2 レビューの実コード確認で段階的に判明した最重要事項）。keyless（workers-ai）経路は次の **6 箇所すべて**でブロックされる。層の内訳は **domain layer 1（domain service）+ application layer 5（usecase 2 + DI 2 + tester 1）**。

**domain layer（1 箇所・真の domain service）:**
- `AdminSettingsService.assertSpeechEnvOverride`（`app/core/domain/adminSettings/service.ts` L94-114 — round-2 [P-001] で追加発見の 6 番目のゲート）: `env.apiKey === null|"" && cfg.apiKeySource === "env"` で `SpeechEnvOverrideMissingKey` を throw する。`updateSpeechConfig` が draft 作成直後（L91 付近）にこれを呼ぶ。workers-ai は `ADMIN_SPEECH_API_KEY` 不設定で `env.apiKey===null`、かつ下記 usecase の正規化で `apiKeySource:'env'` になるため、この条件が成立し **免除・正規化の下流でもう一度**保存を落とす。この分岐は「apiKeySource が env なら env キーが必ず要る」という REST 前提で、鍵が binding 側にある keyless とは前提が食い違う。

**application layer（5 箇所）:**
- **usecase** `updateSpeechConfig`（`app/core/application/adminSettings/updateSpeechConfig.ts` L66-74）: `providerChanged && apiKeyCiphertext === null` で domain の `AdminSettingsErrorCode.SpeechProviderChangedRequiresApiKey` を throw。これは **domain の error code を使う application usecase の不変条件**であり、enforcement は usecase 層にある（domain VO の `create` は provider 変更×鍵の関係を検査しない・round-2 [S-001]）。既定 openai → deepgram-workers-ai 切替は必ず `providerChanged=true`・鍵なしになり保存が失敗する。さらに else 枝（L84-89）は旧 provider の `apiKeySource`/`apiKeyCiphertext` を流用するため、免除だけでは workers-ai 行に旧鍵 ciphertext が残る。
- **usecase** `testSpeechConnection`（同 `testSpeechConnection.ts` L80-86）: `resolvedKey` が null/空のとき `speechConnectionTester.ping` を呼ばず「No api key available」を返す。workers-ai は env override も ciphertext も持たず常に空。
- **DI** request 経路 `buildSpeechRecognitionProvider`（`serverCloudflare.ts` L630）: `if (!adminSpeechApiKey || !adminSpeechModel) return Stub`。
- **DI** consumer 経路 `resolveConsumerSpeechConfig`（同 L1192）: `if (provider === null || model === null || apiKey === null) return null`（→ 沈黙 Stub）。audio 文字起こしは**consumer で走る**ので、ここが workers-ai の実質ブロッカー。
- **tester** `HttpSpeechConnectionTester.ping`（`app/core/application/di/speechConnectionTester.ts` L36-39）: `trimmedKey.length === 0` で `adapter.ping` 到達前に「API key is empty」で短絡。

このまま `deepgram-workers-ai` を選んでも API キーが無いと保存・接続テスト・consumer 解決の各所で永久にブロックされる。UI 側 `apiKeyRequired` の抑制はクライアント検証を通すだけでサーバの各ゲートは残る。

### Decision
Workers AI provider を **「apiKey 不要・AI binding 依存」** として扱うよう、**上記 6 箇所すべての apiKey ゲートを keyless 述語で一貫分岐**する（domain service 1 + application 5）。

**判定述語は domain SSOT に置く。** 「この provider は apiKey を要するか」は、真の domain service `assertSpeechEnvOverride`（`SpeechEnvOverrideMissingKey` を throw）と、domain の error code を使う application usecase `updateSpeechConfig`（`SpeechProviderChangedRequiresApiKey`）の**両方**の判定に使うため、述語は application/DI ヘルパではなく domain（`valueObject.ts`）に置く（例: `SpeechRecognitionConfig.requiresApiKey(provider)` もしくは keyless provider 集合 `KEYLESS_SPEECH_PROVIDERS`）。domain service が application 層ヘルパに依存する逆流を避けるための配置であり、`service.ts` は既に同 `valueObject.ts` を import 済みなので述語を直接参照できる（SSOT を domain に置いた判断が `assertSpeechEnvOverride` の carve-out でむしろ補強される）。application/DI 側の `isWorkersAiSpeechProvider(provider)` はこの domain 述語へ委譲する薄いラッパとし、binding 系コードから domain VO を直接触らせない。

各層の分岐:
- **domain service** `assertSpeechEnvOverride`: 先頭に keyless carve-out を追加し、`requiresApiKey(cfg.provider) === false` のとき env キー欠如でも throw せず `cfg`（`env`/null のまま）を返す。usecase の `apiKeySource:'env'` 正規化がこのゲートを踏み抜くのを防ぐ（round-2 [P-001]）。
- **usecase** `updateSpeechConfig`: keyless のとき providerChanged-requires-apiKey を免除し、draft を `apiKeySource:'env'`/ciphertext null に**明示正規化**（旧 ciphertext を引き継がない）。keyless で operator が誤入力した apiKey は silently drop される旨を JSDoc に明記（round-2 [S-002]）。
- **usecase** `testSpeechConnection`: keyless のとき resolvedKey 空でも tester に到達させる。
- **DI request** `buildSpeechRecognitionProvider`: keyless のとき非 Stub の配線条件を「`AI` binding が注入されている **かつ** model がある」に切り替える（apiKey 不問）。binding 未注入なら Stub。
- **DI consumer** `resolveConsumerSpeechConfig`: 3 項 early-return を「keyless は apiKey null を許容」に分岐（`apiKey: ""` を返す。単に空文字を返すのではなく early-return 条件自体を変える）。REST の apiKey 必須は従来どおり。
- **tester** `HttpSpeechConnectionTester.ping`: keyless のとき empty-key 短絡をスキップし `adapter.ping(cfg, "", timeoutMs, { ai })` に進む。
- **SecretBox 暗号化は workers-ai には非適用**（保管すべき鍵が無い）。AC の「SecretBox 暗号化（該当する場合）」の「該当する場合」に該当しない旨を spec に明記。`apiKeySource` は `env` 固定相当で扱う（DB 暗号鍵行を持たない）。

### Consequences
- 良い点: 「API キーを Cloudflare 側に寄せる」という Issue の狙いが保存・接続テスト・consumer 解決の全経路で実現。keyless 述語を domain SSOT に集約したので、domain service・usecase・DI・tester がドリフトしない。既存 REST 経路の apiKey 必須ロジックは無改修。
- トレードオフ: apiKey ゲートが単一箇所ではなく **domain service 1（`assertSpeechEnvOverride`）+ application 5（usecase 2 + DI 2 + tester 1）の 6 箇所**に散在していたため、keyless 分岐も 6 箇所に入る（当初「DI ゲートのみ・usecase 変更なし」という plan 前提は誤りで、round-1 で 5 箇所、round-2 で domain service を加えて 6 箇所に確定した）。`env > db > stub` フォールバックの意味が provider 種別で分岐する（REST=apiKey 駆動、workers-ai=binding 駆動）。この非対称は spec と domain service / DI / usecase の JSDoc に明記する。UI の API キー欄も workers-ai 選択時は「不要（Cloudflare 管理）」表示に分岐が要る（ただしクライアント抑制だけでは不十分でサーバ側 6 箇所の分岐が必須）。

---

## ADR-005: Workers AI provider の接続テスト（ping）は「binding 存在確認」とする

### Status
Accepted

### Context
REST provider の probe は認証 / モデル存在を軽量エンドポイントで確認する（openai=`GET /models/{model}`、deepgram=`GET /v1/projects`、gemini=`pingGemini`）。Workers AI には probe 用の HTTP エンドポイントも検証すべき API キーも無い（認証は Cloudflare 側）。ADR-006（#701）は「probe で実音声を送らない」を要求する。`SpeechConnectionTester.ping(cfg, apiKey, timeoutMs)` は binding を受け取らない現行シグネチャ。

### Decision
`deepgramWorkersAiSpeechAdapter.ping` は **`deps.ai`（AI binding）の存在をもって `ok:true`**、未注入なら `ok:false`（error: 例 `"AI binding is not configured"`）とする。実 `env.AI.run` は呼ばない（課金 / 実音声不要 / ADR-006 踏襲）。

- そのため `HttpSpeechConnectionTester` に `ai?: Ai` を注入し（コンストラクタ、container から）、`adapter.ping` に `deps` として渡す。
- REST provider の ping は `deps` を無視するので無改修。

### Consequences
- 良い点: probe で実音声も課金も発生しない。binding 配線ミスを接続テストで検出できる。
- トレードオフ: 「binding があるが Deepgram-via-WAI が実際に webm/opus を受理するか」までは probe では保証しない（REST の auth-only probe と同水準の弱さ）。フォーマット受理は ADR-006 の実機検証で担保。

---

## ADR-006: PoC は「型契約による静的検証（本 Issue 内）＋ staging での implement-then-verify / revert（webm/opus 受理）」で代替する

### Status
Accepted（戦略として採用）。**webm/opus 受理の実機確認は staging で実施・未確定**（この dev 環境からは実 env.AI binding に到達不可）。

### Context
Issue は「ADR 決定の前に、Workers AI 経由が webm/opus を受理しレスポンス shape が REST と互換かを、実際に録音したファイルで小さく PoC 検証する」ことを求める。しかし本開発環境には実 Cloudflare アカウント / `env.AI` binding / Deepgram-via-WAI の実疎通手段が無い。Workers AI はローカルモック（miniflare）を持たず、`wrangler dev` の AI binding も実アカウント認証で remote API を叩くため、実キー無しでは疎通できない。

一方、調査で PoC 懸念の一部は**型契約で静的に裏取りできる**ことが判明した:

- **レスポンス shape の REST 互換性:** `Ai_Cf_Deepgram_Nova_3_Output`（index.d.ts L9405）は `results.channels[].alternatives[].transcript` で、既存 `DeepgramSpeechRecognitionProvider`（REST）が読む shape と**完全一致**。既存 REST アダプターの transcript 抽出ロジックをそのまま流用できる（型で担保）。
- **入力契約:** `Ai_Cf_Deepgram_Nova_3_Input` は `audio: { body: object; contentType: string }` を要求し、`encoding?: "...|opus|..."`・`language?`・`smart_format?` を任意で受ける。webm/opus は `audio.contentType` に mime を渡す形で投入する契約。

### Decision
PoC を 2 段構えで代替する:

1. **静的契約検証（本 Issue 内で完了）:** `@cloudflare/workers-types` の `Ai_Cf_Deepgram_Nova_3_Input/Output` を authoritative な契約として採用し、レスポンス shape の REST 互換性を型レベルで確定する（本 ADR に記録済み）。アダプターは `env.AI.run("@cf/deepgram/nova-3", { audio: { body, contentType: input.mime }, ... })` を型付きで呼び、出力を既存 REST の抽出ロジック（`results.channels[0].alternatives[0].transcript`）で処理。fetch モックではなく `Ai` binding のフェイク（`run` を差し替えたスタブ）で 2xx/4xx 相当・空 transcript・timeout・binding 未注入を単体テスト。
2. **webm/opus 受理は staging で implement-then-verify / revert（#766 ADR-003 と同型）:** 実装を本番形の独立コミットで main へ入れ、実 `env.AI` + 実録音 webm/opus が揃う staging で受理可否を確定する。opt-in（既定 `openai` 据え置き・明示選択時のみ作動）なので先マージでも既存経路は無傷。受理 NG（webm/opus が拒否）なら実装コミットを `git revert`（spec/ADR 更新は別コミットで revert 対象外）。

**偽陽性に注意（#766 ADR-003 から継承・重要）:** `runIngestionJob` の audio 経路は configured provider の `SpeechFailureError` を握り潰し空 transcript で「成功」扱いする（`if (isSpeechFailureError(error)) return ""`）。したがって受理判定は「ノート保存が成功したか」では決めず、**adapter／ネットワーク層で実 `env.AI.run` が非空 transcript を返したことを直接確認**して下す。staging 検証でもこの判定基準を適用する。

### Consequences
- 良い点: レスポンス shape 互換という PoC の主要懸念を型で先に潰せる。実装は diff-only + opt-in なので、捨て PoC を書くより本番形で検証する方が二度手間が無く、NG 時も原子的に revert できる。
- トレードオフ: webm/opus 受理は本 Issue のマージ時点では未確定（staging 依存）。main に「受理未確定の workers-ai provider」が opt-in で載る期間が生じる（既定 openai のため一般利用者には不可視）。
- 引き継ぎ: 受理 NG の場合、録音 UI 側の webm→ogg/opus 変換や `encoding` 明示指定は本 Issue のスコープ外（別 Issue）。NG の根拠（拒否 mime・status・エラー）を本 ADR に追記する。

---

## ADR-007: `AiOptions.signal` は存在するが timeout 実装には使わず `Promise.race` を採る（実装時判断）

### Status
Accepted（実装中に plan/ADR-006 の前提の誤りを発見して確定）

### Context
plan.md（リスク節・ステップ 3）と ADR-006 は「`AiOptions`（`@cloudflare/workers-types` index.d.ts）には `AbortSignal` も timeout フィールドも**無い**」を前提に、workers-ai の timeout を `Promise.race` + 自前タイマーで満たす設計にしていた。実装時に本リポジトリ同梱の `@cloudflare/workers-types@4.20260511.1` の `AiOptions` を実確認したところ、**`signal?: AbortSignal` フィールドが存在する**（`queueRequest`/`websocket`/`tags`/`gateway`/`returnRawResponse`/`prefix`/`extraHeaders`/`signal`）。plan の「signal 無し」という事実主張は、この版では誤りだった。

### Decision
それでも **`Promise.race` + 自前タイマー（`SpeechFailureError` を reject）** を採用し、`AiOptions.signal` は**使わない**。理由:

- **決定性**: workerd が AI 実行（`env.AI.run`）に対して `signal` を実際に honor して中断・reject するかは、dev から実 binding に到達できない本環境では検証不可（ADR-006 と同じ制約）。`Promise.race` は下層の挙動に依存せず port の timeout 契約（`SpeechFailureError`）を必ず満たす。
- **テスト容易性**: adapter 単体テストは `Ai` binding のフェイク（`run` 差し替え）で回す。フェイクは `signal` を honor しないので、`signal` に依存する timeout はテストで固定できない。`Promise.race` タイマー経路はフェイクでも決定的に発火する。
- **REST 契約との非混同**: plan の意図どおり REST の `AbortController`/`DOMException(AbortError)` 判定は流用しない（`run()` は fetch signal 駆動ではないため AbortError は発生しない）。

### Consequences
- 良い点: dev で検証不能な runtime 挙動に依存せず timeout 契約を保証。テストが決定的。
- トレードオフ: `Promise.race` はタイマー発火後も下層 `run()` をキャンセルしないため、バック側の Workers AI 実行は継続し課金され得る（provider の JSDoc に明記）。`signal` を渡せば実キャンセルの可能性はあるが、上記の決定性・テスト容易性・runtime 不確実性を優先した。staging で実 binding が使える段階で `signal` の honor 可否が確認できれば、`Promise.race` を保ったまま `signal: AbortSignal.timeout(timeoutMs)` を**追加**する余地は残る（本 Issue では見送り）。

---

---

## ADR-008: `env.AI` binding はローカル `wrangler.toml` には宣言せず、staging/production の infra テンプレートにのみ宣言する（ブラウザ検証で発見）

### Status
Accepted（Phase 2 ブラウザ検証で `pnpm dev` の boot 不能を実測して確定。当初 plan ステップ 12 は「ローカル `wrangler.toml` の web worker と `[env.consumer]` にも `[ai]` を追加」としていたが、実測に基づき修正）

### Context
plan は `[ai] binding = "AI"` をローカル `wrangler.toml` にも足し「ローカル dev の AI binding は実アカウント認証依存」とコメントで注記する方針だった。実装後にローカルで `pnpm dev`（`vite dev --config vite.config.cloudflare.ts`、`@cloudflare/vite-plugin` 経由の miniflare）を起動したところ、次のエラーで**起動そのものが失敗**した:

```
Failed to start the remote proxy session ...
You must be logged in to use wrangler dev in remote mode. Try logging in, or run wrangler dev --local.
```

Workers AI はローカルモック（miniflare のローカルエミュレーション）を持たないため、`[ai]` を宣言すると dev サーバは AI binding のために remote-proxy セッションを張ろうとし、`wrangler login` 未認証の環境では boot 前に落ちる。これは `deepgram-workers-ai` を選んだときだけでなく、**すべての開発者の `pnpm dev` を無条件に壊す**（speech に無関係な開発も含む）。ローカルの `wrangler.toml` はコミット対象で全開発者が共有するため、影響は全員に及ぶ。

### Decision
ローカル `wrangler.toml`（web worker / `[env.consumer]` 双方）からは `[ai]` binding を**宣言しない**。代わりに、なぜ省くのか・ローカルで有効化するには `wrangler login` して手動で `[ai]` を足す旨をコメントで残す。binding は staging/production を生成する `infra/templates/wrangler.{staging,production}.toml.tmpl`（web worker + `[env.consumer]`）にのみ宣言する。

- ローカルでは binding 不在が既定。DI（`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig`）は binding 未注入時に **Stub speech provider にフォールバック**するため、`deepgram-workers-ai` を選んでもローカルでは graceful に degrade する（ブラウザ検証 TC-4 で「AI binding is not configured」による ping 失敗＝ゲート通過を確認済み）。
- 実文字起こし・webm/opus 受理・E2E は元々 staging 依存（ADR-006）なので、ローカルに binding を置く実利は無く、破壊的副作用（boot 不能）だけが残る。

### Consequences
- 良い点: 全開発者の `pnpm dev` が無認証で従来どおり起動する。keyless provider のローカル UI 検証（選択・保存・接続テストのゲート通過）は binding 不在でも成立する。設計意図（ローカルは Stub、実疎通は staging）とも一致。
- トレードオフ: ローカルで Workers AI の実疎通を試したい開発者は `wrangler login` のうえ手動で `[ai]` を足す必要がある（コメントに手順を明記）。ローカル config と staging/production テンプレートとで binding 宣言の有無が非対称になる（コメントで理由を明示して吸収）。
