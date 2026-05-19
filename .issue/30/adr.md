# ADR — Issue #30: countByOwner にフィルタを反映

## ADR-001: count 用 opts は `Pick<NoteOwnerListOpts, ...>` で派生

### Status
Proposed

### Context
`countByOwner` にフィルタを渡すための opts 型をどう定義するか。選択肢:
- (a) 新規に `NoteOwnerCountOpts` を独立して定義（filter フィールドを 1 個ずつ書く）
- (b) `NoteOwnerListOpts` から `Pick` で派生
- (c) `NoteOwnerListOpts` をそのまま渡してもらい、adapter 側で `limit/offset/sort/order` を無視する

### Decision
(b) `Pick<NoteOwnerListOpts, "status" | "tagIds" | "dateRange" | "visibility" | "referencingNoteId">`。

### Consequences
- 良い点:
  - filter フィールドの形が `findByOwner` と永続的に一致 — 片方だけ追加するような drift が型レベルで防げる
  - count 経路ではページネーション・ソートが意味を持たないことを型で表現
- トレードオフ: `NoteOwnerListOpts` のフィルタフィールドを追加・改名するとき両方の見直しが必要 (`Pick` のキー文字列リテラルを直す) — ただし既存メンテナンスコストは変わらない

---

## ADR-002: `opts` は optional、`undefined` は「フィルタなし」

### Status
Proposed

### Context
シグネチャを `countByOwner(ownerId, opts: NoteOwnerCountOpts)` と必須にするか、`opts?: NoteOwnerCountOpts` と任意にするか。

### Decision
optional にする。`opts === undefined` の場合は owner に紐づく全 note を数える（既存の挙動と等価）。

### Consequences
- 良い点:
  - `runExportJob.ts` 内部 mock の `async countByOwner() { return 0; }` のような既存実装が破壊変更にならない
  - 「フィルタなし＝全件」の表現が `findByOwner` 側の filter フィールド未指定挙動と一貫
- トレードオフ: 呼出側が「明示的にフィルタなしを意図している」のか「忘れているのか」が見分けにくいケースがあり得るが、ports は domain 内部 API のため十分

---

## ADR-003: adapter は `buildOwnerListWhere` を private 共通化、null で早期 return

### Status
Proposed

### Context
filter 構築は `findByOwner` で既に複雑で、いずれかの候補集合の交差が空・visibility=[] の場合は短絡する必要がある。`countByOwner` でも同じ短絡が要る。

### Decision
adapter 内に private async helper `buildOwnerListWhere(ownerId, opts): Promise<SQL | null>` を作る。`null` を返したら呼び側は `findByOwner` → `[]`、`countByOwner` → `0` を返す。

### Consequences
- 良い点:
  - filter 意味論が 1 箇所に集約 — 将来フィルタを追加するときの修正点が 1 つに収束
  - 短絡のタイミング・条件を `findByOwner` と `countByOwner` で同期できる
- トレードオフ:
  - helper が `null` シグナルを内包するため呼び側が短絡を忘れない構造にする必要あり — 早期 return パターンで担保
  - host-var cap については Issue #8 ADR-003 + Issue #33 で対策済みなので追加対応不要
