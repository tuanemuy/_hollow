# Directory ユースケース

## CreateDirectory

### 概要
新規ディレクトリを作成する。

### 入力DTO
- `actorUserId: UserId`, `parentId: DirectoryId | null`, `name: string`

### 出力DTO
- `directory: DirectoryDTO`

### 処理フロー
1. parent を取得（null ならルートを `DirectoryService.ensureRoot` で確保）
2. `parent.ownerId === actorUserId` を確認、違反 `AuthorizationError`
3. `DirectoryName` 構築、`DirectoryService.assertSiblingNameUnique`
4. `parent.depth + 1 <= MAX_DEPTH` を確認、違反 `BusinessRuleError('directory_too_deep')`
5. UoW: 新規 Directory を作成して save

### エラーケース
- `ValidationError`
- `BusinessRuleError('directory_name_conflict' | 'directory_too_deep')`
- `AuthorizationError`
- `ResourceNotFoundError('directory')`

---

## RenameDirectory

### 入力DTO
- `actorUserId: UserId`, `directoryId: DirectoryId`, `newName: string`

### 出力DTO
- `directory: DirectoryDTO`

### 処理フロー
1. Directory 取得、所有者確認
2. ルート（`parentId === null`）はリネーム不可
3. `DirectoryService.assertSiblingNameUnique`（exceptId に自身）
4. `dir.rename(newName, now)` → save

### エラーケース
- `BusinessRuleError('cannot_rename_root' | 'directory_name_conflict')`
- `ValidationError`

---

## MoveDirectory

### 入力DTO
- `actorUserId: UserId`, `directoryId: DirectoryId`, `newParentId: DirectoryId | null`

### 出力DTO
- `directory: DirectoryDTO`

### 処理フロー
1. 対象 / 新親 を取得、所有者一致を確認
2. `DirectoryService.assertNotCyclicMove`
3. `DirectoryService.assertSiblingNameUnique`（移動後の親で）
4. 深さ上限を確認
5. `dir.moveTo(newParent, now)` → save（depth は子孫も再計算が必要なため、リポジトリ実装で再帰更新するか、ドメインで `recomputeDepth` を提供）

### エラーケース
- `BusinessRuleError('directory_cyclic_move' | 'directory_name_conflict' | 'directory_too_deep')`
- `AuthorizationError`

---

## DeleteDirectory

### 入力DTO
- `actorUserId: UserId`, `directoryId: DirectoryId`

### 出力DTO
- `trashedNoteIds: NoteId[]`, `deletedDirectoryIds: DirectoryId[]`

### 処理フロー
1. Directory 取得、所有者確認、ルートは削除不可
2. UoW: `DirectoryService.deleteSubtree(dir, now, { dirRepo, noteRepo })`
3. 戻り値の各 trashedNoteId について Outbox イベント `note.deleted` を発火（Publication の `note.publish_changed`, Search の delete も連鎖）

### エラーケース
- `BusinessRuleError('cannot_delete_root')`
- `AuthorizationError`

---

## GetDirectoryTree

### 入力DTO
- `actorUserId: UserId`

### 出力DTO
- `tree: DirectoryTreeNode[]`（再帰構造）

### 処理フロー
1. `DirectoryRepository.findTree(actorUserId)`
2. フラット配列を木に組み立てて返す

### エラーケース
- なし
