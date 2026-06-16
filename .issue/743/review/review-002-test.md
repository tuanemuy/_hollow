# PR #744 レビュー — Test 観点 (review-002 / 2周目フルレビュー)

対象 PR: #744 / 計画: `.issue/743/plan.md`
レビュー軸: テストの網羅性・設計・モック戦略・回帰検出力

## サマリ

1周目 W-001（累積 id key テストの退行検出力不足）の修正を最新の作業ツリーで確認した。
`DirectoryBreadcrumb.test.tsx` に `console.error` spy（L176）と
`afterEach` の `vi.restoreAllMocks()`（L64）が追加され、name-based key への退行が
React の重複キー警告（`console.error`）として捕捉される構造になっている。修正は妥当で、
1周目の指摘は解消済みと判定する。

AC-7a（DirectoryBreadcrumb 単体）/ AC-7b（FilterBar 回帰）/ AC-7c（HeaderSection 配置）は
計画どおりカバーされている。#710 で FilterBar 側にあったパンくず系テストの
DirectoryBreadcrumb 単体への移譲に検証の穴は無く、過剰モック・偽陽性も見当たらない。
対象 2 ファイル 34 件は `vitest run` で全 pass、フルスイート 4017 件も pass を確認済み。

Blocker・Warning ともに無し。新規の Note のみ。

### Test
#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** 1周目 W-001 の修正が正しく退行を捕捉する。
  / 場所: `DirectoryBreadcrumb.test.tsx:171-195`（spy L176 / 二重 assert L190-194 / restore L64）
  / `key` が累積 id（`a`, `a/b`, ...）から name ベース（全 `"Notes"`）へ退行すると、React は
  list 描画で重複キーを検知して `console.error("Encountered two children with the same key, %s. ...", key)`
  を出す。本テストは `expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("the same key"), expect.anything())`
  と `expect(errorSpy).not.toHaveBeenCalled()` の二段で固定しており、前者は退行メッセージをピンポイントで、
  後者はそれ以外の予期せぬ React 警告も同時に捕捉する。実装本体（`DirectoryBreadcrumb.tsx:54-57`）の
  累積 id `join("/")` がこの不変条件の唯一の番人であり、揃える先 `NoteBreadcrumb.test.tsx` には key テスト自体が
  無いため、ここを固めた意義は大きい。`mockImplementation(() => {})` で出力を握り潰したうえで
  `afterEach` の `vi.restoreAllMocks()`（L64）が確実に復元するので、他テストへの spy 漏れも無い。過剰モックではない。

- **[N-002]** 偽陽性リスクの確認: 同名 4 セグメント（`"Notes"` ×4）で `links()===3` / `aria-current===1` /
  labels 4 件を併せて assert（L186-188）しているため、spy が万一無効化されても描画自体の崩れは別 assert が拾う。
  退行検出を console spy 単独に依存させず描画構造でも二重化しており、堅い。

- **[N-003]** #710 テストの移譲が過不足なく完了している。FilterBar 側から外れた 4 観点
  （セグメントリンクの directoryId スコープ / separator が要素間のみ / breadcrumb 行配置 / nav 内 × の navigate）のうち、
  ナビ構造 3 観点（祖先=リンク・末尾=非リンク・separator・Folder 無し）は `DirectoryBreadcrumb.test.tsx` に移設、
  × navigate は廃止機能なので「nav 内に button が 0」（L122-133）の不在テストへ置換、
  行配置は移設先が HeaderSection（AC-7c）に変わったため FilterBar からの削除が正しい。漏れは無い。

- **[N-004]** DirectoryBreadcrumb 単体テストが AC-7a の列挙項目を網羅する。1 セグメント（末尾＝先頭、L114-120：
  リンク 0・separator 0）/ 2 セグメント（L94-112）/ 3 セグメント（L135-152）を持ち、separator が `N-1` 件で
  先頭前に無いことを `compareDocumentPosition` で順序まで検証。Folder アイコン不在（L154-169）は
  「先頭 wrapper の最初の要素がリンクで aria-hidden span を含まない」かつ「aria-hidden span 数＝separator 数（N-1）」の
  二段確認で、アイコン span が混入すれば数が N になって落ちる。末尾非リンクは `tagName !== "A"`（L111）で固定。

- **[N-005]** FilterBar 回帰テスト（`Issue #743` describe, L711-807）の検出力が高い。
  L721-731「resolvable segments を渡しても nav も fallback chip も出ない」がパンくず移設の本丸の回帰
  （FilterBar がパンくずを描き続ける退行）をピンポイントで突く。L740-749 は fallback chip の × が
  `closest("nav")===null` であることまで確認し、location 語彙（nav）/ filter 語彙（chip）の棲み分けを構造で固定。
  L769-806 の clear-all は navigate-time search updater を直接呼んで `directoryId/from/to` 全てが
  undefined になることを assert しており、root crumb 不採用後の唯一の directory 解除導線（plan AC-5）の回帰を担保する。
  `undefined` directoryId（L733-738）も含め、resolvable / unresolvable / 不在の 3 分岐が網羅されている。

- **[N-006]** AC-7c（HeaderSection 配置）にテストが無い点は妥当。`HeaderSection` は複数 loader を await する
  async server component で `createRoot` ベースの happy-dom 単体では render できず、plan テスト方針が
  「DOM 順序の単体テストが書けない場合は単体＋手動で AC-4 を担保してよい」と明文化済み。
  `DirectoryBreadcrumb` の `nav` 自身が `mb-6` を持つ（`DirectoryBreadcrumb.tsx:50`）構造は単体テストで、
  見出し直前の条件描画は `.issue/743/manual-test/` の手動結果で担保される設計で、書ける範囲を避けた逃げではない。

- **[N-007]** モック戦略が 3 ファイル間で整合。`DirectoryBreadcrumb.test.tsx` / `FilterBar.test.tsx` は
  `Link` を `data-directory-id` 付き anchor としてモックし（祖先リンクの `search.directoryId` スコープ契約に必要十分）、
  脆いセレクタは `span[aria-hidden="true"]` という意味ベースに統一されている。揃える先 `NoteBreadcrumb.test.tsx`（不変）と
  同型のモック語彙で、過剰モックや実装クラス依存の脆さは無い。
