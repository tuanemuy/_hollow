# Note ユースケース

## CreateNote

### 概要
空 or 内容を持つノートを新規作成。

### 入力DTO
- `actorUserId: UserId`, `directoryId: DirectoryId | null`（null は ownerRoot を解決）, `title: string`（空可、空なら "無題"）, `contentHtml: string`（空可）, `frontMatter: Record<string, unknown>`, `tagNames: string[]`, `internalLinkRefs: InternalLinkRefDTO[]`

### 出力DTO
- `note: NoteDTO`

### 処理フロー
1. Directory 取得・所有確認、null なら `DirectoryService.ensureRoot`
2. `NoteService.assembleFromInputs` で sanitize + 抽出 + 解決
3. `NoteService.generateUniqueSlug`
4. UoW: `Note.create`、`NoteRepository.save`（タグ件数は読み取り時に集計するため、ここで `tags.note_count` 列を更新する処理は配線していない。表示件数の真実源は read-time 集計。spec/domains/tag.md 参照）
5. Outbox `note.saved` を発火（Search 連携）

### エラーケース
- `BusinessRuleError('media_not_owned' | 'slug_conflict' | 'content_too_large')`
- `ValidationError`
- `AuthorizationError`（directory 所有不一致）

---

## SaveNote

### 概要
既存ノートの明示保存（全フィールド更新）。

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `title?: string`, `contentHtml?: string`, `frontMatter?: Record<string, unknown>`, `tagNames?: string[]`, `internalLinkRefs?: InternalLinkRefDTO[]`, `requireLock: boolean`

### 出力DTO
- `note: NoteDTO`

### 処理フロー
1. Note 取得、所有者確認、`status === 'active'` 確認
2. `NoteService.assembleFromInputs({ ownerId, rawContent, declaredTagNames, declaredInternalLinkRefs }, deps)` を呼び、結果として `{ html: ContentHtml; tagIds: TagId[]; internalLinkRefs: InternalLinkRefDTO[]; mediaRefs: MediaAssetId[] }` を受け取る
3. UoW:
   - 旧 mediaRefs / tagIds を保持
   - `note.updateContent({ title, contentHtml: html, frontMatter, tagIds, internalLinkRefs, mediaRefs, actorUserId, requireLock, now })`（assembleFromInputs の戻り値をそのまま渡す）
   - NoteRepository.save
   - `MediaService.reconcileRefs(旧, 新)`
   - タグ件数は読み取り時に集計するため、`tags.note_count` 列を更新する処理は配線していない（表示件数の真実源は read-time 集計。spec/domains/tag.md 参照）
   - **NoteRevision を 1 件 insert**（Issue #158 ADR-002）— 確定した `next` Note の `title` / `contentHtml` / `frontMatter` をスナップショット。`AdminSettings.limits.maxNoteRevisionsPerNote` を超過していたら最古行を削除（同 UoW 内、ADR-004）
4. Outbox `note.saved` 発火。payload は NoteSnapshot 型: `{ noteId, ownerId, visibility, title, plainBody, tagNames, directoryPath, frontMatterDate, updatedAt }`（plainBody は HtmlSanitizer の派生メソッドで HTML→text 変換、directoryPath は DirectoryService.computePath、tagNames は TagRepository.findByIds から取得）

### エラーケース
- `BusinessRuleError('edit_locked_by_other' | 'media_not_owned' | 'content_too_large' | 'note_trashed')`
- `ValidationError`

---

## SaveNoteDraft

### 概要
自動保存。タイトル + 本文 + FrontMatter のみ部分更新。タグ / 内部リンク / メディア参照は別パスで反映。

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `title?: string`, `contentHtml?: string`, `frontMatter?: Record<string, unknown>`

### 出力DTO
- `note: NoteDTO`

### 処理フロー
1. Note 取得、所有者確認、`status === 'active'`
2. contentHtml が提供されたら sanitize のみ実施（タグ抽出はスキップ）
3. `note.updateContent({...部分, actorUserId, requireLock: false, now})`
4. NoteRepository.save
5. Outbox `note.saved` 発火（draft でも検索インデックスは更新）

### エラーケース
- `BusinessRuleError('edit_locked_by_other' | 'note_trashed')`

---

## RenameNote

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `newTitle: string`, `regenerateSlug: boolean`

### 出力DTO
- `note: NoteDTO`

### 処理フロー
1. Note 取得、所有者確認
2. `NoteService.generateUniqueSlug` を `regenerateSlug === true` のときのみ呼ぶ
3. `note.rename(newTitle, newSlug ?? 既存 slug, now)` → save
4. タイトル変更により内部リンク（タイトル参照）が更新される可能性 → Outbox `note.saved` で間接的に反映

### エラーケース
- `ValidationError`
- `BusinessRuleError('note_trashed')`

---

## MoveNote

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `newDirectoryId: DirectoryId`

### 出力DTO
- `note: NoteDTO`

### 処理フロー
1. Note / Directory 取得、所有者一致確認
2. `note.moveTo(newDirectoryId, now)` → save
3. Outbox `note.saved`（directoryPath が変わるため検索再インデックス）

### エラーケース
- `BusinessRuleError('note_trashed')`
- `AuthorizationError`

---

## BulkMoveNotes

### 入力DTO
- `actorUserId: UserId`, `noteIds: NoteId[]`, `newDirectoryId: DirectoryId`

### 出力DTO
- `successCount: number`, `failures: { noteId; reason }[]`

### 概要
複数の独立した MoveNote を順に実行する薄いオーケストレータ。トランザクションは件単位。

### 処理フロー
- 各 NoteId について個別に MoveNote ロジックを実行。1 件の失敗で全体は止まらず、結果を集計

### エラーケース
- 個別エラーは failures に積む

---

## DeleteNote

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`

### 出力DTO
- なし

### 処理フロー
1. Note 取得、所有者確認、`status === 'active'`
2. UoW: `note.trash(now)` → save → Outbox `note.deleted`
3. （Publication / Search は Outbox 経由で連鎖クリーンアップ）

### エラーケース
- `BusinessRuleError('note_already_trashed')`

---

## BulkTrashNotes
- 入力 `noteIds: NoteId[]`、各件 DeleteNote 相当を非トランザクションで実行、結果集計

---

## RestoreNote

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `restoreDirectoryId: DirectoryId | null`

### 出力DTO
- `note: NoteDTO`

### 処理フロー
1. Note 取得、所有者確認、`status === 'trashed'`
2. 復元先 Directory を解決（指定なし or 削除済みなら `DirectoryService.ensureRoot`）
3. 復元先で `NoteService.assertSlugUnique`、必要なら新 slug
4. `note.restore(restoreDirectoryId, now)` → save → Outbox `note.saved`（インデックス再追加）

### エラーケース
- `BusinessRuleError('note_not_trashed' | 'slug_conflict')`

---

## PurgeNote

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`

### 出力DTO
- なし

### 処理フロー
1. Note 取得、所有者確認、`status === 'trashed'`
2. UoW: `NoteRepository.purge(id)`、Outbox `note.purged`（Media が refCount を減算）
3. **`note_revisions` は `ON DELETE CASCADE` で物理削除される** — 履歴は別途消す必要なし（Issue #158）

### エラーケース
- `BusinessRuleError('note_not_trashed')`

---

## PurgeTrashOlderThan（バッチ）

### 概要
ゴミ箱保持期間を超えた `trashed` ノートを完全削除する。Cron で起動。

### 入力DTO
- なし（`AdminSettings.limits.trashRetentionDays` を参照）

### 出力DTO
- `purgedCount: number`

### 処理フロー
1. `NoteRepository.findTrashedOlderThan(allUsers, now - retentionDays)` を所有者まとめて取得（ページング）
2. 各 noteId について PurgeNote の処理を非トランザクションで実行（個別失敗は警告ログ）
3. 集計結果を返す

### エラーケース
- 個別 Note の purge 失敗はリトライ対象

---

## AcquireEditLock / ExtendEditLock / ReleaseEditLock

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `ttlSec: number`（Acquire/Extend のみ）

### 出力DTO
- `note: NoteDTO`

### 処理フロー
- Acquire: `note.acquireEditLock(actorUserId, now, ttlSec)` → save
- Extend: `note.extendEditLock(actorUserId, now, ttlSec)` → save
- Release: `note.releaseEditLock(actorUserId)` → save

### エラーケース
- `BusinessRuleError('edit_locked_by_other')`

---

## ListNotesByOwner

### 入力DTO
- `actorUserId: UserId`, `status?: NoteStatus`, `directoryId?: DirectoryId`, `tagIds?: TagId[]`, `dateRange?: DateRange`, `keyword?: string`, `cursor?: string`, `limit: number`

### 出力DTO
- `notes: NoteListItemDTO[]`, `nextCursor: string | null`

### 処理フロー
- `keyword` がある場合: Search ドメイン（SearchOwnNotes）に委譲
- 無い場合: `NoteRepository.listWithCount` を 1 回呼び、`{ items, count }` を取得して DTO 化（同一 filter 解決から page と total を導出するため、表示総件数と可視ページが構造的に一致する — Issue #30）

### エラーケース
- `ValidationError`

---

## ListNotesInDirectory

### 入力DTO
- `actorUserId: UserId`, `directoryId: DirectoryId`, `limit/cursor`

### 出力DTO
- `notes: NoteListItemDTO[]`, `nextCursor: string | null`

### 処理フロー
- Directory 取得・所有確認 → `NoteRepository.findByDirectory`

---

## GetNoteDetail

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`

### 出力DTO
- `note: NoteDTO`, `backlinks: BacklinkDTO[]`, `directoryPath: string`

### 処理フロー
1. Note 取得、所有者確認（trashed も閲覧可だが操作制限）
2. `NoteRepository.findReferrers(note.id)` でバックリンク
3. `DirectoryService.computePath`

### エラーケース
- `ResourceNotFoundError('note')` / `AuthorizationError`

---

## GetBacklinks
- `noteId` 指定でバックリンク一覧のみ返す

---

## DuplicateNote

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`

### 出力DTO
- `note: NoteDTO`

### 処理フロー
1. Note 取得、所有者確認
2. UoW: `NoteService.duplicate` → 保存 → Outbox `note.saved`
3. 旧 mediaRefs について MediaService.reconcileRefs で inc

---

## ListNoteRevisions（Issue #158）

### 概要
特定の Note の履歴一覧。trashed なノートでも閲覧可能。

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `limit: number`, `offset: number`

### 出力DTO
- `revisions: NoteRevisionSummaryDTO[]`, `totalCount: number`

### 処理フロー
1. Note 取得、所有者確認
2. `NoteRevisionRepository.findByNoteId(noteId, { limit, offset })` で newest-first 取得
3. `NoteRevisionRepository.countByNoteId(noteId)` で件数取得
4. Summary DTO（`id` / `noteId` / `title` / `createdAt` / `createdByUserId`）に投影

### エラーケース
- `NotFoundError('NOTE_NOT_FOUND')` / `ForbiddenError('NOTE_FORBIDDEN')`

---

## GetNoteRevision（Issue #158）

### 概要
単一の過去版 + 現在の Note 状態を返す。UI が「現在版と過去版を比較」できるようにペアで返却。

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `revisionId: NoteRevisionId`

### 出力DTO
- `revision: NoteRevisionDTO`, `note: NoteDTO`

### 処理フロー
1. Note 取得、所有者確認
2. `NoteRevisionRepository.findById(revisionId)` を取得
3. `revision.noteId === noteId` を確認（クロスノート参照拒否）

### エラーケース
- `NotFoundError('NOTE_NOT_FOUND' | 'REVISION_NOT_FOUND')` / `ForbiddenError('NOTE_FORBIDDEN')`

---

## RestoreNoteRevision（Issue #158）

### 概要
過去版を Note 本体に書き戻す。ADR-005 のセマンティクス。

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `revisionId: NoteRevisionId`

### 出力DTO
- `note: NoteDTO`

### 処理フロー（UoW 内）
1. Note 取得、所有者確認、`status === 'active'` 確認
2. Revision 取得、`noteId` / `ownerId` 整合性確認
3. **現在の Note 状態を新しい revision として insert**（セーフティネット）
4. `NoteService.assembleFromInputs` を **revision の contentHtml** に対して走らせ、タグ / 内部リンク / メディア参照を現時点で再抽出
5. `Note.updateContent({ title, contentHtml, frontMatter, tagIds, internalLinkRefs, mediaRefs, actorUserId, requireLock: false })` → save → `note.contentUpdated` イベント
6. `MediaService.reconcileRefs(旧, 新)`
7. 上限 (`maxNoteRevisionsPerNote`) 超過時は最古を削除

### エラーケース
- `BusinessRuleError('media_not_owned' | 'edit_locked_by_other' | 'note_already_trashed')`
- `NotFoundError('NOTE_NOT_FOUND' | 'REVISION_NOT_FOUND')` / `ForbiddenError('NOTE_FORBIDDEN')`
