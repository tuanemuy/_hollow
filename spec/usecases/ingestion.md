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
   - audio: `SpeechRecognitionProvider.transcribe` → `LLMProvider.structureToHtml`
   - plain: テキストをそのまま `LLMProvider.structureToHtml`
   - 加えて、`LLMProvider.suggestMetadata` でタグ・aliases 取得
5. `IngestionPreview` を組み立てて `job.attachPreview(p, now)` → save
6. 失敗時は `job.markFailed(code, reason, now)` → save。失敗もユーザーに通知できる状態にする

### エラーケース
- `LLMRateLimitError` → 再試行 (worker レベル)
- `LLMUnavailableError` / `LLMTimeoutError` → `job.markFailed('llm_failure')`
- `OCRFailureError` / `SpeechFailureError` / `PDFParseError` / `OfficeParseError` → `job.markFailed`
- `SanitizerError` → `job.markFailed('sanitize_failure')`

---

## RegenerateIngestionPreview

### 入力DTO
- `actorUserId: UserId`, `jobId: IngestionJobId`

### 出力DTO
- `jobId: IngestionJobId`

### 処理フロー
1. Job 取得、所有者確認、`status === 'previewing'`
2. `job.regenerate(now, MAX_REGEN=5)` → save
3. キューに RunIngestionJob を再 enqueue

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
5. UoW 内で `job.commit(noteId, now)` → save、`TempFileStorage.delete`
6. Outbox `note.saved` 発火

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
