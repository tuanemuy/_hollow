# Ingestion テストケース

## UploadFile

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 対応形式、サイズ内 | Upload(html) | Job 作成、temp 保存、Queue enqueue |
| 対応外形式 | Upload(zip) | `BusinessRuleError('unsupported_format')` |
| サイズ超過 | Upload(50MB+1) | `BusinessRuleError('size_exceeded')` |
| 当日上限到達 | Upload | `BusinessRuleError('daily_upload_quota_exceeded')` |
| MIME 偽装（実際は対応外） | Upload | RunIngestionJob でエラー、`job.markFailed` |

## RunIngestionJob

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| HTML ファイル | Run | sanitize 済みで previewing |
| Markdown ファイル | Run | HTML 化 → sanitize → previewing |
| Office (docx) | Run | OfficeExtractor → LLM → previewing |
| PDF textual | Run | PDFExtractor → LLM → previewing |
| PDF scanned | Run | PDFExtractor → OCR → LLM → previewing |
| 画像 | Run | OCR → LLM → previewing |
| 音声 | Run | SpeechRecognition → LLM → previewing |
| LLM 失敗 | Run | `job.markFailed('llm_failure')` |
| OCR 失敗 | Run | `job.markFailed('ocr_failure')` |
| sanitize 失敗 | Run | `job.markFailed('sanitize_failure')` |

## RegenerateIngestionPreview

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| previewing 状態 | Regenerate | regenerationCount++、再 enqueue |
| 5 回到達後の 6 回目 | Regenerate | `BusinessRuleError('regeneration_limit_exceeded')` |
| failed 状態 | Regenerate | `BusinessRuleError('invalid_status_for_regeneration')` |

## CommitIngestionPreview

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| previewing で commit | Commit | Note 作成、temp 削除、job saved |
| modifications.directoryNameToCreate | Commit | 新ディレクトリ作成 |
| overwriteNoteId 指定 | Commit | 既存ノートを SaveNote ロジックで更新 |
| 不正な状態（pending） | Commit | `BusinessRuleError('invalid_status_for_commit')` |

## DiscardIngestionPreview

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| previewing | Discard | status=discarded、temp 削除 |
| failed | Discard | status=discarded |
| saved | Discard | `BusinessRuleError('invalid_status_for_discard')` |

## GetIngestionJobs / GetIngestionJob

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分のジョブ | Get | DTO |
| 他人のジョブ | Get | `AuthorizationError` |

## BulkUpload

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 5 ファイル混合（成功 / 不可） | BulkUpload | jobIds と failures に分かれる |
