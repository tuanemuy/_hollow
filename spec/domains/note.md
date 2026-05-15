# Note

ノートの本体・メタデータ・状態を保持する中核ドメイン。FrontMatter / 本文 HTML / タグ参照 / 内部リンク / 編集ロックを含む集約。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| Note | ノート | 1 つの記事に相当する集約ルート |
| NoteId | ノートID | UUID v7 |
| NoteSlug | ノートスラッグ | 公開 URL に使う識別子（ユーザー内一意） |
| ContentHtml | 本文HTML | サニタイズ済みの HTML 本文 |
| FrontMatter | フロントマター | キー値ペアのメタデータ集合 |
| InternalLink | 内部リンク | `[[Title]]` または `[[note-id]]` の参照 |
| Backlink | バックリンク | 自分を内部リンクで参照しているノートとの関係（派生） |
| NoteStatus | ノートステータス | `active` / `trashed` |
| EditLock | 編集ロック | 同時編集衝突防止のためのソフトロック |

## エンティティ

### Note（集約ルート）

- フィールド:
  - `id: NoteId`
  - `ownerId: UserId`
  - `directoryId: DirectoryId`
  - `slug: NoteSlug`
  - `title: NoteTitle`
  - `contentHtml: ContentHtml`
  - `frontMatter: FrontMatter` — 値オブジェクト
  - `tagIds: TagId[]` — 紐付くタグの ID 集合（順序不問、ユニーク）
  - `internalLinkRefs: InternalLinkRef[]` — このノートから出る参照（解決済み + 未解決）
  - `mediaRefs: MediaAssetId[]` — 本文中で使用しているメディア ID
  - `status: NoteStatus`（default `active`）
  - `trashedAt: Instant | null`
  - `createdAt: Instant`
  - `updatedAt: Instant`
  - `editLock: EditLock | null`
- 振る舞い:
  - `create(input: { ownerId; directoryId; slug; title; contentHtml; frontMatter; tagIds; internalLinkRefs; mediaRefs; now: Instant; idGen: IdGenerator }): Note`
  - `updateContent(args: { title?: NoteTitle; contentHtml?: ContentHtml; frontMatter?: FrontMatter; tagIds?: TagId[]; internalLinkRefs?: InternalLinkRef[]; mediaRefs?: MediaAssetId[]; now: Instant; actorUserId: UserId; requireLock: boolean; }): Note` — `requireLock === true` のとき `editLock` が `actorUserId` 以外 or 無効なら `BusinessRuleError('edit_locked_by_other')`。`requireLock === false` のとき他者の生きたロックがあれば `BusinessRuleError('edit_locked_by_other')`、自分のロック or 無し なら更新可。`contentHtml` / `tagIds` / `internalLinkRefs` / `mediaRefs` は `NoteService.assembleFromInputs` の戻り値をそのまま渡す前提（Note 自身は受け取った値を信頼）
  - `moveTo(newDirectoryId: DirectoryId, now: Instant): Note` — `status === 'active'` 必須
  - `rename(newTitle: NoteTitle, newSlug: NoteSlug, now: Instant): Note`
  - `trash(now: Instant): Note` — `active` → `trashed`、`trashedAt` 設定。Publication / Search 連携イベントは Outbox 経由
  - `restore(newDirectoryId: DirectoryId | null, now: Instant): Note` — `trashed` → `active`、`trashedAt = null`
  - `acquireEditLock(userId: UserId, now: Instant, ttlSeconds: number): Note` — 既存ロックが期限切れ or 同ユーザーなら奪取、他ユーザーで生きていれば `BusinessRuleError('edit_locked_by_other')`
  - `extendEditLock(userId: UserId, now: Instant, ttlSeconds: number): Note` — 自分のロックを延長
  - `releaseEditLock(userId: UserId): Note` — 他人のロックは解放不可
  - `replaceTags(tagIds: TagId[], now: Instant): Note`
- 不変条件:
  - `status === 'trashed'` のとき `directoryId` は最後の所在を保持するが、ツリー表示には含めない
  - `slug` は同一ユーザー内で一意（集約外チェック）
  - `mediaRefs` は本文 HTML 中の `<img>` `<video>` `<source>` 参照と整合（差分はサニタイズ後に算出）
  - `editLock !== null && editLock.expiresAt > now` の場合、`editLock.userId` 以外からの `updateContent` を拒否
- ライフサイクル: `active ↔ trashed`、`trashed → purged`（外部から完全削除 = 物理削除）

## 値オブジェクト

### NoteSlug
- `value: string`
- ルール: 1..120 字、`[a-z0-9][a-z0-9-]*` 形式

### NoteTitle
- `value: string`
- ルール: 1..200 字（空は不可、未入力時のフォールバック `無題` はサービス層で適用）

### ContentHtml
- `value: string` — 完全な HTML フラグメント
- ルール: 上限 1 MiB、サニタイズ後の値であること（生成側が `HtmlSanitizer` 経由）
- 等価性: `value` の完全一致

### FrontMatter
- `value: Record<string, FrontMatterValue>`（`FrontMatterValue = string | number | boolean | string[] | Record<string, FrontMatterValue>`）
- ルール: トップレベルキーは ASCII、深さ 3 以内、シリアライズサイズ 64 KiB 以下
- 既知キー: `title`, `aliases: string[]`, `tags: string[]`, `publish: 'private' | 'unlisted' | 'public'`, `created`, `updated`, `date`
- 等価性: 正規化後の構造的等価

### InternalLinkRef
- フィールド: `kind: 'id' | 'title'`, `target: string`, `resolvedNoteId: NoteId | null`, `displayText: string | null`
- ルール: `kind === 'id'` なら `target` は UUID v7。`kind === 'title'` なら 1..200 字
- 等価性: `(kind, target)` の組み合わせ

### EditLock
- フィールド: `userId: UserId`, `acquiredAt: Instant`, `expiresAt: Instant`
- ルール: `expiresAt > acquiredAt`、`ttl <= 30 分`
- 等価性: 全フィールド

## ドメインサービス

### NoteService
- 責務: 集約をまたぐ整合性（slug 一意、内部リンク解決、本文-メディア整合）
- メソッド:
  - `assertSlugUnique(ownerId: UserId, slug: NoteSlug, exceptId: NoteId | null, repo: NoteRepository): Promise<void>`
  - `extractMetadataFromHtml(html: ContentHtml): { tagsFromBody: string[]; internalLinks: InternalLinkRef[]; mediaIds: MediaAssetId[] }`
  - `resolveInternalLinks(refs: InternalLinkRef[], ownerId: UserId, repo: NoteRepository): Promise<InternalLinkRef[]>` — タイトル参照を ID 参照に解決（一致なしは未解決のまま残す）
  - `assertMediaOwnership(mediaIds: MediaAssetId[], ownerId: UserId, repo: MediaAssetRepository): Promise<void>` — 他人のメディアを参照していたら `BusinessRuleError('media_not_owned')`
  - `generateUniqueSlug(ownerId: UserId, title: NoteTitle, repo: NoteRepository): Promise<NoteSlug>` — 衝突時はサフィックス付与
  - `duplicate(source: Note, now: Instant, idGen: IdGenerator, repo: NoteRepository): Promise<Note>` — `title` に `(コピー)` を付与、新 `slug` を `generateUniqueSlug` で発行、`status = 'active'`、`editLock = null` で複製
  - `assembleFromInputs(input: { ownerId: UserId; rawContent: ContentHtml; declaredTagNames: TagName[]; declaredInternalLinkRefs: InternalLinkRef[] }, deps: { sanitizer: HtmlSanitizer; tagSvc: TagService; tagRepo: TagRepository; blacklistRepo: TagBlacklistRepository; noteRepo: NoteRepository; mediaRepo: MediaAssetRepository; idGen: IdGenerator; clock: Clock; }): Promise<{ html: ContentHtml; tagIds: TagId[]; internalLinkRefs: InternalLinkRef[]; mediaRefs: MediaAssetId[] }>` — `Note.create` / `Note.updateContent` を呼ぶ前段で常にこのヘルパを通す。処理順: HtmlSanitizer 適用 → 本文中タグ/メディア/リンク抽出 → 宣言値とマージ → TagService.resolveOrCreate → resolveInternalLinks → assertMediaOwnership

## ポート

### NoteRepository
- メソッド:
  - `findById(id: NoteId): Promise<Note | null>`
  - `findByOwnerAndSlug(ownerId: UserId, slug: NoteSlug): Promise<Note | null>`
  - `findByDirectory(directoryId: DirectoryId, opts: ListOpts): Promise<Note[]>`
  - `findByOwner(ownerId: UserId, opts: ListOpts & { status?: NoteStatus; tagIds?: TagId[]; dateRange?: DateRange }): Promise<Note[]>`
  - `findTrashedOlderThan(ownerId: UserId, before: Instant): Promise<Note[]>`
  - `findReferrers(targetNoteId: NoteId): Promise<Note[]>` — バックリンクのため
  - `save(note: Note): Promise<void>`
  - `purge(id: NoteId): Promise<void>` — 物理削除（孤児メディアイベントを発行）
  - `countByOwner(ownerId: UserId): Promise<number>`
- エラーケース: `RepositoryConflictError`（slug 一意）

### HtmlSanitizer（ポート）
- メソッド:
  - `sanitize(rawHtml: string, policy: SanitizePolicy): { html: ContentHtml; removed: Array<{ tag: string; reason: string }> }`
- エラーケース: `SanitizerError` — 内部パーサー失敗

### MarkdownConverter（ポート）
- メソッド: `toHtml(markdown: string): Promise<string>` — 後段でサニタイズ
- エラーケース: `ConversionError`

## ユースケース（概要）

- CreateNote / SaveNote（明示保存・全体更新）/ SaveNoteDraft（自動保存・タイトル+本文+メタの差分）/ RenameNote / MoveNote / DeleteNote / RestoreNote / PurgeNote
- AcquireEditLock / ExtendEditLock / ReleaseEditLock
- ListNotesByOwner / ListNotesInDirectory / SearchNotes（Search ドメインへ委譲）
- GetNoteDetail / GetBacklinks
- DuplicateNote（複製）
- BulkMoveNotes / BulkTrashNotes
