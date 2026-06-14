# 実装計画 — Issue #701: feat: 録音＋文字起こしによるノート化（録音UI / SpeechRecognitionProvider 実装 / 文字起こしプロバイダ設定を別枠化）

**Issue:** #701
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

音声をブラウザで録音し、文字起こし→構造化→ノート化できるようにする。あわせて、文字起こしプロバイダ（OpenAI `gpt-4o-transcribe`）の設定を LLM 設定とは別枠で `adminSettings` に追加し、現状ハードコードされている `StubSpeechRecognitionProvider` を設定駆動の実プロバイダに置き換える。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `/admin/speech` で文字起こしプロバイダ・API キーを設定でき、`env > db` のフォールバック・`SecretBox` 暗号化保管・接続テストが動く。**接続テストは provider のモデル存在/認証を probe で確認するまでが合格条件**（transcribe 実音声疎通は含まない。ADR-006）。 | Issue 受け入れ条件1 / A | 1,2,3,4,7,8,9,11,12 |
| AC-2 | 設定で選んだプロバイダの `SpeechRecognitionProvider` が request / consumer 両パスで DI 注入され、`StubSpeechRecognitionProvider` のハードコードを置換する | Issue 受け入れ条件2 / A,B | 5,6,10 |
| AC-3 | 音声ファイルをアップロード（DropZone が `audio/*` を受理する導線。ステップ15で確認）すると文字起こし → 構造化 HTML → プレビュー → ノート保存まで通る。**transcribe の実音声疎通はここ（と手動テスト）で担保する**。 | Issue 受け入れ条件3 / B | 5,6,10,13,15 |
| AC-4 | ブラウザでマイク録音 → そのまま取り込み → ノート化できる。録音中状態表示・取り消し・再録音・マイク権限拒否時のフォールバックがある | Issue 受け入れ条件4 / C | 14,15 |
| AC-5 | 取り込んだ音声が `MediaAsset(kind='source')` として保存され、ノート詳細の「元ファイル」行から閲覧/ダウンロードできる（Issue #452 踏襲）。録音由来 Blob（File 化）特有メタデータ（MIME/拡張子）で `mimeType`/`filename` が欠落しないことを手動 TC（ステップ16・手動テスト）で確認する。 | Issue 受け入れ条件5 | 13,14（既存フロー合流）, 16（手動TC） |
| AC-6 | 文字起こし失敗（`SpeechFailureError`）時、LLM 構造化をスキップして縮退 preview を生成し `previewing` に到達する。**プレビュー画面に文字起こし失敗の注記（`class="ingestion-failure-note"` を持つ段落）が表示され、空相当の本文のまま保存でき、利用者が本文を追記して commit できる**（ADR-005）。録音元ファイルは `MediaAsset(kind='source')` として保持される。 | Issue 受け入れ条件6 | 5 |
| AC-7 | `spec/domains/ingestion.md` / `spec/domains/adminSettings.md` / `spec/usecases/*` / `spec/pages/index.md` / `spec/manual-tests/ingest.md` / ADR を実装に合わせて更新する | Issue 受け入れ条件7 | 16,17 |

## スコープ

A（設定別枠化）+ B（プロバイダ実装）+ C（録音UI）を **1 つの PR にフルスコープで収める**（ユーザー方針2）。

### 含まれないもの
- **ユーザー個別の文字起こし設定（`UserSpeechOverride`）** — 将来拡張の余地として構造だけ意識するが実装しない（Issue 明記のスコープ外）。
- **`locale` の可変化** — 当面 `ja-JP` 固定で開始。ユーザー指定・インスタンス設定での可変化は後続 Issue（ユーザー方針3）。なお `transcribe` の入力 `locale` は既に存在し、現状 `runIngestionJob` は `"ja"` を渡している。
- **第2プロバイダ（Deepgram / Gemini audio 等）の実装** — registry パターンで拡張可能にするが、まず OpenAI 1 プロバイダのみ疎通（ユーザー方針1）。
- **Cloudflare Workers AI（`env.AI` バインディング）経由の呼び出し** — 調査メモで可能性が挙がっているが、第一段は REST `/audio/transcriptions` + Bearer 認証（LLM の HTTP アダプタと対称）で実装。Workers AI 経由は後続最適化。
- **話者分離・タイムスタンプ** — ポートの契約上スコープ外（`speechRecognitionProvider.ts` の JSDoc 明記）。

## 調査結果

### 関連ファイルと役割
- `app/core/domain/ingestion/ports/speechRecognitionProvider.ts` — `SpeechRecognitionProvider` ポート（`transcribe` / `SpeechFailureError`）。**変更不要**。空文字返却＝発話なし、catastrophic のみ `SpeechFailureError` という契約が既に明文化されている。
- `app/core/adapters/stub/speechRecognitionProvider.ts` — 常に `BusinessRuleError('unsupported_format')` を投げるスタブ。DI 置換後も「未設定時フォールバック」として残す（LLM の `StubLLMProvider` と対称）。**Stub の `unsupported_format` は `SpeechFailureError` ではないため ADR-005 の縮退対象外**で、未設定時の audio は従来どおり `markFailed` される（Round 2 arch P-001 で確定）。
- `app/core/application/ingestion/runIngestionJob.ts` — `runPipeline` の `extractText` に `case "audio"` が既に存在し `deps.speech.transcribe({ audioBytes, mime, locale: "ja" })` を呼ぶ（513-519 行）。**音声フロー自体は配線済み**。失敗時は `classifyPipelineError` が `speech_failure` を返し `markFailed` するため、**AC-6（空テキストでプレビュー保存）は現状未対応** → 本 Issue で対応が必要。
- `app/core/domain/ingestion/service.ts` — `IngestionService.detectKind` が `audio/*` プレフィックスと `webm/m4a/mp3/wav/flac/ogg` 拡張子を `audio` に分類済み。録音の `audio/webm` はそのまま通る。**変更不要**。
- `app/core/application/ingestion/uploadFile.ts` — `bodyStream` から `IngestionJob(kind=audio)` を生成し temp storage にステージ。録音 Blob も File 化すればこの経路に合流できる。**変更不要**。
- `app/core/application/ingestion/commitIngestionPreview.ts` — commit 時に temp バイト列を `${ownerId}/source/${mediaId}` へコピーし `MediaAsset(kind='source')` を作成、`note.sourceFileId` に束縛（#452）。音声も既存フローでそのまま保存される。**変更不要**（AC-5 は既存挙動で満たす）。
- `app/components/ingestion/UploadForm.tsx` / `UploadDialog.tsx` / `actions.ts` — DropZone と `uploadFileFn`（multipart/form-data、`file.stream()` 転送）。録音 UI はここに並ぶ導線を追加し、`uploadFileFn` を再利用する。

### LLMConfig 系の雛形（A の対称実装の起点）
- ドメイン VO: `app/core/domain/adminSettings/valueObject.ts` の `LLMConfig`（116-253 行）。`provider`/`apiKeySource('env'|'db')`/`apiKeyCiphertext` の不変条件（db のとき ciphertext 必須、env のとき null 必須）を持つ。
- エンティティ: `app/core/domain/adminSettings/entity.ts` の `InstanceSettings`（`llm: LLMConfig` フィールド、`defaultLLM()`、`updateLLM()`、`reconstruct()`）。
- ドメインサービス: `app/core/domain/adminSettings/service.ts`（`decryptApiKey` / `encryptApiKey` / `assertEnvOverride`）。**`LLMConfig` 型に密結合**（型注釈が `LLMConfig`）→ 速度を保つには `SpeechConfig` 用に対称な薄いサービス関数を別に用意する（ADR-003 参照）。
- ユースケース: `updateLLMConfig.ts` / `testLLMConnection.ts`。
- DI: `serverCloudflare.ts` の `createRequestContainer`（645 行で `speechRecognitionProvider: new StubSpeechRecognitionProvider()` ハードコード）、`buildLlmProvider`（542-555 行、env キー未設定なら Stub）、`createConsumerContainer` / `resolveConsumerLlmConfig`（DB 行読み出し + 復号 + override）、`adminSettingsEnv` 組み立て（669-686 行）。`types.ts` の `RequestContainer`（`speechRecognitionProvider` 180 行、`adminSettingsEnv` 226 行）。
- 接続テスト: `app/core/application/di/llmConnectionTester.ts`（`HttpLLMConnectionTester`、registry の `ping` にディスパッチ）、ポート `app/core/domain/adminSettings/ports/llmConnectionTester.ts`。
- registry: `app/core/adapters/llm/registry.ts`（`factoryProviderRegistry: Record<LLMProvider, ProviderAdapter>` でコンパイル時網羅。barrel は `import type` のみ依存で value cycle を回避）。
- アダプタ barrel: `app/core/adapters/openai/index.ts`（`openaiAdapter satisfies ProviderAdapter`）、`connectionPing.ts`（`pingOpenAI`：最小リクエスト→2xx で ok、throw しない）。
- 管理画面: `app/routes/admin/llm.tsx`（RSC レンダー）、`app/components/admin/LLMSettingsForm/{Page,index,action}.tsx`、`app/routes/admin/route.tsx` の `ADMIN_NAV`（107 行に「LLM 設定」）と side-effect import 群（15-20 行）。
- DB: `app/core/adapters/d1/schema.ts` の `instanceSettings`（757-785 行、`llm_provider`/`llm_model`/`llm_base_url`/`llm_api_key_source`/`llm_api_key_ciphertext` + `key_source_enum` チェック制約）。`app/core/adapters/d1/repositories/instanceSettingsRepository.ts`（`toEntity` の列→フィールドマッピング、`save` の逆方向）。マイグレーションは `app/core/adapters/d1/migrations/`（連番、最新は `0016`）。
- SecretBox: ポート `app/core/domain/adminSettings/ports/secretBox.ts`、`app/core/application/adminSettings/decryptWithFallback.ts`（current → previous 鍵フォールバック）。

### あるべきアーキテクチャ
- ヘキサゴナル + DDD。依存は内向き（presentation → application → domain、adapter は port を実装）。
- 検証は 2 点のみ：transport 境界（zod schema）と VO 構築（業務不変条件）。中間は静的型を信頼。
- `*ErrorCode` の値は `lower_snake_case` で `BusinessRuleError('...')` の文言と一致（`errorCodeNaming.test.ts` が強制）。
- API キーは `env > db` 優先、DB は `SecretBox` 暗号化、未設定時 Stub フォールバック（ADR-004 / Issue #101 ADR-007 の方針）。
- registry パターン：`Record<ProviderId, Adapter>` でコンパイル時網羅、barrel は型のみ依存。

### 既存実装の状態（あるべき姿との一致/乖離）
- **一致**: 取り込みパイプライン（`audio` 分岐・`detectKind`・upload→preview→commit・`MediaAsset(kind='source')`）は配線済みで「変更最小」要件を満たせる。ポート `SpeechRecognitionProvider` も契約が確定済み。
- **乖離1（本 Issue で解消）**: `adminSettings` に Speech 設定が無い。`InstanceSettings` は `llm` 単独。→ `SpeechConfig` VO と `speech` フィールドを追加。
- **乖離2（本 Issue で解消）**: `speechRecognitionProvider` が request/consumer 両パスで Stub ハードコード。→ 設定駆動の factory に置換。
- **乖離3（本 Issue で解消）**: 文字起こし失敗時に空テキストでプレビュー保存できない（`markFailed` される）。spec/scenario の方針「テキストが空でも保存可能」と乖離。→ `runIngestionJob` で `SpeechFailureError` を空文字に縮退させ、**空 transcript 時は LLM 構造化をスキップ**して `class="ingestion-failure-note"` 注記入りの縮退 preview を生成（ADR-005）。
- **設計判断**: `AdminSettingsService` は `LLMConfig` に密結合のため、Speech に流用せず対称な薄いサービス関数を新設（ADR-003）。registry は LLM registry（llm/ocr/pdf/ping をバンドル）と責務が違うため Speech 専用 registry を新設（ADR-002）。

### 依存関係
- DB マイグレーション（既存 `instance_settings` 行へカラム追加・nullable）→ repository マッピング → entity/VO → DI。
- DI 変更は request パス（admin 画面・接続テスト）と consumer パス（worker の取り込み）の両方に波及。
- 録音 UI は `uploadFileFn` 再利用なのでバックエンド変更不要だが、SSR/CSR の `"use client"` 境界に注意（`MediaRecorder` はブラウザ専用）。

## 設計

### ドメインモデルへの影響
- **新規 VO `SpeechRecognitionConfig`**（`app/core/domain/adminSettings/valueObject.ts`）。`LLMConfig` に対称：
  - フィールド: `provider: SpeechProvider`（当面 `["openai"]` の literal union）、`model: string`（例 `gpt-4o-transcribe`、1..120）、`apiKeySource: 'env' | 'db'`、`apiKeyCiphertext: string | null`。
  - 不変条件: `db` のとき ciphertext 必須／`env` のとき null 必須（`LLMConfig` と同一ロジック）。
  - **`baseURL` は持たない**（OpenAI 固定エンドポイント `/v1/audio/transcriptions`。将来 OpenAI 互換の別エンドポイントが必要になったら追加。YAGNI）。
  - ブランド型 + `create` ファクトリ。`providers` / `apiKeySources` を静的公開（フォームの選択肢用）。
- **`SpeechProvider` literal union**（`["openai"] as const`）。INVARIANT コメントで `speechProviderRegistry` との対応を明記（`Record<SpeechProvider, SpeechAdapter>` でコンパイル時網羅）。
- **エンティティ `InstanceSettings` に `speech: SpeechRecognitionConfig` を追加**（`app/core/domain/adminSettings/entity.ts`）:
  - 型定義に `speech` フィールド追加、`default()` に `defaultSpeech()`（`provider: 'openai'`, `model: 'gpt-4o-transcribe'`, `apiKeySource: 'env'`, `apiKeyCiphertext: null`）を追加。
  - `updateSpeech(settings, speech, now)` 操作を追加（`updateLLM` と対称、version インクリメント）。
  - `reconstruct()` の入力型に `speech` を追加。**後方互換**: 既存 DB 行（speech 列が NULL）の rehydrate は `defaultSpeech()` に縮退させる（`maxNoteRevisionsPerNote` の optional パターンと同様、`coerceSpeech` で吸収）。
- **新規エラーコード**（`app/core/domain/adminSettings/errorCode.ts`）: `InvalidSpeechProvider` / `InvalidSpeechModel` / `InvalidSpeechModelTooLong` / `InvalidSpeechApiKeySource` / `InvalidSpeechApiKeyCiphertext` / `SpeechProviderChangedRequiresApiKey` / `SpeechEnvOverrideMissingKey`。値は `lower_snake_case`（`errorCodeNaming.test.ts` 準拠）。
- **新規ポート `SpeechConnectionTester`**（`app/core/domain/adminSettings/ports/speechConnectionTester.ts`）: `ping(cfg: SpeechRecognitionConfig, apiKey): Promise<{ ok, latencyMs, error? }>`。`LLMConnectionTester` と対称。
- **ドメインサービス**: `AdminSettingsService` は `LLMConfig` 密結合のため流用不可。`SpeechRecognitionConfig` 用に `decryptSpeechApiKey` / `assertSpeechEnvOverride` を同 `service.ts` に追加（薄い対称関数。ADR-003）。

### ユースケース / アプリケーションロジック
- **`updateSpeechConfig`**（`app/core/application/adminSettings/updateSpeechConfig.ts`）: `updateLLMConfig` を雛形に。admin 認可 → 現行 `InstanceSettings` ロード → provider 変更時の apiKey 必須チェック → `apiKeyPlain` を `SecretBox.encrypt` → `assertSpeechEnvOverride` で env 優先 → `InstanceSettings.updateSpeech` で保存。env override の silent-skip ログも対称に。
- **`testSpeechConnection`**（`app/core/application/adminSettings/testSpeechConnection.ts`）: `testLLMConnection` を雛形に。draft or 永続設定の `SpeechRecognitionConfig` を構築 → `env > db` で apiKey 解決 → `container.speechConnectionTester.ping` → `{ ok, latencyMs, error }` を返す（throw しない）。
- **`getInstanceSettings`**: 既存 DTO 射影に `speech` を含める（`view.ts` の projection を確認・拡張）。フォーム初期値に必要。
- **`runIngestionJob` の失敗縮退**（AC-6）: 実コード調査の結果、`runPipeline`（261-371 行）の分岐は `html` / `markdown` / **`else`** の 3 つで、`audio` は OCR/image と同じく `else`＝**`deps.llm.structureToHtml({ rawText: text })` を必ず通る**。当初の「空文字に縮退すれば preview に到達」は、空文字が `structureToHtml` に流れてしまうため不十分（無駄な課金・二次 `markFailed`・Stub 挙動依存のリスク）。**よって ADR-005 で「audio かつ transcript が空のとき LLM 構造化（`structureToHtml`/`suggestMetadata`）をスキップし、`fallbackTitle` ＋ 失敗注記入りの最小プレースホルダ HTML で preview を生成する」と確定**。`extractText` の `audio` 分岐で `SpeechFailureError` を catch して空文字に縮退し、`runPipeline` 冒頭で `kind==="audio" && text.trim()===""` を判定して LLM を呼ばない縮退分岐に入る。失敗の明示は **本文 HTML 先頭の `<p class="ingestion-failure-note">…</p>` 注記**（サニタイザは `data-*` を剥がすが `class` は許可されるため。固定定数なのでサニタイザは通さず `ContentHtml.create` へ直接）で行い、`IngestionPreview` VO へのフィールド追加はしない（VO は 10〜15 箇所に波及するため。`ContentHtml.create("")` は許容、`NoteTitle` は既存 `fallbackTitle` ガードで安全、という VO 検証済み）。`speech_failure` での `markFailed` は VO 構築失敗等の真の catastrophic のみに限定。

### アダプター / 永続化 / 外部連携
- **OpenAI transcribe アダプタ**（`app/core/adapters/openai/speechRecognitionProvider.ts`）: `SpeechRecognitionProvider` を実装。`POST {baseURL}/audio/transcriptions`（既定 `https://api.openai.com/v1`）に multipart/form-data（`file` = audio Blob, `model`, `language` = locale 由来）を送信、`text` を返す。非 2xx / timeout / transport は `SpeechFailureError` に翻訳（空発話は空文字）。25MB 上限の超過は事前に検出して `SpeechFailureError`。
- **OpenAI ping**（`app/core/adapters/openai/speechConnectionPing.ts` または既存 `connectionPing.ts` に追加）: 最小の疎通確認。transcribe は実音声が要るため、**モデル一覧 `GET {baseURL}/models/{model}` か `GET /models` で 2xx を確認**する軽量 probe にする（実音声を送らない。ADR-006）。throw せず `{ ok, reason }`。
- **Speech registry**（`app/core/adapters/speech/registry.ts`）: `SpeechAdapter = { create(cfg): SpeechRecognitionProvider; ping(cfg, apiKey, timeoutMs): Promise<{ok, error?}> }`、`speechProviderRegistry: Record<SpeechProvider, SpeechAdapter>` + `lookupSpeechAdapter(provider)`。barrel `app/core/adapters/openai/speechIndex.ts`（または `index.ts` に `openaiSpeechAdapter` を追加）が `SpeechAdapter` を export。
- **`HttpSpeechConnectionTester`**（`app/core/application/di/speechConnectionTester.ts`）: `SpeechConnectionTester` 実装、registry の `ping` にディスパッチ。`HttpLLMConnectionTester` と対称。
- **DB スキーマ**（`app/core/adapters/d1/schema.ts`）: `instanceSettings` に `speech_provider TEXT NOT NULL DEFAULT 'openai'`, `speech_model TEXT`（nullable: 既存行救済。reconstruct で default 補完）, `speech_api_key_source TEXT NOT NULL DEFAULT 'env'`, `speech_api_key_ciphertext TEXT` を追加。`speech_api_key_source IN ('env','db')` の check 制約を追加（既存 `key_source_enum` と対称）。
- **マイグレーション**（`app/core/adapters/d1/migrations/0017_add_speech_config.sql`）: `ALTER TABLE instance_settings ADD COLUMN ...` を4本。既存単一行（singleton）にも default が入るよう nullable + default 設計（ADR-004）。
- **repository**（`instanceSettingsRepository.ts`）: `toEntity` に speech 列→`SpeechRecognitionConfig` マッピング、`save` に逆方向を追加。
- **consumer 解決の拡張**（`serverCloudflare.ts`）: `resolveConsumerLlmConfig` と対称な `resolveConsumerSpeechConfig`（DB 行読み出し + `env > db` + 復号フォールバック）を追加し、`createConsumerContainer` で `speechRecognitionProvider` を override。`readInstanceSettingsLlmRow` と対称の speech 列 select を追加。

### UI / プレゼンテーション
- **`/admin/speech` ルート**（`app/routes/admin/speech.tsx`）: `admin/llm.tsx` を雛形に RSC レンダー。
- **`SpeechSettingsForm`**（`app/components/admin/SpeechSettingsForm/{Page,index,action}.tsx`）: `LLMSettingsForm` を雛形に。provider（当面 openai 固定だが select で将来拡張余地）・model・API キー入力・接続テストボタン。`updateSpeechConfigFn` / `testSpeechConnectionFn` server function、zod schema（`app/components/admin/schema.ts` に追加）。
- **`admin/route.tsx`**: `ADMIN_NAV` に `{ to: "/admin/speech", label: "文字起こし設定" }` を追加、`AdminNavItem['to']` union に追加、side-effect import に `SpeechSettingsForm/action` を追加。
- **録音 UI（C）**: `app/components/ingestion/AudioRecorder.tsx`（`"use client"`）。`MediaRecorder` でマイク録音 → 停止で `Blob`（`audio/webm`）→ `File` 化 → 既存 `uploadFileFn`（multipart）に流す。状態: idle / requesting-permission / recording（経過時間表示）/ stopped（プレビュー・取り消し・再録音・取り込み実行）/ permission-denied（フォールバック文言 + ファイルアップロードへの誘導）。`UploadForm` / `UploadDialog` の DropZone に並ぶ導線として配置。
- **対応形式ラベル**: 既に「音声」を含む（`SUPPORTED_FORMATS_LABEL`）。変更不要。

## 実装ステップ

依存方向の順（内側のレイヤーが先）に並べる。

### 1. エラーコード追加
- **対象ファイル:** `app/core/domain/adminSettings/errorCode.ts`
- **変更内容:** `InvalidSpeechProvider` / `InvalidSpeechModel` / `InvalidSpeechModelTooLong` / `InvalidSpeechApiKeySource` / `InvalidSpeechApiKeyCiphertext` / `SpeechProviderChangedRequiresApiKey` / `SpeechEnvOverrideMissingKey` を追加（値は lower_snake_case）。
- **理由:** VO・サービス・ユースケースが参照する。命名規約テスト（`errorCodeNaming.test.ts`）の対象。

### 2. `SpeechRecognitionConfig` VO + `SpeechProvider` union
- **対象ファイル:** `app/core/domain/adminSettings/valueObject.ts`
- **変更内容:** `SPEECH_PROVIDERS = ["openai"] as const`、`SPEECH_API_KEY_SOURCES`（`env`/`db`）、`SpeechRecognitionConfig` ブランド型 + `create`（`LLMConfig.create` のロジックを baseURL 抜きで対称化）。**INVARIANT コメントには `speechProviderRegistry` との対応に加え、各 provider の `model` 既定値の対応（`openai → 'gpt-4o-transcribe'`）も明記する**（S-004。provider 追加時にモデル既定も増える齟齬を防ぐ）。
- **理由:** ドメインの中核。illegal state を型で排除。

### 3. ドメインサービス関数追加
- **対象ファイル:** `app/core/domain/adminSettings/service.ts`
- **変更内容:** `decryptSpeechApiKey(cfg, secrets)` / `assertSpeechEnvOverride(cfg, env)` を追加（`AdminSettingsService` 既存関数と対称、`SpeechRecognitionConfig` 型）。
- **理由:** `AdminSettingsService` が `LLMConfig` 密結合のため流用不可（ADR-003）。

### 4. `InstanceSettings` に `speech` 追加
- **対象ファイル:** `app/core/domain/adminSettings/entity.ts`
- **変更内容:** 型に `speech: SpeechRecognitionConfig`、`defaultSpeech()`、`default()` への組み込み、`updateSpeech()` 操作、`reconstruct()` 入力型 + `coerceSpeech`（NULL 列 → default 縮退で後方互換）。
- **理由:** singleton 集約に Speech 設定を保持。

### 5. 取り込みパイプラインの失敗縮退（AC-6）
- **対象ファイル:** `app/core/application/ingestion/runIngestionJob.ts`
- **変更内容（ADR-005 で確定）:**
  1. `extractText` の `case "audio"`（513-518 行）で `deps.speech.transcribe(...)` を `try/catch` し、**`SpeechFailureError` のみ**を catch したら空文字 `""` を返す。**`SpeechFailureError` 以外（例: 未設定時 Stub が投げる `BusinessRuleError('unsupported_format')`）は catch せず素通しする**（後述の縮退対象スコープ）。
  2. `runPipeline`（261 行〜）で `text = await extractText(deps)` の直後に **`kind === "audio" && text.trim().length === 0`** を判定する縮退分岐を追加。**この縮退は if/else（html/markdown/else）の前で early-return 相当に preview を組み立てて return する構造にする** — `suggestMetadata` は if/else の外（335-338 行、全 kind 共通経路）にあるため、`else` ブロックをスキップするだけでは `suggestMetadata` が残ってしまう。早期 return で metadata/タグ解決ブロック（335-355 行）自体を回避する。この分岐では `titleSuggestion = fallbackTitle(deps.originalFileName)`、`html` = 失敗注記の固定 HTML 定数（`<p class="ingestion-failure-note">文字起こしに失敗しました。録音は保存されています。本文を手動で追記して保存できます。</p>`、**サニタイザを通さず**直接 `ContentHtml.create` へ）、`directorySuggestion = null`、`suggestedTagNames: []`。`structureToHtml` / `suggestMetadata` は呼ばない（空入力で LLM を叩かない＝課金回避・二次 `markFailed` 回避）。
  3. `classifyPipelineError` の `speech_failure` → `markFailed` 経路は VO 構築失敗等の真の catastrophic のみに限定（通常の文字起こし失敗は (1)(2) で `previewing` に到達）。
  - **縮退対象スコープ（Round 2 arch P-001 確定）:** 縮退は **実プロバイダの `SpeechFailureError`（＝実際の文字起こし失敗・無音）のみ**に限定する。**Speech 未設定（`StubSpeechRecognitionProvider` フォールバック）時は従来どおり fail**（`Stub` の `BusinessRuleError('unsupported_format')` が `classifyPipelineError` 540 行 → `markFailed` に落ちて `previewing` に到達しない）。「未設定＝機能未提供で fail」を意図的挙動とし、(1) の catch を `SpeechFailureError` のみに絞ることでこの分離を実現する。
  - `locale: "ja"` は当面維持（方針3）。
- **理由:** spec/scenario の「テキストが空でも保存可能」を満たす（AC-6 を観測可能に）。`audio` が `else`＝LLM 必須経路を通る点・`suggestMetadata` が if/else 外の共通経路である点を踏まえ、early-return で metadata ブロックごと回避し空入力を LLM に流さない。

### 6. OpenAI transcribe アダプタ
- **対象ファイル:** `app/core/adapters/openai/speechRecognitionProvider.ts`
- **0（先頭タスク）— Cloudflare Workers multipart PoC（S-002）:** 実装本体の前に、**実音声 1 本で Workers 上から `POST /audio/transcriptions` が 200 を返すことを `pnpm dev` で確認する最小 PoC** を行う。`audioBytes: ArrayBuffer` → `Blob`（mime 付き）→ `FormData`（`file`/`model`/`language`）を構築し、`Content-Type: multipart/form-data; boundary=...` は**手で設定せず fetch に任せる**点を確認する。**`messagesClient.ts` は Chat Completions の JSON body 専用で multipart には流用不可**（URL 合成・secret masking のパターンのみ流用）。PoC が通ってから本実装に進み、ステップ依存の手戻りを防ぐ。
- **変更内容:** `SpeechRecognitionProvider` 実装。`POST /audio/transcriptions` に multipart（file/model/language）。25MB 超は事前 `SpeechFailureError`。非 2xx/timeout/transport を `SpeechFailureError` に翻訳、空発話は空文字。URL 合成・secret masking のみ `messagesClient.ts` から流用（multipart 本体は新規）。
- **理由:** B の中核。Stub を置換する実体。Workers multipart の実現可能性を実装前に潰す。

### 7. OpenAI speech ping
- **対象ファイル:** `app/core/adapters/openai/speechConnectionPing.ts`
- **変更内容:** `GET {baseURL}/models/{model}`（or `/models`）で 2xx 確認の軽量 probe。throw せず `{ ok, reason }`。
- **理由:** 接続テストで実音声を送らずに疎通確認（ADR-006）。

### 8. Speech registry + barrel
- **対象ファイル:** `app/core/adapters/speech/registry.ts`、`app/core/adapters/openai/index.ts`（既存 barrel に追記）
- **変更内容（S-005 で確定）:** `SpeechAdapter` 型 + `speechProviderRegistry: Record<SpeechProvider, SpeechAdapter>` + `lookupSpeechAdapter`。`openaiSpeechAdapter`（`create` / `ping`）は **新規 `speechIndex.ts` を作らず既存 `openai/index.ts` に追加 export**（OpenAI の全 adapter を 1 ファイルに集約）。`openai/index.ts` には `import type { SpeechAdapter } from "../speech/registry"` を 1 行足すだけで**型のみ依存を維持**（value import しないため value cycle なし。既存 `import type { ProviderAdapter } from "../llm/registry"` と同じ向き）。`speech/registry.ts` は `openai/index.ts` から `openaiSpeechAdapter` を value import（registry → adapter の一方向）。
- **理由:** registry パターンで後続プロバイダ差し替え可能に（方針1）。barrel 配置を確定し実装者の迷いを排除。

### 9. `SpeechConnectionTester` ポート + Http 実装
- **対象ファイル:** `app/core/domain/adminSettings/ports/speechConnectionTester.ts`、`app/core/application/di/speechConnectionTester.ts`
- **変更内容:** ポート定義 + `HttpSpeechConnectionTester`（registry の ping にディスパッチ、secret masking）。
- **理由:** 接続テストの application 層ディスパッチャ（`HttpLLMConnectionTester` 対称）。

### 10. DI 配線（request / consumer 両パス）
- **対象ファイル:** `app/core/application/di/types.ts`、`app/core/application/di/serverCloudflare.ts`（`app/core/application/di/env.ts` は **変更不要** — `ADMIN_*` 参照は 0 件で `ADMIN_LLM_*` 同様すべて `serverCloudflare.ts` にある。Round 2 arch S-001 で確認済み）
- **`ADMIN_SPEECH_*` env binding の波及範囲（S-001 で実コード列挙）:** `ADMIN_LLM_*` の先例を辿った結果、speech 版（`ADMIN_SPEECH_API_KEY`（secret）/ `ADMIN_SPEECH_MODEL`（var）/ `ADMIN_SPEECH_PROVIDER`（var））を追加する箇所は次の通り。**`baseURL` は持たないため `ADMIN_SPEECH_BASE_URL` は不要**（ADR-003）。
  - `serverCloudflare.ts`:
    - `ServerEnv` 型（204-263 行付近、`ADMIN_LLM_API_KEY?`/`ADMIN_LLM_MODEL?`/`ADMIN_LLM_PROVIDER?` の隣 235-245 行）に `ADMIN_SPEECH_API_KEY?` / `ADMIN_SPEECH_MODEL?` / `ADMIN_SPEECH_PROVIDER?` を追加。
    - `RequestServerConfig` 型（102 行〜、`adminLlmApiKey?`/`adminLlmModel?`/`adminLlmProvider?` の隣 147-168 行）に `adminSpeechApiKey?` 等を追加。
    - `readRequestServerConfig`（322-366 行、`...(env.ADMIN_LLM_API_KEY ? ...)` の隣 357-366 行）に speech のスプレッド分岐を追加。
    - `createRequestContainer`: `buildSpeechRecognitionProvider`（env キー有→registry factory / 無→Stub）を追加し 645 行の `speechRecognitionProvider: new StubSpeechRecognitionProvider()` ハードコードを置換。`adminSpeechEnv` 組み立て（669-686 行の `adminSettingsEnv` 組み立てに対称）。`speechConnectionTester: new HttpSpeechConnectionTester()`。
    - `createConsumerContainer`（780 行〜）+ `resolveConsumerSpeechConfig`（883 行の `resolveConsumerLlmConfig` に対称：DB 行読み出し + `env>db` + 復号フォールバック + **DB ciphertext 復号失敗時に Stub へ縮退**する分岐も対称に）で `speechRecognitionProvider` を override。
    - `readInstanceSettingsSpeechRow`（960 行付近の `readInstanceSettingsLlmRow` に対称の speech 列 select）を追加。
  - `app/worker/cloudflare/handlers.ts`: `ConsumerEnv`/`RelayEnv` 等は `type ConsumerEnv = ServerEnv` のエイリアスなので `ServerEnv` への追加で自動波及（個別変更不要だが、consumer worker が speech env を読めることを確認）。
  - `app/server.cloudflare.ts`: `AppEnv = ServerEnv` エイリアスなので自動波及（個別変更不要）。
  - `wrangler.toml`: `[vars]` に `ADMIN_SPEECH_MODEL`/`ADMIN_SPEECH_PROVIDER`、secret `ADMIN_SPEECH_API_KEY` の運用記述（`docs/runtime_cloudflare.md` も更新）。
  - `types.ts`: `RequestContainer` に `speechConnectionTester` を追加、`AdminSettingsEnv` の speech 版（`speechApiKey/speechProvider/speechModel`）を追加（or 新型 `AdminSpeechEnv`）。
- **理由:** Stub 置換（AC-2）と env>db>stub フォールバック（AC-1）。env binding の追加漏れ（特に consumer worker 側で speech env が読めない）を防ぐ。

### 11. repository マッピング
- **対象ファイル:** `app/core/adapters/d1/repositories/instanceSettingsRepository.ts`
- **変更内容:** `toEntity` に speech 列→VO、`save` に逆方向を追加。
- **理由:** 永続化の往復。

### 12. DB スキーマ + マイグレーション
- **対象ファイル:** `app/core/adapters/d1/schema.ts`、`app/core/adapters/d1/migrations/0017_add_speech_config.sql`
- **変更内容:** 4 カラム追加 + `speech_api_key_source` の enum check。マイグレーション ALTER 4 本。
- **理由:** Speech 設定の永続化先（AC-1）。

### 13. ユースケース `updateSpeechConfig` / `testSpeechConnection` / DTO 拡張
- **対象ファイル:** `app/core/application/adminSettings/updateSpeechConfig.ts`、`.../testSpeechConnection.ts`、`.../view.ts`、`app/core/application/dto/adminSettings.ts`、`app/core/application/adminSettings/index.ts`
- **変更内容:**
  - `updateLLMConfig` / `testLLMConnection` を雛形に対称実装。
  - **`view.ts` の speech 拡張（S-003 で具体化）:** `maskApiKey(cfg: LLMConfig)`（25-33 行）は `LLMConfig` 型に密結合だが、実体は `{ apiKeySource, apiKeyCiphertext }` しか参照しない。**`maskApiKey` を構造型 `{ apiKeySource: 'env'|'db'; apiKeyCiphertext: string | null }` を受け取るよう汎用化**し、LLM/speech 双方から呼ぶ（ADR-003 の「独立 VO + 対称関数」と一貫。speech 専用 `maskSpeechApiKey` を別途作るより重複が少ない）。`toInstanceSettingsView`（44-55 行）は `apiKeyMasked = env?.apiKey ? null : maskApiKey(settings.llm)` の隣に **speech 版マスク（`env.speechApiKey ? null : maskApiKey(settings.speech)`）** を追加。
  - **DTO 拡張:** `app/core/application/dto/adminSettings.ts` の `InstanceSettingsDTO` 型に `speech`（provider/model/apiKeySource/apiKeyMasked + `envOverrides.speech*`）フィールドを追加、`toInstanceSettingsDTO` に speech 射影を追加。
  - **env overlay:** `AdminSettingsEnv` の env overlay を speech 用に拡張（`envOverrides` の speech フラグ）。
- **理由:** 管理画面のバックエンド（AC-1, AC-3 の通し）。フォーム初期値・マスク表示に speech を載せる。

### 14. `/admin/speech` 画面
- **対象ファイル:** `app/routes/admin/speech.tsx`、`app/components/admin/SpeechSettingsForm/{Page,index,action}.tsx`、`app/components/admin/schema.ts`、`app/routes/admin/route.tsx`
- **変更内容:** `admin/llm.tsx` + `LLMSettingsForm` を雛形に。`ADMIN_NAV` / nav union / side-effect import に speech を追加。zod schema（`updateSpeechConfigSchema` / `testSpeechConnectionSchema`）追加。
- **理由:** AC-1 の管理 UX。

### 15. 録音 UI コンポーネント + ファイルアップロード音声受理の確認
- **対象ファイル:** `app/components/ingestion/AudioRecorder.tsx`（`"use client"`）、`UploadForm.tsx` / `UploadDialog.tsx`（導線追加）、DropZone（`accept` 属性）
- **変更内容:**
  - **（確認タスク, S-001）:** ファイルアップロード導線の DropZone（`UploadForm.tsx` / `UploadDialog.tsx`）の `accept` 属性が `audio/*`（webm/m4a/mp3/wav/flac/ogg）を実際に受理する状態か**確認する**。`SUPPORTED_FORMATS_LABEL` は「音声」を含むと確認済みだが、`accept` 制約はラベルと別物。受理済みなら「確認のみ・変更不要」、未受理なら `accept` に audio を追加する（AC-3 のアップロード経由を確実に検証）。
  - **（録音 UI, AC-4）:** `MediaRecorder` 録音 → Blob → File → `uploadFileFn`。状態機械（idle/requesting/recording/stopped/permission-denied）、経過時間表示、取り消し・再録音、権限拒否フォールバック。
- **理由:** AC-4（録音）+ AC-3（ファイルアップロードの音声受理確認）。既存アップロード経路に合流（バックエンド変更なし）。

### 16. spec 更新
- **対象ファイル:** `spec/domains/adminSettings.md`、`spec/domains/ingestion.md`、`spec/usecases/adminSettings.md`、`spec/usecases/ingestion.md`、`spec/scenario/ingest.md`、`spec/pages/index.md`、`spec/manual-tests/ingest.md`、`spec/testcases/ingestion/index.md`
- **変更内容:** `SpeechRecognitionConfig` VO・`updateSpeechConfig`/`testSpeechConnection` ユースケース・P42（or P41 拡張）speech 設定画面・録音 UI シナリオ・音声 TC（録音→ノート化、文字起こし失敗時の縮退保存=注記表示+本文追記、**縮退 preview → 本文追記 → commit 成功**（AC-6 最終節「本文を追記して commit できる」まで観測）、権限拒否、接続テスト=probe 境界、**AC-5 録音由来 Blob の `MediaAsset` メタデータ欠落回帰**）を追記。失敗時の LLM スキップ縮退方針（ADR-005）を ingestion usecase に明記。
- **理由:** AC-7。

### 17. ADR 追加（spec/adr）
- **対象ファイル:** `spec/adr/0XX-speech-provider.md`（連番）
- **変更内容:** 文字起こしプロバイダの方針（OpenAI 第一段固定・registry で拡張可能・env>db>stub・SecretBox 暗号化・locale 当面 ja-JP 固定）を ADR-004（LLM 単一固定）と対称に記録。`.issue/701/adr.md` の技術判断を spec 側へ反映。
- **理由:** AC-7。設計判断の正本化。

### 18. テスト
- **対象ファイル:** `app/core/domain/adminSettings/__tests__/`、`app/core/application/adminSettings/__tests__/`、`app/core/adapters/openai/__tests__/`、`app/core/application/di/__tests__/`、`app/core/application/ingestion/__tests__/`
- **変更内容:** 下記「テスト方針」参照。
- **理由:** 各 AC の回帰防止。

## 設計判断

詳細は `.issue/701/adr.md` 参照。要約:
- **ADR-001**: 文字起こしプロバイダは OpenAI `gpt-4o-transcribe` を第一段採用（日本語精度・webm 対応・REST/Bearer で LLM アダプタと対称・25MB 上限で録音をそのまま流せる）。
- **ADR-002**: Speech registry は LLM registry と分離（責務・キー集合が異なる）。`Record<SpeechProvider, SpeechAdapter>` でコンパイル時網羅。
- **ADR-003**: `SpeechRecognitionConfig` は `LLMConfig` と独立した VO + 対称な薄いサービス関数（`AdminSettingsService` を `LLMConfig` から汎用化しない）。`baseURL` は持たせない（YAGNI）。
- **ADR-004**: DB マイグレーションは nullable + default の ALTER 4 本。既存 singleton 行は reconstruct で default 縮退して後方互換。
- **ADR-005**: 文字起こし失敗（=空 transcript）時は **LLM 構造化（`structureToHtml`/`suggestMetadata`）をスキップ**し、`fallbackTitle` ＋ `class="ingestion-failure-note"` の固定注記 HTML（サニタイザ非経由）で縮退 preview を生成して `previewing` に到達（commit 可能性を担保、AC-6）。`audio` が `else`＝LLM 必須経路を通る点を踏まえ空入力を LLM に流さない。`IngestionPreview` VO は変更しない（波及回避）。`markFailed` は真の catastrophic のみ。
- **ADR-006**: 接続テストは transcribe ではなく `GET /models` 系の軽量 probe（実音声不要・低コスト）。**合格境界はモデル存在/認証まで**（transcribe 疎通は AC-3/手動）。
- **ADR-007**: 録音 UI は専用バックエンド経路を作らず `uploadFileFn`（multipart）に合流。`MediaRecorder` の Blob を File 化して既存 upload→ingest→commit に乗せる。

## リスクと注意点

- **OpenAI transcribe の Cloudflare Workers 上での挙動が未検証**（multipart の `fetch` body 構築・FormData 対応）。PoC 必須。Workers でも `FormData` + `Blob` は使えるが、実音声での疎通確認が要る。
- **25MB 上限・録音長の上限が未確定**。録音 UI 側で上限を設けないと、長時間録音が `uploadFile` の `maxIngestionBytes`（既定 32MiB）や OpenAI 25MB に抵触する。録音 UI に時間/サイズの上限・警告を入れる。
- **AC-6 の「失敗を明示」の preview 表現は確定済み**（ADR-005）: `IngestionPreview` VO は変更せず、本文 HTML 先頭に `class="ingestion-failure-note"` の固定注記（サニタイザ非経由）を入れ、LLM 構造化をスキップして `previewing` に到達。`ContentHtml.create("")` 許容・`NoteTitle` の `fallbackTitle` ガード・サニタイザが `data-*` を剥がす（→ `class` を使う）点はいずれも実コードで検証済み。
- **consumer パスの二重解決**（`resolveConsumerLlmConfig` に倣う）で DB 行読み出しが LLM/Speech で2回走る。`readInstanceSettings*Row` を1回に統合する最適化余地（初版は対称優先で別 select 可）。
- **マイク権限・MediaRecorder のブラウザ差**（Safari の `audio/mp4` vs Chrome の `audio/webm`）。録音 MIME を `MediaRecorder.isTypeSupported` で分岐し、`detectKind` が受ける形式（webm/m4a/mp3...）に収める。
- **RSC の side-effect import 漏れ**で server-fn が manifest 未登録になると admin 画面が動かない（`admin/route.tsx` への import 追加を忘れない）。
- **locale 固定の明示**: `runIngestionJob` は `"ja"` を、OpenAI アダプタは `ja-JP` 由来の `language` を渡す。当面固定で良いが、ポートの `locale` を無視せず素通しする（後続の可変化に備える）。

## テスト方針

- **ドメイン VO（`SpeechRecognitionConfig`）**: provider 検証・model 長さ境界（1/120/121）・`db`↔ciphertext・`env`↔null の不変条件（ミューテーション境界）。`errorCodeNaming.test.ts` に新コードが乗ること。
- **エンティティ**: `updateSpeech` の version インクリメント・`reconstruct` の NULL 列 → default 縮退（後方互換）・`default()` の speech 既定値。
- **ドメインサービス**: `decryptSpeechApiKey`（env→null / db→decrypt）・`assertSpeechEnvOverride`（env 有で db→env 化、env 無 + source=env で `SpeechEnvOverrideMissingKey`）。
- **ユースケース**: `updateSpeechConfig`（provider 変更時の apiKey 必須・暗号化・env override silent-skip）・`testSpeechConnection`（draft/persisted・env>db 解決・apiKey 欠如で ok:false）。fake repository / fake SecretBox / fake tester。
- **アダプタ（OpenAI transcribe）**: `fetch` をスタブし 2xx→text / 4xx・5xx・timeout→`SpeechFailureError` / 空発話→空文字 / 25MB 超→事前失敗。ping の 2xx→ok / 非2xx→reason。
- **取り込み失敗縮退（AC-6）**: `runIngestionJob` で fake speech が `SpeechFailureError` を投げたとき、(1) `structureToHtml` / `suggestMetadata` が**呼ばれない**こと（fake LLM の spy で 0 回。`suggestMetadata` は if/else 外の共通経路なので early-return で回避されることを担保）、(2) preview の `contentHtml` に `ingestion-failure-note` 注記が含まれること、(3) ジョブが `previewing` に到達し `markFailed` されないこと。正常に空文字（無音）が返ったケースも同じ縮退分岐に入ることを確認。**Stub 経路（Speech 未設定）: fake speech が `BusinessRuleError('unsupported_format')`（Stub 相当）を投げたときは縮退分岐に入らず `markFailed` され `previewing` に到達しないこと（縮退対象は `SpeechFailureError` のみ、Round 2 arch P-001）を 1 ケース追加。**
- **DI**: env キー有で実 provider、無で Stub。consumer パスで DB 設定が解決され override されること。
- **接続テスト統合**（real-DB / integration）: `/admin/speech` の保存→接続テストの往復（`docs/test.md` の integration 層方針に従う）。
- **手動/ブラウザ**: マイク録音→取り込み→ノート化、権限拒否フォールバック、音声ファイルアップロード→ノート化、元ファイル閲覧、**文字起こし失敗時の縮退 preview → 本文追記 → commit 成功（AC-6 最終節、coverage S-001）**。**AC-5 回帰: 録音由来 Blob（File 化）特有メタデータ（MIME `audio/webm` 等・拡張子）で `MediaAsset` の `mimeType`/`filename` が欠落しないこと**（録音経路とファイル経路の両方で元ファイル行を確認）。`spec/manual-tests/ingest.md` の新 TC を agent-browser で検証。

## レビュー履歴

### 1周目

**修正した点**:
- **coverage P-001 / arch P-001 / arch P-002（AC-6 失敗縮退の確定）**: 実コード調査で `runPipeline` の `audio` 分岐が `else`＝`structureToHtml` 必須経路を通ること、`ContentHtml.create("")` は許容・`NoteTitle` は `fallbackTitle` で安全・サニタイザは `data-*` を剥がす（`class` は許可）ことを検証。ADR-005 を両論併記から **「空 transcript 時は LLM 構造化をスキップし、`class="ingestion-failure-note"` の固定注記 HTML（サニタイザ非経由）＋ `fallbackTitle` で縮退 preview を生成、`IngestionPreview` VO は変更しない」** に決定。AC-6 を「プレビュー画面に失敗注記が表示され、空相当本文で `previewing` 到達、本文追記して commit 可」の観測可能文に書き換え。ステップ5を具体化（early-return 分岐・固定 HTML・LLM スキップ・`markFailed` 限定）。
- **coverage P-002（AC-1 接続テスト境界）**: AC-1 に「接続テストは provider のモデル存在/認証を probe で確認するまでが合格」を明記し、transcribe 実音声疎通を AC-3／手動に割り当て。ADR-006 に合格境界の確定を追記し Status を Accepted に。

**取り込んだ改善提案**:
- **coverage S-001（AC-3 アップロード導線）**: ステップ15に DropZone の `accept` が `audio/*` を受理するかの確認タスクを追加（受理済みなら確認のみ）。AC-3 の対応ステップに 15 を追加。
- **coverage S-002（AC-5 回帰）**: AC-5 に録音由来 Blob のメタデータ欠落確認を明記し、手動 TC（ステップ16・テスト方針）へ紐づけ。
- **arch S-001（env binding 波及）**: ステップ10に `ADMIN_SPEECH_*` の追加箇所（`ServerEnv`/`RequestServerConfig`/`readRequestServerConfig`/consumer 解決/`readInstanceSettingsSpeechRow`/worker エントリ自動波及/`wrangler.toml`）を行番号付きで列挙。`baseURL` 不要を明記。
- **arch S-002（multipart PoC）**: ステップ6の先頭タスクに Workers 上の multipart PoC を明示。`messagesClient.ts` は JSON 専用で multipart 流用不可な点を記述。
- **arch S-003（view.ts speech 拡張）**: ステップ13を `maskApiKey` の構造型汎用化・DTO への speech フィールド・env overlay の speech 版まで具体化。
- **arch S-004（INVARIANT に model 既定値）**: ステップ2の INVARIANT コメントに provider↔`model` 既定値の対応（`openai → 'gpt-4o-transcribe'`）を含める旨を反映。
- **arch S-005（barrel 配置）**: ADR-002 とステップ8で barrel を新規 `speechIndex.ts` ではなく既存 `openai/index.ts` に集約・型のみ依存維持と確定。Status を Accepted に。

**見送った提案とその理由**:
- なし（両レビューの指摘はメイン方針により全件取り込み）。

### 2周目

**修正した点**:
- **arch P-001（要修正・未設定時 Stub の catch 漏れ）**: `StubSpeechRecognitionProvider` は `SpeechFailureError` ではなく `BusinessRuleError('unsupported_format')` を投げ（実コード確認済み）、ADR-005 の `SpeechFailureError`-only catch を素通りして `classifyPipelineError` 540 行 → `markFailed` に落ちる。**「Speech 未設定（Stub）時は従来どおり fail（縮退対象にしない）、縮退は実プロバイダの `SpeechFailureError` のみに限定」と確定**。ADR-005 に「未設定時の扱い」節を追加し、ステップ5 の catch 条件を `SpeechFailureError` のみと明記。AC-6 のスコープを「設定済みプロバイダの transcribe 失敗時」に限定。テスト方針に Stub 経路（`unsupported_format` → `markFailed`、`previewing` 到達せず）の境界ケースを 1 件追加。

**取り込んだ改善提案**:
- **arch S-002（`suggestMetadata` の共通経路）**: `suggestMetadata`（335-338 行）は if/else の外＝全 kind 共通経路にあり、`else` をスキップするだけでは残る点を確認。ステップ5・ADR-005 に「縮退分岐は if/else の前で early-return 相当に preview を組み立てて return し、metadata/タグ解決ブロック（335-355 行）自体を回避する」と明記。テスト方針の spy 0 回検証に `suggestMetadata` の回避担保を追記。
- **arch S-001（env.ts 過剰）**: `env.ts` に `ADMIN_*` 参照は 0 件（全て `serverCloudflare.ts`）と確認。ステップ10 の対象ファイルから `env.ts` を外し「変更不要」と注記。
- **coverage S-001（AC-6 commit 観測）**: 手動 TC（ステップ16・テスト方針 手動節）に「縮退 preview → 本文追記 → commit 成功」を追加し、AC-6 最終節（本文を追記して commit できる）まで観測対象にした。

**見送った提案とその理由**:
- なし（両レビューの指摘はメイン方針により全件取り込み）。

### 3周目

両視点（要件カバレッジ / アーキ・リスク）とも問題点ゼロで終了。arch S-001（Workers multipart PoC が NG の場合の退避先を念頭に置く）は計画に記述済みのため新規修正なし。計画は最終承認状態。
