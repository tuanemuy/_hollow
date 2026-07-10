# Ingestion ユースケース

## UploadFile

### 概要
ファイルを受け取り、IngestionJob を `pending` で作成して非同期処理を開始する。

### 入力DTO
- `actorUserId: UserId`, `originalFileName: string`, `mimeType: string`, `byteSize: number`, `bodyStream: ReadableStream`

### 出力DTO
- `jobId: IngestionJobId`

### 処理フロー
1. AdminSettings から `limits` を取得し、`IngestionService.assertWithinLimits`
2. `IngestionService.detectKind` でファイル種別を判定。不明なら `BusinessRuleError('unsupported_format')`
3. 当日のアップロード数を確認、上限超過なら `BusinessRuleError('daily_upload_quota_exceeded')`
4. UoW: IngestionJob を `status='pending'` で作成、`TempFileStorage.put` で一時保存
5. キュー（Queue ポート）に処理ジョブを enqueue

### エラーケース
- `BusinessRuleError('unsupported_format' | 'size_exceeded' | 'daily_upload_quota_exceeded')`

---

## RunIngestionJob（ワーカー）

### 入力DTO
- `jobId: IngestionJobId`

### 出力DTO
- なし

### 処理フロー
1. Job 取得、`pending` でなければ skip（冪等）
2. `job.startProcessing(now)` → save
3. `TempFileStorage.get` でファイル取得
4. `IngestionService.process(job, stream, deps)` を呼ぶ。内部で kind に応じた分岐:
   - html: sanitize のみ
   - markdown: `MarkdownConverter.toHtml` → sanitize
   - office: `OfficeExtractor.extractText` → `LLMProvider.structureToHtml` → sanitize
   - pdfTextual: `PDFExtractor.extract` → `LLMProvider.structureToHtml` → sanitize
   - pdfScanned: `PDFExtractor.extract`（pageImages） → `OCRProvider.extractText`（または `LLMProvider`）→ `LLMProvider.structureToHtml`
   - image: `OCRProvider.extractText` → `LLMProvider.structureToHtml`
   - audio: `SpeechRecognitionProvider.transcribe` → `LLMProvider.structureToHtml`。**transcript が空のとき（`SpeechFailureError` を空文字に縮退、または無音で空文字）は LLM 構造化をスキップし、失敗注記入りの縮退 preview を生成する**（後述「文字起こし失敗時の縮退」、Issue #701 ADR-005）
   - plain: テキストをそのまま `LLMProvider.structureToHtml`
   - 加えて、`LLMProvider.suggestMetadata` でタグ・aliases 取得
   - LLM 構造化分岐では、事前に `DirectoryRepository.findTree(ownerId)` で取得した既存ディレクトリのパス列（正準形）を `structureToHtml` の `existingDirectories` に渡す。`findTree` 失敗時は空配列にフォールバックして取り込みを継続する。
5. `IngestionPreview` を組み立てて `job.attachPreview(p, now)` → save
   - `LLMProvider.structureToHtml` の `directorySuggestion`（パス）を既存ディレクトリ列と正規化（大小無視・スラッシュ正規化）して突き合わせる。一致した場合は `suggestedDirectoryId` に解決し `suggestedDirectoryName=null`、不一致の場合は末尾セグメントを新規の単一ディレクトリ名として `suggestedDirectoryName` に採用する（深いネスト新規作成はコミット経路の制約によりスコープ外）。
6. 失敗時は `job.markFailed(code, reason, now)` → save。失敗もユーザーに通知できる状態にする

### 文字起こし失敗時の縮退（audio、Issue #701 ADR-005）

`extractText` の `case "audio"` で `SpeechRecognitionProvider.transcribe` を呼び、**`SpeechFailureError` のみ**を catch して空文字に縮退する（`SpeechFailureError` 以外、特に未設定時 Stub の `BusinessRuleError('unsupported_format')` は catch せず素通し）。`runPipeline` で `kind === 'audio'` かつ transcript が空のとき、LLM 分岐（`structureToHtml` / `suggestMetadata`）の前で early-return 相当の縮退分岐に入り、以下で preview を組み立てて `previewing` に到達させる:

- `title = fallbackTitle(originalFileName)`（`NoteTitle` は空文字を弾くため fallback で保護）
- `contentHtml` = 失敗注記の固定 HTML（先頭に `<p class="ingestion-failure-note">…</p>`。信頼済み定数のためサニタイザ非経由で `ContentHtml.create` へ。`ContentHtml.create("")` 相当は許容される）
- `suggestedDirectoryId = null` / `suggestedTagNames: []`（`suggestMetadata` も呼ばない）

これにより利用者は注記の下に本文を追記して commit できる（AC-6）。録音元ファイルは commit 時に `MediaAsset(kind='source')` として保存される。**Speech 未設定時（Stub フォールバック）は縮退対象外で従来どおり `markFailed`**（縮退は設定済みプロバイダの transcribe 失敗時のみ）。

### エラーケース
- `LLMRateLimitError` → 再試行 (worker レベル)
- `LLMUnavailableError` / `LLMTimeoutError` → `job.markFailed('llm_failure')`
- `OCRFailureError` / `PDFParseError` / `OfficeParseError` → `job.markFailed`
- `SpeechFailureError`（設定済みプロバイダ）→ 上記「文字起こし失敗時の縮退」で空テキスト縮退し `previewing` に到達（`markFailed` しない）。Stub の `unsupported_format`（未設定時）は従来どおり `job.markFailed`
- `SanitizerError` → `job.markFailed('sanitize_failure')`

---

## RegenerateIngestionPreview

### 入力DTO
- `actorUserId: UserId`, `jobId: IngestionJobId`

### 出力DTO
- `jobId: IngestionJobId`

### 処理フロー
1. Job 取得、所有者確認、`status === 'previewing'`
2. `job.regenerate(now, MAX_REGEN=5)` → `previewing → pending` に遷移（`preview` を null に戻し `regenerationCount` をインクリメント）、`ingestion.regenerated` を outbox に発火 → save
3. dispatch が `ingestion.regenerated` を `runIngestionJob` にルーティングし、`pending → processing → previewing` で LLM を再駆動（admin retry と同一経路。usecase 戻り時点ではまだ `pending`）

### エラーケース
- `BusinessRuleError('regeneration_limit_exceeded' | 'invalid_status_for_regeneration')`

---

## CommitIngestionPreview

### 入力DTO
- `actorUserId: UserId`, `jobId: IngestionJobId`, `modifications: { title?: string; directoryId?: DirectoryId; directoryNameToCreate?: string; frontMatter?: Record<string, unknown>; tagNames?: string[]; internalLinkRefs?: InternalLinkRefDTO[]; overwriteNoteId?: NoteId }`

### 出力DTO
- `noteId: NoteId`

### 処理フロー
1. Job 取得、所有者確認、`status === 'previewing'`
2. modifications.directoryNameToCreate があれば CreateDirectory ロジックで作成
3. modifications.overwriteNoteId があれば、対象 Note の SaveNote ロジックを使う（ContentHtml を Preview の物に置換）
4. なければ `IngestionService.commitToNote` を呼んで新規 Note 作成
5. （Issue #452 / #468）`tempStorageKey !== null` のとき、元ファイルを永続保存する3段フロー（metadata-first）:
   - (a) main UoW 前: `idGenerator.next()` で mediaId 確定 → `tempFileStorage.get(tempKey)`（temp 欠損なら source 永続化をスキップ）→ **独立の小 UoW で `MediaAsset.create(kind='source')`（pending）を save**（イベント collect なし）→ `objectStorage.put('{ownerId}/source/{mediaId}', bytes, job.mimeType)`。行が blob より先に必ず存在するため、put 失敗・main UoW ロールバック・クラッシュのいずれでも残るのは `pending(kind='source')` 行 + blob であり、SweepAbandonedSourceIntakes → PurgeOrphans が自動回収する（Issue #468 ADR-002）
   - (b) main UoW 内: `findById(mediaId)` → `isPending` ガード（null / 非 pending は `SystemError(DataIntegrityError)`）→ `markAttached`（attached/refCount=1）→ save。Note の `sourceFileId` に設定。overwrite で旧 `sourceFileId` があればその `MediaAsset` を `decrementRef` で orphan 化（標準 purge worker が回収）。上限の再検証はしない（ingestion アップロード時に検証済み）
   - (c) UoW 後: 既存の `tempFileStorage.delete`
6. UoW 内で `job.commit(noteId, now)` → save、`TempFileStorage.delete`
7. Outbox `note.saved` 発火

### エラーケース
- `BusinessRuleError('invalid_status_for_commit' | 'slug_conflict')`

---

## DiscardIngestionPreview

### 入力DTO
- `actorUserId: UserId`, `jobId: IngestionJobId`

### 出力DTO
- なし

### 処理フロー
1. Job 取得、所有者確認、`status in ['previewing', 'failed']`
2. `job.discard(now)` → save
3. `TempFileStorage.delete`

### エラーケース
- `BusinessRuleError('invalid_status_for_discard')`

---

## RetryIngestionJob（admin）

failed ジョブを管理者が再試行する経路（P46 / spec G3）。owner retry とはドメイン遷移 `job.retry` を共有するが、認可セマンティクスが異なる（全 job 対象 vs 自分の job のみ）ため別 usecase。

### 入力DTO
- `actorUserId: UserId`, `jobId: IngestionJobId`

### 出力DTO
- なし

### 処理フロー
1. `assertAdmin(actorUserId)`（admin 認可。owner 一致は不要 — 全 job を retry できる）
2. Job 取得
3. `job.retry(now)` → `failed → pending`（`preview` / `errorCode` / `errorReason` を null に戻し `tempStorageKey` を保持、`regenerationCount` も保持）、`ingestion.retryRequested` を outbox に発火 → save
4. dispatch が `ingestion.retryRequested` を `runIngestionJob` にルーティングし LLM を再駆動

### エラーケース
- `ForbiddenError('FORBIDDEN_ADMIN_ONLY')`（非 admin — `assertAdmin` 由来）
- `NotFoundError('USER_NOT_FOUND')`（actor 不在 — `assertAdmin` 由来）
- `NotFoundError('INGESTION_JOB_NOT_FOUND')`（job 不在）
- `BusinessRuleError('ingestion_invalid_state_for_retry' | 'ingestion_no_temp_storage_for_retry')`

---

## OwnerRetryIngestionJob（owner）

failed ジョブを所有者が再試行する経路（spec/scenario/ingest.md B1 異常系）。`regenerateIngestionPreview` / `discardIngestionPreview` と同じ owner 認可。

### 入力DTO
- `actorUserId: UserId`, `jobId: IngestionJobId`

### 出力DTO
- `jobId: IngestionJobId`

### 処理フロー
1. Job 取得、所有者確認（`found.entity.ownerId === actor`）
2. `job.retry(now)` → `failed → pending`（admin retry と同一のドメイン遷移）、`ingestion.retryRequested` を outbox に発火 → save
3. dispatch が `ingestion.retryRequested` を `runIngestionJob` にルーティングし LLM を再駆動（usecase 戻り時点ではまだ `pending`）

owner retry には per-job の retry 回数上限は無い。コスト制御はインスタンス単位の利用上限（B2 異常系の「同一日のアップロード上限」）に委ねる方針（.issue/254/adr.md ADR-002）。

### エラーケース
- `NotFoundError('INGESTION_JOB_NOT_FOUND')`
- `ForbiddenError('INGESTION_JOB_FORBIDDEN')`（他人の job）
- `BusinessRuleError('ingestion_invalid_state_for_retry' | 'ingestion_no_temp_storage_for_retry')`

---

## GetIngestionJobs / GetIngestionJob

### 入力DTO
- 一覧: `actorUserId: UserId`, `status?: IngestionStatus`, `limit?: number`, `offset?: number`, `includeDiscarded?: boolean`
- 単体: `actorUserId: UserId`, `jobId: IngestionJobId`

### 出力DTO
- 一覧 / 単体の IngestionJobDTO

### 処理フロー
- IngestionJobRepository.findByOwner / findById、所有者一致を確認
- 既定では `discarded` を結果から除外する（取り込みキュー表示向け）
- `includeDiscarded: true` または `status: "discarded"` を明示することで履歴として取得可能
- `status` 明示指定が既定の除外条件より優先される（include が exclude に勝つ契約）

---

## BulkUpload

### 概要
複数 UploadFile を一括で受け、各々を UploadFile に委譲する。

### 入力DTO
- `actorUserId: UserId`, `files: Array<{ name; mime; size; body }>`

### 出力DTO
- `jobIds: IngestionJobId[]`, `failures: { name; reason }[]`

### 処理フロー
- 各ファイルに UploadFile を実行、結果集計
- 上限到達など個別エラーは failures へ
