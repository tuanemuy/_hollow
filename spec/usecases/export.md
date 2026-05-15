# Export ユースケース

## StartExportJob（同期: 単体・軽量）

### 入力DTO
- `actorUserId: UserId | null`, `format: 'html' | 'markdown' | 'pdf'`, `targetNoteId: NoteId`, `options: ExportOptionsDTO`

### 出力DTO
- `artifact: { fileName: string; bytes: ArrayBuffer; mimeType: string }`

### 処理フロー
1. Note 取得、`Note.status === 'active'`
2. `ExportService.assertCanAccess({ viewerOwnerId: actorUserId, targetNoteIds: [targetNoteId], visibilityMap, ownerMap })`
3. 一時 ExportJob を `scope='single'` で組み立て（永続化は任意）
4. `ExportService.assembleArtifact(job, deps)`
5. 同期で結果を返却

### エラーケース
- `BusinessRuleError('export_unauthorized' | 'export_size_exceeded')`

---

## EnqueueExportJob（非同期: 一括 / 大規模）

### 入力DTO
- `actorUserId: UserId`, `format`, `scope: 'multiple' | 'view'`, `noteIds?: NoteId[]`, `viewQuery?: ViewQuerySnapshotDTO`, `options: ExportOptionsDTO`

### 出力DTO
- `jobId: ExportJobId`

### 処理フロー
1. `ExportService.assertCanAccess`（一括は viewer === owner のみ）
2. `ExportService.enforceQuota`
3. UoW: ExportJob を `status='pending'` で save
4. Queue に `RunExportJob` を enqueue

### エラーケース
- `BusinessRuleError('export_unauthorized' | 'export_quota_exceeded')`

---

## RunExportJob（ワーカー）

### 入力DTO
- `jobId: ExportJobId`

### 処理フロー
1. Job 取得、`pending` でなければ skip
2. `ExportService.resolveTargetNotes(job)` で対象 NoteId 確定
3. `job.startProcessing(total, now)` → save
4. ノート毎に Note + Media を取得、形式に応じてレンダリング
   - HTML: `HtmlRenderer.wrapForExport`
   - Markdown: `MarkdownRenderer.fromHtml`
   - PDF: `PDFRenderer.render`（mediaResolver は ObjectStorage.get）
5. 1 件単位で `recordProgress`、失敗は `recordFailedNote`
6. 全件処理後、`ArchiveBuilder.createZip`（複数 / view scope）または単体ファイルを `ObjectStorage.put`
7. `job.complete(artifactKey, size, now, ttlSec=604800)` → save

### エラーケース
- `LLMError` 等は本ジョブでは起きない
- `PDFRenderError` / `ArchiveError` → `job.fail`
- `StorageUnavailableError` → `job.fail`（再試行可）

---

## GetExportJob / ListExportJobs

### 入力DTO
- `actorUserId`, （Get: `jobId`）

### 出力DTO
- ExportJobDTO

### 処理フロー
- ExportJobRepository.findById / findByOwner、所有者一致確認

---

## DownloadExportArtifact

### 入力DTO
- `actorUserId: UserId`, `jobId: ExportJobId`

### 出力DTO
- `url: URL`, `expiresAt: Instant`

### 処理フロー
1. Job 取得、所有者確認、`status === 'completed'`、`expiresAt > now`
2. `ObjectStorage.presignDownload`（短 TTL、例 5 分）
3. 返却

### エラーケース
- `BusinessRuleError('export_not_ready' | 'export_expired')`

---

## CancelExportJob

### 入力DTO
- `actorUserId`, `jobId`

### 処理フロー
1. Job 取得、所有者確認
2. `job.cancel(now)` → save
3. アーティファクトが既に存在すれば `ObjectStorage.delete`

### エラーケース
- `BusinessRuleError('export_already_finished')`

---

## PurgeExpiredExports（バッチ）

### 処理フロー
1. ExportJobRepository.findExpired
2. 各 Job について `job.expire(now)` → save、`ObjectStorage.delete`

---

## HandleUserDeletedEvent

### 概要
ユーザー削除で関連 ExportJob をキャンセル + アーティファクト削除

### 処理フロー
- ユーザーの ExportJob を列挙 → `cancel` → `ObjectStorage.delete`
