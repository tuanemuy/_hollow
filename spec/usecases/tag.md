# Tag ユースケース

## CreateTag

### 入力DTO
- `actorUserId: UserId`, `name: string`

### 出力DTO
- `tag: TagDTO`

### 処理フロー
1. `TagName` 構築
2. `TagService.assertNameUnique`
3. UoW: Tag を作成、save
4. TagBlacklist にあれば自動的に削除（既にブラックリスト解除扱い）

### エラーケース
- `ValidationError` / `BusinessRuleError('tag_name_conflict')`

---

## RenameTag

### 入力DTO
- `actorUserId: UserId`, `tagId: TagId`, `newName: string`

### 出力DTO
- `tag: TagDTO`, `affectedNoteIds: NoteId[]`

### 処理フロー
1. Tag 取得、所有者確認
2. 新名 `TagName` 構築、`TagService.assertNameUnique`
3. UoW: `tag.rename(newName, now)` → save
4. 本文 HTML 中の `#oldName` を `#newName` に置換するため、関連ノートを `NoteRepository.findByOwner({ tagIds: [tagId] })` で取得し、各 Note の contentHtml を `TagService.renameInBody` で置換した結果で `note.updateContent` で保存（Outbox `note.saved` を発火）
5. 結果として影響を受けた NoteId を返却

### エラーケース
- `ValidationError`
- `BusinessRuleError('tag_name_conflict')`

---

## MergeTags

### 入力DTO
- `actorUserId: UserId`, `sourceTagId: TagId`, `targetTagId: TagId`

### 出力DTO
- `affectedNoteIds: NoteId[]`

### 処理フロー
1. Source / Target Tag 取得、所有者一致、source !== target
2. `TagService.computeMergePlan` で書き換え計画を取得
3. UoW: 関連ノートを取得し、各 Note の `replaceTags(tagIdsから source を除き target を含めた重複排除セット)` を呼び、save
4. Source Tag を delete（Target Tag 行は変更しないため version も進めない。表示件数は read-time 集計。`tags.note_count` 列は Issue #372 で撤去済み。spec/domains/tag.md 参照）
5. Outbox `note.saved` を該当ノート分発火

### エラーケース
- `BusinessRuleError('tag_merge_same' | 'tag_owner_mismatch')`

---

## DeleteTag

### 入力DTO
- `actorUserId: UserId`, `tagId: TagId`

### 出力DTO
- `affectedNoteIds: NoteId[]`

### 処理フロー
1. Tag 取得、所有者確認
2. UoW: 関連ノートを取得し、各 Note から tag を `replaceTags(現在の tagIds - 削除対象)` で除去、save
3. TagBlacklistRepository.add(`{ ownerId, name, addedAt }`)
4. TagRepository.delete
5. Outbox `note.saved` 発火

### エラーケース
- `AuthorizationError`

---

## ListTags

### 入力DTO
- `actorUserId: UserId`, `limit/cursor`

### 出力DTO
- `tags: TagDTO[]`, `nextCursor: string | null`

### 処理フロー
- TagRepository.findByOwner

---

## RebuildNoteTagAssociation（内部用、Note の SaveNote / Ingestion から間接呼び出し）

### 概要
Note 保存時に declaredTagNames + 本文抽出名から TagId セットを解決する内部処理。

### 処理フロー
- `TagService.resolveOrCreate` を呼ぶ
- TagBlacklist に含まれる名前は除外
- 戻り値 TagId[] を呼び出し元に返す

### エラーケース
- `ValidationError`
