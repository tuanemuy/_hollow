# TC-6: filter 経路（クエリなし）の表示がリグレッションなし

**実行日:** 2026-05-20
**結果:** **PASS**

## 期待結果

クエリなし（filter 経路 = `listNotesByOwner`）で、list / calendar / tile が Issue #29 までの挙動と完全一致。

## 実測

### list 表示 (`/`)

| 項目 | 値 |
|---|---|
| list items | 12 |
| `1970` 出現 | なし |
| `2026年` 出現回数 | 24（12 行 × 2） |
| 空状態 UI 表示 | なし |

→ 実 `updatedAt` 表示 / 行ごとの visibility chip いずれも正常。

### calendar 表示 (`/?display=calendar`)

| 項目 | 値 |
|---|---|
| `main h2`（日付見出し）数 | 12 |
| フォールバック文言 | なし |
| `1970` 出現 | なし |

→ 日付グルーピングが期待通り。

### tile 表示 (`/?display=tile`)

| 項目 | 値 |
|---|---|
| tile card 数（`a[href*="/notes/"]`） | 13（12 ノート + ヘッダ「新規作成」リンク 1） |
| visibility chip 数 | 27（フィルタ combobox の option 3 つ含む。実カード分は 12 で全 chip 表示） |

→ 全タイルに chip が出ている。

## スクリーンショット

- `screenshots/tc-6/step-01-filter-list.png`
- `screenshots/tc-6/step-02-filter-calendar.png`
- `screenshots/tc-6/step-03-filter-tile.png`

## 確認ポイント結果

| 項目 | 結果 |
|---|---|
| list で実日付 + chip | OK |
| calendar で日付グルーピング | OK |
| tile で chip | OK |
| Issue #29 以前との挙動一致（リグレッションなし） | OK |
