# AdminSettings

インスタンス全体の設定（LLM・カスタムプロンプト・デザイントークン・登録制御）を管理する。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| InstanceSettings | インスタンス設定 | 単一のシングルトン集約 |
| LLMConfig | LLM 設定 | プロバイダ識別と接続情報 |
| SpeechRecognitionConfig | 文字起こし設定 | 文字起こしプロバイダ識別と接続情報 |
| PromptTemplate | プロンプトテンプレート | 取り込み等の用途別プロンプト |
| DesignTokens | デザイントークン | CSS カスタムプロパティの集合 |
| RegistrationPolicy | 登録ポリシー | サインアップ受付可否 |

## エンティティ

### InstanceSettings（シングルトン集約ルート）

- フィールド:
  - `id: 'singleton'`
  - `llm: LLMConfig`
  - `speech: SpeechRecognitionConfig` — 文字起こしプロバイダ設定（Issue #701。`llm` と並列の独立フィールド）
  - `prompts: Partial<Record<PromptPurpose, PromptTemplate>>` — **キー存在 = インスタンス上書き / キー欠落 = ビルトイン既定値を継承**（Issue #218 ADR-001）。`UserPromptOverride` と同型のセマンティクス
  - `designTokens: DesignTokens`
  - `registration: RegistrationPolicy`
  - `limits: InstanceLimits`
  - `updatedAt: Instant`
- 振る舞い:
  - `updateLLM(cfg: LLMConfig, now: Instant): InstanceSettings`
  - `updateSpeech(cfg: SpeechRecognitionConfig, now: Instant): InstanceSettings` — 文字起こし設定の差し替え（`updateLLM` と対称、version インクリメント）
  - `updatePrompt(purpose: PromptPurpose, template: PromptTemplate, now: Instant): InstanceSettings` — 非空テンプレートで上書きを設定（空文字はユースケース層で `resetPrompt` にルーティング、ADR-006）
  - `resetPrompt(purpose: PromptPurpose, now: Instant): InstanceSettings` — 単一上書きの削除（既定継承に戻す）
  - `resetAllPrompts(now: Instant): InstanceSettings` — 全上書きを削除
  - `updateDesignTokens(tokens: DesignTokens, now: Instant): InstanceSettings`
  - `resetDesignTokens(now: Instant): InstanceSettings`
  - `setRegistrationOpen(open: boolean, reason: string | null, now: Instant): InstanceSettings`
  - `updateLimits(limits: InstanceLimits, now: Instant): InstanceSettings`

### 既定値（SSOT）

- 文字起こし設定: `defaultSpeech()`（`provider: 'openai'`, `model: 'gpt-4o-transcribe'`, `apiKeySource: 'env'`, `apiKeyCiphertext: null`）。`default()` に組み込まれ、`reconstruct()` は既存 DB 行で `speech_model` 等が NULL のとき `coerceSpeech` で `defaultSpeech()` に縮退させる（後方互換。Issue #701 ADR-004、`maxNoteRevisionsPerNote` の optional-on-reconstruct と同型）。
- プロンプト: `app/core/domain/adminSettings/defaults.ts` の `BUILTIN_PROMPT_DEFAULTS`。`text` は空文字を保持し、`promptResolver` の「空文字 = operator の追加指示なし（アダプタが固定のロール宣言＋出力契約のみでシステムプロンプトを組む）」契約と整合する（Issue #218 ADR-002、#396 ADR-002 で是正）。
- デザイントークン:
  - CSS の既定値そのものは `app/styles/tokens.css`（CLAUDE.md と一致、`spec/design/tokens.md` にミラー）が SSOT。
  - 管理画面で上書き可能なトークンの「キー → 既定値」は `app/core/domain/adminSettings/defaults.ts` の `BUILTIN_DESIGN_TOKENS`（curated subset・計 27 キー）が SSOT（Issue #397）。`tokens.css` との値整合は `defaults.test.ts` が CI で機械検証する（手書き定数 + 整合性テスト方式、ランタイム CSS パース / codegen は不採用）。
  - 既定値は管理画面に初期表示され、override（既定値と異なる値）のみが永続化される。既定値と同値の行は `UpdateDesignTokens` ユースケースで除外する（`DesignTokens` VO は「永続化される override 集合」という意味を純粋に保ち、既定マップ知識を持たない）。
  - `var(...)` 参照値（`--code-comment`, `--color-info`）と breakpoints は curated subset から除外（`spec/design/tokens.md` §12 参照）。

### UserPromptOverride（ユーザー個別、別集約）

- フィールド: `ownerId: UserId`, `prompts: Partial<Record<PromptPurpose, PromptTemplate>>`, `updatedAt: Instant`
- 振る舞い: `setPrompt(purpose, template, now): UserPromptOverride` / `clearPrompt(purpose, now): UserPromptOverride`

## 値オブジェクト

### LLMConfig
- フィールド: `provider: 'anthropic'`, `model: string`, `apiKeySource: 'env' | 'db'`, `apiKeyCiphertext: string | null` — `apiKeySource === 'db'` のときのみ
- バリデーション: `model` 1..120、`apiKeyCiphertext` は暗号化済みフォーマット

### SpeechRecognitionConfig

Issue #701。`LLMConfig` と対称な、文字起こしプロバイダの独立 VO（ADR-003）。`AdminSettingsService` / `LLMConfig` の汎用化はせず、独立 VO + 対称な薄いサービス関数として実装する。

- フィールド: `provider: SpeechProvider`, `model: string`, `apiKeySource: 'env' | 'db'`, `apiKeyCiphertext: string | null` — `apiKeySource === 'db'` のときのみ
- バリデーション: `model` 1..120、`apiKeyCiphertext` は暗号化済みフォーマット
- 不変条件: `apiKeySource === 'db'` のとき `apiKeyCiphertext` 必須／`apiKeySource === 'env'` のとき `apiKeyCiphertext === null`（`LLMConfig` と同一ロジック）
- `baseURL` は持たない（OpenAI 固定エンドポイント `/v1/audio/transcriptions`。将来 OpenAI 互換の別エンドポイントが必要になったら追加。YAGNI — ADR-003）
- `providers`（選択肢）・`apiKeySources` を静的公開（フォームの選択肢用）

### SpeechProvider（列挙）
- `'openai'` — 当面 `["openai"] as const`。`app/core/adapters/speech/registry.ts` の `speechProviderRegistry`（`Record<SpeechProvider, SpeechAdapter>` でコンパイル時網羅）と対応する。provider ごとの `model` 既定値の対応（`openai → 'gpt-4o-transcribe'`）も VO 側の INVARIANT として明記する（provider 追加時にモデル既定も増える齟齬を防ぐ）。将来 Deepgram 等を registry で差し替え可能（Issue #701 ADR-001 / ADR-002 / `spec/adr/013-speech-provider.md`）

### PromptTemplate
- フィールド: `text: string`, `expectedVariables: string[]`（例 `['rawText', 'locale']`）
- バリデーション: `text` 中の `{{var}}` プレースホルダが `expectedVariables` に含まれること。サイズ 16 KiB 以下

### PromptPurpose（列挙）
- `'structure' | 'title' | 'directory' | 'metadata' | 'ocr_assist'`
- **SSOT**: 上記 5 値（Issue #218 ADR-005）。UI 用 ID（`ingestion_structuring` / `title_generation` / `directory_suggestion`）は廃止。`ocr_assist` は ingestion パイプライン未参照だが、admin 画面では編集可能（OCR 機能の将来的プロビジョン）。

### DesignTokens
- フィールド: `tokens: Record<string, string>` — 例 `{ '--color-bg': '#fff', '--font-body': 'system-ui' }`
- バリデーション: キーは `--[a-z0-9-]+`、値は CSS 構文として有効（簡易チェック）、エントリ数 200 以下

### RegistrationPolicy
- フィールド: `open: boolean`, `closedReason: string | null`

### InstanceLimits
- フィールド: `maxUploadBytesPerDay: number`, `maxIngestionBytes: number`, `maxNoteBytes: number`, `maxExportArtifactBytes: number`, `maxShareLinksPerNote: number`, `editLockTtlSec: number`, `trashRetentionDays: number`, `maxNoteRevisionsPerNote: 整数 (1..1000)、既定 50`（Issue #158 ADR-004 — `SaveNote` / `RestoreNoteRevision` のたびに `note_revisions` が増えるノート単位の保持上限）

## ドメインサービス

### AdminSettingsService
- 責務: 暗号化された API キーの取り扱い、設定の一貫性確認
- メソッド:
  - `decryptApiKey(cfg: LLMConfig, secrets: SecretBox): Promise<string | null>`
  - `encryptApiKey(plain: string, secrets: SecretBox): Promise<string>`
  - `assertEnvOverride(cfg: LLMConfig, env: { apiKey: string | null }): LLMConfig` — env がある場合は `apiKeySource = 'env'` を強制
  - `decryptSpeechApiKey(cfg: SpeechRecognitionConfig, secrets: SecretBox): Promise<string | null>` — Issue #701。`decryptApiKey` と対称（`SpeechRecognitionConfig` 型）
  - `assertSpeechEnvOverride(cfg: SpeechRecognitionConfig, env: { apiKey: string | null }): SpeechRecognitionConfig` — Issue #701。`assertEnvOverride` と対称。`AdminSettingsService` が `LLMConfig` に密結合のため流用せず薄い対称関数を追加（ADR-003）

## ポート

### InstanceSettingsRepository
- `get(): Promise<InstanceSettings>` — 無ければデフォルトを返す
- `save(s: InstanceSettings): Promise<void>`

### UserPromptOverrideRepository
- `findByOwner(ownerId: UserId): Promise<UserPromptOverride | null>`
- `save(o: UserPromptOverride): Promise<void>`

### SecretBox（ポート）
- メソッド: `encrypt(plain: string): Promise<string>` / `decrypt(cipher: string): Promise<string>`
- エラーケース: `SecretBoxError`

### LLMConnectionTester（ポート）
- メソッド: `ping(cfg: LLMConfig, apiKey: string): Promise<{ ok: boolean; latencyMs: number; error?: string }>`

### SpeechConnectionTester（ポート）
- Issue #701。`LLMConnectionTester` と対称。
- メソッド: `ping(cfg: SpeechRecognitionConfig, apiKey: string): Promise<{ ok: boolean; latencyMs: number; error?: string }>` — 実音声を送らず軽量 probe（`GET /models/{model}` 系）で疎通確認する（ADR-006）

## ユースケース（概要）

- GetInstanceSettings
- GetInstancePromptDefaults（user/admin、P23 用）
- UpdateLLMConfig / TestLLMConnection
- UpdateSpeechConfig / TestSpeechConnection（Issue #701）
- UpdatePromptTemplate / ResetPromptTemplate / ResetAllPromptTemplates（admin） / UpdateUserPromptOverride（user）
- UpdateDesignTokens / ResetDesignTokens
- ToggleRegistrationPolicy
- UpdateInstanceLimits
- GetUsageMetrics（admin の P40 概況 / P47 詳細 用）
