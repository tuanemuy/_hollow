# Search テストケース

## HandleNoteSavedEvent / NoteTrashedEvent / PublicationChangedEvent

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| `note.saved` 受信 | Handle | IndexJob(upsert) を enqueue、payload に NoteSnapshot |
| `note.deleted` 受信 | Handle | IndexJob(delete) を enqueue |
| `note.publish_changed` 受信 | Handle | IndexJob(upsert) を enqueue、visibility 更新 |
| 同イベント二重配信 | Handle | IndexJob が 2 件 enqueue されても Consumer 側で冪等 |

## ConsumeIndexJob

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| upsert Job、index 利用可 | Consume | SearchDocument upsert、complete |
| delete Job | Consume | SearchIndex.delete |
| index 一時不可 | Consume | recordAttempt、attempts < 3 で再試行 |
| 3 回失敗 | Consume | DLQ 行きとしてマーク |

## SearchOwnNotes

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| キーワードあり | Search | 該当 hits + nextCursor |
| 0 件ヒット | Search | 空配列 |
| keyword 空 | Search | `ValidationError` |
| tagNames 指定 | Search | フィルタ後の hits |
| directoryId 指定 | Search | directoryPath prefix で絞り込み |
| SearchIndex 障害 | Search | `SearchIndexUnavailableError` |

## SearchPublicNotes

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 未ログイン viewer | Search | public のみ返却 |
| username 指定 | Search | 該当ユーザーの public のみ |
| 存在しない username | Search | `ResourceNotFoundError('user')` |
| レート上限 | Search | `RateLimitError` |

## SearchUserPublicNotes

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常 | Search | 該当ユーザーの公開ノート |
| 該当ユーザーが suspended | Search | 0 件（または `ResourceNotFoundError` — 仕様: 後者で統一） |
