# ADR — Issue #31: SavedView に visibility フィルタを永続化

## ADR-001: `ViewQuery.visibilityFilter` の型は `readonly PublicationVisibility[]`、空配列 = 「フィルタなし」

### Status
Proposed

### Context
`ViewQuery` 内で `visibility` をどう表現するか:
- A. `PublicationVisibility | null`（単一値、null = フィルタなし）
- B. `readonly PublicationVisibility[]`（複数値、`[]` = フィルタなし）
- C. `readonly PublicationVisibility[] | null`（`null` = フィルタなし、`[]` = マッチなし）

Issue #8 の `NoteOwnerListOpts.visibility` は port-側で `readonly PublicationVisibility[]`（ADR-001 / ADR-002 of Issue #8）であり、URL 側は単一値という非対称設計を採っている。SavedView VO がどちらに寄せるかが論点。

### Decision
**B を採用**: `readonly PublicationVisibility[]`、空配列 = 「フィルタなし」。

理由:
- `ViewQuery.tagIds` も `readonly TagId[]` で「空 = フィルタなし」という慣行を採っており、新フィールドだけ `null` ベースにすると VO 内で表現が割れて読みづらい
- `null` ↔ `[]` 区別（C 案）は Issue #8 port のように「全 SQL 引数を構築する直前で `[]` を early-return ガード」として意味を持たせる文脈で必要だが、SavedView VO は SQL を組み立てないので意味的に区別不要
- Issue 本文の `visibilityFilter?: readonly PublicationVisibility[]` の `?` は「オプショナル受け入れ」のニュアンスで、永続表現は必ず配列があるべきと解釈する

### Consequences
- 良い点: `tagIds` と同じ語彙で扱える。`equals` も同形
- トレードオフ: port 側（Issue #8 ADR-002）が採用した `undefined` vs `[]` の意味区別を VO 側は持たない。port 受け渡し時に「空配列なら `undefined` に変換」する変換責務が境界（`loaders.ts`）に残るが、これは既存の境界変換の流れの内側にある

---

## ADR-002: URL は単一値 `visibility` enum のまま、selectors で配列 ↔ 単一値を境界変換

### Status
Proposed

### Context
`noteListSearchSchema.visibility` は単一 enum。SavedView VO は `readonly PublicationVisibility[]`。両者を結ぶ `searchToViewQuery` / `viewQueryToSearch` でどう橋渡しするか。

### Decision
- `searchToViewQuery(search)`: `search.visibility !== undefined` のとき `visibilityFilter: [search.visibility]`、未指定なら `[]`
- `viewQueryToSearch(view)`: `view.query.visibilityFilter.length > 0` のとき `out.visibility = view.query.visibilityFilter[0]`、長さ 0 なら省略

Issue #8 ADR-001 が port-API ↔ URL で採用した「port-側-配列・URL-側-単一値」を SavedView 経路でも踏襲する。

### Consequences
- 良い点: URL schema を破壊せずに済む（既存ブックマーク互換）。将来 multi-select UI を導入する際に URL schema 側だけ拡張すればよく、VO は破壊変更不要
- トレードオフ: API 直叩きで `visibilityFilter: ["public","unlisted"]` を保存した SavedView を URL 化すると先頭値だけが残る非対称。**現行 UI 経路（SaveViewDialog）では発火しない**ため実害なし。将来 multi-select を導入する際に URL schema を `visibility: z.array(...)` に拡張するタイミングで対称性を回復する

---

## ADR-003: 既存 JSON 行の `visibilityFilter` キー欠落は「フィルタなし」として後方互換デコード

### Status
Proposed

### Context
`saved_views.query_json` 列は既存行に `visibilityFilter` キーを持たない（本 Issue の変更前に作成された SavedView）。マイグレーションでバックフィルするか、デコード側で欠落を許容するか。

### Decision
**デコード側で許容**。`decodeQueryJson` で `parsed.visibilityFilter` が `undefined` の場合は空配列を返し、`isStringArray` の検証は値が存在する場合のみ行う。

### Consequences
- 良い点: マイグレーション不要。`query_json` JSON 列の追加カラム拡張は通常マイグレーションを伴わないので、CD パイプラインに影響しない
- トレードオフ: コードレベルで「欠落 = 空配列」と「明示空配列」を区別できない。両者を区別する必要が出た場合（例: 「フィルタ未設定の SavedView を新 UI で警告表示」）は後段の Issue でカラム拡張・バックフィルが必要
