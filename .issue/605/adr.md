# ADR — Issue #605: 公開面の published_at 基準の並び替え・期間集計

## ADR-001: 公開日ソート/期間絞り込みを publication 集約の listing 経路に置く

### Status
Proposed

### Context
P30「公開日順」ソートと P32 期間ファセットは `published_at`（publication 集約の値）を基準にしたい。だが現状の経路は note 集約のポート（`noteRepository.listWithCount` の `updatedAt`/`createdAt`/`title` sort、`SearchIndex` の `date_for_calendar` 由来 projection）に載っており、publishedAt を持たない。選択肢:
- (a) note 集約のポートに publishedAt/可視性を持ち込む。
- (b) publication 集約に公開日ソート/期間対応の読み取り経路を新設する。

### Decision
(b) を採用。`published_at` は publication 集約の責務であり、note 集約のポートに持ち込むのは集約境界違反（#568 ADR-001 が `findReferrers` への `visibility` 追加を退けたのと同じ判断）。owner-scoped 公開ノート listing（`listPublicNoteIdsByOwnerSorted`）を publication port/adapter に新設し、id の素の射影＋total を返して hydrate は usecase 側に残す。

### Consequences
- 良い点: 集約境界を保てる。`idx_pubs_public_published_at` がそのまま効く。既存 `findPublicByOwner`（keyset/noteId 順）を壊さない。
- トレードオフ: usecase に sort 軸での経路分岐（publication listing vs note listing）が増える。

---

## ADR-002: タグ AND フィルタは application で id 解決して publication listing に渡す

### Status
Proposed

### Context
公開日ソートとタグ AND フィルタは別集約の関心（公開日=publication、タグ=note/tag）。両立させつつ total（件数）整合を保つ必要がある。タグ絞り込み時に total を別経路で数えると、ページ窓と total が乖離しうる（#30 の不変条件に反する）。

### Decision
新ポート `listPublicNoteIdsByOwnerSorted` に optional な `noteIds?: readonly NoteId[]`（タグ事前解決済み候補）を持たせる。application 層で tag→note id を解決してから publication listing に渡し、adapter 側で `note_id IN (...)` 制約と published_at 順を**単一パス**で合成して total を出す。

### Consequences
- 良い点: 集約境界を保ちつつ、窓と total を単一クエリで整合させられる。
- トレードオフ: タグ候補集合が巨大だと `IN (...)` が膨らむ。現規模では実害小。将来は join 化を検討。

---

## ADR-003: 期間 published_at は adapter 内 JOIN で着地（projection 拡張は見送り）

### Status
Proposed

### Context
公開検索/facet の期間絞り込みを `published_at` 基準にする方法は二案:
- (A) adapter で `search_documents JOIN publication_states` を dateRange 句のときだけ追加し `ps.published_at` で評価。
- (B) `search_documents` に `published_at` 列を projection し、`handlePublicationChangedEvent` で反映＋全件再 index。

### Decision
まず (A)。facet は期間数ぶんの bounded COUNT で JOIN コストは限定的。visibility='public' は既に sd 側で効くため JOIN は published_at 取得目的に限定できる。read-only SQL なので集約横断 join は CLAUDE.md 上も許容範囲。(B) は projection 拡張＋イベント配線＋再 index が必要で重く、本 Issue のスコープ外。

### Consequences
- 良い点: 最小侵襲。projection/イベントを増やさない。
- トレードオフ: 公開検索 SQL に JOIN が入る。perf が問題化したら別 Issue で (B) に段階移行。

---

## ADR-004: username prefix 検索は既存 `username` 列への範囲スキャンで index 化する（正規化列は追加しない）

### Status
Accepted（実測で確定。当初案＝正規化列追加を破棄）

### Context
`searchPublicByUsernamePrefix` の `LOWER(username) LIKE` は `uniq_users_username` を使えず全表走査になる、というのが Issue の指摘。当初計画は tags の `name_normalized` に倣って `users.username_normalized` 物理列＋index を足す方針だった。だが実装中に2つの事実が判明し、この方針を破棄した:

1. **`username` は常に lowercase。** `Username` 値オブジェクト（`app/core/domain/identity/valueObject.ts`）の `USERNAME_PATTERN` は `[a-z0-9-]` のみ許可し、大文字を含む入力は `BusinessRuleError` で**拒否**する（lowercase 化ではなく拒否）。全書き込みは domain を通るため、DB の `username` は常に lowercase。したがって `username_normalized`（= `lower(username)`）は `username` の**完全な複製**で、tags の `name`（表示形・大小混在可）と `name_normalized` の関係とは本質的に異なる。冗長列＝#372/0013 で削除した `tags.note_count` と同種の dead weight。

2. **`LIKE` は（正規化列でも）index を使わない。** ローカル D1 に対する `EXPLAIN QUERY PLAN` の実測:
   - `username LIKE 'abc%' ESCAPE '\'` → **SCAN users**
   - `username_normalized LIKE 'abc%' ESCAPE '\'` → **SCAN users**（追加した列の index も使われない）
   - `LOWER(username) LIKE 'abc%'` → **SCAN users**
   - `username >= 'abc' AND username < 'abd'` → **SEARCH users USING INDEX uniq_users_username** ✅

   既定の case-insensitive `LIKE` と BINARY collation の組合せ（＋ESCAPE 句）では LIKE 最適化が効かず、正規化列を足しても perf 目標（index 利用）を達成できない。index を確実に使うのは半開区間の**範囲クエリ**だけ。

### Decision
正規化列・新規 migration を一切追加せず、既存 `uniq_users_username`（`username` 列）に対する半開区間の範囲スキャンで実装する:

```
WHERE username >= lower(prefix) AND username < prefixUpperBound(lower(prefix))
```

入力 prefix は adapter で lowercase 化する（`username` が lowercase のため case-folding は query 側だけで足りる）。`prefixUpperBound` は最後の code point を +1 した排他的上限（全要素が U+10FFFF のときのみ `null`＝上限なし）。`%`/`_` は範囲では特殊文字でないため LIKE エスケープも不要。

### Consequences
- 良い点: スキーマ変更ゼロ（migration・backfill・列追加なし）＝本番 D1 反映リスクなし。既存 index をそのまま使い、確実に index-served になる（実測で確認）。CLAUDE.md の「冗長な非正規化列を増やさない」方針（#372 と同じ grain）に沿う。
- トレードオフ: prefix 上限計算（`prefixUpperBound`）という小さなロジックが増える。LIKE の中置・後置一致には流用できない（前方一致専用）が、本メソッドは前方一致のみなので問題なし。
- 関連: better-auth は未 wire（全書き込みが `D1UserRepository.insert`/`save` 経由）。`username` が常に lowercase である保証は domain 不変条件に由来し、書き込み経路に依存しないため、将来 better-auth を wire しても範囲クエリは成立し続ける（生成列ヘッジ自体が不要になった）。

---

## ADR-005: 実装時の追加判断（#605 実装中に確定）

### Status
Accepted（実装で確定）

### Context / Decision
実装中に下した非自明な判断を記録する。

1. **（撤回）`users.username_normalized` 物理列。** 当初 nullable 物理列＋backfill で実装したが、ADR-004 の実測（`username` は常に lowercase ＝列が冗長、かつ `LIKE` は正規化列でも index を使わない）を受けて**列ごと破棄**し、範囲クエリ方式に置換した。migration 0016・schema 列・insert/save 書き込みはすべて撤去済み。

2. **領域1 タグ AND 候補解決は `noteRepository.findByOwner({ status:'active', tagIds })` で行う。** 専用の id-only メソッドは新設せず、既存 `findByOwner` でタグ付き active note を取得して id を抽出し、`listPublicNoteIdsByOwnerSorted` の `noteIds` 候補集合に渡す（ADR-002 の単一パス合成）。候補数の上限は `TAG_CANDIDATE_CAP = 1000`（owner 単位の現実的な公開ノート数を十分上回る）。publication listing 側が候補集合内で published_at 順に再ページングするため、候補取得自体のソートは不問。

3. **領域2 の publication JOIN は `dateRange` 句がある時だけ FROM に追加する（`publicationJoin(joinPublication)` ヘルパー）。** `buildDateRangeClause` は `ps.published_at` を参照するよう変更し、query/countByDateRanges × MATCH/LIKE の 4 経路すべてで「date 窓があるとき JOIN を足し、無いときは素の sd スキャン」を一貫適用。date 窓なしの全件 count（`all` ファセット）は JOIN なしのまま。

### Consequences
- 既存の searchIndex/facet integration テスト（publication_states 行を seed していなかったもの）は、date 窓ありの検索が published_at 基準になったため publication_states 行の seed が必要になった。該当テストを更新済み。

---

## ADR-006: タグ候補経路は host-var 上限を超えないよう chunk＋in-memory で合成する（W-001 対応）

### Status
Accepted（レビュー review-001 W-001 の修正で確定）

### Context
ADR-002 で導入した `listPublicNoteIdsByOwnerSorted` の optional `noteIds`（タグ AND 事前解決済み候補、上限 `TAG_CANDIDATE_CAP = 1000`）を、adapter が**チャンク無しの単一 `inArray(note_id, [...])`** で発行していた。だが D1 は prepared-statement の host 変数を約100に制限し（`_chunks.ts`、`SAFE_CHUNK_SIZE = 90`）、本リポジトリの他の `IN (...)` はすべて `selectInChunks` でチャンク分割するのが確立した不変条件。候補が90件超のタグ付き公開ノートを持つ owner では host-var 上限超過でクエリが実行時失敗していた（ADR-002「現規模では実害小」は host-var 上限を見落としていた）。

代替案として `TAG_CANDIDATE_CAP` を90に下げる案は、90件超のタグ付き公開ノートを持つ owner で結果が**サイレントに切り捨て**られ正しくないため不採用。

### Decision
`noteIds` 候補が指定されたケースを `listSortedWithinCandidates` に分離し、候補 id を `SAFE_CHUNK_SIZE` でチャンク分割（`selectInChunks`）して各チャンクの `(note_id, published_at)` を取得 → 全チャンク結果を結合 → in-memory で `published_at`（ISO テキスト＝辞書順＝時系列順）desc/asc・note_id tie-break ソート → `total = マッチ件数`・`offset/limit` でページスライスして返す。`noteIds` 候補が**無い**ケース（タグ未指定）は `listSortedAll` として現状の index-served 直接 SQL（`idx_pubs_owner_visibility_published_at`）を維持（host-var 問題なし）。

候補経路では `notes` の status JOIN を**省略**する。候補は呼び出し側で `noteRepository.findByOwner({ status:'active', tagIds })` 由来＝active note 限定であり、trashed 混入が原理的に起きないため。no-candidate 経路（`listSortedAll`）は全公開行が母集合になり relay-lag の trashed 公開行が混入しうるので、従来どおり `notes.status = 'active'` JOIN を維持する（#605 P-002 不変条件）。

### Consequences
- 良い点: host-var 上限を超えない。集約境界は維持（adapter は publication_states のみ扱い、note_tags 等は JOIN しない＝タグ解決は application 層のまま）。取得・count が同一 merged 母集合なので `items.length <= total`・窓と total 独立（#30）を保つ。
- トレードオフ: 候補経路はソート・ページングが in-memory（index 非利用）。候補上限が `TAG_CANDIDATE_CAP = 1000` に bound されるため最悪でも12チャンク・1000行のメモリソートに収まり、現実的なオーナー単位の公開ノート数では十分軽量。
- テスト: 候補数 120（>90）で host-var エラーなく正しい total・ページ・published_at 順が返ることを `publicationStateRepository.integration.test.ts` に追加。

---

## ADR-007: date 窓の評価基準は `SearchQuery.dateBasis` で surface 別に明示する（B-001 対応）

### Status
Accepted（レビュー review-001 B-001 の修正で確定。ADR-005 項3 を是正）

### Context
ADR-003 / ADR-005 項3 で `D1SearchIndex` の date 窓を `dateRange !== null` のときだけ `publication_states` に INNER JOIN し `ps.published_at` で評価するよう変更した。しかしこの分岐は **surface を判別しておらず**、`dateRange` の有無だけで JOIN を足していた。`searchOwnNotes`（自分のノート＝`['private','unlisted','public']` 全可視性＋dateRange）も同じ adapter の `SearchIndex.query` を通るため、公開面に閉じるはずの変更が private 面へ漏れていた:

1. **脱落リグレッション。** public publication を持たない private/unlisted ノートは `publication_states` 行が無いため、INNER JOIN により date 絞り込み時に全件脱落する（main は全ノートに存在する `sd.date_for_calendar` で絞っていたので脱落しなかった）。
2. **意味のサイレント切替。** private 面の「期間」の意味が `date_for_calendar`（カレンダー日付）から `published_at`（公開日）へ無断で変わる。private/unlisted は公開日を持たない／持っても意味が異なる。

`searchOwnNotes.test.ts` は fake `SearchIndex` の unit テストで、D1 の JOIN を捕捉できず未検出だった。

### Decision
date 窓の評価基準をドメイン値オブジェクト `SearchQuery` に明示する。`dateBasis: 'published_at' | 'date_for_calendar'` を追加し、デフォルトは後方互換のため `'date_for_calendar'`（既存 private/own の意味を維持）とする。surface ごとに usecase が明示的に渡す:

- 公開面（`searchPublicNotes` / `countPublicSearchFacets` / `searchUserPublicNotes` 経由）→ `'published_at'`。
- 自分のノート面（`searchOwnNotes`）→ `'date_for_calendar'`（従来どおり全可視性に効く）。

adapter は JOIN の条件を `q.dateRange !== null && q.dateBasis === 'published_at'` に変更し、`buildDateRangeClause(range, basis)` を basis で分岐（`published_at` → `ps.published_at`、`date_for_calendar` → `sd.date_for_calendar`）。query / countByDateRanges × MATCH / LIKE の 4 経路すべてで一貫適用する。`countByDateRanges`（公開 facet 用）は呼び出し側 `countPublicSearchFacets` が `dateBasis:'published_at'` を渡すため、per-facet 窓は published_at 基準で評価される。

### Consequences
- 良い点: surface ↔ date 基準の SSOT を `SearchQuery` 1 箇所に集約（W-002 で指摘された「`dateRange !== null` だけの暗黙結合」の再発防止）。集約境界は維持（`date_for_calendar` は note 集約の search projection、`published_at` は publication 集約。JOIN は read-only SQL に限定）。private/unlisted ノートが date 絞り込みで脱落しなくなる。
- トレードオフ: `SearchQuery` に1フィールド増える。デフォルトを `'date_for_calendar'` にしたことで「公開面は明示必須」という規約が生まれる（公開面 usecase 3 箇所で明示済み）。
- テスト: publication 行を持たない private/unlisted ノートが `date_for_calendar` 窓で脱落しないことを `searchIndex.integration.test.ts` に MATCH / LIKE 両経路で追加。公開面 facet/検索テストは `dateBasis:'published_at'` を明示して引き続き published_at 基準を検証。
