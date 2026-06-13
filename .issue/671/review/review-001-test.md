# Review 001 — Test 観点 (PR #682 / Issue #671)

対象: `app/components/public/__tests__/SearchFilterDrawer.test.tsx`
基点: `pnpm vitest run` で当該ファイル 6 ケース全 pass を確認済み。

## サマリ

期間「すべて」デフォルト化（AC-1〜5）の主要ケースと、期間ラジオの堅牢なアサート
（`name="search-period"` + `value` + `checked` 属性での特定、arch-risk S-001 対応）は
適切に実装されている。`isPeriodRadioChecked` ヘルパは「すべて解除」「すべてリセット」への
誤一致を構造的に排除しており、計画方針どおり。一方、AC-11（チップ行が filter-bar の兄弟）の
リグレッションテストが「文書順のみ」のアサートに留まっており、計画（coverage S-004）が必須と
した「チップ行が `FILTER_BAR_RIGHT` の子孫でないこと」を証明しきれていない。また AC-5 の
リグレッション保証が `30d` 1 値に偏っている。

---

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** AC-11 の兄弟性アサートが「文書順」のみで非ネストを証明していない / 場所: `app/components/public/__tests__/SearchFilterDrawer.test.tsx:138-156`
  - 理由: テストは `clearIdx > sortSlotIdx`（「すべて解除」が sort slot より後に出現）だけを検証している。だが計画 coverage S-004 / ステップ7 は「チップ行が `FILTER_BAR_RIGHT` の子孫でない＝**兄弟**であること」を必須要件としている。sort slot が `FILTER_BAR_RIGHT` の末尾であっても、仮にチップ行が `FILTER_BAR_RIGHT` 内の sort slot の **後ろ**にネストされていた場合でも `clearIdx > sortSlotIdx` は green になる。つまり「チップ行が filter-bar の中（ただし最後）に挟まる」退行を検出できない。コメント（149-155 行）は「confirming the chip row is a sibling」と主張しているが、順序だけでは兄弟性は示せない。これがまさに AC-11 が防ごうとしている構造退行の核心であり、テストがそこを射抜けていない。
  - 提案: SSR markup の包含関係を直接アサートする。例えば (a) `FILTER_BAR_RIGHT` の class 文字列（`flex items-center gap-2`）を含む開始タグ位置から、その対応する閉じ `</div>` 位置を求め、`clearIdx` がそのレンジ外であることを確認する、または (b) `FILTER_BAR` の class を持つ `<div>` の閉じタグ位置を特定し、チップ行（`すべて解除` または `ACTIVE_CHIPS` の class）がその閉じタグより後にあることを検証する。少なくとも「チップ行のインデックス < FILTER_BAR の閉じタグのインデックス」が偽であること（＝外側にあること）を包含関係として明示すべき。現状の順序チェックは「フィルターボタンとソートトグルの間に挟まっていない」ことしか保証していない。

- **[W-002]** AC-5（7d/30d/1y は従来どおり）のリグレッション保証が `30d` のみに偏っている / 場所: `app/components/public/__tests__/SearchFilterDrawer.test.tsx:83-116`
  - 理由: チップ表示・バッジ加算・ラジオ checked・フッター件数を検証しているのは `period: "30d"` の 1 ケースのみ。`7d` / `1y` についてはチップ・バッジ・`checked`・件数のいずれも具体的にアサートされていない（ラジオラベル `過去 7 日` / `過去 1 年` の存在は 107-108 行で確認されるが、これは「ラジオが描画されること」であって「7d 選択時に従来どおり動くこと」ではない）。`checked={(selected ?? "all") === p}` の分岐は値ごとに独立なので 30d で通っても 7d/1y のチップ/バッジ経路を保証しない。計画テスト方針も「期間 7d/30d/1y は従来どおりチップ・バッジ・ラジオ checked（AC-5）」と 3 値を明記している。
  - 提案: `7d`（境界の最小ファセット 3）と `1y`（28）について、最低 1 ケースずつ `isPeriodRadioChecked(html, "7d") === true` ＋ チップ `過去 7 日` 表示 ＋ バッジ加算（`activeCount` に含む）を確認するケースを追加する。`it.each` でパラメタライズすれば 1 ブロックで 3 値を網羅でき、退行検出力が上がる。

#### Notes

- **[N-001]** AC-1（period=all で URL から `period` が落ちる）の `navigate` 引数アサートが無い / 場所: テスト全般
  - `navigate` は mock 化され呼び出し引数を検証していない。AC-1 の本質（`navigate` が `period` を `undefined` にして URL に載せない）はクライアント挙動で SSR markup では確認できないため、テストでの非カバーは計画方針（「URL から period が消える」は manual-test 委譲）と整合しており妥当。ただし `navigate` mock は既にあるので、`onChange` を直接呼ぶ単体検証まではしていない点を明記しておく（純 SSR テストの範囲では現状で問題なし）。

- **[N-002]** バッジ数のアサート `>4<` がやや脆い / 場所: `app/components/public/__tests__/SearchFilterDrawer.test.tsx:92`
  - `>4<` は `FILTER_BTN_BADGE` の `<span>4</span>` を狙った包含チェックだが、将来 `4` を含む別テキストノードが増えると誤一致しうる。現状の markup では他に `>4<` パターンは出ないため実害はない。より堅牢にするなら badge span の class（`rounded-pill bg-accent` 等）込みで特定する余地がある。現状は許容範囲。

- **[N-003]** モバイル挙動（ボトムシート/横スクロール/開閉トランジション）の非テストは妥当 / 場所: 計画テスト方針・AC-6〜9/14/15
  - これらは `data-[open]` 駆動のトランジション・`max-sm:` バリアントによる見た目で、SSR static markup では検証不可。計画も「開閉/トランジション/横スクロールはクライアント挙動で SSR markup テストでは検証不可。manual-test に委ねる」と明記しており、テスト不在は方針どおり。`max-sm:` class 文字列が styles.ts に載っていること自体は typecheck/lint で担保され、JIT 走査されるため SSR テストで class 存在を assert する価値は低い。妥当な割り切り。

- **[N-004]** 既存 render ヘルパの Props 拡張対応は正しい / 場所: `app/components/public/__tests__/SearchFilterDrawer.test.tsx:44-56`
  - 新 Props（`resultsCount` / `countIsLowerBound` / `children`）に合わせ render ヘルパを更新し、`children` に `data-testid="sort-slot"` のスタブを渡している。これは sibling アサート（W-001 で言及）のアンカーにも使われ、テスト構成として筋が良い。`children` を必須にした実装（`Props.children: React.ReactNode`、optional でない）とも整合。既存 3 ケースは破綻せず pass。

- **[N-005]** `isPeriodRadioChecked` ヘルパの品質は高い / 場所: `app/components/public/__tests__/SearchFilterDrawer.test.tsx:58-71`
  - `<input ... name="search-period" ...>` を属性順非依存の正規表現で抽出し、`value="X"` で対象を特定してから `checked` を判定する設計は、arch-risk S-001 が懸念した「すべて」素朴部分一致の誤 green を構造的に防いでいる。コメントも意図（なぜ部分一致を避けるか）を明記しており、why コメントとして適切。`checked` は React が boolean 属性として `checked=""` ではなく `checked` を出力する点に依存するが、`/\bchecked\b/` は `value="..."` 内の文字列とは衝突しないため安全（period 値に `checked` 文字列は含まれない）。良いヘルパ。

- **[N-006]** AC-13 のもう一方（`PublicSearch.test.tsx`）の更新確認は本レビュー対象外だが要確認 / 場所: `app/components/public/__tests__/PublicSearch.test.tsx`
  - 計画 AC-13 は `PublicSearch.test.tsx` も「更新後も通る」ことを求める。ステップ6 で `PublicSearch` から `RESULTS_COUNT` 等の所有が `SearchFilterDrawer` へ移動しているため、`PublicSearch.test.tsx` が件数表示やフィルターバー構造をアサートしていた場合は更新が必要。本レビューの主対象は `SearchFilterDrawer.test.tsx` だが、PR 全体としては `PublicSearch.test.tsx` の pass も AC-13 の構成要件である点を記録しておく。
