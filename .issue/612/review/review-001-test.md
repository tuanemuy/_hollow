# PR #714 レビュー — Test 観点（review-001）

対象: `app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts`（`countPublicByOwner` describe 追加分, L396-578）
基準: `.issue/612/plan.md` AC-5 / ステップ5、`docs/test.md`、`.issue/612/adr.md`

## 検証結果サマリー

plan ステップ5 が要求する 7 ケースは全て独立テストとして存在し、期待件数も具体的に明示されている。実装（adapter L347-365）は `listSortedAll`（L255-261）と完全一致の WHERE（owner + visibility=public + published_at NOT NULL + notes.status=active）で、テストはこの 4 条件を概ね独立に固定している。AC-5 の必須要件（active JOIN・visibility・published_at NOT NULL の D1 検証）と、AC-2 の adapter レベル裏取り（listing total 一致）は満たされている。

| plan ケース | 対応テスト | 期待値 | 独立性 |
|---|---|---|---|
| (a) active+public+published_at 複数 | "counts active + public + published_at rows" | 3 | OK |
| (b) trashed だが published_at 有り | "excludes a trashed-but-public row (AC-1)" | 1 | OK（active 条件のみ崩す） |
| (c) active だが published_at NULL | "excludes an active row whose published_at is NULL" | 1 | OK（NOT NULL 条件のみ崩す） |
| (d) private/unlisted 除外 | "excludes private / unlisted rows" | 1 | △（W-001 参照） |
| (e) ゼロ | "returns 0 when the owner has no public notes" | 0 | OK |
| (f) 他 owner 分離 | "does not count another owner's public notes" | 1 | OK |
| (g) listing total 一致【必須】 | "agrees with the listing total ... (AC-2)" | 2 かつ count===listingTotal | OK |

## Test

### Blockers

なし

### Warnings

- **[W-001]** visibility 除外ケース (d) が published_at NULL と二重ガードになっており、偽陰性リスクがある — `publicationStateRepository.integration.test.ts:474-497`
  - 場所: "excludes private / unlisted rows"。private 行・unlisted 行をともに `publishedAt: null` で seed している（L484-490）。
  - 理由: 実装の WHERE は visibility 条件と `isNotNull(publishedAt)` の AND。private/unlisted 行が published_at NULL だと、**仮に visibility フィルタが消えても** NOT NULL 条件だけで除外され、テストは緑のまま通る。つまりこのケースは「visibility 条件が効いていること」を独立に固定できておらず、(c) と除外要因が重複している。plan ステップ5 (d) の意図（visibility 条件の独立固定）と、リスク欄「WHERE 条件をズレさせない」回帰防止の狙いに対して網羅が一段甘い。
  - 提案: private/unlisted 行に `publishedAt` を非 NULL で与える（例 `"2024-01-01T00:00:00.000Z"`）。そうすれば除外要因が visibility 条件単独に切り分けられ、visibility フィルタ脱落時に確実に赤化する。なお既存 #605 の同種テスト（L175-203）も published_at NULL で seed しているため、本修正は #605 側の潜在的弱点の踏襲を断つ意味もある。

### Notes

- **[N-001]** plan の任意エッジ「同一 owner で active+private と active+public 混在の切り分け」は (d) でカバー済み（同一 active status 下で public のみ数える）。ただし W-001 の通り published_at が二重ガードになっている点だけ補正余地あり。
- **[N-002]** ケース (g) のアサーションは `expect(count).toBe(2)` と `expect(count).toBe(listingTotal)` の二段で、具体値固定 + 等価確認の両方を持つため「両者が誤った同値で揃う」偽陽性を排除できている。良い設計。listing 側を `limit: 1000` で呼ぶのは plan の「limit:大」指示に沿い、total は limit 非依存（`listSortedAll` は count を別クエリで算出, L277-281）なので妥当。
- **[N-003]** seed の id 衝突・テスト独立性は問題なし。`nextId` は module スコープの単調カウンタで全 describe 横断で一意、`setup.ts` の beforeEach TRUNCATE で行はクリア、各テストが固有 username の owner を `createTestContainer()` で seed するため相互干渉なし。既存 #605 ヘルパー（seedUser/seedDirectory/seedNote）をそのまま流用しており、スタイル整合も取れている。
- **[N-004]** (a)/(f) のように「published_at NULL や trashed を混ぜない純 active+public」と「混入させる」を分けた構成で、件数の偽陽性（多めに数える）と偽陰性（少なめに数える）の双方をカバーできている。期待件数は全ケースでマジックでない明示値。
- **[N-005]** AC-3（1000 件頭打ち解消）の integration 直接検証は無いが、COUNT クエリに limit/offset/cursor が無いことが実装上自明（adapter L351-362）であり、plan も大規模 seed を「integration test で代替可」とし summary.md でブラウザ検証省略を明記。構造保証で足り、追加テスト不要と判断。妥当。
