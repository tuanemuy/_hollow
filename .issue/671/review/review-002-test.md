# Review 002 — Test 観点 (PR #682 / Issue #671)

対象: `app/components/public/__tests__/SearchFilterDrawer.test.tsx`（主）、`app/components/public/__tests__/PublicSearch.test.tsx`（AC-13 の他方）
基点: `pnpm vitest run app/components/public/__tests__/SearchFilterDrawer.test.tsx` で 8 ケース全 pass、`app/components/public/__tests__/` 全 61 ケース全 pass を確認済み。
これは 2 回目のフルレビュー（ゼロベース）。Round 1 の W-001 / W-002 修正の妥当性も確認する。

## サマリ

Round 1 の 2 件の Warning はいずれも適切に修正された。AC-11（チップ行が filter-bar の兄弟）は
`filterBarCloseIndex` ヘルパで `<div>`/`</div>` をバランスして filter-bar の閉じタグ位置を求め、
「sort slot は閉じタグより前（=子孫）／チップ行・すべて解除ボタンは閉じタグより後（=兄弟）」を
包含関係として証明しており、Round 1 が指摘した「文書順だけでは非ネストを示せない」問題を構造的に
解消している。AC-5 は `it.each` で `7d/30d/1y` の 3 値をパラメタライズし、各値でバッジ加算・チップ表示・
remove ラベル・`checked`（かつ `all` は非 checked）を網羅。Round 1 の「30d 偏重」も解消。
期間ラジオの堅牢アサート（`name="search-period"` + `value` + `checked`）も維持されており、
「すべて」の素朴部分一致による誤 green は構造的に排除されている。新規の Blocker / Warning はなし。
残課題は軽微（アンカー正規表現が DOM 順依存である点の明記）のみ。

---

### Test

#### Blockers

なし

#### Warnings

なし

##### Round 1 指摘の解消状況

- **[W-001 解消]** AC-11 兄弟性アサートが「文書順のみ」だった件 / 場所: `SearchFilterDrawer.test.tsx:77-92, 173-209`
  - `filterBarCloseIndex(html)` を追加し、`FILTER_BAR` の開始タグから `<div>`/`</div>` を
    深さカウントして**対応する閉じタグの index** を算出。テストは `sortSlotIdx < barCloseIdx`
    （sort slot は filter-bar の子孫）かつ `chipRowIdx > barCloseIdx`・`clearIdx > barCloseIdx`
    （チップ行と「すべて解除」は閉じタグより後＝兄弟）を検証している。これは Round 1 が必須とした
    「チップ行が `FILTER_BAR_RIGHT` の子孫でない＝兄弟であること」を包含関係として証明する内容で、
    「チップ行が filter-bar の末尾にネストされた退行」も検出できる。div のみをカウントし span/button/
    input/aside は無視する設計も正しい（div ネストの深さ計算に他タグは無関係）。コメント（200-205 行）も
    「pure document order could not distinguish … the close-tag boundary does」と意図を明記。修正は妥当。

- **[W-002 解消]** AC-5 のリグレッション保証が `30d` 偏重だった件 / 場所: `SearchFilterDrawer.test.tsx:104-137`
  - 単一 `30d` ケースを `it.each([7d, 30d, 1y])` に置換。各値で バッジ `>4<`（1 user + 2 tags + 1 period）、
    period チップのラベル表示、`${label} を解除` の remove affordance、`isPeriodRadioChecked(html, period) === true`
    かつ `isPeriodRadioChecked(html, "all") === false`、user/tag チップを網羅。`checked={(selected ?? "all") === p}`
    の分岐が値ごとに独立である点を踏まえ 3 値すべてを射抜いており、計画テスト方針（「7d/30d/1y は従来どおり」）と
    整合。30d の footer 件数（`12 件を表示`）は別ケース（139-151 行）で維持。修正は妥当。

#### Notes

- **[N-001]** AC-11 / filter-bar アンカー正規表現が「最初の一致」=DOM 順に依存している / 場所: `SearchFilterDrawer.test.tsx:78-80, 186-188`
  - `filterBarCloseIndex` の `html.match(/<div class="flex items-center justify-between[^"]*">/)` は
    最初の一致を取る。`DRAWER_HEADER`（`flex items-center justify-between px-5 py-4 border-b border-hairline shrink-0`）
    も同パターンを含むが、DOM 上 `FILTER_BAR` が先に出るため正しく filter-bar を掴む。同様にチップ行アンカー
    `/<div class="[^"]*border-b border-hairline[^"]*">/` も `border-b border-hairline` を持つ 7 定数のうち、
    DOM 順で `ACTIVE_CHIPS` が `DRAWER_HEADER`/`FACET_SECTION` より前にあるため最初の一致＝チップ行になる。
    現状は両方とも DOM 構造（filter-bar → chip row → drawer）に依存して成立しており、テストも green。
    ただし将来 filter-bar より前に `justify-between` の div が増えたり、チップ行より前に `border-b border-hairline`
    の div が増えると静かに別要素を掴みうる。実害は現状なし。より堅牢化するなら filter-bar 側は
    `FILTER_BAR` 固有クラス（`mb-2` まで含める等）、チップ行側は `ACTIVE_CHIPS` 固有クラス（`pb-3 border-b`）で
    アンカーを絞る余地がある。現状は許容範囲。

- **[N-002]** AC-1（period=all で URL から `period` が落ちる）はテスト非カバーだが方針どおり / 場所: テスト全般
  - `navigate` は mock 化され引数アサートはしていない。`navigate` の `period → undefined` 反映は
    クライアント挙動で SSR markup では検証不可。計画は「URL から period が消える」を manual-test 委譲としており、
    実際 `.issue/671/manual-test/results/TC-1.md` 等で確認済み。SSR テストの範囲では現状で妥当。
    Round 1 N-001 と同評価。

- **[N-003]** バッジ数アサート `>4<` の脆さは変わらず（許容） / 場所: `SearchFilterDrawer.test.tsx:123`
  - `>4<` は `FILTER_BTN_BADGE` の `<span>4</span>` を狙う包含チェック。現 markup では他に `>4<` は出ないため
    実害なし。badge span の class 込み特定にすればより堅牢だが現状許容。Round 1 N-002 と同評価。

- **[N-004]** モバイル挙動（ボトムシート/横スクロール/開閉トランジション）の非テストは妥当 / 場所: AC-6〜9/14/15
  - `data-[open]` 駆動トランジション・`max-sm:` バリアントの見た目は SSR static markup では検証不可。
    計画も manual-test 委譲を明記し、`.issue/671/manual-test/` で TC-4〜7c により確認済み。妥当な割り切り。

- **[N-005]** AC-13 の他方 `PublicSearch.test.tsx` は更新後も通る（SearchFilterDrawer を null スタブ） / 場所: `PublicSearch.test.tsx:26-28`
  - ステップ6 で `RESULTS_COUNT`/filter-bar 組み立ての所有が `SearchFilterDrawer` 側へ移った構造変更に対し、
    `PublicSearch.test.tsx` は `SearchFilterDrawer` を `() => null` でスタブし hero/empty-state コピーのみ検証する
    設計のため、構造変更の影響を受けず 2 ケースとも pass。AC-13 の「PublicSearch.test.tsx も更新後に通る」要件を満たす。
    Round 1 N-006 の要確認事項は解消。

- **[N-006]** `isPeriodRadioChecked` ヘルパの品質は引き続き高い / 場所: `SearchFilterDrawer.test.tsx:62-71`
  - `name="search-period"` の `<input>` を属性順非依存で抽出し、`value="X"` で対象特定後に `/\bchecked\b/` を判定。
    `すべて` の素朴部分一致（「すべて解除」「すべてリセット」への誤一致）を構造的に排除する arch-risk S-001 準拠の設計。
    実装側も `PeriodFacetSection` の radio に `value={p}` を付与しており（ADR-004）、ヘルパと整合。
    period 値（`7d/30d/1y/all`）に `checked` 文字列は含まれないため `/\bchecked\b/` の誤一致もなし。良いヘルパ。

- **[N-007]** 「全フィルター不在時」ケースが追加され空状態の退行も守られている / 場所: `SearchFilterDrawer.test.tsx:95-102`
  - `q` のみ（フィルターなし）でバッジ・チップ行・「すべて解除」が出ないことを検証。`activeCount > 0` ガードの
    下限挙動（チップ行 null 分岐）をカバーしており、`all` デフォルト化のもう一つの境界として妥当。
