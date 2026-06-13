# PR #714 レビュー記録 — ラウンド2（Infrastructure / D1 Adapter）

**対象PR:** #714
**観点:** Infrastructure (D1 Adapter)
**レビュー種別:** ラウンド2 フルレビュー（ゼロベース）
**レビュー日:** 2026-06-13

---

## 検証サマリー

`D1PublicationStateRepository.countPublicByOwner`（`app/core/adapters/d1/repositories/publicationStateRepository.ts:347-365`）を `listSortedAll` の count 部分（同ファイル `:277-281`）および `listPublicNoteIdsByOwnerInRange`（`:367-393`）と突き合わせ、port IF（`app/core/domain/publication/ports/publicationStateRepository.ts:87-94`）・スキーマのインデックス（`app/core/adapters/d1/schema.ts:439-449`）・integration test（`publicationStateRepository.integration.test.ts:395-906`）まで検証した。

plan.md の adapter 層に関わる AC（AC-1 / AC-2 / AC-3 / AC-5）はすべて adapter 実装・テストで満たされている。WHERE 条件・JOIN 結合キーは `listSortedAll` の count と完全一致、`count()` import 済み・null 安全・mapDbError 文言とも問題なし。limit/offset/cursor を持たない COUNT クエリ化で AC-3（1000 件頭打ち）は構造的に解消されている。要修正レベルの問題は検出されなかった。

### AC 検証（adapter 層関連）

- **AC-1（trashed-but-public 除外）:** `eq(notes.status, "active")` を INNER JOIN（`:354,:360`）で持つため除外される。test `excludes a trashed-but-public row`（`:757-778`）で 1 件に固定。**満たす。**
- **AC-2（listing total と整合）:** WHERE 4 条件が `listSortedAll` の count（`:255-261` の range 抜き）と完全一致。test `agrees with the listing total under a trashed-but-public row`（`:871-905`）で `countPublicByOwner == listPublicNoteIdsByOwnerSorted.total == 2` を直接突き合わせ（plan ステップ5 (g) 必須ケース）。**満たす（デフォルト経路スコープ）。**
- **AC-3（1000 件頭打ち解消）:** COUNT クエリで limit/offset/cursor 不在（`:351-362`）。旧 `findPublicByOwner({limit:1000}).length` の頭打ちが原理的に消える。**満たす。**
- **AC-5（active JOIN・visibility・published_at NOT NULL を D1 integration test で検証）:** 独立ケースで active 除外（`:757`）・published_at NULL 除外（`:780`）・private/unlisted 除外（`:802`）・zero（`:827`）・owner 分離（`:844`）・total 突き合わせ（`:871`）を網羅。除外条件を 1 ケースに混ぜず独立固定する plan 指示どおり。**満たす。**

---

### Infrastructure (D1 Adapter)

#### Blockers

- **[B-001]** なし。

#### Warnings

- **[W-001]** なし。

#### Notes

- **[N-001]** WHERE 条件の完全一致を確認。`countPublicByOwner`（`publicationStateRepository.ts:357-360`）= `eq(publicationStates.ownerId, ownerId)` / `eq(publicationStates.visibility, "public")` / `isNotNull(publicationStates.publishedAt)` / `eq(notes.status, "active")`。`listSortedAll` の `whereClause`（`:255-261`）は同 4 条件 + `publishedRangeConditions(opts.publishedRange)`。`countPublicByOwner` は range 引数を取らない件数専用メソッドなので range 条件が無いのは正しく、フィルタ無し listing total（range 空配列）と同一母集合になる。`listPublicNoteIdsByOwnerInRange`（`:380-385`）とも owner/visibility/published_at/active の 4 条件は一致しており、確立済みパターンの素直な踏襲。

- **[N-002]** innerJoin の結合キーが 3 メソッドで完全一致。`countPublicByOwner`（`:354`）/ `listSortedAll`（`:271,:280`）/ `listPublicNoteIdsByOwnerInRange`（`:378`）すべて `innerJoin(notes, eq(notes.id, publicationStates.noteId))`。結合キーの取り違え（owner_id 結合等）なし。`publication_states.note_id` が PK（schema `:427-429`）かつ `notes.id` への FK なので 1:1 で count 膨張のリスクもなし。

- **[N-003]** `count()` import・null 安全・mapDbError 文言すべて既存規約に整合。`count` は drizzle-orm から import 済み（`:5`）。戻り値 `Number(countRows[0]?.value ?? 0)`（`:363`）は `listSortedAll` の `Number(countRows[0]?.value ?? 0)`（`:285`）と同一の null 安全パターン。`mapDbError("Failed to count public publication_states", ...)`（`:348`）は他メソッドの "Failed to ..." 文言規約に沿い、固有で識別可能。read-only メソッドなので `pending` バッチに乗らず即時実行する点も `findById` 等の読み取り系と一貫。

- **[N-004]** インデックス利用は妥当。`idx_pubs_owner_visibility_published_at`（schema `:445-449`、leading `(owner_id, visibility)` equality + `published_at`）が `countPublicByOwner` の owner+visibility equality と published_at NOT NULL を index-served で解決する。COUNT は publication_states 側を index で絞り込み、`notes.status='active'` の JOIN は note PK 経由。ADR-001 / plan「`idx_pubs_owner_visibility_published_at` がそのまま効く」の主張どおり。`notes` 側の `status` フィルタは PK lookup 後の述語評価で、`idx_notes_owner_status_updated`（schema `:280`）が補助的に効きうるが、本クエリの主経路は publication_states 起点で問題なし。スキーマ変更・マイグレーション不要も確認。

- **[N-005]** AC-3 の頭打ち解消は構造保証。`countPublicByOwner` は limit/offset/cursor を一切持たない COUNT(*)（`:351-362`）であり、旧経路の `findPublicByOwner(..., {limit:1000})` のような行数上限が原理的に存在しない。runtime のマジックナンバーではなくクエリ形による保証なので堅牢。test 側は大規模 seed を省略し COUNT に limit 不在であることを実装で担保する方針（plan ステップ5 / testing.md 確認項目3）で、これは妥当な代替。

- **[N-006]** `findPublicByOwner`（`:197-222`）は本 PR で一切改変されていないことを diff で確認。active JOIN 非追加のため deleteAccount の trashed-but-public flip 掃除・listRelatedPublicNotes の over-fetch・keyset cursor の意味が無変更（AC-4、ADR-001 案 (a) 回避）。adapter 層として共有メソッドの契約破壊なし。

- **[N-007]** test の UoW 経由呼び出しが他メソッドと整合。`container.unitOfWorkProvider.run(async ({ publicationStateRepository }) => ...)`（`:750-753` 他）で read-only count を呼ぶ形は既存 integration test と同じ。`listPublicNoteIdsByOwnerSorted` との突き合わせ（`:891-905`）も同一 UoW トランザクション内で実行しており、母集団の一貫性を担保している。
