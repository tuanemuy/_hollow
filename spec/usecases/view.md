# View ユースケース

## CreateSavedView

### 入力DTO
- `actorUserId: UserId`, `name: string`, `kind: 'personal' | 'public'`, `query: ViewQueryDTO`, `displayMode: 'list' | 'tile' | 'calendar'`, `calendarDateKey: 'updated' | 'created' | 'frontMatterDate'`, `sort: { by: 'updatedAt' | 'createdAt' | 'title'; direction: 'asc' | 'desc' }`, `isDefault: boolean`

### 出力DTO
- `view: SavedViewDTO`

### 処理フロー
1. `SavedViewName` 構築、`SavedViewService.assertNameUnique`
2. `isDefault === true` なら `ensureSingleDefault` で他の default を外す
3. UoW: SavedView 作成 → save
4. 参照する TagId / DirectoryId の存在を `detectBrokenConditions` で検証（壊れた条件は `brokenConditions` に記録）

### エラーケース
- `ValidationError`
- `BusinessRuleError('saved_view_name_conflict')`

---

## UpdateSavedView

### 入力DTO
- `actorUserId`, `viewId`, `name?`, `query?`, `displayMode?`, `calendarDateKey?`, `sort?`, `isDefault?`

### 出力DTO
- `view: SavedViewDTO`

### 処理フロー
- 既存 SavedView を取得、所有者確認
- 各フィールドに対応する振る舞いを呼ぶ
- 必要に応じて `SavedViewService.ensureSingleDefault`
- `detectBrokenConditions` で再検証

### エラーケース
- `BusinessRuleError('saved_view_name_conflict')`

---

## DeleteSavedView

### 入力DTO
- `actorUserId`, `viewId`

### 出力DTO
- なし

### 処理フロー
- 取得 → 所有者確認 → SavedViewRepository.delete

---

## SetDefaultSavedView

### 入力DTO
- `actorUserId`, `kind`, `viewId | null`

### 出力DTO
- なし

### 処理フロー
- `viewId === null` のとき、kind の default を `null` に
- 否則、`ensureSingleDefault(viewId)` を呼び、対象を `markDefault`

---

## ListSavedViews

### 入力DTO
- `actorUserId`, `kind: 'personal' | 'public'`

### 出力DTO
- `views: SavedViewDTO[]`

### 処理フロー
- SavedViewRepository.findByOwner(ownerId, kind)
- 各ビューについて `detectBrokenConditions` を実行し、`brokenConditions` を最新化（save）

---

## ValidateSavedView

### 入力DTO
- `actorUserId`, `viewId`

### 出力DTO
- `brokenConditions: BrokenConditionMarker[]`

### 処理フロー
- SavedView 取得 → `SavedViewService.detectBrokenConditions`
- 結果を save

---

## HandleTagDeletedEvent / HandleDirectoryDeletedEvent / HandleNotePurgedEvent

### 概要
参照していた tag/directory/note が消えたら brokenConditions を更新するイベントハンドラ。

### 処理フロー
- 該当エンティティを参照している SavedView を SavedViewRepository から検索
- `markBroken(markers, now)` → save
