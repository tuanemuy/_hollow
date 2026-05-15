# View

保存済みビュー（フィルタ + 表示形式の組み合わせ）を管理する。Tag・Directory を ID 参照。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| SavedView | 保存ビュー | 名前付きの検索条件 + 表示設定 |
| ViewKind | ビュー種別 | `personal` / `public` |
| DisplayMode | 表示形式 | `list` / `tile` / `calendar` |
| CalendarDateKey | カレンダー基準日 | `updated` / `created` / `frontMatterDate` |
| ViewQuery | 検索条件 | ディレクトリ・タグ・期間・キーワードの組合せ |

## エンティティ

### SavedView（集約ルート）

- フィールド:
  - `id: SavedViewId`
  - `ownerId: UserId`
  - `name: SavedViewName`
  - `kind: ViewKind` — `public` は公開ノートを対象（訪問者は使わないがオーナーが切替可）
  - `query: ViewQuery`
  - `displayMode: DisplayMode`
  - `calendarDateKey: CalendarDateKey`
  - `sort: { by: 'updatedAt' | 'createdAt' | 'title'; direction: 'asc' | 'desc' }`
  - `isDefault: boolean` — 1 ユーザーで 1 つだけ true（kind ごとに）
  - `brokenConditions: BrokenConditionMarker[]` — 削除済み参照を保持
  - `createdAt: Instant`
  - `updatedAt: Instant`
- 振る舞い:
  - `rename(name: SavedViewName, now: Instant): SavedView`
  - `updateQuery(q: ViewQuery, now: Instant): SavedView`
  - `setDisplayMode(mode: DisplayMode, calKey: CalendarDateKey, now: Instant): SavedView`
  - `markDefault(now: Instant): SavedView` / `unmarkDefault(now: Instant): SavedView`
  - `markBroken(markers: BrokenConditionMarker[], now: Instant): SavedView`
  - `repairBrokenConditions(now: Instant): SavedView` — 壊れた条件を取り除いた `query` に置き換え
- 不変条件:
  - `kind === 'public'` のとき `query.tagIds` などはこのユーザーが公開してきた範囲の参照のみ有効（不正は `brokenConditions` に積む）

## 値オブジェクト

### SavedViewName
- `value: string` (1..60 字)

### ViewQuery
- フィールド: `directoryId: DirectoryId | null`, `tagIds: TagId[]`, `dateRange: DateRange | null`, `keyword: string | null`, `referencingNoteId: NoteId | null`
- バリデーション: `keyword` 1..200

### BrokenConditionMarker
- 判別ユニオン:
  ```ts
  type BrokenConditionMarker =
    | { kind: 'tag'; id: TagId; lastSeenAt: Instant }
    | { kind: 'directory'; id: DirectoryId; lastSeenAt: Instant }
    | { kind: 'note'; id: NoteId; lastSeenAt: Instant };
  ```
- 等価性: 全フィールドの構造的等価

## ドメインサービス

### SavedViewService
- 責務: 既定ビュー一意制約、参照整合性チェック
- メソッド:
  - `assertNameUnique(ownerId: UserId, kind: ViewKind, name: SavedViewName, exceptId: SavedViewId | null, repo: SavedViewRepository): Promise<void>`
  - `ensureSingleDefault(ownerId: UserId, kind: ViewKind, targetId: SavedViewId | null, repo: SavedViewRepository): Promise<void>` — 既存の既定を外す
  - `detectBrokenConditions(view: SavedView, dirRepo, tagRepo, noteRepo): Promise<BrokenConditionMarker[]>`

## ポート

### SavedViewRepository
- `findById(id: SavedViewId): Promise<SavedView | null>`
- `findByOwner(ownerId: UserId, kind: ViewKind): Promise<SavedView[]>`
- `findDefault(ownerId: UserId, kind: ViewKind): Promise<SavedView | null>`
- `save(view: SavedView): Promise<void>`
- `delete(id: SavedViewId): Promise<void>`

## ユースケース（概要）

- CreateSavedView / UpdateSavedView / DeleteSavedView
- SetDefaultSavedView
- ListSavedViews
- ValidateSavedView（壊れた条件のチェック）
