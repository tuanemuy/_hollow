# PR #714 レビュー — Infrastructure (D1 Adapter)

対象: `app/core/adapters/d1/repositories/publicationStateRepository.ts` `countPublicByOwner`（L347-365）
関連: port IF `app/core/domain/publication/ports/publicationStateRepository.ts` L87-97 / schema `app/core/adapters/d1/schema.ts` L424-455 / integration test L403-578

## Infrastructure (D1 Adapter)

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** WHERE 条件が `listSortedAll` の base whereClause と完全一致している。
  - `countPublicByOwner`（L356-361）: `owner_id = ?` + `visibility = 'public'` + `published_at IS NOT NULL` + `notes.status = 'active'`。
  - `listSortedAll`（L255-261）の whereClause: 上記4条件 + `publishedRangeConditions(opts.publishedRange)`。
  - 差分は `publishedRangeConditions` のみ。ヒーロー件数はフィルタ非依存の全件 count（plan AC-2 / リスク欄「フィルタ適用時はヒーロー件数 ≠ listing total が仕様どおり」）なので、range 条件を持たないのは設計どおり正しい。条件の欠落・余剰なし。`listPublicNoteIdsByOwnerInRange`（L380-385）とも JOIN・base 4条件が一致。

- **[N-002]** `innerJoin(notes, eq(notes.id, publicationStates.noteId))`（L354）の結合キーは正しい。`publication_states.note_id` は notes.id への FK（schema L427-429、PK 兼 FK）であり、`listSortedAll`（L271）/ `listPublicNoteIdsByOwnerInRange`（L378）と同一形。

- **[N-003]** `count()` は L4 で import 済み。`Number(countRows[0]?.value ?? 0)`（L363）は `listSortedAll`（L285）と完全に同一の null 安全パターン。`mapDbError("Failed to count public publication_states", ...)`（L348）でラップしており、他メソッドの "Failed to ..." 文言規約と一貫している（find/list 系と動詞だけ差し替えた素直な命名）。

- **[N-004]** インデックス利用は適切。`idx_pubs_owner_visibility_published_at`（schema L445-449: owner_id, visibility, published_at）の先頭2列が `owner_id =`・`visibility =` の等値、第3列 `published_at` が `IS NOT NULL` レンジで効くため、publication_states 側はインデックスシークで絞れる。notes JOIN は PK（notes.id）への結合なので per-row lookup でコストは小さく、count 専用のため行体は読まない。limit/offset/cursor がない分 listing 経路より単純。

- **[N-005]** AC-3（1000 件頭打ち解消）は構造的に達成。`findPublicByOwner({limit:1000}).length` と異なり COUNT(*) クエリで limit/offset/cursor を一切持たないため、公開 1000 件超でも頭打ちが原理的に発生しない。port JSDoc（L92-95）にもその契約が明記されている。

- **[N-006]** AC-5（integration test 検証）は adapter レベルで担保済み。test L403-578 が active+public+published_at 件数（a）、trashed-but-public 除外（b, AC-1）、published_at NULL 除外（c）、private/unlisted 除外（d）、ゼロ件（e）、他 owner 分離（f）、`listPublicNoteIdsByOwnerSorted.total` との一致（g, AC-2 の drift 検知）を独立ケースで網羅。plan ステップ5 の (a)-(g) 要件と一致。
