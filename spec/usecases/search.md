# Search ユースケース

> 検索インデックスの再構築（`bulkRebuildFromSnapshots` 経路）は admin 専用 operation として `AdminSettings.RebuildSearchIndex`（spec/usecases/adminSettings.md）に集約する。

## HandleNoteSavedEvent / HandleNoteTrashedEvent / HandlePublicationChangedEvent

### 概要
他ドメインの Outbox イベントを受けて IndexJob を enqueue する。本セクションの `note.saved` / `note.deleted` は**論理 event 名**で、実装の物理 event 群を集約したもの（下表参照）。

### 物理 event ↔ 論理 event / search handler のマッピング

| 物理 event | 論理 event | search handler |
|---|---|---|
| `note.created` | `note.saved` | HandleNoteSavedEvent |
| `note.content_updated` | `note.saved` | HandleNoteSavedEvent |
| `note.renamed` | `note.saved` | HandleNoteSavedEvent |
| `note.moved` | `note.saved` | HandleNoteSavedEvent |
| `note.restored` | `note.saved` | HandleNoteSavedEvent |
| `note.tags_replaced` | `note.saved` | HandleNoteSavedEvent |
| `note.trashed` | `note.deleted` | HandleNoteTrashedEvent |
| `note.purged` | `note.deleted` | HandleNoteTrashedEvent |
| `note.publish_changed` | `note.publish_changed` | HandlePublicationChangedEvent |

NoteSnapshot は event payload には含まれない（payload は `noteId` を含む最小集合）。dispatcher 側で `noteRepository.findById` + `buildNoteSnapshots` で最新 snapshot を再構築して handler の入力 `{ snapshot }` に渡す（Issue #145 ADR-001）。

### 入力DTO
- HandleNoteSavedEvent: `{ snapshot: NoteSnapshot }`
- HandleNoteTrashedEvent: `{ noteId: NoteId }`
- HandlePublicationChangedEvent: `{ snapshot: NoteSnapshot }`

### 処理フロー
- HandleNoteSavedEvent: IndexJob を `op='upsert'`, `noteId=snapshot.noteId`, `attempts=0` で `enqueue`。payload に最新 NoteSnapshot を含める
- HandleNoteTrashedEvent: IndexJob を `op='delete'` で enqueue
- HandlePublicationChangedEvent: visibility が変わるため `op='upsert'`、payload に最新 NoteSnapshot を含める

### dispatcher 側の事前処理（snapshot 再構築）

物理 save 系 6 event および `note.publish_changed` の処理では、dispatcher が UoW を開設して `noteRepository.findById` を呼び、以下のいずれかに該当する場合は handler 呼び出しを skip（handled + logger.info）する:

1. `findById === null`（trash → purge レースで note が消えている）
2. `note.status === 'trashed'`（蘇生レース防止 — Issue #145 ADR-007 "trashed status guard"）

`note.trashed` の dispatch では search 側 HandleNoteTrashedEvent と publication 側 HandleNoteTrashedEvent に fan-out する。順序は search → publication で固定（publication.changeVisibilityAndCascade が `note.publish_changed` を emit するため、search delete を先に終わらせる）。`note.purged` は search 側のみ routing（publication / media / view 側の purge handler routing は別 Issue 範囲）。

### エラーケース
- `IndexJobRepository` の重複は許容（at-least-once 前提）

---

## ConsumeIndexJob（ワーカー）

### 入力DTO
- `jobId: IndexJobId`

### 処理フロー
1. IndexJob 取得
2. `op === 'upsert'`: payload の NoteSnapshot から `SearchService.applyUpsert`
3. `op === 'delete'`: `SearchService.applyDelete(noteId)`
4. 成功時 `IndexJobRepository.complete`、失敗時 `recordAttempt + fail`、attempts >= 3 で DLQ

### エラーケース
- `SearchIndexUnavailableError` → 再試行
- `SearchTimeoutError` → 再試行
- それ以外 → DLQ

---

## SearchOwnNotes

### 入力DTO
- `actorUserId: UserId`, `keyword: string`, `tagNames?: string[]`, `directoryId?: DirectoryId`, `dateRange?: DateRange`, `cursor?: string`, `limit: number`

### 出力DTO
- `hits: SearchHitDTO[]`, `nextCursor: string | null`

### 処理フロー
1. `SearchQuery` 構築（`ownerIdFilter=actorUserId`、`visibilityFilter=['private','unlisted','public']`）
2. `SearchService.runQuery(query, index)`
3. directoryId 指定があれば `directoryPath` を Directory から取得して prefix マッチ
4. DTO 化

### エラーケース
- `ValidationError`
- `SearchIndexUnavailableError`（呼び出し元はリトライ案内）

---

## SearchPublicNotes（全インスタンス公開検索）

### 入力DTO
- `viewerUserId: UserId | null`, `keyword: string`, `tagNames?: string[]`, `dateRange?: DateRange`, `username?: string`, `sort?: SearchSort`（省略時 `relevance`）, `cursor?`, `limit`

### 出力DTO
- `hits: SearchHitDTO[]`, `nextCursor`

### 処理フロー
1. `username` が指定されていれば該当ユーザーの UserId を解決して `ownerIdFilter` に
2. `visibilityFilter=['public']`
3. `SearchService.runQuery`

### エラーケース
- `ResourceNotFoundError('user')`（username 指定で存在しない場合）
- `RateLimitError`（未ログインのレート制限）

---

## SearchUserPublicNotes

### 入力DTO
- `targetUsername: string`, `viewerUserId: UserId | null`, `keyword?: string`, `tagNames?`, `cursor?`, `limit`

### 出力DTO
- `hits: SearchHitDTO[]`, `nextCursor`

### 処理フロー
- SearchPublicNotes に委譲、`username=targetUsername` 固定
