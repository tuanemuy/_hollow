# Export

エクスポートジョブの状態管理と成果物配布を扱う。Note と Media を ID で参照。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| ExportJob | エクスポートジョブ | 1 度のエクスポート要求 |
| ExportJobId | エクスポートジョブID | UUID v7 |
| ExportFormat | エクスポート形式 | `html` / `markdown` / `pdf` |
| ExportScope | エクスポート範囲 | `single` / `multiple` / `view` |
| ExportOptions | オプション | FrontMatter 包含、メディア埋め込み等のフラグ |
| ExportArtifact | 成果物 | ZIP もしくは単体ファイル。R2 保存 |

## エンティティ

### ExportJob（集約ルート）

- フィールド:
  - `id: ExportJobId`
  - `ownerId: UserId`
  - `format: ExportFormat`
  - `scope: ExportScope`
  - `targetNoteIds: NoteId[]`
  - `viewQuery: ViewQuerySnapshot | null` — `scope === 'view'` 時
  - `options: ExportOptions`
  - `status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'expired'`
  - `artifactKey: string | null` — R2 のキー
  - `artifactSize: number | null`
  - `errorReason: string | null`
  - `errorCode: string | null`
  - `progress: { processed: number; total: number }`
  - `failedNoteIds: NoteId[]`
  - `createdAt: Instant`
  - `updatedAt: Instant`
  - `completedAt: Instant | null`
  - `expiresAt: Instant | null` — 既定 7 日
- 振る舞い:
  - `startProcessing(total: number, now: Instant): ExportJob` — `pending` → `processing`、`progress.total = total`
  - `recordProgress(processed: number, now: Instant): ExportJob`
  - `recordFailedNote(noteId: NoteId, now: Instant): ExportJob`
  - `complete(artifactKey: string, size: number, now: Instant, ttlSec: number): ExportJob` — `processing` → `completed`、`expiresAt` 設定
  - `fail(code: string, reason: string, now: Instant): ExportJob`
  - `cancel(now: Instant): ExportJob` — `pending` / `processing` → `cancelled`
  - `expire(now: Instant): ExportJob` — `completed` → `expired`（成果物は別途削除ジョブ）
- 不変条件:
  - `status === 'completed'` のとき `artifactKey !== null && expiresAt !== null`
  - `progress.processed <= progress.total`

## 値オブジェクト

### ExportFormat / ExportScope
- 列挙

### ExportOptions
- フィールド: `includeFrontMatter: boolean`, `embedMedia: boolean`, `pdfPaperSize: 'A4' | 'Letter' | null`
- 等価性: 全フィールド一致

### ViewQuerySnapshot
- フィールド: `directoryId: DirectoryId | null`, `tagIds: TagId[]`, `dateRange: DateRange | null`, `keyword: string | null`, `referencingNoteId: NoteId | null`
- 等価性: 全フィールド一致

## ドメインサービス

### ExportService
- 責務: ジョブ実行のオーケストレーション
- メソッド:
  - `assembleArtifact(job: ExportJob, deps: { noteRepo; mediaRepo; storage; pdfRenderer; markdownRenderer; htmlRenderer }): Promise<{ key: string; size: number }>` — 形式に応じて成果物を組み立て、R2 にアップロード
  - `resolveTargetNotes(job: ExportJob, repos: { noteRepo: NoteRepository; tagRepo: TagRepository }): Promise<NoteId[]>` — `scope === 'view'` のときクエリを実行
  - `enforceQuota(job: ExportJob, currentUserUsage: number, limits: ExportLimits): void` — `BusinessRuleError('export_quota_exceeded')`
  - `assertCanAccess(args: { viewerOwnerId: UserId | null; targetNoteIds: NoteId[]; visibilityMap: Map<NoteId, Visibility>; ownerMap: Map<NoteId, UserId> }): void` — 訪問者（`viewerOwnerId === null`）は `visibilityMap` がすべて `public` のときのみ許可。一括（`scope !== 'single'`）は `viewerOwnerId !== null` かつ全ノートが自分所有 のみ許可。違反は `BusinessRuleError('export_unauthorized')`

## ポート

### ExportJobRepository
- `findById(id: ExportJobId): Promise<ExportJob | null>`
- `findByOwner(ownerId: UserId, opts: ListOpts): Promise<ExportJob[]>`
- `findExpired(now: Instant, limit: number): Promise<ExportJob[]>`
- `save(job: ExportJob): Promise<void>`

### PDFRenderer（ポート）
- メソッド: `render(html: string, options: { paper: 'A4' | 'Letter'; embedMedia: boolean; mediaResolver: (id: MediaAssetId) => Promise<ArrayBuffer | null> }): Promise<ArrayBuffer>`
- エラーケース: `PDFRenderError`

### MarkdownRenderer（ポート）
- メソッド: `fromHtml(html: string, options: { includeFrontMatter: boolean; frontMatter: FrontMatter }): Promise<string>`
- エラーケース: `RenderError`

### HtmlRenderer（ポート）
- メソッド: `wrapForExport(html: string, options: { includeFrontMatter: boolean; frontMatter: FrontMatter; designTokens: Record<string, string> }): Promise<string>`

### ArchiveBuilder（ポート）
- メソッド:
  - `createZip(files: AsyncIterable<{ path: string; bytes: ArrayBuffer }>): Promise<ArrayBuffer>`
- エラーケース: `ArchiveError`

## ユースケース（概要）

- StartExportJob（同期: 単体小サイズ） / EnqueueExportJob（非同期）
- GetExportJob / ListExportJobs
- DownloadExportArtifact（プリサインド URL 生成）
- CancelExportJob
- PurgeExpiredExports（バッチ）
