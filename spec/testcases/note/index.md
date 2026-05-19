# Note テストケース

## CreateNote

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 空 input | CreateNote(title='', content='') | title='無題' で作成、slug 自動生成 |
| HTML 入力に script タグ | CreateNote | sanitize で除去 |
| 本文中 `#tag` 含む | CreateNote | tag 自動抽出、Tag 作成、note_tags 紐付け |
| 本文中 `[[Other]]` 含む | CreateNote | InternalLink が未解決として保存 |
| 他人 media を埋め込み | CreateNote | `BusinessRuleError('media_not_owned')` |
| 1MB 超 content | CreateNote | `BusinessRuleError('content_too_large')` |
| 同一 slug の既存ノート | CreateNote | slug をサフィックス付与で衝突回避 |

## SaveNote

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分が編集ロック保有 | SaveNote(requireLock=true) | 反映 |
| 他人が編集ロック | SaveNote(requireLock=true) | `BusinessRuleError('edit_locked_by_other')` |
| 他人ロックあり requireLock=false | SaveNote | `BusinessRuleError('edit_locked_by_other')` |
| ロックなし | SaveNote(requireLock=false) | 反映 |
| trashed ノート | SaveNote | `BusinessRuleError('note_trashed')` |
| タグ追加 | SaveNote | note_tags 更新、Tag.noteCount inc |
| タグ削除 | SaveNote | note_tags から除去、Tag.noteCount dec |
| メディア追加 | SaveNote | reconcileRefs で MediaAsset.refCount inc |

## SaveNoteDraft

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 他人ロックあり | SaveNoteDraft | `BusinessRuleError('edit_locked_by_other')` |
| 自分ロック保有 | SaveNoteDraft | 反映、タグは更新せず本文のみ |
| trashed ノート | SaveNoteDraft | `BusinessRuleError('note_trashed')` |

## RenameNote

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常リネーム regenerateSlug=false | RenameNote | title 変更、slug 維持 |
| regenerateSlug=true、衝突 | RenameNote | 新 slug + サフィックス |
| trashed | RenameNote | `BusinessRuleError('note_trashed')` |

## MoveNote / BulkMoveNotes

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分の別ディレクトリへ | MoveNote | 移動成功 |
| 他人のディレクトリへ | MoveNote | `AuthorizationError` |
| 移動先存在せず | MoveNote | `ResourceNotFoundError` |
| BulkMoveNotes 一部失敗 | BulkMoveNotes | failures 配列に蓄積、成功は反映 |

## DeleteNote / RestoreNote / PurgeNote / PurgeTrashOlderThan

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| active ノート | DeleteNote | trashed 化、Outbox `note.deleted` |
| 既に trashed | DeleteNote | `BusinessRuleError('note_already_trashed')` |
| trashed ノート | RestoreNote | active、`note.saved` 発火 |
| active を Restore | RestoreNote | `BusinessRuleError('note_not_trashed')` |
| 復元先 slug 衝突 | RestoreNote | `BusinessRuleError('slug_conflict')` |
| trashed を Purge | PurgeNote | 物理削除、Outbox `note.purged` |
| 30 日経過 trashed あり | PurgeTrashOlderThan | 該当ノートを purge、それ未満は残す |

## AcquireEditLock / ExtendEditLock / ReleaseEditLock

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| ロックなし | Acquire | lock 取得 |
| 自分のロック保有 | Acquire | 期限延長として更新 |
| 他人の有効ロック | Acquire | `BusinessRuleError('edit_locked_by_other')` |
| 他人の期限切れロック | Acquire | 奪取成功 |
| 自分ロックを Extend | Extend | expiresAt 更新 |
| 他人ロックを Extend | Extend | `BusinessRuleError` |
| 他人ロックを Release | Release | `BusinessRuleError` |

## ListNotesByOwner / ListNotesInDirectory

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 50 件のノート | ListNotesByOwner(limit=20) | 20 件 + nextCursor |
| 全件 trashed | ListNotesByOwner(status='active') | 0 件 |
| tag フィルタ複数 | ListNotesByOwner | AND 結果 |
| ディレクトリ別 | ListNotesInDirectory | 配下のみ |

## GetNoteDetail / GetBacklinks

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分のノート | GetNoteDetail | NoteDTO + backlinks + directoryPath |
| 他人のノート | GetNoteDetail | `AuthorizationError` |
| trashed | GetNoteDetail | 取得可、ただし lock UI 抑制 |
| 存在しない | GetNoteDetail | `ResourceNotFoundError` |
| 参照されている | GetBacklinks | backlinks に対応する NoteId |

## DuplicateNote

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常ノート | DuplicateNote | 新 Note、title に "(コピー)"、新 slug |
| trashed | DuplicateNote | 動作対象外（仕様: 拒否） |
| メディア参照あり | DuplicateNote | 参照 inc される（reconcileRefs） |
