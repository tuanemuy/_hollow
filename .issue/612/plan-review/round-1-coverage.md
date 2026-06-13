# Plan Review — Issue #612 (Round 1)

**視点:** Issueの要件カバレッジ・スコープ整合性
**対象:** `.issue/612/plan.md` / `.issue/612/adr.md`
**レビュー日:** 2026-06-13

---

## 検証サマリー

Issue 本文・補足で挙げられた4つの要件はすべて受け入れ基準に落ちている:

1. trashed-but-public 除外 → AC-1
2. listing total との整合 → AC-2
3. limit:1000 頭打ち解消 → AC-3
4. 3呼び出し元の不変更 → AC-4（+ AC-5 でテスト担保）

**最重要検証（AC-2 のフィルタ無し全件比較が本当に成立するか）の結果: 成立する。**

- 新メソッド SQL（plan L74-80）の WHERE = `owner_id = ? AND visibility = 'public' AND published_at IS NOT NULL AND notes.status = 'active'`（INNER JOIN notes）。
- `listSortedAll`（`publicationStateRepository.ts:255-261`）の `whereClause` = `eq(ownerId) AND eq(visibility,'public') AND isNotNull(publishedAt) AND eq(notes.status,'active')`（+ `publishedRangeConditions`、フィルタ無しでは空）。INNER JOIN notes。
- 両者の条件・JOIN・母集団は完全一致。`listUserPublicNotes` のデフォルト sort は `publishedAt`（`listUserPublicNotes.ts:129`）で、フィルタ無し（tag/publishedRange 無し）なら candidate 無しの `listSortedAll` 経路に入り、その `total` を返す。よってフィルタ無し全件では `publicNoteCount`（新メソッド）と listing `total` が同一 SQL で数えられ整合する。

plan が AC-2 をあえて「フィルタ無しの全件比較」とスコープしている点は正しい。フィルタ適用時やソート軸切替時は listing 側だけが絞り込まれてヒーローの無条件件数とは当然ズレる（仕様どおり）ので、無条件比較に限定したのは妥当。

---

#### 問題点（要修正）

問題点ゼロ。

Issue 要件はすべて検証可能な AC に落ち、各 AC と実装ステップの紐づけ（AC-1→2,3 / AC-2→2,3,4 / AC-3→2,3 / AC-4→1 / AC-5→5）は正しい。スコープ外作業（findPublicByOwner 改変・listRelatedPublicNotes / deleteAccount 改変・他画面）は「含まれないもの」で明示的に除外されており、混入なし。新メソッド追加は port→adapter→usecase→test の内向き依存順で閉じている。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-2 の検証方法に「デフォルト経路（sort=publishedAt・フィルタ無し）でのみ厳密一致する」前提を一行添えるとよい
  - 理由: 現状 AC-2 は「フィルタ無しの全件比較で一致する」とだけ書かれている。実装上は「フィルタ無し」かつ「デフォルト sort=publishedAt」の組み合わせで `listSortedAll` を通るときに同一 SQL で一致する。一方 sort を `updatedAt`/`createdAt`/`title` に切り替えた無フィルタ表示では listing 側は `noteRepository.listWithCount`（`visibility:['public'] + status:'active'` を notes 主テーブル側の機構で解決、`noteRepository.ts:494-553`）という別クエリ機構を通る。母集団の意図（public かつ active）は一致するはずだが、JOIN 形ではなく candidate/NOT EXISTS 解決のため「同一 SQL での一致」とは言い切れない。AC-2 を厳密に「同一 SQL での一致」として扱うなら、検証対象がデフォルト経路であることを明記しておくと、レビュアー/実装者が誤って別 sort 経路で突き合わせて混乱するのを防げる（ステップ5の AC-2 adapter 裏取りも `listPublicNoteIdsByOwnerSorted`（=listSortedAll）と突き合わせる前提で正しく書かれているので、AC 文言だけ補足すれば十分）。

- **[S-002]** ステップ5のテストケースに「`listSortedAll` の `total` と `countPublicByOwner` を、`status='trashed'`+public 行が混在する母集団で突き合わせる」ケースを AC-2 裏取りの本命として明示する
  - 理由: 現状ステップ5の listing total 突き合わせは「可能なら…1ケースで」と任意扱い。だが AC-2（整合）は本 Issue の核心要件（症状=一覧4件 vs ヒーロー5件）であり、trashed-but-public 行が両者から等しく除外されることの突き合わせこそが回帰防止の要。任意ではなく必須ケースに格上げすると、将来 `listSortedAll` 側の WHERE 変更時に `countPublicByOwner` との drift を検知できる。

---

#### 良い点

- Issue 補足で「修正方針は要検討」とされた論点（findPublicByOwner に active JOIN を足すか / 件数専用メソッドを足すか / 呼び出し側で active 担保か）を ADR-001 で (a)(b)(c) として整理し、deleteAccount の掃除と keyset cursor の意味を壊さない (c) を選んだ根拠が明確。実コードで裏取りした結果、deleteAccount（`deleteAccount.ts:66-90`）が `findPublicByOwner` の全 public 行（trashed 含む）を private に flip して掃除する必要があるという ADR の主張は正しく、(a) を退ける理由は妥当。
- AC-3（1000 頭打ち解消）を「COUNT クエリ化により limit/offset/cursor を持たない＝原理的に頭打ちが発生しない」と構造で保証している点が良い。runtime のマジックナンバー回避ではなくクエリ形による保証なので堅牢。
- スコープの「含まれないもの」が4項目で具体的に列挙され、特に listRelatedPublicNotes（`listRelatedPublicNotes.ts:106-114` で in-memory active 再フィルタ済み）と deleteAccount の現挙動が正しい根拠まで添えられている。実コードと一致を確認済み。
- 「新メソッドの WHERE 条件を `listSortedAll` と完全一致させる」「`published_at IS NOT NULL` を落とさない」をリスク欄で明示しており、AC-2 整合の唯一の壊れ筋（条件 drift）を正しく特定している。
- presentation 出力（`publicNoteCount: number`）の型・意味が不変で UserPublicTop 変更不要、という判断は `UserPublicTop.tsx:122,174` の利用箇所と一致。値が（trashed-but-public 分）減るのは仕様どおりの変化と PR 明記する旨もあり、レビュー観点の抜けがない。
