# AdminSettings

インスタンス全体の設定（LLM・カスタムプロンプト・デザイントークン・登録制御）を管理する。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| InstanceSettings | インスタンス設定 | 単一のシングルトン集約 |
| LLMConfig | LLM 設定 | プロバイダ識別と接続情報 |
| PromptTemplate | プロンプトテンプレート | 取り込み等の用途別プロンプト |
| DesignTokens | デザイントークン | CSS カスタムプロパティの集合 |
| RegistrationPolicy | 登録ポリシー | サインアップ受付可否 |

## エンティティ

### InstanceSettings（シングルトン集約ルート）

- フィールド:
  - `id: 'singleton'`
  - `llm: LLMConfig`
  - `prompts: Record<PromptPurpose, PromptTemplate>`
  - `designTokens: DesignTokens`
  - `registration: RegistrationPolicy`
  - `limits: InstanceLimits`
  - `updatedAt: Instant`
- 振る舞い:
  - `updateLLM(cfg: LLMConfig, now: Instant): InstanceSettings`
  - `updatePrompt(purpose: PromptPurpose, template: PromptTemplate, now: Instant): InstanceSettings`
  - `updateDesignTokens(tokens: DesignTokens, now: Instant): InstanceSettings`
  - `setRegistrationOpen(open: boolean, reason: string | null, now: Instant): InstanceSettings`
  - `updateLimits(limits: InstanceLimits, now: Instant): InstanceSettings`

### UserPromptOverride（ユーザー個別、別集約）

- フィールド: `ownerId: UserId`, `prompts: Partial<Record<PromptPurpose, PromptTemplate>>`, `updatedAt: Instant`
- 振る舞い: `setPrompt(purpose, template, now): UserPromptOverride` / `clearPrompt(purpose, now): UserPromptOverride`

## 値オブジェクト

### LLMConfig
- フィールド: `provider: 'anthropic'`, `model: string`, `apiKeySource: 'env' | 'db'`, `apiKeyCiphertext: string | null` — `apiKeySource === 'db'` のときのみ
- バリデーション: `model` 1..120、`apiKeyCiphertext` は暗号化済みフォーマット

### PromptTemplate
- フィールド: `text: string`, `expectedVariables: string[]`（例 `['rawText', 'locale']`）
- バリデーション: `text` 中の `{{var}}` プレースホルダが `expectedVariables` に含まれること。サイズ 16 KiB 以下

### PromptPurpose（列挙）
- `'structure' | 'title' | 'directory' | 'metadata' | 'ocr_assist'`

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

## ユースケース（概要）

- GetInstanceSettings
- UpdateLLMConfig / TestLLMConnection
- UpdatePromptTemplate（admin） / UpdateUserPromptOverride（user）
- UpdateDesignTokens / ResetDesignTokens
- ToggleRegistrationPolicy
- UpdateInstanceLimits
- GetUsageMetrics（admin の P40 用）
