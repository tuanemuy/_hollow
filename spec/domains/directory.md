# Directory

ユーザーごとのノート格納ディレクトリツリーを管理する。Note 集約は `directoryId` で参照する。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| Directory | ディレクトリ | ノートを格納する階層的なコンテナ |
| DirectoryId | ディレクトリID | UUID v7 |
| DirectoryPath | ディレクトリパス | ルートからの `/` 区切り表現（読み取り用、保存は parentId） |
| Root | ルート | ユーザーごとに 1 つ存在する仮想ディレクトリ（`parentId === null`） |

## エンティティ

### Directory（集約ルート）

- フィールド:
  - `id: DirectoryId`
  - `ownerId: UserId`
  - `parentId: DirectoryId | null` — null は ルート専用
  - `name: DirectoryName` — ルートは空文字を許容
  - `slug: string` — URL 用、`name` を kebab 化（ルートは空）
  - `depth: number` — ルート 0、子は親 +1
  - `createdAt: Instant`
  - `updatedAt: Instant`
- 振る舞い:
  - `rename(newName: DirectoryName, now: Instant): Directory` — 既存兄弟と重複しないことは集約外チェック（DomainService）
  - `moveTo(newParent: Directory, now: Instant): Directory` — `newParent.depth + 1 <= MAX_DEPTH`、循環防止（祖先チェックはサービス）
- 不変条件:
  - ルートディレクトリは 1 ユーザーにつき 1 つ
  - `depth <= MAX_DEPTH`（既定 10）
  - 自身の祖先を新しい親にできない
  - 同一親配下に同名（case-insensitive）の兄弟が存在しない

## 値オブジェクト

### DirectoryName
- `value: string`
- ルール: 1..80 字、`/` `\` `<` `>` `:` `|` `?` `*` `\0` 禁止。前後空白トリム
- ルート専用に空文字許容（生成時フラグ）
- 等価性: 大文字小文字を区別しない比較

## ドメインサービス

### DirectoryService
- 責務: 集約をまたぐ階層整合性を担保
- メソッド:
  - `assertSiblingNameUnique(parentId: DirectoryId | null, name: DirectoryName, exceptId: DirectoryId | null, repo: DirectoryRepository): Promise<void>`
  - `assertNotCyclicMove(target: Directory, newParent: Directory, repo: DirectoryRepository): Promise<void>`
  - `computePath(dir: Directory, repo: DirectoryRepository): Promise<DirectoryPath>`
  - `ensureRoot(ownerId: UserId, now: Instant, idGen: IdGenerator, repo: DirectoryRepository): Promise<Directory>` — 無ければ作る
  - `deleteSubtree(dir: Directory, now: Instant, repos: { dirRepo: DirectoryRepository; noteRepo: NoteRepository }): Promise<{ trashedNoteIds: NoteId[]; deletedDirectoryIds: DirectoryId[] }>` — 配下のディレクトリを深さ優先で辿り、各ディレクトリ配下の `active` ノートをすべて `trash()` した後、ディレクトリ自身を物理削除する。戻り値は呼び出し元 usecase が Outbox イベント（`note.deleted` を `trashedNoteIds` 分発火）の組み立てに利用する

## ポート

### DirectoryRepository
- メソッド:
  - `findById(id: DirectoryId): Promise<Directory | null>`
  - `findRoot(ownerId: UserId): Promise<Directory | null>`
  - `findChildren(parentId: DirectoryId): Promise<Directory[]>`
  - `findTree(ownerId: UserId): Promise<Directory[]>` — フラット配列で返し、呼び出し側で木に組む
  - `findAncestors(id: DirectoryId): Promise<Directory[]>`
  - `findBySiblingName(parentId: DirectoryId | null, ownerId: UserId, name: DirectoryName): Promise<Directory | null>`
  - `save(d: Directory): Promise<void>`
  - `delete(id: DirectoryId): Promise<void>` — 単一ディレクトリの物理削除（配下を持たない前提。配下の処理は `DirectoryService.deleteSubtree` が事前に行う）
- エラーケース:
  - `RepositoryConflictError` — sibling name uniqueness

## ユースケース（概要）

- CreateDirectory
- RenameDirectory
- MoveDirectory
- DeleteDirectory（配下のノートはゴミ箱へ、孫ディレクトリも再帰）
- GetDirectoryTree
