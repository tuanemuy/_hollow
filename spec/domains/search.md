# Search

ノートの全文検索インデックスと検索クエリ実行を担う。Note を ID で参照し、ドメインイベント経由でインデックスを更新する。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| SearchDocument | 検索ドキュメント | 1 ノートを表す検索インデックスエントリ |
| Visibility | 公開可視性 | `private` / `unlisted` / `public` |
| SearchQuery | 検索クエリ | キーワード + ファセットを含む検索条件 |
| SearchHit | 検索結果 | 1 件のヒット（ノート ID と要約） |
| IndexJob | インデックスジョブ | 非同期インデックス更新ジョブ |

## エンティティ

### SearchDocument（集約ルート）

- フィールド:
  - `noteId: NoteId` — 集約 ID
  - `ownerId: UserId`
  - `visibility: Visibility`
  - `title: string`
  - `body: string` — HTML をプレーン化したテキスト
  - `tagNames: string[]` — タグ名のスナップショット
  - `directoryPath: string`
  - `dateForCalendar: Instant` — FrontMatter `date` > `updatedAt`
  - `updatedAt: Instant`
  - `indexedAt: Instant`
- 振る舞い:
  - `fromSnapshot(snapshot: NoteSnapshot, now: Instant): SearchDocument` — 静的ファクトリ。NoteSnapshot を SearchDocument に変換
  - `markRemoved(now: Instant): { tombstone: true; noteId: NoteId }` — 削除指示（実体はリポジトリでマーカー処理）

### 補助型

```ts
type NoteSnapshot = {
  noteId: NoteId;
  ownerId: UserId;
  visibility: Visibility;
  title: string;
  plainBody: string;        // HTML から抽出済みのプレーンテキスト
  tagNames: string[];
  directoryPath: string;
  frontMatterDate: Instant | null;
  updatedAt: Instant;
};
```

NoteSnapshot は application 層の dispatcher（`dispatchDomainEvent`）が、Note ドメインの Outbox イベント（`note.*` / `publication.*`）受信時に `noteRepository.findById` + `buildNoteSnapshots` で再構築し、Search ドメインのワーカーに渡される。Search ドメインから Note の他リポジトリを参照することはなく、aggregate 集約は dispatcher の責務として application 層に閉じる（詳細は本ファイル末尾と Issue #145 ADR-001 を参照）。

### IndexJob

- フィールド:
  - `id: IndexJobId`
  - `noteId: NoteId`
  - `op: 'upsert' | 'delete'`
  - `attempts: number`
  - `lastError: string | null`
  - `enqueuedAt: Instant`
- 振る舞い:
  - `recordAttempt(error: string | null, now: Instant): IndexJob`

## 値オブジェクト

### SearchQuery
- フィールド: `keyword: string`, `ownerIdFilter: UserId | null`, `visibilityFilter: Visibility[]`, `tagNames: string[]`, `directoryPathPrefix: string | null`, `dateRange: DateRange | null`, `dateBasis: DateBasis`（デフォルト `date_for_calendar`）, `sort: SearchSort`, `limit: number`, `cursor: string | null`
- バリデーション: `keyword` 長さ 1..200、`limit` 1..50
- `dateBasis: DateBasis`（`'published_at' | 'date_for_calendar'`、デフォルト `date_for_calendar`）: `dateRange` をどの日付軸で適用するかを指定する
- `sort: SearchSort`（`'relevance' | 'newest'`、デフォルト `relevance`）: `newest` は検索インデックス projection の `updated_at`（`SearchHit.updatedAt` と同じ値）降順 + `note_id` 昇順 tie-breaker。`sort` は `query` の並び順のみに影響し、カウント系（`countByDateRanges`）の結果には影響しない
- 注記: ドメイン契約は `keyword` 長さ 1..200 で不変。ただし D1 adapter は FTS5 `tokenize='trigram'` の制約により 3 Unicode codepoint 未満のクエリトークンを内部的に除外する（`spec/database/index.md` の `search_documents_fts` 節、`.issue/50/adr.md` ADR-003 参照）

### SearchHit
- フィールド: `noteId: NoteId`, `ownerId: UserId`, `username: Username`, `title: string`, `snippet: string`, `tagNames: string[]`, `score: number`

## ドメインサービス

### SearchService
- 責務: インデックス更新と検索のオーケストレーション（Search ドメイン内で完結）
- メソッド:
  - `applyUpsert(snapshot: NoteSnapshot, index: SearchIndex, now: Instant): Promise<void>` — SearchDocument を生成して `index.upsert`
  - `applyDelete(noteId: NoteId, index: SearchIndex): Promise<void>`
  - `runQuery(query: SearchQuery, index: SearchIndex): Promise<{ hits: SearchHit[]; nextCursor: string | null }>`

## ポート

### SearchIndex（ポート）
- メソッド:
  - `upsert(doc: SearchDocument): Promise<void>`
  - `delete(noteId: NoteId): Promise<void>`
  - `query(q: SearchQuery): Promise<{ hits: SearchHit[]; nextCursor: string | null }>`
  - `bulkRebuildFromSnapshots(snapshots: AsyncIterable<SearchDocument>): Promise<void>` — production の呼び出し経路は `AdminSettings.RebuildSearchIndex`（spec/usecases/adminSettings.md 参照）。
- エラーケース: `SearchIndexUnavailableError` / `SearchTimeoutError`

`NoteSnapshot.frontMatterDate` は `frontMatter['date']` を `Date | null` に解釈した値。`Date` インスタンス / ISO 文字列 / epoch ミリ秒（finite な number）以外は `null` 扱いとする（`buildNoteSnapshot.parseFrontMatterDate` 参照）。

### IndexJobRepository
- `enqueue(job: IndexJob): Promise<void>`
- `nextBatch(limit: number, now: Instant, maxAttempts: number): Promise<IndexJob[]>` — `attempts >= maxAttempts` の行は DLQ 行として SQL レベルで除外する（Issue #145 ADR-006）。
- `complete(id: IndexJobId): Promise<void>`
- `fail(id: IndexJobId, error: string, now: Instant): Promise<void>`

## ユースケース（概要）

- HandleNoteSavedEvent（NoteSnapshot を受け IndexJob を enqueue）
- HandleNoteTrashedEvent（IndexJob を delete で enqueue）
- HandlePublicationChangedEvent（再インデックス用 IndexJob）
- ConsumeIndexJob（worker。SearchService.applyUpsert / applyDelete を呼ぶ）
- SearchOwnNotes / SearchPublicNotes / SearchUserPublicNotes

`NoteSnapshot` は dispatcher（`dispatchDomainEvent`）が UoW を開設して `noteRepository.findById` + `buildNoteSnapshots` で event 受信時に再構築する。event payload には NoteSnapshot を含めず `noteId` だけを保持することで、outbox の serialization 負荷を抑え、最新スナップショットでインデックスを更新できる（Issue #145 ADR-001）。trashed note を検知した場合は dispatcher 側で skip して index に乗せない（ADR-007 trashed status guard）。
