# ADR — Issue #171: findByOwner chunk 経路の 2-pass 最適化

## ADR-001: `findByOwner` chunk 経路を 2-pass JS-side（id+sortCol → page rows）化

### Status
Accepted

### Context

PR #170 (Issue #165) で `buildOwnerListWhere` を `(where, idScope)` 構造に分割し、`idScope !== null` のときに `selectInChunks(Array.from(idScope), chunk => db.select().from(notes).where(and(where, inArray(notes.id, chunk))))` で chunk fold する戦略を採用した。これにより `inArray(notes.id, [...intersected])` の bind cap 上限問題は解決した。

ところが review-001.md **P-W-001 / P-W-002** で指摘された通り、`db.select()` は `notes` 全カラムを読み出し、`contentHtml`（10-50KB/行）と `frontMatterJson` を含む `NoteRow` を `idScope.size` 件分マテリアライズする。`idScope.size = 5000` × `contentHtml = 50KB` のオーナーでは `limit = 50` でも 250MB クラスをマテリアライズし、Workers 128MB ヒープ制限を超過する。`.issue/165/adr.md` ADR-001 §トレードオフの「Workers 128MB / NoteRow ~1KB / 想定最大 1 万件」想定とは桁が 1 つズレており、実用上限は `contentHtml` のサイズに依存する数百件規模に留まる。

### Decision

`findByOwner` の `idScope !== null` 分岐を 2-pass 化する:

1. **Pass 1（軽量 sort）**: `selectInChunks(idScope, chunk => db.select({ id: notes.id, [sortCol]: notes[sortCol] }).from(notes).where(and(where, inArray(notes.id, chunk))))` で軽量 projection のみ取得。`where` の追加述語（`ownerId / status / dateRange / visibility NOT EXISTS`）はここで適用される
2. JS 側 `sortRowsByColumn(sortRows, sortCol, order)` で sort → `slice(opts.offset, opts.offset + opts.limit)` で `pageKeys`、その `id` 列を `pageIds` として確定
3. `pageIds.length === 0` なら `[]` を return（早期短絡）
4. **Pass 2（page のみ全カラム）**: `selectInChunks(pageIds, chunk => db.select().from(notes).where(inArray(notes.id, chunk)))` で全カラム取得。`where` の再適用は不要（補足参照）
5. Pass 2 は chunk 並列実行で順序が保証されないため、`Map<id, NoteRow>` で再索引し `pageIds` の順序に並べ直す。`byId.get(id) === undefined` は skip（Pass 1/2 間並行 delete 許容）
6. `hydrateMany(orderedRows)` で children を bulk load して `Note[]` を返す

`sortNoteRowsBy` ヘルパは generic 化（`<T extends { readonly id: string } & Readonly<Record<SortColumn, string>>>`）して Pass 1 の軽量 row も Pass 2 の `NoteRow` も同じ helper で sort 可能にする。`findReferrers` の呼び出しは型推論で `T = NoteRow` となるため変更不要。

### Consequences

**良い点:**

- メモリ展開が `idScope.size × NoteRow (~50KB)` から `idScope.size × {id, sortCol} (~64 bytes)` + `limit × NoteRow` に削減
  - 例: `idScope.size = 5000`, `limit = 50`, `contentHtml = 50KB` のケース
    - 旧: 5000 × 50KB = **250MB**（Workers OOM 確実）
    - 新: 5000 × 64B + 50 × 50KB = 320KB + 2.5MB ≈ **2.8MB**（許容範囲）
- I/O ラウンドトリップは Pass 2 の chunk 並列分（最大 `ceil(500/90) = 6 chunks`）増えるが、`Promise.all` で累積レイテンシは ~1 ラウンドトリップ増加に留まる
- `where` 述語の重複適用は不要（Pass 1 で適用済み → 結果 id を Pass 2 で IN するだけ）
- `idScope === null` 経路（DB 側 LIMIT/OFFSET 一発）は変更なし。filter 未使用時の性能特性は維持
- review-001.md P-W-001 / P-W-002 の解消
- `sortNoteRowsBy` の generic 化により `findReferrers` も同じ helper で動く（外部から見て破壊的変更なし）

**トレードオフ:**

- I/O 回数増（Pass 1 chunk 数 + Pass 2 chunk 数）。D1 課金は増えるが MVP 規模で許容
- Pass 1 と Pass 2 の間で並行 delete / trash により Pass 2 で row が消えるケース。既存実装でも DB 側 LIMIT/OFFSET 経路で同じ race（read committed 単発トランザクション）が存在し、Pass 2 で `byId.get(id) === undefined` を skip することで「ページ件数が limit より少ない」結果となる。これは既存挙動と整合
- 2-pass で D1 binding を 2 回呼ぶ責務がリポジトリに増える。`hydrateMany` までを含めると 3 段（Pass 1 → Pass 2 → loadChildren）の chain になるが、各段の責務は明確

### 補足: `where` 再適用が Pass 2 で不要な根拠

`buildOwnerListWhere` が返す `where` は次の述語を AND で含みうる:

- `eq(notes.ownerId, ownerId)` （必須）
- `eq(notes.status, opts.status)` （オプション）
- `gte/lt(notes.updatedAt, ...)` （`dateRange`）
- `notExists(...)` （`visibility` が wantsPrivate のとき）

これらはすべて `notes` 行の状態に基づく述語（PK ではない）。Pass 1 で `and(where, inArray(notes.id, chunk))` を適用した時点で、`where` を満たす id のみが `sortRows` に乗る。Pass 2 で `inArray(notes.id, pageIds)` だけを引いても、`pageIds` は既に `where` を通過した id 集合のサブセットなので、追加述語を再適用しても結果は変わらない（並行更新があれば一部 row 状態が変わって `where` を満たさなくなるが、これは既存 chunk 経路でも同じ race であり本 Issue で新たに導入する race ではない）。

### 補足: `idScope === null` 経路は変更しない理由

`idScope === null` は `candidateSets.length === 0` のとき（`tagIds === undefined` かつ `visibility` が wantsPrivate 経路 or 未指定）。`where` 述語のみで `notes` をフィルタでき、DB 側 `ORDER BY ... LIMIT ... OFFSET ...` の 1 クエリで完結する。`idx_notes_owner_status_updated` がカバーするためインデックスシークで効率的。

2-pass 化はあくまで「`idScope` の id 集合を IN で適用する必要がある」ケースに限定。`idScope === null` 経路で 2-pass にすると Pass 1 で全 owner notes の `{ id, sortCol }` をマテリアライズすることになり、分母が `idScope` に絞られない分むしろ悪化する。

### 補足: Pass 2 も `selectInChunks` で chunk する理由

`opts.limit` の caller 上限は最大 500（`deleteTag` / `mergeTags` / `renameTag` の `*_NOTE_PAGE_SIZE = 500`）。これは `SAFE_CHUNK_SIZE = 90` を超えるため、Pass 2 の `inArray(notes.id, pageIds)` を plain で発行すると bind cap を踏む。`selectInChunks` でラップ必須。

### 却下した選択肢

**(B) DB-side covering index**

- 案: `notes` テーブルに `idx_notes_owner_updated_at_id (owner_id, updated_at DESC, id)` などを追加し、SQLite に `ORDER BY updated_at DESC LIMIT 50 OFFSET 50` をインデックススキャンだけで処理させる。`idScope` の IN を SQL に押し込み、covering index で sort/limit を直接処理
- 却下理由:
  1. `buildOwnerListWhere` の `idScope` は **JS 側で計算された intersection**（tag AND, visibility 候補、referrer の和集合）であり、SQL 側にこの集合を渡すには `inArray(notes.id, [...idScope])` の bind が必要。これが Issue #165 の出発点であり bind cap で fail する
  2. 各 candidate set を全部 SQL 化（CTE / EXISTS / INTERSECT）するなら Issue #165 ADR-001 却下案 (B) と同じ問題に戻る（drizzle が `GROUP BY HAVING COUNT(DISTINCT)` をクリーンに表現できない）
  3. `sort='title'` / 複合フィルタの組み合わせ爆発に対応する index 群を維持するコストが高い
  4. 本 Issue のスコープ（chunk 経路のメモリ削減）に対し index 戦略の再設計はオーバースペック

Issue #165 が「JS 側 intersection を chunk で適用する」戦略を確立した以上、本 Follow-up はその枠内で「マテリアライズ量を削減する」方向に限定するのが筋。

**(C) `selectInChunks` に projection ホルダを足して 1-pass 維持**

- 案: `selectInChunks` の signature に projection 切替を追加し、1-pass で完結
- 却下理由: signature 変更は他リポジトリにも波及する。1-pass のままだと結局「全 `idScope` 分」を取らないと sort できないため、軽量 projection 切替だけでは page 全カラム取得が別途必要。結局 2-pass になる

**(D) usecase 側で `limit` を縮小**

- 案: callers (`listNotesByOwner`, `deleteTag`, etc.) で `limit` を 50 以下に強制
- 却下理由: 問題の本質は `idScope.size`（filter intersection の元集合）が膨らむことで、`limit` を絞ってもメモリは削減できない。`limit = 10` でも `idScope.size = 5000` なら 5000 行分マテリアライズする

### Follow-up（本 Issue で扱わない）

- `findReferrers` の chunk 経路（`select()` 全カラム）も同じパターンで 2-pass 化できる余地がある。`.issue/165/adr.md` ADR-002 範囲だが backlink 件数の現実的な上限を考えると優先度低
- `countByOwner` chunk 経路の最適化は review-001.md P-W-003 で既に `count()` 集計に修正済み
- chunk 並列度上限ガード（review-001.md A-W-003）は別 Issue
