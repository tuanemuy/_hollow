# Tag

ユーザー単位のタグカタログを管理する。Note は `tagIds` で参照する。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| Tag | タグ | ノートに付与するラベル |
| TagId | タグID | UUID v7 |
| TagName | タグ名 | 表示・検索用文字列。ユーザー内で一意 |
| TagBlacklist | タグブラックリスト | 削除後に自動再抽出を防ぐ名前リスト |

## エンティティ

### Tag

- フィールド:
  - `id: TagId`
  - `ownerId: UserId`
  - `name: TagName`
  - `createdAt: Instant`
  - `updatedAt: Instant`
- 振る舞い:
  - `rename(newName: TagName, now: Instant): Tag` — ユーザー内一意は集約外で検証
- 不変条件: なし（`name` の検証は TagName 値オブジェクトが担う）

> **表示件数は read-time 集計のみ（Issue #365 / #372）**
> 表示件数の真実源は read-time 集計である。タグ一覧（`tagRepository.findByOwner`）は `note_tags` × **当該 owner の** active（非 trashed）`notes` を都度 `COUNT` して件数を算出する（集計 JOIN は `notes.owner_id` で owner-scoped。詳細は `.issue/365/adr.md` ADR-004）。
> 集計値はエンティティを経由せず `findByOwner` の戻り型 `{ tag; noteCount }` から `toTagDTO(tag, noteCount)` の経路で DTO（`TagDTO.noteCount`）まで運ばれる。エンティティの `noteCount` フィールド・`incrementNoteCount`/`decrementNoteCount`、および `tags.note_count` 列・関連索引・check 制約は Issue #372 で撤去済み（#365 で死蔵化したものを除去）。方式比較の経緯は #357 を参照。

### （値オブジェクト）TagBlacklistEntry

TagBlacklistEntry は ID を持たず `(ownerId, name)` で同定されるため値オブジェクトとして扱う。下の「値オブジェクト」セクションに記載。

## 値オブジェクト

### TagName
- `value: string`
- ルール: 1..50 字、空白・改行禁止、`#` から始まる場合は除去して保持。Unicode 正規化（NFKC）後の比較で一致
- 等価性: 正規化後 `value` の完全一致

### TagBlacklistEntry
- フィールド: `ownerId: UserId`, `name: TagName`, `addedAt: Instant`
- バリデーション: `name` は TagName のルールに従う
- 等価性: `(ownerId, name)` の組

## ドメインサービス

### TagService
- 責務: タグの一意性と削除時のブラックリスト管理
- メソッド:
  - `assertNameUnique(ownerId: UserId, name: TagName, exceptId: TagId | null, repo: TagRepository): Promise<void>`
  - `computeMergePlan(source: Tag, target: Tag): { fromTagId: TagId; toTagId: TagId }` — Tag 集約内のドメインバリデーション（ownerId 一致、source !== target）を確認し、書き換え指示を返す（Note 側の `tagIds` 書き換えは MergeTags ユースケースが NoteRepository 経由で実行）
  - `renameInBody(html: ContentHtml, oldName: TagName, newName: TagName): ContentHtml` — 本文中の `#oldName` トークン（前後が単語境界）を `#newName` に置換し、新 ContentHtml を返す（純粋関数）
  - `extractFromHtml(html: ContentHtml): TagName[]` — 本文中の `#hashtag` を抽出
  - `resolveOrCreate(ownerId: UserId, names: TagName[], idGen: IdGenerator, now: Instant, repo: TagRepository, blacklistRepo: TagBlacklistRepository): Promise<TagId[]>` — ブラックリストに含まれる名前は無視

## ポート

### TagRepository
- メソッド:
  - `findById(id: TagId): Promise<Tag | null>`
  - `findByOwnerAndName(ownerId: UserId, name: TagName): Promise<Tag | null>`
  - `findByOwner(ownerId: UserId, opts: ListOpts): Promise<Tag[]>`
  - `findByIds(ids: TagId[]): Promise<Tag[]>`
  - `save(tag: Tag): Promise<void>`
  - `delete(id: TagId): Promise<void>`

### TagBlacklistRepository
- メソッド:
  - `isBlacklisted(ownerId: UserId, name: TagName): Promise<boolean>`
  - `add(entry: TagBlacklistEntry): Promise<void>`
  - `remove(ownerId: UserId, name: TagName): Promise<void>`
  - `listByOwner(ownerId: UserId): Promise<TagBlacklistEntry[]>`

## ユースケース（概要）

- CreateTag / RenameTag / DeleteTag（ブラックリストに追加）
- MergeTags
- ListTags
- RebuildNoteTagAssociation（Note 保存時の同期、TagService 経由）
