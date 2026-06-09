# PR Review #001 — feat(#605): 公開面の published_at 基準の並び替え・期間集計

**PR:** #611
**Date:** 2026-06-09
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 1
- Notes: 多数（既存パターン由来・任意）
- Verdict: **BLOCKED**

---

## Adapter / Infrastructure

### Blockers
- **[B-001]** date 窓の `published_at` 化が公開面に限定されず、`searchOwnNotes`（自分のノート＝全可視性）の日付絞り込みまで巻き込む
  - 場所: `app/core/adapters/d1/searchIndex.ts:149,280,531-545`（`joinPublication = q.dateRange !== null` と `buildDateRangeClause`→`ps.published_at` + `publicationJoin` の INNER JOIN）
  - 理由: スコープは「公開面の期間絞り込みを published_at 基準に」だが、adapter の分岐は `q.dateRange !== null` だけで surface を判別していない。private 経路 `searchOwnNotes.ts`（visibility `['private','unlisted','public']` ＋ dateRange）も同じ adapter を通る。main では `sd.date_for_calendar`（全ノートに存在）で全可視性に効いていたが、本 PR 後は (1) `publication_states` への INNER JOIN により public publication を持たない private/unlisted ノートが日付絞り込み時に全件脱落、(2) private 面の期間意味が `date_for_calendar`→`published_at` に黙って切替。`searchOwnNotes.test.ts` は fake SearchIndex の unit テストで D1 JOIN を捕捉できず未検出。
  - 提案: `SearchQuery` に date 窓の基準を表す `dateBasis`（`'published_at' | 'date_for_calendar'`）を持たせ、公開面（`countPublicSearchFacets`/`searchPublicNotes`）のみ published_at を要求、`searchOwnNotes` は従来どおり date_for_calendar。adapter は `joinPublication = q.dateRange !== null && q.dateBasis === 'published_at'` とし `buildDateRangeClause` を basis で分岐。own-notes×date の adapter integration テストを追加。

### Warnings
- **[W-002（adapter視点・B-001の派生）]** `dateRange !== null` だけで JOIN という暗黙結合は、将来 dateRange を使う別経路が増えたとき同じ取りこぼし/意味ズレを再発させる。surface ↔ dateBasis を 1 箇所で SSOT 化推奨。

### Notes
- publication adapter の新クエリ（取得・count 両方に `innerJoin(notes, status='active')`、tie-break、空候補短絡、index 列順、mapDbError）、userRepository の range スキャン＋`prefixUpperBound`、migration 0015 の連番/idempotency はいずれも良好。

---

## Domain / Use Case

### Blockers
- なし

### Warnings
- **[W-001]** 新ポート `noteIds` 候補集合が D1 host-var 上限を超えうる（`TAG_CANDIDATE_CAP=1000` と adapter の単一 `inArray`）
  - 場所: `app/core/adapters/d1/repositories/publicationStateRepository.ts`（`inArray(publicationStates.noteId, [...opts.noteIds])`）／起点 `app/core/application/publication/listUserPublicNotes.ts`（`TAG_CANDIDATE_CAP=1000`）
  - 理由: このリポジトリは `_chunks.ts` で「D1 は host 変数を約100に制限」と明記し `SAFE_CHUNK_SIZE=90` で全 `IN (...)` をチャンク分割するのが確立した不変条件。`listPublicNoteIdsByOwnerSorted` はチャンク無しの単一 `inArray` を発行し、usecase は最大1000件の候補を渡しうるので、タグ候補が90件超の owner で host-var 上限超過によりクエリ失敗。ADR-002「現規模では実害小」は host-var 上限を見落とし。
  - 提案: adapter 側で候補 id をチャンク分割して publication 行（note_id + published_at）を取得し、in-memory で intersection・published_at 順ソート・ページング・count する（候補は active note 由来なので trashed 混入なし）。90件超のタグ候補で integration テストを追加。

### Notes
- 集約境界（published_at は publication 集約に閉じ込め）、total 整合（#30, 同一 active 母集合）、hydrate の id 順再整列（`listRelatedPublicNotes` パターン）、port 型/JSDoc、エラー契約はいずれも計画/ADR に忠実。

---

## Frontend

### Blockers
- なし

### Warnings
- なし

### Notes
- sort 軸 enum の SSOT 一貫性（4箇所に `publishedAt` 一貫追加）、ラベル整合、URL クリーン化（client `nextFilterSearch` と server default `?? "publishedAt"` 一致）、`display=calendar` 非干渉（client は `updatedAt` グルーピングで sort 軸と独立）を確認。enum 重複・トグルの aria は既存パターン由来でスコープ外。

---

## Test

### Blockers
- なし

### Warnings
- なし

### Notes
- 計画ステップ10 のカバレッジを網羅的に充足（published_at 昇降順・NULL 除外・tie-break・trashed total 非膨張・タグ AND 窓と total 独立・hydrate 後順序維持・date_for_calendar≠published_at の期間出入り MATCH/LIKE 両経路・case-insensitive prefix・range 境界・LIKE 特殊文字 literal）。load-bearing なシード設計。
- **[N-001]** `searchIndex.integration.test.ts:735` のテスト名「ignoring the query's own dateRange」が、`makeQuery` で dateRange=null のため実カバレッジに穴（任意対応）。

---

## Design Decisions

- B-001 修正で `SearchQuery` に `dateBasis` を導入する（surface ごとに date 窓の基準を明示）。ADR に追記する。
- W-001 修正で publication adapter のタグ候補経路を in-memory intersection 方式に変更する（host-var 上限回避・集約境界維持）。ADR に追記する。
