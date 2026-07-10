# Ingestion テストケース

## UploadFile

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 対応形式、サイズ内 | Upload(html) | Job 作成、temp 保存、outbox に ingestion job 作成イベント発火（Queue 直接 enqueue ではなく outbox 経由） |
| 対応外形式 | Upload(zip) | `BusinessRuleError('unsupported_format')` |
| サイズ超過 | Upload(50MB+1) | `BusinessRuleError('ingestion_byte_size_exceeds_limit')` |
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
| 音声（文字起こし成功） | Run | SpeechRecognition → LLM → previewing |
| 音声（設定済みプロバイダで `SpeechFailureError`） | Run | 空テキストに縮退。`structureToHtml` / `suggestMetadata` を**呼ばず**、`ingestion-failure-note` 注記入りの縮退 preview で previewing に到達（`markFailed` しない、Issue #701 ADR-005） |
| 音声（無音で transcribe が空文字） | Run | 上と同じ縮退分岐で previewing（LLM スキップ） |
| 音声（未設定 / Stub の `unsupported_format`） | Run | 縮退対象外。`job.markFailed`（previewing に到達しない。縮退は `SpeechFailureError` のみ） |
| LLM 失敗 | Run | `job.markFailed('llm_failure')` |
| OCR 失敗 | Run | `job.markFailed('ocr_failure')` |
| sanitize 失敗 | Run | `job.markFailed('sanitize_failure')` |

## RegenerateIngestionPreview

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| previewing 状態 | Regenerate | `previewing → pending` に遷移、regenerationCount++、preview を null に、`ingestion.regenerated` を発火（dispatch が `runIngestionJob` にルーティングして再駆動） |
| 5 回到達後の 6 回目 | Regenerate | `BusinessRuleError('regeneration_limit_exceeded')` |
| failed 状態 | Regenerate | `BusinessRuleError('invalid_status_for_regeneration')` |

## CommitIngestionPreview

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| previewing で commit | Commit | Note 作成、temp 削除、job saved |
| modifications.directoryNameToCreate | Commit | 新ディレクトリ作成 |
| overwriteNoteId 指定 | Commit | 既存ノートを SaveNote ロジックで更新 |
| 不正な状態（pending） | Commit | `BusinessRuleError('invalid_status_for_commit')` |
| temp blob 欠損（tempStorageKey は非 null だが実体なし） | Commit | source 永続化をスキップして commit は完走（Note 作成・job saved・`sourceFileId` は null）。pending 行も blob も残らず（skip 判定が行 insert より先）、warn ログで観測可能（Issue #468） |
| main UoW ロールバック（例: 実在しない directoryId） | Commit | `pending(kind='source')` 行と source blob が残存し、outbox に `media.*` は残らない。temp blob は保全され、同一 job の再 commit が新しい pending 行で完走する（放棄行は pending のまま干渉しない）。放棄行のみ SweepAbandonedSourceIntakes → PurgeOrphans で自動回収され、再 commit した source は無傷（Issue #468） |
| ステージ (a) の R2 put 失敗（pending 行 save 後） | Commit | `SystemError(EXTERNAL_API_ERROR)` で reject。blob なしの `pending(kind='source')` 行が残り（行なし blob は生じない）、note / job は未変更・outbox に `media.*` は残らないまま SweepAbandonedSourceIntakes → PurgeOrphans で行が回収される（Issue #468） |
| ステージ (a) 完了後・main UoW 前に pending 行が消失 | Commit | `SystemError(DATA_INTEGRITY_ERROR)` で reject、main UoW 全体がロールバック（note 未作成、job は previewing のまま）（Issue #468） |
| ステージ (a) 完了後・main UoW 前に pending 行が非 pending へ遷移 | Commit | `SystemError(DATA_INTEGRITY_ERROR)` で reject、main UoW 全体がロールバック（note 未作成、job は previewing のまま）（Issue #468） |

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
| 他人のジョブ | Get | `ForbiddenError('INGESTION_JOB_FORBIDDEN')` |
| discarded を含む自分のジョブ群 | Get（status 未指定） | discarded を含まない一覧 |
| discarded を含む自分のジョブ群 | Get（`includeDiscarded: true`） | discarded を含む一覧 |
| discarded を含む自分のジョブ群 | Get（`status: "discarded"`） | discarded のみ含む一覧 |

## BulkUpload

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 5 ファイル混合（成功 / 不可） | BulkUpload | jobIds と failures に分かれる |
