# AdminSettings ユースケース

すべて `role === 'admin'` を要求する（usecase 入口で確認）。

## GetInstanceSettings

### 入力DTO
- `actorUserId: UserId`

### 出力DTO
- `settings: InstanceSettingsDTO`（apiKeyCiphertext は返さず、`apiKeyMasked: string` のみ）

### 処理フロー
1. actor の role 確認
2. InstanceSettingsRepository.get
3. apiKey 部分はマスクして DTO 化

### エラーケース
- `AuthorizationError`

---

## UpdateLLMConfig

### 入力DTO
- `actorUserId`, `model: string`, `apiKeyPlain: string | null`

### 出力DTO
- なし

### 処理フロー
1. admin チェック
2. 既存設定取得
3. `apiKeyPlain !== null` のとき `SecretBox.encrypt`、`apiKeySource = 'db'`
4. env 経由のキーがある場合、`AdminSettingsService.assertEnvOverride` を呼ぶと `apiKeySource = 'env'` に強制
5. `settings.updateLLM(cfg, now)` → save

### エラーケース
- `ValidationError`
- `SecretBoxError`

---

## TestLLMConnection

### 入力DTO
- `actorUserId`, `useDraft: boolean`, `draftConfig?: LLMConfigDTO`

### 出力DTO
- `ok: boolean`, `latencyMs: number`, `error: string | null`

### 処理フロー
1. admin チェック
2. cfg を解決（保存済み or draft）、apiKey を解決（env > db）
3. `LLMConnectionTester.ping`

### エラーケース
- `LLMUnavailableError`

---

## UpdatePromptTemplate（admin）

### 入力DTO
- `actorUserId`, `purpose: PromptPurpose`, `template: { text; expectedVariables }`

### 出力DTO
- なし

### 処理フロー
- admin チェック → InstanceSettingsRepository.get
- `template.text === ""` のとき: **ResetPromptTemplate と等価に処理**（`InstanceSettings.resetPrompt(purpose)`、Issue #218 ADR-006）。集約に変更がなければ save しない
- 非空のとき: `PromptTemplate.create` → `updatePrompt` → save

### エラーケース
- `ValidationError('prompt_variable_missing' | 'prompt_too_large')`

---

## ResetPromptTemplate（admin）

Issue #218。指定 `purpose` のインスタンス上書きを削除し、ビルトイン既定値（= operator の追加指示なし。アダプタが固定のロール宣言＋出力契約のみでシステムプロンプトを組む）へ戻す。

### 入力DTO
- `actorUserId`, `purpose: PromptPurpose`

### 出力DTO
- なし

### 処理フロー
- admin チェック → `instanceSettingsRepository.get` → `InstanceSettings.resetPrompt(purpose, now)`
- 集約に変更がなければ save しない（既に上書きなしの場合は no-op）

### エラーケース
- `ValidationError('prompt_purpose_invalid')`
- `ForbiddenError('FORBIDDEN_ADMIN_ONLY')`

---

## ResetAllPromptTemplates（admin）

Issue #218。すべてのインスタンス上書きを一括削除し、全 `PromptPurpose` をビルトイン既定値へ戻す。

### 入力DTO
- `actorUserId`

### 出力DTO
- なし

### 処理フロー
- admin チェック → `instanceSettingsRepository.get` → `InstanceSettings.resetAllPrompts(now)`
- 集約に変更がなければ save しない

### エラーケース
- `ForbiddenError('FORBIDDEN_ADMIN_ONLY')`

---

## UpdateUserPromptOverride（user）

### 入力DTO
- `actorUserId`, `purpose`, `template | null`

### 処理フロー
- UserPromptOverrideRepository.findByOwner（無ければ新規）
- `setPrompt` or `clearPrompt`
- save

### エラーケース
- `ValidationError`

### 注記

P23 の「インスタンスデフォルト継承中」表示は、Issue #218 のセマンティクス変更後は「インスタンスに上書きがあればそれを継承、なければビルトイン既定（= operator の追加指示なし。システム既定のロール＋出力契約のみ）」を意味する（`getInstancePromptDefaults` の API 互換は維持）。

---

## UpdateDesignTokens / ResetDesignTokens

### 入力DTO
- `actorUserId`, （Update: `tokens: Record<string,string>`）

### 処理フロー
- admin チェック
- DesignTokens 構築（バリデーション含む）
- `settings.updateDesignTokens(tokens, now)` → save
- Reset は既定値を適用

### エラーケース
- `ValidationError`

---

## ToggleRegistrationPolicy

### 入力DTO
- `actorUserId`, `open: boolean`, `closedReason: string | null`

### 処理フロー
- admin チェック → `settings.setRegistrationOpen(open, closedReason, now)` → save

---

## UpdateInstanceLimits

### 入力DTO
- `actorUserId`, `limits: InstanceLimitsDTO`

### 処理フロー
- admin チェック → `settings.updateLimits(limits, now)` → save

### エラーケース
- `ValidationError`

---

## RebuildSearchIndex

### 入力DTO
- `actorUserId: UserId`

### 出力DTO
- `processedCount: number`、`startedAt: Instant`、`finishedAt: Instant`

### 処理フロー
1. admin チェック（`assertAdmin`）
2. `userRepository.listAll`（cursor ベース、page size `REBUILD_USER_PAGE_SIZE = 50`）でユーザを列挙
3. 各ユーザについて `noteRepository.findByOwner({ status: 'active', limit: REBUILD_PAGE_SIZE = 50, offset })` で active ノートを offset ページング
4. 各ページごとに新しい UoW を開き `buildNoteSnapshots` で snapshot を構築、`SearchDocument.fromSnapshot(snap, now)` を AsyncIterable で yield
5. `searchIndex.bulkRebuildFromSnapshots(generator())` を UoW の外で await
6. `{ processedCount, startedAt, finishedAt }` を返す

### エラーケース
- `ForbiddenError('FORBIDDEN_ADMIN_ONLY')`（actor が admin でない / 削除 / 停止）
- `SearchIndexUnavailableError` / `SystemError(DatabaseError)` は presentation 層へ propagate

### 注記
- migration 内の `INSERT … SELECT FROM search_documents` リビルドは schema 変更時の決定的経路。本 RebuildSearchIndex は host table 自体が古い / 壊れた場合の整合性回復経路。詳細は `.issue/93/adr.md` ADR-001。
- 排他制御は行わない。並走時は eventual consistency に任せる（ADR-003）。UI 側でボタン disable などのクライアント側の多重押下防止のみ行う。

---

## GetUsageMetrics

### 入力DTO
- `actorUserId`

### 出力DTO
- `userCount: number`, `storageDurableObjectBytes: number`, `storageR2Bytes: number`, `uploadsToday: number`, `llmCallsToday: number`, `alerts: AlertDTO[]`

### 処理フロー
1. admin チェック
2. UserRepository.countAdmins / listAll で集計（or 専用 メトリクスポート経由）
3. NoteRepository / MediaAssetRepository から消費量集計
4. IngestionJob / LLM 呼び出しのログから当日値（メトリクス用ポートを別途用意）

### エラーケース
- 集計失敗時は `null` を返し UI 側で「取得失敗」表示
