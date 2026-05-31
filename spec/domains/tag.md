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
  - `noteCount: number` — 派生値。エンティティ契約としては保持し `incrementNoteCount`/`decrementNoteCount` で更新するが、**表示件数の真実源ではない**（下記参照）
  - `createdAt: Instant`
  - `updatedAt: Instant`
- 振る舞い:
  - `rename(newName: TagName, now: Instant): Tag` — ユーザー内一意は集約外で検証
  - `incrementNoteCount(): Tag` / `decrementNoteCount(): Tag` — `noteCount >= 0` を保つ
- 不変条件: `noteCount >= 0`

> **noteCount の二層構造（Issue #365）**
> 表示件数の真実源は read-time 集計である。タグ一覧（`tagRepository.findByOwner`）は `note_tags` × **当該 owner の** active（非 trashed）`notes` を都度 `COUNT` して件数を算出し（集計 JOIN は `notes.owner_id` で owner-scoped。詳細は `.issue/365/adr.md` ADR-004）、永続化された `tags.note_count` 列は読み取らない。
> エンティティの `noteCount` フィールドと `incrementNoteCount`/`decrementNoteCount`、`tags.note_count` 列は死蔵だが残置している。理由は (1) `toTagDTO` の射影が `noteCount` フィールドを使うため契約を変えると DTO・表示側まで連鎖する、(2) `mergeTags` の `incrementNoteCount` は OCC version を同時に進めるため削ると version 進行が変わる、の2点。次に読む人が「increment の配線漏れ＝バグ」と再誤認しないように明記する。方式比較の経緯は #357 を参照。

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
