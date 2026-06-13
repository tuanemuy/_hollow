# PR #714 レビュー（ラウンド2 / フルレビュー・ゼロベース）

## Test

レビュー対象: `app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts` の
`describe("D1PublicationStateRepository.countPublicByOwner (integration, #612)")`（7 ケース）、
および突き合わせ対象の adapter 実装 / port / usecase。

判定: 計画ステップ5の (a)-(g) 全ケースが独立ケースとして実装され、Round 1 の修正
（private/unlisted 除外を非NULL published_at で visibility 単独検証する形）も反映済み。
ブロッカー無し。

### Blockers

- **[B-001]** なし

### Warnings

- **[W-001]** なし

### Notes

- **[N-001]** **(a)-(g) のケース対応と独立性は計画どおり成立している。**
  - (a) → `counts active + public + published_at rows`（3 件 → `toBe(3)`）。
  - (b) → `excludes a trashed-but-public row`：active 1 + trashed-but-public 1 を投入し
    `toBe(1)`。trashed 行も `published_at` 非NULL（`"2024-02-01..."`）で投入されており、
    `status='active'` 条件だけが除外要因として独立に固定されている。混入なし。
  - (c) → `excludes an active row whose published_at is NULL`：active+public+NULL を 1 件
    混ぜ `toBe(1)`。`published_at NOT NULL` 条件を `status` と直交させて単独固定できている。
  - (d) → `excludes private / unlisted rows`：**Round 1 修正が正しく入っている。** private /
    unlisted 行の `publishedAt` を非NULL（`"2024-01-01..."`）で投入し、コメント
    「Non-NULL published_at so visibility is the sole exclusion reason」のとおり
    visibility 条件を単独で検証している。`published_at NULL` との二重ガードによる偽陰性
    （visibility 条件が消えても NULL ガードで巻き取られて緑のまま）が解消されている。
  - (e) → `returns 0 when the owner has no public notes`（`toBe(0)`）。
  - (f) → `does not count another owner's public notes`：other owner に 2 件公開を持たせて
    `toBe(1)`。owner スコープを単独固定。
  - (g)【必須】→ `agrees with the listing total under a trashed-but-public row`：同一 owner
    で active 2 + trashed-but-public 1 を投入し、`count === listingTotal === 2` を
    `listPublicNoteIdsByOwnerSorted({order:'desc',limit:1000,offset:0})`（=`listSortedAll`）の
    total と突き合わせ。AC-2 の adapter レベル裏取り・drift 回帰防止として機能する。

- **[N-002]** **WHERE 条件の parity が実体で確認できる。** adapter 実装（diff L915-933）の
  `countPublicByOwner` の WHERE は `ownerId + visibility='public' + isNotNull(publishedAt) +
  notes.status='active'`（INNER JOIN notes）で、`listSortedAll`（`publicationStateRepository.ts`
  L255-261）の `whereClause` と完全一致。range 条件のみ `listSortedAll` 側が
  `...publishedRangeConditions()` を足すが、(g) テストは range/フィルタ無し経路で突き合わせて
  おり、デフォルト経路での parity を正しく検証している（AC-2 のスコープと整合）。

- **[N-003]** **seed の独立性・id 衝突リスクは無い。** `nextId` がモジュールスコープの単調増加
  カウンタで全テスト横断で一意な UUID を払い出し、`setup.ts` の `beforeEach` が全テーブルを
  TRUNCATE してテスト間状態を遮断する。各 `it` は `createTestContainer()` を新規生成し、owner
  username も全て distinct（`owner-count` / `owner-count-trash` / ... / `owner-count-parity`）。
  describe をまたいだ seed の混入や id 衝突の余地は無い。

- **[N-004]** **アサーションの具体性は count メソッドの戻り値（number）に対しては十分。**
  `countPublicByOwner` は `Promise<number>` を返すだけなので `toBe(n)` 以上の粒度は不要で、
  各ケースで「除外行が 1 件混ざった状態で期待件数ちょうど」を検証しており偽陽性
  （件数が一致してしまう副作用）を抑えられている。(g) は `count===listingTotal` の関係性まで
  踏み込んでおり最も強い。過不足なし。

- **[N-005]【偽陰性リスク・参考】** (g) の parity テストは「両者から trashed-but-public が等しく
  除外される」ことは押さえるが、count 専用 SQL と `listSortedAll` の count SQL が**たまたま
  両方とも同じ条件を落としても緑になる**形（共通モード障害）は原理的に検出できない。これは
  本 PR の責務外（どちらも同一の確立パターンを共有する設計判断 ADR-001 による）であり、
  各除外ケース (b)-(d) を count 側単独で独立固定していることで個別条件の retention は別途
  担保されている。現状の網羅で実用上の回帰検知は十分。指摘ではなく構造の明示にとどめる。

- **[N-006]【参考】** AC-3（1000 件頭打ち解消）は integration テストでは大規模 seed を避け、
  「COUNT クエリに limit/offset/cursor を持たない」という構造で担保する方針（plan ステップ3 /
  manual-test summary）。テストレイヤーで明示の 1000 件超ケースは無いが、これは plan で意図的に
  integration 代替＝省略と合意済みで、count メソッドに limit が存在しないことは実装上自明。
  テスト不足とは判定しない。
