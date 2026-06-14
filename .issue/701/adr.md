# ADR — Issue #701: 録音＋文字起こしによるノート化

## ADR-001: 文字起こしプロバイダに OpenAI `gpt-4o-transcribe` を第一段採用する

### Status
Proposed

### Context
取り込みパイプラインの `audio` 分岐は `SpeechRecognitionProvider.transcribe` を呼ぶよう既に配線済みだが、実アダプタが無く `StubSpeechRecognitionProvider` が常に `BusinessRuleError` を投げる。実プロバイダを選定する必要がある。Issue コメントの調査（deep-research、22 ソース / 92 主張を敵対的検証）では Cloudflare Workers 適性・ブラウザ録音（webm/opus 中心）の日本語音声・既存 Gemini 採用を条件に、`OpenAI gpt-4o-transcribe > Deepgram Nova-3 > Gemini audio > Google Cloud STT v2` という順位だった。候補ごとのトレードオフ:

- **OpenAI gpt-4o-transcribe**: REST `/audio/transcriptions`・Bearer 認証・SDK 不要。webm/m4a/mp3 明示対応・25MB 上限でブラウザ録音をそのまま流せる。日本語精度の評判良。Workers AI 経由でも呼べる。
- **Deepgram Nova-3**: 最安（約 $0.0052/分の確証あり）だが付加機能・日本語評価の情報が薄い。
- **Gemini audio**: 構造化（structureToHtml）と API 統一できる魅力があるが、**webm/m4a ネイティブ対応が不確実**。
- **Google Cloud STT v2**: 60 秒超で非同期バッチ + GCS 必須、Workers と相性が悪い。

ユーザー方針: OpenAI `gpt-4o-transcribe` を採用、registry で後から差し替え可能にしたうえでまず 1 プロバイダ疎通。

### Decision
第一段は **OpenAI `gpt-4o-transcribe`** を REST `/v1/audio/transcriptions`（multipart/form-data, Bearer 認証）で実装する。LLM の OpenAI アダプタ（`messagesClient` の URL 合成・secret masking）と対称に組む。Gemini への統一は録音フォーマット対応の不確実性ゆえ採らず、「構造化は Gemini / 文字起こしは OpenAI」の住み分けを許容する。registry パターンで複数プロバイダを切り替え可能にし、後から Deepgram 等を差し替えられる構造にする。Cloudflare Workers AI（`env.AI`）経由は後続最適化とし、初版は素の REST で疎通させる。

### Consequences
- 良い点: webm をそのまま流せて録音 UI の変換が不要。日本語精度が高い。LLM アダプタと対称で実装コストが低い。registry で将来差し替え可能。
- トレードオフ: 25MB 上限が録音長の制約になる。Workers 上での multipart `fetch` は PoC で確認が要る。文字起こしと構造化でプロバイダが分かれる（API 統一の単純さは失う）。

---

## ADR-002: Speech registry を LLM registry と分離する

### Status
Accepted

### Context
LLM 側には `app/core/adapters/llm/registry.ts` があり、`ProviderAdapter = { llm, ocr, pdf, ping }` を `Record<LLMProvider, ProviderAdapter>` で束ねている。Speech も同型を流用するか、専用 registry を新設するかの判断が要る。LLM registry のアダプタは llm/ocr/pdf の 3 ポートをバンドルしており、`LLMProvider`（anthropic/openai/gemini）でキーされる。Speech プロバイダの集合（当面 openai のみ、将来 deepgram 等）とポート（transcribe のみ）は LLM と異なる。

### Decision
**Speech 専用 registry** を `app/core/adapters/speech/registry.ts` に新設する。`SpeechAdapter = { create(cfg): SpeechRecognitionProvider; ping(...) }` を `Record<SpeechProvider, SpeechAdapter>` で束ね、`lookupSpeechAdapter(provider)` を公開する。barrel は LLM と同じく `import type` のみで registry に依存し value cycle を避ける。

**barrel 配置の確定（Round 1 arch S-005）:** 既存 `app/core/adapters/openai/index.ts` は `openaiAdapter satisfies ProviderAdapter`（LLM registry 用）を export 済みで、`import type { ProviderAdapter } from "../llm/registry"` のみ依存して value cycle を回避している。Speech adapter（`openaiSpeechAdapter`）は **新規 `speechIndex.ts` を作らず、同じ `openai/index.ts` に追加 export する**。`import type { SpeechAdapter } from "../speech/registry"` を 1 行足すだけで型のみ依存を維持でき（value import しないため cycle なし）、OpenAI provider の adapter 実装が 1 ファイルに集約されて発見性も上がる。`speechProviderRegistry`（`speech/registry.ts`）は `openai/index.ts` から `openaiSpeechAdapter` を value import するが、これは registry → adapter の一方向で既存 LLM registry と同じ向き。

### Consequences
- 良い点: `SpeechProvider` 集合が `LLMProvider` と独立して進化できる。LLM registry に Speech 専用ポートを混ぜず責務が明確。`Record<SpeechProvider, SpeechAdapter>` でコンパイル時網羅。OpenAI の全 adapter（LLM/OCR/PDF/ping/speech）が `openai/index.ts` に集約され実装者が迷わない。
- トレードオフ: registry コードが 2 系統に増える（が、責務分離の利益が上回る）。`HttpSpeechConnectionTester` も `HttpLLMConnectionTester` と別に持つ。`openai/index.ts` が LLM registry と speech registry の両方に型依存する（型のみなので cycle は発生しない）。

---

## ADR-003: `SpeechRecognitionConfig` を独立 VO + 対称サービス関数として実装する

### Status
Proposed

### Context
`LLMConfig` と対称な Speech 設定 VO が必要。選択肢は (a) `AdminSettingsService` / `LLMConfig` をジェネリックに汎用化して両方で使い回す、(b) 独立した `SpeechRecognitionConfig` VO + 対称な薄いサービス関数を別途用意する。`AdminSettingsService.decryptApiKey` / `assertEnvOverride` は型注釈が `LLMConfig` で密結合しており、`LLMConfig` は `baseURL`（OpenAI 互換エンドポイント）の provider×baseURL 不変条件を内包する。Speech は当面 OpenAI 固定エンドポイントで `baseURL` 不要。

### Decision
**独立した `SpeechRecognitionConfig` VO** を作る。`provider`/`model`/`apiKeySource`/`apiKeyCiphertext` を持ち、`baseURL` は持たない（YAGNI — 将来 OpenAI 互換の別エンドポイントが必要になったら追加）。サービス関数は `AdminSettingsService` に `decryptSpeechApiKey` / `assertSpeechEnvOverride` を対称に追加する（`LLMConfig` 汎用化はしない）。`InstanceSettings` は `llm` と並列に `speech` フィールドを持つ。

### Consequences
- 良い点: それぞれの不変条件が独立して進化できる（Speech に baseURL を強制されない、LLM の openai×baseURL ロジックを Speech に持ち込まない）。型が明示的で読みやすい。
- トレードオフ: `create` / decrypt / envOverride のロジックに構造的重複が出る（が、抽象化による結合より重複を許容する方がレイヤーの意図が明確）。

---

## ADR-004: DB マイグレーションは nullable + default の ALTER で後方互換を取る

### Status
Proposed

### Context
`instance_settings` は singleton 行（`id = 'singleton'`）を 1 行持つ。Speech 用に `speech_provider` / `speech_model` / `speech_api_key_source` / `speech_api_key_ciphertext` を追加する必要がある。SQLite の `ALTER TABLE ADD COLUMN` は NOT NULL 列に default が無いと既存行で失敗する。`llm_base_url` 追加（`0010`）は nullable で対応した先例がある。

### Decision
`0017_add_speech_config.sql` で 4 カラムを ALTER 追加する。`speech_provider TEXT NOT NULL DEFAULT 'openai'`、`speech_api_key_source TEXT NOT NULL DEFAULT 'env'`、`speech_model TEXT`（nullable）、`speech_api_key_ciphertext TEXT`（nullable）。`speech_api_key_source IN ('env','db')` の check 制約を追加。`speech_model` を nullable にしておき、`InstanceSettings.reconstruct` 側で NULL を `defaultSpeech()` の値に縮退させる（`coerceSpeech`）。これにより既存行・古いコードが書いた行も安全に rehydrate できる。

### Consequences
- 良い点: 既存 singleton 行を壊さずマイグレーションできる。`maxNoteRevisionsPerNote`（#158）の optional-on-reconstruct パターンと一貫。
- トレードオフ: ドメイン側に NULL→default の縮退ロジックが必要（`coerceSpeech`）。スキーマ上は `speech_model` が nullable だが、VO 構築時には常に非空が保証される（reconstruct が補完するため二重防御）。

---

## ADR-005: 文字起こし失敗（=空 transcript）時は LLM 構造化をスキップし、注記入りの縮退 preview を生成する

### Status
Accepted

### Context
`spec/scenario/ingest.md` は「OCR / 音声認識失敗: 失敗箇所を明示。テキストが空でも、利用者が手動で内容を追記して保存可能」と定める。一方、現在の `runIngestionJob` は `SpeechFailureError` を `classifyPipelineError` で `speech_failure` に分類し `markFailed` する（=ジョブが failed になり preview に到達しない）。AC-6 を満たすにはこの挙動を変える必要がある。

**実コード調査で判明した重要事実（Round 1 arch P-001 / P-002）:**

1. `runPipeline`（`runIngestionJob.ts` 261-371 行）の分岐は `kind === "html"` / `kind === "markdown"` / **`else`（その他全て）** の 3 つで、`audio` は OCR/image と同じく `else` ブロック＝**`deps.llm.structureToHtml({ rawText: text, ... })` を必ず通る**。したがって「`extractText` で空文字に縮退すれば preview に到達する」という当初の単純化は誤りで、空文字 `""` がそのまま `structureToHtml` に流れる。これは (a) 無駄な LLM 課金、(b) LLM 側の失敗で再び `markFailed` され AC-6 が崩れる、(c) consumer パスで LLM が Stub のとき空入力に対する Stub 挙動次第で結果が不定、というリスクを生む。
2. `ContentHtml.create("")` は **空文字を許容**する（`note/valueObject.ts` 148-159 行、検査は 1 MiB 上限のみ）。空本文の preview 構築は VO 不変条件を通る。
3. `NoteTitle.create("")` は **空文字を弾く**（`TitleEmpty` を throw、95-118 行）。ただし `runPipeline` は既に `titleSuggestion.trim().length > 0 ? titleSuggestion : fallbackTitle(deps.originalFileName)` でガードしており、`fallbackTitle` は最悪でも `"Untitled"` を返すため、タイトルは安全。
4. 失敗情報の格納先: `IngestionPreview` VO には現在 failure フィールドが無く、失敗情報は `IngestionJob` 集約側（`FailedIngestionJob.errorCode/errorReason`）にしか無い。`markFailed` 経路を使わず `previewing` に到達させると、`IngestionJob` のエラーフィールドは埋まらない。`IngestionPreview` は commit / wire / プレビュー画面の 10〜15 箇所で消費されるため、VO へのフィールド追加は中規模波及。

### Decision
**audio かつ transcript が空（=`SpeechFailureError` を catch して空文字に縮退、または正常に空文字＝無音が返った）場合、LLM 構造化（`structureToHtml` / `suggestMetadata`）をスキップし、`fallbackTitle(originalFileName)` ＋ 失敗注記を含む最小プレースホルダ HTML で preview を生成する。**

具体的に `runPipeline` を次のように変更する:

1. `extractText` の `case "audio"` で **`SpeechFailureError` のみ** を `try/catch` し、空文字 `""` を返す（catastrophic な文字起こし失敗・無音を空文字に縮退）。**`SpeechFailureError` 以外の例外（特に未設定時 Stub の `BusinessRuleError('unsupported_format')`）は catch せず素通しする**（後述「未設定時の扱い」）。
2. `runPipeline` で `text` が空（`text.trim().length === 0`）かつ `kind === "audio"` のとき、`else`（LLM）ブロックに入る前に **early-return 相当の縮退分岐**を設ける。**注意: `suggestMetadata`（`runIngestionJob.ts` 335-338 行）は if/else の外＝全 kind 共通経路にあるため、`else` をスキップするだけでは `suggestMetadata` が残る。縮退分岐は if/else の前で preview を組み立てて return し、335-355 行の metadata/タグ解決ブロック自体を回避する構造にする（Round 2 arch S-002）:**
   - `titleSuggestion = fallbackTitle(deps.originalFileName)`
   - `html` = 失敗注記の固定 HTML 定数（後述）。これは**信頼済みの定数なのでサニタイザを通さず**そのまま `ContentHtml.create(html)` に渡す（サニタイザの契約は untrusted 入力向け）。
   - `directorySuggestion = null`、`metadata` 推定もスキップ（`suggestedTagNames: []`）
   - `structureToHtml` / `suggestMetadata` は呼ばない（空入力で LLM を叩かない＝課金回避・再 `markFailed` 回避）。
3. **失敗の明示手段は「本文 HTML 先頭の注記＋空相当の本文」方式を採用し、`IngestionPreview` VO へのフィールド追加は行わない。** 理由: VO 変更は 10〜15 箇所に波及するのに対し、注記方式は `runPipeline` 内で完結し、既存のプレビュー画面（`ContentHtml` を表示）にそのまま表示される。利用者は注記の下に本文を追記して commit できる。
   - **サニタイザ調査結果（重要）:** `app/core/adapters/sanitizer/htmlSanitizer.ts` の `GLOBAL_ATTRS`（138-145 行）は `data-internal-link` のみ許可で、未知の `data-*`（例 `data-evil`）は剥がす（テスト済み）。よって `data-ingestion-failed` をサニタイザに通すと**剥がされる**。そこで注記 HTML は**サニタイザを経由させず固定定数として `ContentHtml.create` に直接渡す**（信頼済みのため安全）。注記マーカーには既に許可されている `class`（例 `<p class="ingestion-failure-note">…</p>`）を使い、UI 側で強調したい場合はこの class を使う。`data-*` 許可リストを広げる変更は不要。
4. `classifyPipelineError` の `speech_failure` → `markFailed` 経路は **transcribe 以外の真の catastrophic（VO 構築失敗等、実装上は到達しない想定）のみ**に限定する。通常の文字起こし失敗は (1)(2) で吸収され `previewing` に到達する。

**未設定時（Stub フォールバック）の扱い（Round 2 arch P-001 で確定）:** 縮退の対象は **実プロバイダの `SpeechFailureError`（＝実際の文字起こし失敗・無音）のみ**に限定する。Speech が未設定で `StubSpeechRecognitionProvider` がフォールバックされた場合、Stub は `BusinessRuleError('unsupported_format')` を throw する（`SpeechFailureError` ではない）。これは (1) の `SpeechFailureError`-only catch を素通りし、`classifyPipelineError`（`isBusinessRuleError(error) → error.code` = `"unsupported_format"`、540 行）→ `markFailed` に落ちる。**この「未設定＝機能未提供で fail（縮退対象にしない）」を意図的挙動として採用する**。理由: 縮退 preview は「文字起こしを試みたが失敗した」状況のためのものであり、そもそもプロバイダ未設定の状態を縮退で隠すと「設定し忘れに気づけない」「空ノートが量産される」副作用がある。Stub を `SpeechFailureError` を投げる実装に寄せる案は採らない（未設定と実失敗を区別したいため）。AC-6 のスコープは「**設定済みプロバイダの transcribe 失敗**時に縮退 preview に到達する」であり、未設定時は対象外。テスト方針に Stub 経路（`unsupported_format` → `markFailed`、`previewing` に到達しない）の期待挙動を 1 ケース追加する。

これにより **AC-6 を観測可能な形**に確定する:「**設定済みプロバイダで**文字起こしに失敗した音声を取り込むと、プレビュー画面に文字起こし失敗の注記（`class="ingestion-failure-note"` を持つ段落）が表示され、本文が空相当の状態で `previewing` に到達し、利用者が本文を追記して commit できる。録音元ファイルは `MediaAsset(kind='source')` として保存される」（プロバイダ未設定時は縮退対象外で従来どおり `markFailed`）。

### Consequences
- 良い点: 利用者が文字起こし失敗時も手動で本文を補って保存でき、録音した音声（`MediaAsset(kind='source')`）も保持される。spec/scenario と一致。空入力で LLM を叩かないため無駄な課金・二次失敗が無い。`IngestionPreview` VO を変えないため波及が `runPipeline` 内に閉じる。
- トレードオフ: 失敗注記が「本文 HTML 内のマジックな段落」になるため、UI 側で特別扱い（強調表示等）したい場合は `.ingestion-failure-note` セレクタに依存する弱い結合が生まれる。将来 failure を構造的に扱いたくなったら `IngestionPreview` への optional フィールド追加にリファクタする余地を残す。
- 検証: AC-6 テストで「fake speech が `SpeechFailureError` を投げる → `structureToHtml` / `suggestMetadata` が**呼ばれない**こと（spy で 0 回。`suggestMetadata` は共通経路にあるため early-return での回避を担保）」「preview の `contentHtml` に `ingestion-failure-note` 注記が含まれること」「ジョブが `previewing` に到達すること」を確認する。**加えて Stub 経路の境界テスト「fake speech が `BusinessRuleError('unsupported_format')` を投げる → 縮退せず `markFailed`、`previewing` に到達しない」を 1 ケース追加し、縮退対象が `SpeechFailureError` のみに限定されていることを担保する（Round 2 arch P-001）。**

---

## ADR-006: 接続テストは transcribe ではなく軽量 probe で行う

### Status
Accepted

### Context
`/admin/speech` の接続テストは LLM 設定の「接続テスト」と対称に提供する。LLM 側は最小の Chat Completions リクエスト（`max_tokens: 1`）で 2xx を確認している。transcribe を疎通確認に使うには実音声ファイルが必要で、コスト・実装ともに重い。

### Decision
接続テストは transcribe を呼ばず、**`GET {baseURL}/models/{model}`（または `GET /models`）で 2xx を確認する軽量 probe** とする。`pingOpenAI`（LLM）と同様 throw せず `{ ok, reason }` を返し、`HttpSpeechConnectionTester` が `{ ok, latencyMs, error }` に正規化する。secret masking を適用する。

### Consequences
- 良い点: 実音声不要・低コスト・低レイテンシ。API キー / モデル名の妥当性（認証・モデル存在）を確認できる。
- トレードオフ: transcribe エンドポイント固有の障害（multipart 経路の問題）までは検出できない。実音声での疎通は手動/ブラウザテストで担保する。
- **AC との境界確定（Round 1 coverage P-002）:** AC-1 の「接続テストが動く」の合格条件は「probe が provider のモデル存在/認証まで確認すること」に限定する（transcribe 実音声疎通は含まない）。transcribe 経路の疎通は AC-3（音声アップロード → ノート化）と手動/ブラウザテストで担保する。これにより「接続テストは通るのに実録音で失敗する」状態を AC-1 の合格と誤判定しない。

---

## ADR-007: 録音結果は専用経路を作らず既存 upload→ingest に合流させる

### Status
Proposed

### Context
録音 UI（C）の出力をバックエンドへ渡す方法として、(a) 録音専用のサーバ関数・ユースケースを新設する、(b) 既存の `uploadFileFn`（multipart/form-data, `file.stream()`）に Blob を File 化して流す、の 2 案がある。Issue の実装方針は「録音結果も `kind='audio'` の取り込み元バイト列として既存フローに合流させる（録音専用の別経路を作らない）」と明記。`IngestionService.detectKind` は `audio/webm` を `audio` に分類済みで、commit 時の `MediaAsset(kind='source')` 保存（#452）も既存フローで動く。

### Decision
録音 UI は `MediaRecorder` で得た `Blob`（`audio/webm` 等）を `File` 化し、**既存 `uploadFileFn` に渡す**。バックエンド（`uploadFile` → `runIngestionJob` → `commitIngestionPreview`）は変更しない。録音 MIME はブラウザ差を `MediaRecorder.isTypeSupported` で吸収し、`detectKind` が受ける形式（webm/m4a/mp3 等）に収める。

### Consequences
- 良い点: バックエンド変更最小。AC-5（元ファイル保存）が既存挙動で自動的に満たされる。upload/preview/commit の状態機械・プレビュー UI を録音でもそのまま再利用できる。
- トレードオフ: 録音長 → ファイルサイズが `maxIngestionBytes`（32MiB）/ OpenAI 25MB 上限に抵触しうるため、録音 UI 側で時間/サイズ上限を設ける必要がある。Safari/Chrome で録音 MIME が割れる（`audio/mp4` vs `audio/webm`）点の分岐が要る。

---

## ADR-008: バックエンドコア（ステップ1〜13）実装時の確定事項

### Status
Accepted（実装で確定。ステップ1〜13）

### Context / Decision
ステップ1〜13 の実装中に非自明だった判断点を記録する。

- **`AdminSpeechEnv` を `AdminSettingsEnv` と別の型として新設**（`di/types.ts`）。speech は `baseURL` 軸を持たない（ADR-003）ため、`AdminSettingsEnv` を再利用すると `baseURL: null` を常に持つ歪な形になる。`{ apiKey, provider, model }` の独立型にして `RequestContainer.adminSpeechEnv` に載せた。`updateSpeechConfig` / `testSpeechConnection` / `view.ts` はこの型を参照する。
- **`maskApiKey` を構造型 `{ apiKeySource, apiKeyCiphertext }` に汎用化**（S-003 どおり）。`view.ts` の import から `LLMConfig` 型依存を外し、LLM/speech 双方から呼ぶ。`toInstanceSettingsDTO` / `toInstanceSettingsView` の speech 引数（`speechApiKeyMasked` / `speechEnv`）は **省略可能（デフォルト null）** にして、既存呼び出し（fixtures・他テスト）を壊さない後方互換を確保した。`getInstanceSettings` は `adminSpeechEnv` を渡すよう更新済み。
- **OpenAI transcribe アダプタの `file` フィールド名は MIME サブタイプ由来**（`audio.webm` 等）。OpenAI は `file` の拡張子で形式判定するため、`filenameForMime` で MIME から拡張子を best-effort 生成する（`x-` プレフィックス除去）。`messagesClient.ts` からは `DEFAULT_BASE_URL` のみ流用し、multipart 本体・URL 合成（`/audio/transcriptions`）・error masking は新規実装（JSON 専用クライアントは流用不可）。
- **`speechConnectionPing` は `GET {baseURL}/models/{model}`**（ADR-006）。`encodeURIComponent(model)` でモデル名をパスに埋め、2xx で `ok`、404/401 等は `reason` を返す（throw しない）。
- **registry の barrel 配置は ADR-002/S-005 どおり** `openai/index.ts` に `openaiSpeechAdapter` を追加（`import type { SpeechAdapter }` の型のみ依存で value cycle 回避）。`speech/registry.ts` が value import する一方向。
- **DI の Stub フォールバックは「env キー無 OR 未登録 provider」で Stub**。`buildSpeechRecognitionProvider` は env キー欠如・`lookupSpeechAdapter` 未ヒット（operator typo）いずれも `StubSpeechRecognitionProvider` に縮退させ、container 構築は必ず成功する（未設定 audio は ADR-005 どおり従来 fail）。
- **共有テスト fixtures（`app/core/application/__tests__/helpers.ts`・`app/core/adapters/d1/__tests__/helpers.ts`）に `speechConnectionTester` / `adminSpeechEnv` を追加**。`RequestContainer` に必須 2 フィールドが増えたため、これらを更新しないと全コードベースが typecheck 不能になる。担当外のステップ18 テストファイルではなく、レイヤー横断の共有ハーネスなので本ステップで対応した。

### Consequences
- 良い点: `pnpm typecheck` がクリーン。DTO 拡張が後方互換（speech 引数 optional）なので、ステップ14 の admin UI が `InstanceSettingsDTO.speech` を参照でき、既存呼び出しは無改修。
- 注意（他エージェント向け結合点）:
  - **server function / usecase シグネチャ**: `updateSpeechConfig({ container, input: { actorUserId, provider, model, apiKeyPlain } })`、`testSpeechConnection({ container, input: { actorUserId, useDraft, draftConfig } })`。`draftConfig` は `{ provider, model, apiKeySource: 'env'|'db', apiKeyCiphertext: string|null } | null`。出力は `{ ok, latencyMs, error: string|null }`。barrel `@/core/application/adminSettings` から export 済み。
  - **DTO**: `InstanceSettingsDTO.speech = { provider, model, apiKeySource, apiKeyMasked, envOverrides: { provider, model, apiKey } }`。
  - **env binding 名**: `ADMIN_SPEECH_API_KEY`（secret）/ `ADMIN_SPEECH_MODEL`（var）/ `ADMIN_SPEECH_PROVIDER`（var）。`wrangler.toml` の `[vars]` 追記とドキュメント更新は担当外（ステップ16-17）だが、env 名はこれで確定。
  - **`SpeechProvider` union は `["openai"]` 固定**。admin UI の provider select は現状 1 択。

---
