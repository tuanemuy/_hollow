# Plan Review Round 1 — 要件カバレッジ・スコープ整合性

**対象:** `.issue/671/plan.md` / `.issue/671/adr.md`
**視点:** Issue #671 の要件カバレッジ・スコープ整合性
**基点コード:** `origin/main`（PR #674 マージ後）を参照して検証
**作成日:** 2026-06-13

---

## サマリー

計画は Issue 本文の3課題＋コメント2件の追加課題（A:アバターサイズ衝突、B:チップ行構造バグ）を AC-1〜AC-13 に網羅的に落とし込めており、スコープ整合性も高い。課題2を「PR #674 でマージ済み・本Issueでは触らない」と明確に除外できている点、`origin/main` を基点とする注意書き、px完全一致不要のコメント合意を反映している点はいずれも適切。要件の取りこぼしや、スコープ外作業の混入は**重大なものはなし**。

ただしモック差分の細部に **AC で拾い切れていない要素が2点**（リセットリンクのタップ高、`ACTIVE_CHIPS_CLEAR`/`clear-all` のモバイル高さ・shrink）あり、加えて AC-11 の構造再編における `SearchSortToggle` の収まり先に計画文の不整合が1点ある。いずれも実装は可能だが受け入れ基準・ステップとして明文化しておくのが安全。

- 問題点: 1 / 改善提案: 4

---

## 検証の前提（コード突き合わせ結果）

`origin/main` の実コードと計画の記述を突き合わせ、以下を確認した。計画の調査結果は概ね正確。

- `PublicSearch.tsx`: `FILTER_BAR_RIGHT` 内に `<SearchFilterDrawer>` と `<SearchSortToggle>` を並置（:186-189）。検索ヒット行のアバターは `${AUTHOR_AVATAR} w-[18px] h-[18px] text-[9px]`（:226、衝突あり）。計画記述と一致。
- `SearchFilterDrawer.tsx`: 1フラグメントで「フィルターボタン＋チップ行＋backdrop＋drawer」を返す。`navigate` の period 分岐は `patch.period === null ? undefined : patch.period`（`all` をそのまま URL に書く）。`activeCount` は `optimistic.period !== null ? 1 : 0`。period チップ描画ガードも `optimistic.period !== null`。ラジオ `checked={selected === p}`。`selectedPeriodCount` は `period !== null` 分岐。すべて計画の記述どおり。
- `styles.ts`: `AUTHOR_AVATAR`（:158, `w-7 h-7 ... text-[11px]`）、`ACTIVE_CHIP_AVATAR`/`TOKEN_AVATAR`/`SUGGESTION_AVATAR` がそれを合成（:254/292/307）。`ACTIVE_CHIPS`（:250, `flex flex-wrap gap-1.5 pb-3 border-b border-hairline mb-1`）、`DRAWER`（:264, 右スライド固定）、`DRAWER_FOOTER`（:272）、`DRAWER_APPLY`（:276, `h-10 px-5`）。すべて一致。
- `AUTHOR_AVATAR` の全消費者は計画が挙げた5箇所（`styles.ts` 内3 + `PublicSearch.tsx` + `PublicNoteDetail.tsx`）で**過不足なし**（`git grep` で確認）。波及範囲の特定は正確。
- `SearchSortToggle.tsx` の `reduceSortSearch`（`sort === "relevance" ? undefined`）が課題1の手本である点は実コードで確認。
- `search.tsx`: `period: z.enum(SEARCH_PERIODS).optional().catch(undefined)`。`all` は enum 内に残る。`periodToDateRange` は `all`→`null`。→ 計画の「スキーマ変更不要」「`all` を enum から外さない」は妥当。
- desktopモック（`P32-public-search.html:879-916`）: `.active-chips` は `.filter-bar` の兄弟（`.results-layout` 直下の独立全幅行）。→ AC-11 の根拠は正確。
- mobileモック（`mobile/P32-public-search.html`）: drawer ボトムシート（:575-）、`.apply-btn` `flex:1; min-height:48px`、`.drawer-footer` `padding-bottom: calc(14px + env(safe-area-inset-bottom))`、`.active-chips` `flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none`、`.chip` `height:32px; flex-shrink:0; white-space:nowrap`、`.chip .avatar-tiny` 16px、`.chip-remove` 22px。→ AC-6〜10 の根拠は正確。

---

## 問題点（要修正）

- **[P-001]** AC-11 の構造再編で `SearchSortToggle` の収まり先が計画内で矛盾している
  - 計画ステップ6（plan.md:154）と ADR-003 Decision（adr.md:73）は「`SearchFilterDrawer` アイランドがフィルターバー右側（フィルターボタン）＋直下のチップ行を兄弟として所有する構造へ再編」とする一方、同じ箇所で「`SearchSortToggle` の配置（`FILTER_BAR_RIGHT` 内）は維持」とも書いている。`origin/main` では `SearchSortToggle` は `PublicSearch` が `FILTER_BAR_RIGHT` 内に**並置**しており、`SearchFilterDrawer` の外にある。
  - 理由: 「アイランドがフィルターバー右側を所有する」と「`SearchSortToggle` の配置を `FILTER_BAR_RIGHT` 内に維持する」は、`SearchFilterDrawer` がチップ行を `filter-bar` の**外（兄弟）**に出すための DOM 再編と両立する形が一意に定まらない。具体的には (a) `SearchFilterDrawer` が `filter-bar` 全体を内側に描画し `SearchSortToggle` を children/slot で受け取るのか、(b) `PublicSearch` が `filter-bar` と `active-chips` の2行を組み、チップ行だけをアイランドの別出力（2つ目のislandやrender prop）で埋めるのか、で実装が大きく変わる。チップ行は楽観状態に依存するためアイランド内に残す必要があり（ADR-003の制約）、その制約と「`SearchSortToggle` を `FILTER_BAR_RIGHT` 内に維持」「チップ行を `filter-bar` の兄弟に出す」を同時に満たす具体構造が計画文だけからは読み取れない。
  - 提案: ステップ6に採用する具体的 DOM 構造を1つ明記する。たとえば「`SearchFilterDrawer` がフラグメントで [フィルターボタン] と [チップ行] と [backdrop/drawer] を返し、`PublicSearch` 側で `filter-bar`（左:件数／右:`<SearchFilterDrawer>`のボタン部分＋`<SearchSortToggle>`）と `active-chips`（`<SearchFilterDrawer>`のチップ部分）を別行として組む」など、どの要素がどのコンポーネントから出力されどの親 DOM に入るかを確定させる。アイランドが2つの非隣接 DOM 位置に要素を出すなら、それが portal なしで成立するか（option A を ADR-003 で却下した理由との整合）も併記する。

---

## 改善提案（検討推奨）

- **[S-001]** `ACTIVE_CHIPS_CLEAR`（モックの `.clear-all`）のモバイル対応が AC・ステップから漏れている
  - 理由: mobileモックでは `.clear-all` も `height:32px` で、`.active-chips` が `flex-nowrap; overflow-x:auto` の横スクロール行に含まれる。チップだけ `max-sm:h-8 max-sm:shrink-0` にして `ACTIVE_CHIPS_CLEAR`（現状 `h-7`、`shrink` 指定なし）を据え置くと、横スクロール行内で「すべて解除」だけ高さが揃わず（28px vs 32px）、`flex-nowrap` 下で潰れ（shrink）も起こりうる。ステップ4は `ACTIVE_CHIP` と `ACTIVE_CHIP_REMOVE` にしか `max-sm:` を足しておらず、`ACTIVE_CHIPS_CLEAR` への `max-sm:h-8 max-sm:shrink-0` 追加が抜けている。AC-9 の文言も「chip 32px / chip-remove 22px」に限定され clear ボタンを含まない。
  - 改善: ステップ4に `ACTIVE_CHIPS_CLEAR` への `max-sm:h-8 max-sm:shrink-0`（必要なら `max-sm:whitespace-nowrap`）追加を加え、AC-9 を「行内の全チップ／クリアボタンがモバイルで高さ32px・横スクロールで潰れない」へ広げる。

- **[S-002]** ドロワー「すべてリセット」リンクのモバイルタップ高（44px）が AC で必須化されていない
  - 理由: mobileモックの `.drawer-footer .reset-link` は `min-height:44px`。`origin/main` の `DRAWER_RESET` は `px-1 py-2` のみでタップ高の保証がない。計画ステップ5は `DRAWER_RESET` を「必要なら `max-sm:min-h-[44px]`」と任意扱いにしており（plan.md:148）、AC-7 は「適用ボタンのフルサイズ」だけを基準化していてリセットリンクのタップ高は検証対象外。モバイルモック追従（課題3）の一部としては落ちている。
  - 改善: `DRAWER_RESET` の `max-sm:min-h-[44px]`（+ `inline-flex items-center`）を「必要なら」ではなく確定タスクにし、AC-7 もしくは新 AC でドロワーフッターのタップターゲット（適用48px・リセット44px）をモック相当にする旨を明記する。コメント合意により px 完全一致は不要だが、タップ高の floor 確保は UX 要件として残る。

- **[S-003]** AC-6（ボトムシート）に backdrop の維持・既存トランジション機構の保持が検証項目として含まれていない
  - 理由: ステップ5/ADR-002 は「`data-[open]` 駆動のトランジションを維持し軸だけ差し替える」「backdrop は `fixed` のまま」を方針に挙げているが、AC-6 は「ボトムシートとして表示される」止まりで、開閉トランジションが（軸の差し替え後も）モバイルで正しく動くこと・backdrop がモバイルでも機能することが検証可能な基準として落ちていない。リスク欄（plan.md:183, 186）には記載があるので意図は明確だが、AC に紐づいていないと検証漏れになりうる。
  - 改善: AC-6 に「モバイルでも `data-[open]` で開閉トランジション（下からのせり上がり）と backdrop のフェードが機能する」を追記。manual-test 項目としては既に挙がっているので、AC 文言の補強で足りる。

- **[S-004]** AC-13 のテスト追加範囲が「課題1」中心で、構造変更（AC-11）のリグレッション保証が任意扱い
  - 理由: ステップ7は課題1（all デフォルト化）のSSRアサートを必須にしつつ、AC-11 の構造変更（チップ行が `filter-bar` の外に出る）のアサートを「必要に応じて追加」としている。AC-11 は今回の主要修正（コメント2の構造バグ）であり、既存テストは `SearchFilterDrawer` を単体 render してチップ存在のみを見ているため、チップ行が `filter-bar` の兄弟に出る構造はテストで担保されない。構造再編は P-001 のとおり実装の自由度が大きく、リグレッションが起きやすい箇所。
  - 改善: AC-13 / ステップ7に「チップ行が `filter-bar` の flex 内に含まれない（=兄弟である）ことを SSR markup の包含関係で検証する」アサートを必須として加える。ただし P-001 で構造が確定してからでないとアサート対象が決まらないため、P-001 の解決を前提とする。

---

## 良い点

- **課題2のスコープ除外が明快。** plan.md:35 で「PR #674（#642実装）でマージ済み、`SearchSortToggle` に置換済み、本Issueでは触らない」と明記し、コメント合意（(a)案で解消・選択不可ラベル撤去）と完全に整合している。スコープ外作業の混入なし。
- **基点ブランチの注意書きが的確。** ローカル `main`/現ブランチが #674 を含まない点をリスク欄・調査結果の双方で繰り返し警告し、`origin/main` から切ることを必須化。行番号・`SearchSortToggle` 手本の前提崩れを防いでいる。実コードと突き合わせた結果、計画の行番号・構造記述は `origin/main` と一致していた。
- **px完全一致不要のコメント合意を反映。** スコープ「含まれないもの」とADR-002で「rem慣習・`max-h-[88vh]` 等の相対値・root font-size のフルードclamp」を根拠付きで明記し、`.issue/642/.manual-test/results/analysis.md` まで参照。コメント補足と矛盾なし。
- **追加課題A/B（コメント1・2）を AC-10/AC-11 に正しく落とし込んでいる。** 特にコメント1の「同一プロパティ二重指定は className 並びでなく生成CSS順で決まる」という根因分析を ADR-001 にそのまま採用し、サイズなしベース＋バリアント分離という根治策にしている。`AUTHOR_AVATAR` の全消費者（5箇所）も漏れなく特定済み。
- **各 AC に「由来」と「対応ステップ」が紐づいており追跡可能。** AC-1〜13 が課題本文・コメント・完了条件のどれに由来するか、どのステップで満たすかが表で一覧化され、カバレッジ検証がしやすい。AC-5（リグレッション裏返し）を独立基準にしている点も良い。
- **課題1の手本を `SearchSortToggle.reduceSortSearch` に置いた判断が適切。** デフォルト値（relevance / all）を URL から外して URL をクリーンに保つパターンを既存実装と一貫させており、レビュー観点でも妥当。`selectedPeriodCount` の `facetByPeriod.get(optimistic.period ?? "all")` への統一も挙動同等で簡潔。
