# Search ユースケース

## HandleNoteSavedEvent / HandleNoteTrashedEvent / HandlePublicationChangedEvent

### 概要
他ドメインの Outbox イベントを受けて IndexJob を enqueue する。

### 入力DTO
- `event: { type: 'note.saved' | 'note.deleted' | 'note.publish_changed'; payload: ... }`

### 処理フロー
- `note.saved`: IndexJob を `op='upsert'`, `noteId=event.noteId`, `attempts=0` で `enqueue`。payload に NoteSnapshot を含める
- `note.deleted`: IndexJob を `op='delete'` で enqueue
- `note.publish_changed`: visibility が変わるため `op='upsert'`、payload に最新 NoteSnapshot を含める

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
- `viewerUserId: UserId | null`, `keyword: string`, `tagNames?: string[]`, `dateRange?: DateRange`, `username?: string`, `cursor?`, `limit`

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
