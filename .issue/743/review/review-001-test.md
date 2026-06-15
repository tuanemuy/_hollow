# PR #744 レビュー — Test 観点 (review-001)

対象 PR: #744 / 計画: `.issue/743/plan.md`
レビュー軸: テストの網羅性・設計・モック戦略・回帰検出力

## サマリ

AC-7a（DirectoryBreadcrumb 単体）と AC-7b（FilterBar 回帰）はおおむね丁寧にカバーされており、
#710 で FilterBar 側にあったパンくず系テスト（セグメントリンク / separator / 行配置 / nav 内 ×
navigate）は DirectoryBreadcrumb 単体テスト側へ過不足なく移譲されている。移譲漏れによる検証の穴は
見当たらない。AC-7c（HeaderSection 配置）は計画が明示的に許容した「単体＋手動」フォールバックに
則っており、逃げではなく妥当な判断と評価する。

ただし「累積 id key」テスト（AC-7a の一項目）は **テスト名が主張する回帰（name-based key への
退行）を実際には検出できない**（false negative）。これを Warning とする。`pnpm test:unit` で
当該 2 ファイル 34 件は全て pass を確認済み。

### Test
#### Blockers
- なし

#### Warnings
- **[W-001]** 「累積 id key」テストが主張する回帰を検出できない（false negative）
  / 場所: `app/components/note/list/__tests__/DirectoryBreadcrumb.test.tsx:170-186`
  / 理由: テスト名は "uses cumulative-id keys ... **without warnings**" で、JSDoc(L13-14) も
  「累積 id パスでキー化されることを stable render で間接検証」と謳う。しかし実装が `key` を
  累積 id（`a`, `a/b`, ...）から **name ベース**（全て `"Notes"`）に退行しても、React は重複キーで
  `console.error` を出すだけで 4 要素を描画し続ける。本テストは描画される要素数（`links()===3`、
  `aria-current===1`、labels 4 件）しか assert せず、**console.error / warn を一切 spy していない**
  ため、退行後も pass する。つまり「累積 id でキー化されていること」を実際には固定できていない。
  / 提案: `vi.spyOn(console, "error")` を仕込み、当該レンダー後に
  `expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining("unique \"key\""))`
  （または `.not.toHaveBeenCalled()`）を assert する。これで name-based key への退行が
  重複キー警告として捕捉される。なお揃える先 `NoteBreadcrumb.test.tsx` には key テスト自体が
  無いので、ここを正しく固めれば DirectoryBreadcrumb 側が実質的にこの不変条件の唯一の番人になる。

#### Notes
- **[N-001]** #710 テストの移譲が過不足なく完了している。FilterBar 側から削除された 4 観点
  （セグメントリンクの directoryId スコープ / separator が要素間のみ / breadcrumb 行が chip cloud の
  兄弟 / nav 内 × の clearDirectory navigate）のうち、ナビ構造に属する 3 観点（リンク・separator・
  末尾非リンク・Folder アイコン無し）は `DirectoryBreadcrumb.test.tsx` に移設され、× navigate は
  「廃止された機能」なので「nav 内に button が 0」(L121-132) という不在テストに置換されている。
  行配置（chip cloud の兄弟）は移設先が HeaderSection 配置（AC-7c）に変わったため FilterBar からの
  削除が正しい。検証の穴は無い。

- **[N-002]** FilterBar 回帰テスト（`Issue #743` describe, L711-807）の回帰検出力が高い。
  特に L721-731「resolvable segments を渡しても nav も fallback chip も出ない」はパンくず移設の
  本丸の回帰（FilterBar が誤ってパンくずを描き続ける退行）をピンポイントで突いている。
  L740-749 で fallback chip の × が `closest("nav")===null` であることまで確認しており、
  location 語彙（nav）と filter 語彙（chip）の棲み分けが構造で固定されている。
  L769-806 の clear-all は updater を直接呼んで `directoryId/from/to` 全てが undefined になることを
  assert しており、root crumb 不採用後の唯一の directory 解除導線（plan AC-5/テスト方針 L194）の
  回帰を担保している。良い。

- **[N-003]** DirectoryBreadcrumb 単体テストが 1 セグメント（末尾＝先頭、L113-119）と複数セグメント
  （2 件 L93-111 / 3 件 L134-151）の両ケースを持ち、separator が `N-1` 件・先頭前に無いことを
  `compareDocumentPosition` で順序まで検証している。Folder アイコン不在（L153-168）は
  「先頭セグメント wrapper の最初の要素がリンクで、aria-hidden span を含まない」かつ
  「aria-hidden span が separator 数（N-1）と一致」の二段で確認しており、アイコン span が混入すれば
  N になって落ちる。AC-7a の列挙項目（祖先=リンク / 末尾=aria-current 非リンク / × 無し /
  区切り要素間のみ / Folder 無し）を漏れなく満たす。

- **[N-004]** Link モック手法は `NoteBreadcrumb.test.tsx` と整合的。NoteBreadcrumb 側は
  `data-to`/`data-search`(JSON) を出すのに対し DirectoryBreadcrumb 側は `data-directory-id` だけを
  出す簡略版だが、検証したい契約（祖先リンクが `search.directoryId` でスコープされる）には十分で、
  過剰モックではない。FilterBar.test.tsx の Link モックも同形（`data-directory-id`）で 3 ファイル間の
  モック語彙が揃っている。脆いセレクタ（クラス名直指定）は DirectoryBreadcrumb 側では
  `span[aria-hidden="true"]` という意味ベースに統一されており、#710 で使っていた
  `span.text-hairline-strong`（実装クラス依存）より堅牢になっている。

- **[N-005]** AC-7c（HeaderSection 配置）にテストが無い点は妥当。`HeaderSection` は 3 つの loader を
  await する async server component で、`createRoot` ベースの happy-dom 単体テストでは
  render できない（plan テスト方針 L193 が「DOM 順序の単体テストが現実的に書けない場合は単体＋手動で
  AC-4 を担保してよい」と明文化）。`DirectoryBreadcrumb` の `nav` が自前で `mb-6` を持ち
  （`DirectoryBreadcrumb.tsx:50`）、HeaderSection で `ViewSwitcher`(h1) の直前に条件描画される
  （`HomePage.tsx:184-187`）構造は単体テスト（描画構造）＋手動で担保される設計で、書けるテストを
  避けた逃げではない。`書ける範囲を書く`原則に照らしても、async server component を無理に
  render する脆いテストを書かない判断は正しい。
</content>
</invoke>
