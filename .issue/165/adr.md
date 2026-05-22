# ADR — Issue #165: D1 inArray バインド上限対策 (buildWhereForNotes の intersected 経路)

## ADR-001: `buildOwnerListWhere` を `(where, idScope)` 構造に分割し、`findByOwner`/`countByOwner` 双方で chunk 化

### Status
Accepted

### Context
Issue #33 ADR-003 で「Follow-up 候補」として残されていた `noteRepository.ts` の `buildOwnerListWhere` 内 `inArray(notes.id, [...intersected])` (l.471) は、`visibility=['public']` × `tagIds=['t1']` のように複数候補セットがどちらも大量の id を返すケースで `intersected.size` が D1 ホスト変数上限 (≒100) を超え bind に失敗する。

選択肢:
- **(A) クエリ全体を chunk 化**: `findByOwner` 本体を `selectInChunks([...intersected], ...)` でループし、各 chunk の結果を JS 側で union → sort → limit
- **(B) subquery 化**: 各候補集合を WHERE の subquery (`EXISTS` 系 / `INTERSECT`) として SQL に直接組み込む
- **(C) 各 `resolve*Candidates` の結果集合に上限を設ける**: silently truncated 仕様

### Decision

**(A) を採用**。具体的には:

1. `buildOwnerListWhere` の return shape を `Promise<SQL | null>` から `Promise<{ where: SQL | null; idScope: ReadonlySet<string> | null } | null>` に変更
   - `candidateSets.length === 0` のとき: `{ where, idScope: null }` を返す
   - `candidateSets.length > 0` のとき: `intersected` を計算し、`size === 0` なら `null`、`size > 0` なら `{ where, idScope: intersected }` を返す
   - 旧実装の `conditions.push(inArray(notes.id, [...intersected]))` は削除し、id スコープを caller に明示移譲

2. `findByOwner`:
   - `idScope === null` → 従来通り 1 クエリ（DB 側 ORDER BY/LIMIT/OFFSET）
   - `idScope !== null` → `selectInChunks(Array.from(idScope), (chunk) => db.select().from(notes).where(and(where, inArray(notes.id, [...chunk]))))` で全 chunk 並列取得 → JS 側で `sortNoteRowsBy` 適用 → `slice(opts.offset, opts.offset + opts.limit)` → `hydrateMany`

3. `countByOwner`:
   - `idScope === null` → 従来通り
   - `idScope !== null` → `selectInChunks(...)` per chunk `select id` で取得し `rows.length` を加算合計

4. JS 側 sort helper `sortNoteRowsBy(rows, sortCol, order)` を新設し、`findReferrers` の inline sort（l.616-621）も置き換え

### Consequences

- 良い点:
  - bind 上限を根本解決（`intersected.size` がいくつでも 90 件 chunk に切られて bind されるため）
  - ADR-002（`findReferrers` の chunk → JS sort パターン）の **適用拡張**として整理でき、新規パターン導入なし
  - `findByOwner` / `countByOwner` の filter 共有規約（`buildOwnerListWhere` 経由）が崩れない。両者が同じ `where` と同じ `idScope` を経由するため list と count の整合が保たれる
  - return shape を `(where, idScope)` に明示分割することで、「filter → SQL/scope 翻訳」と「読み取り戦略（直 SQL vs chunk）」の責務がコード上で分離される
  - sort helper 抽出で `findReferrers` との重複が解消

- トレードオフ:
  - SQL レベルの sort/limit 一発保証は失われる（chunk 跨ぎの並びは JS sort 結果に依存）。ただし `updatedAt`/`createdAt` (ISO-8601 ms text) と `id` (UUIDv7) は SQLite BINARY collation と JS 文字列比較で同値、`title` 列も BMP 範囲では同値性が保てる（リスク欄参照）
  - chunk 数だけ I/O が増える（`intersected.size = 5000` で 56 chunk）。並列実行で累積レイテンシは増えないが D1 クエリ課金は増加。MVP 規模で許容
  - `offset` が大きいときに全 chunk 取得が必要だが、旧実装も WHERE 段階で同等の素材化が必要だった（むしろ旧実装は 5000 件 bind で fail していた）

### 補足: ADR-002 との関係

本 ADR は新規パターンの導入ではなく、ADR-002 が `findReferrers` で確立した「chunk → JS sort → 再適用」パターンの **適用拡張**。`findReferrers` は固定 sort（`updatedAt desc, id desc`）に対し、`findByOwner` は可変 `sort`/`order` を扱う点だけ helper のシグネチャを汎用化する。

### 補足: `countByOwner` が `idScope.size` を返せない理由

`idScope` は `intersectIdSets` で計算済みの「filter 候補に合致する id 集合」だが、`buildOwnerListWhere` が返す `where` には `idScope` に乗らない追加述語（`status`、`dateRange`、`ownerId`、`visibility` の `NOT EXISTS` 経路など）が含まれうる。これらが `idScope` 内の id 一部を除外する可能性があるため、count は per-chunk `select id WHERE (where AND inArray)` で実 DB ヒット数を集計する必要がある。

### 補足: cursor pagination について

Issue 本文の選択肢 (A) には「`opts.cursor`」が出てくるが、`NoteOwnerListOpts`（`app/core/domain/note/ports/noteRepository.ts`）は `limit/offset/sort/order` のみ。cursor pagination は search ドメイン側の責務で、本リポジトリは offset/limit のみ扱う。chunk 戦略も offset/limit のみに適用する。

### 却下した選択肢

- **(B) subquery 化**: `resolveTagAndCandidates` の「全 tag AND を持つ note」を SQL で表現するには `GROUP BY note_id HAVING COUNT(DISTINCT tag_id) = N` が必要で、drizzle の typed builder では trickier。`intersectIdSets` の JS 側合成パターンを 1 箇所のために崩すと、`resolve*Candidates` の役割分担モデル全体を再設計することになり、本 Issue スコープ（bind 上限の 1 点解消）を超過
- **(C) 各 `resolve*Candidates` に上限**: silently truncated は filter 結果と `count` の不整合を生む（list は truncate 後の N 件、count は truncate 前の M 件）。`listNotesByOwner` ユースケースが破綻する仕様欠陥

### Follow-up 候補（ADR-003 既出 + 新規）

- 既出:
  - `publicationStateRepository.findByNoteIds` の `selectInChunks` 適用
  - 他リポジトリ (`mediaAsset`, `tag`) の inArray 監査
  - `findReferrers` の結果上限制御
- 新規 (本 Issue で発見した将来検討項目):
  - `intersected.size` が 1 万件を超える運用が現実化した場合、選択肢 (B) の subquery 化を再評価。`resolveTagAndCandidates` の `HAVING COUNT(DISTINCT)` 表現は drizzle の `sql` テンプレートで raw SQL を埋める手段がある（型安全性は下がるが）
  - **[P-W-001/W-002] `findByOwner` chunk 経路の 2-pass 最適化**: 現状の chunk 経路は `db.select()` (`contentHtml` / `frontMatterJson` を含む全カラム) を `idScope` 全件分マテリアライズしてから JS sort → slice する。`contentHtml` は実運用で 10-50KB/行に達するため、`idScope.size = 5000` のオーナーでは `limit=50` でも 50-250MB クラスをメモリに広げることになる。本 ADR §トレードオフの「Workers 128MB / NoteRow ~1KB / 想定最大 1 万件」想定とは桁が 1 つズレており、現実的な実用上限は `contentHtml` のサイズに依存する。軽量 `{ id, sortCol }` で 1-pass 目を回して sort/slice で page id を確定し、2-pass 目で page 分だけ全カラムを取得する形に書き換えることで、メモリと I/O の両方を桁違いに減らせる見込み。レビュー P-W-001 / P-W-002 で識別。別 Issue で扱う
  - **[A-W-003] chunk 並列数の上限ガード**: `selectInChunks` は `Promise.all` で chunk 数だけ同時にクエリを発火する設計のため、`idScope.size = 10000` で 112 chunks が一斉に走る。Cloudflare Workers の subrequest throttling や D1 の同時接続上限を考慮すると、現状は実測未確認のまま暗黙の上限に依存している。実測 + 並列度上限制御（`p-limit` 相当）を別 Issue で評価する。レビュー A-W-003 で識別
  - **[P-W-004] `listNotesByOwner` ユースケース内 `buildOwnerListWhere` の重複呼び出し回避**: `findByOwner` と `countByOwner` を続けて呼ぶ usecase では、`intersected` 計算と candidate set の I/O が 2 回走る。`{ list, count }` を一度に返す batch API を追加するか、`buildOwnerListWhere` の結果を usecase 層で memo するなどの最適化を別 Issue で検討する。レビュー P-W-004 で識別
