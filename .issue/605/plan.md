# 実装計画 — Issue #605: 公開面の published_at 基準の並び替え・期間集計（#568 で暫定対応した fidelity gap）

**Issue:** #605
**作成日:** 2026-06-09
**複雑度:** 中〜大規模

---

## 目的

#568（PR #604）で領域5公開面を実装した際、`publication_states.published_at`（公開日）を基準にした並び替え・期間集計が現状のポートで満たせず `updatedAt` / `date_for_calendar` で暫定配線した fidelity gap を、publication 集約の責務に沿った形で解消する。具体的には (1) P30 公開トップ「公開日順」ソートを実体も published_at 基準にし、(2) P32 期間ファセット/検索の期間絞り込みを published_at 基準にし、(3) `searchPublicByUsernamePrefix` の index 非効率（perf）を正規化列パターンで改善する。

## 前提（必読）

- 本 Issue が参照するコード（P30 ソート、P32 期間ファセット、`searchPublicByUsernamePrefix` 等）は **`main`（PR #604 マージ済み, `fc2ad2de`）にのみ存在**する。本作業ブランチ `issue/605/published-at-public-sort-facet` は `origin/main` から作成済みなので対象ファイルは揃っている。

## スコープ

### 含まれるもの
- 領域1: P30 公開トップの「公開日順」ソートを `publication_states.published_at` 基準にする（publication 集約に公開日ソート対応の owner-scoped listing 読み取り経路を新設し、`listUserPublicNotes` を載せ替え）。
- 領域2: P32 期間ファセット集計・公開検索の期間絞り込みを `published_at` 基準にする（`SearchIndex` の date 窓を published_at で評価できるよう拡張）。
- 領域3: `users.username_normalized` 正規化列＋インデックスを DB マイグレーションで導入し、`searchPublicByUsernamePrefix` を index-friendly な前方一致に差し替え（tags の `name_normalized` パターンに揃える）。
- 上記に対応する domain port → adapter → usecase → presentation の配線と、real-DB integration / 契約テストの追加・更新。

### 含まれないもの
- `search_documents` への `published_at` projection 列追加＋イベント再 index（領域2 の案B）。まずは adapter 内 JOIN（案A）で着地し、perf が問題化したら別 Issue で段階移行する。
- note 集約のポート（`noteRepository.listWithCount` / `SearchIndex` の `date_for_calendar` 由来 projection）に publishedAt/可視性を持ち込む変更（集約境界違反のため不採用）。
- `username` 自体の UNIQUE 制約・命名規則の変更。

## 実装ステップ

### 領域1 — P30「公開日順」を published_at 基準にする

#### 1. publication ポートに公開日ソート対応の owner-scoped listing を追加

- **対象ファイル:** `app/core/domain/publication/ports/publicationStateRepository.ts`
- **変更内容:** 新メソッド `listPublicNoteIdsByOwnerSorted(ownerId, { order, limit, offset, noteIds? })` を追加。`published_at DESC/ASC, note_id` 順で公開ノート id を offset/limit ページングし、`{ noteIds: readonly NoteId[]; total: number }` を返す。`published_at IS NULL` は既存 `findPublicByOwner`（`isNotNull(publishedAt)`）と同じく**除外で統一**（「末尾寄せ」案は entity 不変条件 public⇒published_at 非 NULL と二重化するので不採用 / S-003-req）。optional `noteIds?`（タグ事前解決済み候補）で `note_id IN (...)` 制約を受け、タグ AND と公開日順を単一パスで合成できるようにする。既存 `findPublicByOwner`（keyset cursor／noteId 順）は意味が違うため拡張せず温存。
- **理由:** 公開日は publication 集約の値。listing を publication 側に置けば集約境界を保ったまま published_at 順を実現できる（#568 ADR-001/002 と同方針）。

#### 2. D1 adapter に実装（active JOIN 必須）

- **対象ファイル:** `app/core/adapters/d1/repositories/publicationStateRepository.ts`
- **変更内容:** `publication_states`（visibility='public' AND owner=? AND published_at IS NOT NULL [AND note_id IN (...)]）を**取得・count の両方で `JOIN notes ON notes.id = publication_states.note_id AND notes.status = 'active'`** して `ORDER BY published_at DESC/ASC, note_id` で offset/limit。total も同じ active 母集合で `count()` する。
- **理由（P-002）:** trash→outbox relay のラグ中は `notes.status='trashed'` でも公開 `publication_states` 行が残りうる（`userRepository.searchPublicByUsernamePrefix` / `listRelatedPublicNotes` が同ラグを active 再チェックで吸収している）。publication 行だけ数えると total が trashed ぶん過大化し、ページからは active フィルタで消えて「total=N だが表示 N-1 件」となり #30 の不変条件（窓と total の整合）を破る。count とページを同一 active 母集合にして整合させる。

#### 2b. owner-scoped published_at ソート用の複合 index を追加

- **対象ファイル:** `app/core/adapters/d1/migrations/00XX_pubs_owner_published_at.sql` ＋ `app/core/adapters/d1/schema.ts`
- **変更内容:** 既存 `idx_pubs_public_published_at` は `(published_at)` 単独で owner 絞り込み＋ソートには効きにくい。`(owner_id, visibility, published_at)` 複合 index を追加し、owner+visibility フィルタ後に published_at 順読み出しが index で効くようにする。
- **理由（S-002-arch）:** perf を主目的に含む Issue。owner-scoped クエリで index が効かないと全表走査になる。

#### 3. usecase を publication 側 listing に載せ替え（id 順での再整列必須）

- **対象ファイル:** `app/core/application/publication/listUserPublicNotes.ts`
- **変更内容:** `sort` に `'publishedAt'` を追加。`publishedAt` のときは新ポート経由（タグ指定があれば application で tag→note id を解決して `noteIds` として渡す）、`createdAt`/`title` 等 note 列のときは従来の `noteRepository.listWithCount` 経由に分岐。**hydrate は `noteRepository.findByIds` が入力 id 順を保証しない（並列チャンク取得）ため、既存 `listRelatedPublicNotes.ts` のパターン（`Map<NoteId, Note>` を作り、ポートが返した id 列を `.map(id => byId.get(id))` で再整列）を踏襲し published_at 順を維持する**。デフォルト sort を `'publishedAt'`（＝UI「公開日順」）に。`items.length ≤ total`／窓と total 独立の不変条件（#30）を維持。
- **理由（P-001/S-001）:** ポートが published_at 順で id を返しても hydrate で順序が崩れると「公開日順」が成立しない。再整列を明示する。

#### 4. UI/route の sort enum に publishedAt を反映

- **対象ファイル:** `app/components/public/PublicTopControls.tsx`（`SortAxis`/`SORT_ORDER`/`SORT_LABELS`/default）、`app/routes/u/$username/index.tsx`（`PUBLIC_SORTS`、`validateSearch.sort`、`renderInputSchema.sort`、`loaderDeps`）
- **変更内容:** `publishedAt` を軸に追加し「公開日順」を `publishedAt` に紐付け。`updatedAt` は「更新日順」に再ラベル（軸自体は残す）。URL クリーン化の default を `publishedAt` に。JSDoc の「公開日順は updatedAt の暫定」注記を更新。**`display=calendar` モードは `date_for_calendar` ベースの日付グルーピングで sort 軸とは独立した関心**のため、default sort 変更が calendar 表示の挙動・件数に影響しないことを確認する（影響しない想定）。
- **理由（S-002-req）:** transport 境界の enum と client の軸を SSOT で揃えつつ、calendar 表示との非干渉を担保。

### 領域2 — P32 期間ファセット/検索を published_at 基準にする

#### 5. SearchIndex の date 窓を published_at 基準にできるよう拡張

- **対象ファイル:** `app/core/domain/search/ports/searchIndex.ts`、`app/core/adapters/d1/searchIndex.ts`（`buildDateRangeClause`/`countByDateRanges`/`query`）
- **変更内容:** 公開面の期間絞り込みを `publication_states.published_at` 基準にする。adapter で `dateRange` 句のときだけ `search_documents sd JOIN publication_states ps ON ps.note_id = sd.note_id`（visibility='public' は sd 側で担保済み）を追加し、`buildDateRangeClause` を `ps.published_at` 基準にする。**MATCH 経路・LIKE フォールバック経路の双方**、かつ `query` と `countByDateRanges` の両方で一貫適用する。
- **理由:** 相関語を「公開日」に正す。ISO8601 辞書順＝時系列の SQL ロジックは流用できる。

#### 6. usecase/読み取り経路の意味を確定

- **対象ファイル:** `app/core/application/search/countPublicSearchFacets.ts` / `app/core/application/search/searchPublicNotes.ts`
- **変更内容:** DateRange を渡す配線は維持（コード変更はほぼ不要）。JSDoc の「date_for_calendar 基準」注記を「published_at 基準」へ更新し、`SearchQuery.dateRange` が公開面では published_at を意味する旨をコメントで明示。
- **理由:** 配線は維持し、相関語の意味だけ正す。

### 領域3 — username prefix の index 効率化（実装中に方針転換: スキーマ変更不要）

> **重要な方針転換（実装中の実測で確定 / ADR-004）:** 当初は `users.username_normalized` 物理列＋index を足す計画だったが、(1) `username` は `Username` 値オブジェクトにより常に lowercase（大文字は拒否）なので正規化列は `username` の完全な複製＝冗長、(2) `EXPLAIN QUERY PLAN` 実測で `LIKE`（正規化列でも）は index を使わず SCAN、index を使うのは範囲クエリのみ、と判明。よって**新規列・migration を追加せず**、既存 `uniq_users_username` への範囲スキャンで実装する。

#### 7. （撤回）正規化列マイグレーション

- 当初案の `users.username_normalized` 列・index・migration・backfill は**すべて不要**として破棄。スキーマ変更ゼロ。

#### 8. `searchPublicByUsernamePrefix` を範囲スキャンに差し替え

- **対象ファイル:** `app/core/adapters/d1/repositories/userRepository.ts`
- **変更内容:** 述語を `LOWER(username) LIKE` → 半開区間 `username >= lower(prefix) AND username < prefixUpperBound(lower(prefix))` に差し替え。入力 prefix を adapter で lowercase 化（`username` が lowercase なので query 側のみで case-folding 充足）。`prefixUpperBound` ヘルパー（最後の code point +1 の排他的上限、全要素 U+10FFFF のときのみ `null`＝上限なし）を追加。`%`/`_` は範囲では非特殊なので LIKE エスケープ不要。EXISTS 列挙ガード（live author ＋ active 公開ノート保有）は据え置き。
- **理由:** 既存 `uniq_users_username` index をそのまま使い、確実に index-served にする（実測確認）。冗長な非正規化列を増やさない（#372 と同じ grain）。better-auth が将来 wire されても `username` lowercase 保証は domain 不変条件由来なので範囲クエリは成立し続ける。

### 横断

#### 10. テスト・ドキュメント更新

- **対象ファイル:** 各層の `__tests__`／`.issue/605/`
- **変更内容:**
  - publication adapter integration: published_at 降順/昇順、NULL 除外、tie-break（note_id）、total 正確性、**trashed ノート混入時に total が active 母集合のまま過大化しないこと（P-002）**、タグ AND ありの窓と total 独立。
  - `listUserPublicNotes` 契約テストに publishedAt sort・タグ合成を追加し、**hydrate 後も published_at 順が保たれること（P-001 の id 順再整列）**を検証。
  - searchIndex integration: `date_for_calendar ≠ published_at` のノートで facet/検索が published_at 基準で期間に出入りすること（境界）、MATCH と LIKE 両経路で一致。
  - userRepository integration: normalized 列の case-insensitive prefix（`Foo`/`foo` 双方ヒット）、live/公開ノート保有のみ列挙、LIKE エスケープ。
  - progress/ADR 注記を更新。

## 設計判断

詳細は `.issue/605/adr.md` を参照。要点:

- **判断1（領域1 タグ AND との合成）:** 新ポートに optional `noteIds?`（事前解決済みタグ候補）を受ける形にし、application で tag→id を解決して渡す。集約境界を保ちつつ単一パスで total を出せる。
- **判断2（領域2 published_at の取り回し）:** まず adapter 内 JOIN（案A）で着地。`search_documents` への projection 列追加（案B）は重いので将来 perf 課題化時に別 Issue で段階移行。
- **判断3（領域3 正規化列の実現方式）改訂:** STORED 生成列は SQLite/D1 の `ALTER ADD COLUMN` 不可、かつ `users` のインバウンド FK 連鎖でテーブル再構築リスク大。better-auth も未 wire（全書き込みが adapter 経由）なので、**tags と同じ物理列＋adapter 書き込み＋backfill** を第一候補にする。VIRTUAL 生成列は将来 better-auth wire 時の forward-looking ヘッジ。

## リスクと注意点

- **published_at の NULL/意味:** public なら published_at は非 NULL（entity 不変条件）だが unlisted→public で再スタンプ、過去の private 期間は反映しない。「公開日順」が最新公開時刻基準である点を UI 文言とテストで明示。
- **領域1 total 整合:** 「items.length ≤ total」「ページ窓と total 独立」（#30）を publication listing でも守る。タグ絞り込み時は単一パス解決で担保。
- **領域2 二経路の一貫性:** `query`/`countByDateRanges` ×（MATCH/LIKE フォールバック）の 4 組合せ全てで publication JOIN を一貫適用しないと、フォールバック時だけ date_for_calendar 基準に戻る不整合が起きる。
- **領域3 backfill と better-auth:** 既存 users 全行 backfill 必須。better-auth は未 wire（全書き込みが `D1UserRepository.insert`/`save` 経由）なので NULL 化リスクは現状なし、adapter 書き込みだけで充足する。将来 better-auth を wire したら VIRTUAL 生成列で別途ヘッジ（本 Issue スコープ外）。
- **マイグレーション可逆性:** D1 本番反映。`username_normalized` は非 UNIQUE（大小違いの同名衝突が理論上ありうるため）。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`、`pnpm test:integration`（real-DB）。
- ブラウザ手動: P30 で「公開日順」が published_at で並ぶ、P32 で期間 facet 件数が公開日基準に変わること（date_for_calendar とずれるシードで差分検証）。詳細は `.issue/605/testing.md`。

## レビュー履歴

### 1周目（2視点並列: 要件カバレッジ / アーキ・リスク）

**修正した点（要修正の反映）**:
- **P-001（両視点）**: `noteRepository.findByIds` は入力 id 順を保証しない（並列チャンク取得）。ステップ3 に「`listRelatedPublicNotes` の `Map` 再整列パターンで published_at 順を維持」を明記。ステップ10 のテストに「hydrate 後も published_at 順が保たれる」検証を追加。
- **P-002（アーキ・リスク）**: publication 行だけ数えると trash relay ラグ中の trashed ノートで total が過大化し #30 不変条件を破る。ステップ2 を「取得・count 両方で `JOIN notes ... status='active'`」に修正。ステップ10 に trashed 混入 total テストを追加。
- **P-003（アーキ・リスク）＋ P-001（要件カバレッジ, better-auth）**: STORED 生成列は `ALTER ADD COLUMN` 不可・`users` の FK 連鎖でテーブル再構築リスク大・better-auth 未 wire。ステップ7/8/設計判断3/ADR-004 を「tags 流の物理列＋adapter 書き込み＋backfill を第一候補、VIRTUAL 生成列は将来ヘッジ」に改訂。ステップ9（better-auth 担保）は不要化してステップ8 に統合。

**取り込んだ改善提案**:
- **S-002（アーキ）**: owner-scoped + published_at ソート用に `(owner_id, visibility, published_at)` 複合 index を追加（ステップ2b 新設）。
- **S-002（要件）**: ステップ4 に「default sort 変更が `display=calendar`（date_for_calendar グルーピング）に干渉しないこと」の確認を追加。
- **S-003（要件）**: ステップ1 の NULL 方針を「除外で統一（末尾寄せ案は不採用）」に確定。
- **S-003（アーキ）**: ステップ7/10 に case-sensitive uniq と case-insensitive normalized prefix の意味差（`Foo`/`foo` 共存）テストを明記。

**見送った提案とその理由**:
- 領域2 案B（`search_documents` への published_at projection 列追加＋再 index）: 重くスコープ過大のため見送り、案A（adapter 内 JOIN）で着地。perf 課題化時に別 Issue で段階移行（ADR-003 のまま）。

### 2周目: 両視点とも問題点ゼロで終了（下記再レビューで確認）
