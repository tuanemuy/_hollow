# Ingestion

ファイルアップロードから LLM 構造化までのジョブを管理する。完了時に Note を生成する。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| IngestionJob | 取り込みジョブ | 1 ファイル単位の取り込み |
| IngestionJobId | 取り込みジョブID | UUID v7 |
| IngestionStatus | ステータス | `pending` / `processing` / `previewing` / `saved` / `failed` / `discarded` |
| SourceFileKind | 種別 | `html` / `markdown` / `office` / `pdfTextual` / `pdfScanned` / `image` / `audio` / `plain` |
| IngestionPreview | プレビュー | 保存前に提示する仮ノートデータ |
| RegenerationCount | 再生成回数 | 保存前の再生成回数（上限あり） |

## エンティティ

### IngestionJob（集約ルート）

- フィールド:
  - `id: IngestionJobId`
  - `ownerId: UserId`
  - `originalFileName: string`
  - `mimeType: string`
  - `byteSize: number`
  - `kind: SourceFileKind`
  - `status: IngestionStatus`
  - `tempStorageKey: string | null` — R2 一時保存のキー（保存完了で削除）
  - `preview: IngestionPreview | null`
  - `errorReason: string | null`
  - `errorCode: string | null` — `'unsupported_format'` / `'size_exceeded'` / `'llm_failure'` / `'sanitize_failure'` / ...
  - `regenerationCount: number`（default 0）
  - `createdAt: Instant`
  - `updatedAt: Instant`
  - `savedAsNoteId: NoteId | null`
- 振る舞い:
  - `startProcessing(now: Instant): IngestionJob` — `pending` → `processing`
  - `attachPreview(p: IngestionPreview, now: Instant): IngestionJob` — `processing` → `previewing`
  - `markFailed(code: string, reason: string, now: Instant): IngestionJob` — 任意 → `failed`
  - `regenerate(now: Instant, maxRegenerations: number): IngestionJob` — `previewing` 必須、`regenerationCount` をインクリメント、超過は `BusinessRuleError('regeneration_limit_exceeded')`、状態を `pending` に戻し `preview` を null に。`ingestion.regenerated` を発火し、dispatch 経由で `runIngestionJob` が `pending → processing → previewing` を再駆動する（admin retry と同一経路）
  - `retry(now: Instant): IngestionJob` — `failed` 必須、`failed → pending` に戻し `preview` / `errorCode` / `errorReason` を null に。`tempStorageKey` と `regenerationCount` は保持する（retry は回数を参照も加算もしない）。`tempStorageKey === null`（reclaimed 済み）のときは `BusinessRuleError('ingestion_no_temp_storage_for_retry')`、`failed` 以外からの呼び出しは `BusinessRuleError('ingestion_invalid_state_for_retry')`。`ingestion.retryRequested` を発火し dispatch 経由で `runIngestionJob` が再駆動。認可非依存で、admin retry（`RetryIngestionJob`）と owner retry（`OwnerRetryIngestionJob`）の両 usecase が共有する
  - `commit(noteId: NoteId, now: Instant): IngestionJob` — `previewing` → `saved`、`savedAsNoteId` 設定
  - `discard(now: Instant): IngestionJob` — `previewing` / `failed` → `discarded`
- 不変条件:
  - `status === 'saved'` のとき `savedAsNoteId !== null`
  - `regenerationCount <= maxRegenerations`（既定 5）
  - retry には per-job の回数上限が無く、`regenerationCount` は retry の終端条件として機能しない。owner retry のコスト制御はインスタンス単位の利用上限に委ねる（.issue/254/adr.md ADR-002）
  - `byteSize <= MAX_BYTES`（既定 50 MiB、`kind` によって細分化）

### IngestionPreview（値オブジェクトに近いが Job に内包）

- フィールド:
  - `title: NoteTitle`
  - `contentHtml: ContentHtml`
  - `suggestedDirectoryId: DirectoryId | null`
  - `suggestedDirectoryName: string | null` — 新規ディレクトリ提案
  - `frontMatter: FrontMatter`
  - `suggestedTagNames: TagName[]`
  - `internalLinkRefs: InternalLinkRef[]`
  - `mediaRefs: MediaAssetId[]`

## 値オブジェクト

### SourceFileKind（列挙）
- 上記の通り

## ドメインサービス

### IngestionService
- 責務: アップロード受付・形式判定・LLM 呼び出し・プレビュー生成・コミット
- メソッド:
  - `detectKind(mimeType: string, fileName: string): SourceFileKind` — 不明は `unsupported`（エラー）
  - `assertWithinLimits(kind: SourceFileKind, byteSize: number, limits: IngestionLimits): void` — 違反は `BusinessRuleError`
  - `process(job: IngestionJob, file: ReadableStream, deps: IngestionDeps): Promise<IngestionPreview>` — kind に応じた処理を内部で分岐
  - `commitToNote(job: IngestionJob, modifications: Partial<IngestionPreview> & { directoryId?: DirectoryId; titleOverride?: NoteTitle }, deps: IngestionCommitDeps): Promise<NoteId>`

### 補助型

```ts
type IngestionDeps = {
  llm: LLMProvider;
  ocr: OCRProvider;
  speech: SpeechRecognitionProvider;
  markdown: MarkdownConverter;
  sanitizer: HtmlSanitizer;
  office: OfficeExtractor;
  pdf: PDFExtractor;
  promptResolver: PromptResolver;
};
type IngestionCommitDeps = {
  idGen: IdGenerator;
  clock: Clock;
  uow: UnitOfWorkContext;     // 呼び出し元 usecase が UoW.run({...}) 内で渡す
  noteSvc: NoteService;
  tagSvc: TagService;
  noteRepo: NoteRepository;
  tagRepo: TagRepository;
  blacklistRepo: TagBlacklistRepository;
  mediaRepo: MediaAssetRepository;
  dirRepo: DirectoryRepository;
};
```

## ポート

### IngestionJobRepository
- `findById(id: IngestionJobId): Promise<IngestionJob | null>`
- `findByOwner(ownerId: UserId, opts: ListOpts): Promise<IngestionJob[]>`
- `save(job: IngestionJob): Promise<void>`
- `findStuck(threshold: Instant): Promise<IngestionJob[]>` — `processing` のまま放置されたジョブ

### LLMProvider（ポート）
- メソッド:
  - `structureToHtml(input: { rawText: string; prompt: string; locale: string }): Promise<{ html: string; titleSuggestion: string; directorySuggestion: string | null }>`
  - `suggestMetadata(input: { html: string; prompt: string }): Promise<{ tags: string[]; aliases: string[] }>`
- エラーケース: `LLMRateLimitError` / `LLMUnavailableError` / `LLMTimeoutError` / `LLMQuotaExceededError`

### OCRProvider（ポート）
- メソッド: `extractText(input: { imageBytes: ArrayBuffer; mime: string }): Promise<string>`
- エラーケース: `OCRFailureError`

### SpeechRecognitionProvider（ポート）
- メソッド: `transcribe(input: { audioBytes: ArrayBuffer; mime: string; locale: string }): Promise<string>`
- エラーケース: `SpeechFailureError`

### OfficeExtractor（ポート）
- メソッド: `extractText(input: { bytes: ArrayBuffer; mime: string }): Promise<{ text: string; structureHints: string[] }>`
- エラーケース: `OfficeParseError`

### PDFExtractor（ポート）
- メソッド: `extract(input: { bytes: ArrayBuffer }): Promise<{ textual: boolean; text: string; pageImages: ArrayBuffer[] }>` — `textual === false` のとき呼び出し側が OCR/LLM へ
- エラーケース: `PDFParseError`

### PromptResolver（ポート）
- メソッド:
  - `resolveFor(userId: UserId, purpose: 'structure' | 'title' | 'directory' | 'metadata'): Promise<string>` — ユーザー個別 → インスタンスデフォルトの順で解決

### TempFileStorage（ポート）
- メソッド: `put(key: string, bytes: ArrayBuffer): Promise<void>` / `get(key): Promise<ArrayBuffer>` / `delete(key): Promise<void>`

## ユースケース（概要）

- UploadFile（POST → 取り込み Job 生成）
- RunIngestionJob（処理本体）
- RegenerateIngestionPreview
- CommitIngestionPreview（Note 生成）
- DiscardIngestionPreview
- GetIngestionJobs / GetIngestionJob
- BulkUpload
