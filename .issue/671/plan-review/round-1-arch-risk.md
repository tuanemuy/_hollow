# Round 1 レビュー（アーキテクチャ整合性・実現可能性・リスク） — Issue #671

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/671/plan.md` / `.issue/671/adr.md`（基点 `origin/main` = PR #674 反映後）

総評: 計画は CLAUDE.md の Styling 規約に忠実で、`origin/main` の実コードと整合しており、コアとなる Tailwind の技術的前提（translate 系の CSS 変数合成）も**実機ビルドで検証済み・正しい**。問題点（要修正）は**ゼロ**。Tailwind 記法の検証結果と、テスト・微小なリスクに関する改善提案を記す。

---

## 検証した技術的前提（証拠つき）

計画 / ADR の最大の不確実性は「`max-sm:translate-y-full` と既定 `translate-x-full` の併存」が実際に動くか、`max-sm:translate-x-0` 併記が要るか、だった。これを `tailwindcss@4.3.1`（プロジェクトの実依存）で実際にコンパイルして確認した。対象クラス: `translate-x-full max-sm:translate-x-0 max-sm:translate-y-full data-[open]:translate-x-0 max-sm:data-[open]:translate-y-0`

生成 CSS の要点:
- すべての translate ユーティリティは `translate: var(--tw-translate-x) var(--tw-translate-y);` という**共通宣言**を出し、各ユーティリティは `--tw-translate-x` または `--tw-translate-y` の**片方だけ**を書き換える。
- `@property --tw-translate-x` / `--tw-translate-y` がともに `initial-value: 0` で登録される。
- したがって:
  - **sm+（デスクトップ）**: `translate-x-full` のみ有効 → `translate: 100% 0`（閉）、`data-[open]:translate-x-0` → `translate: 0 0`（開）。従来どおり右スライド。
  - **max-sm（モバイル）**: `max-sm:translate-x-0`（x を 0 に戻す）+ `max-sm:translate-y-full` → `translate: 0 100%`（閉・下方退避）、`max-sm:data-[open]:translate-y-0` → `translate: 0 0`（開）。ボトムシートとして正しくせり上がる。

結論:
1. **計画 / ADR-002 の方式は正しく動く。** translate 系は CSS 変数で軸独立に合成されるという前提（plan「リスクと注意点」/ ADR-002 Consequences）は実機で裏が取れた。
2. **`max-sm:translate-x-0` の併記は必須、という計画の指摘も正しい。** これを省くとモバイル閉状態で `--tw-translate-x` が `100%` のまま残り `translate: 100% 100%` になりボトムシートが右下にずれる。計画はこの点を「リスクと注意点」で明記しており適切。
3. **カスケード順の懸念もクリア。** `max-sm:data-[open]:translate-y-0`（後方ソース）は `data-[open]:translate-x-0`（前方ソース）より後に出力される。`@media` はセレクタ詳細度を上げないので、モバイル開状態では後勝ちで `--tw-translate-y: 0` が適用され、x も `max-sm:translate-x-0` で 0、結果 `translate: 0 0`。意図どおり。

既存先例も方式を裏付ける:
- `layout/styles.ts:92` — まさに同型（`max-lg:-translate-x-full ... data-[open]:max-lg:translate-x-0`）の data-driven トランジションが本番稼働中。
- `common/styles.ts` modal（`rounded-t-lg sm:rounded-lg ... max-sm:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]`）/ dropdown（`max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:rounded-b-none`）、`note/list/BulkActionBar.tsx`（`max-sm:rounded-t-lg max-sm:pb-[calc(10px+env(safe-area-inset-bottom))]`）。計画が踏襲すると言う方式・safe-area 書式と完全一致。

## 任意プロパティ記法の検証

`max-sm:[scrollbar-width:none]` / `max-sm:[&::-webkit-scrollbar]:hidden` も上記コンパイルで正しく `@media (width < 40rem){ scrollbar-width: none }` 等に展開された。Biome（lint/format）は className 文字列リテラルの中身を解釈しないため、これらの任意プロパティ記法でエラーにはならない。lightningcss も標準プロパティ/疑似要素として通る。計画の「typecheck/format で確認」は念のための確認として妥当だが、機構上は問題ない。

## AUTHOR_AVATAR 消費者の網羅性（ADR-001）

`origin/main` で `AUTHOR_AVATAR` を grep し、全消費者を洗い出した:
- `styles.ts:254` `ACTIVE_CHIP_AVATAR`（`w-4 h-4`）
- `styles.ts:292` `TOKEN_AVATAR`（`w-4 h-4 shrink-0`）
- `styles.ts:307` `SUGGESTION_AVATAR`（`w-5 h-5 shrink-0`）
- `PublicSearch.tsx:226` 検索ヒット行（`w-[18px] h-[18px]`）
- `PublicNoteDetail.tsx:112` 直接 `AUTHOR_AVATAR`（サイズ込み 28px を期待）

計画の実装ステップ 2 が列挙する消費者（`ACTIVE_CHIP_AVATAR`/`TOKEN_AVATAR`/`SUGGESTION_AVATAR` + `PublicSearch` + `PublicNoteDetail`）と**完全一致。漏れなし**。`AUTHOR_AVATAR_MD` の新設で `PublicNoteDetail` の 28px を維持する方針も妥当。`ProfileAvatar`（`PROFILE_AVATAR`, styles.ts）は別定数でグラデが共通なだけ、`AUTHOR_AVATAR` は参照していないので波及対象外（正しくスコープ外）。

## 課題1（period=all デフォルト化）の整合性

- `SearchSortToggle.reduceSortSearch`（`sort === "relevance" ? undefined`）が「既定値は URL に載せない」手本として実在し、計画が手本にする前提は崩れていない。
- `periodToDateRange`（`all`/`undefined` → `null`）と route schema（`period: z.enum(SEARCH_PERIODS).optional().catch(undefined)`）はいずれも `period` 欠落を許容済み。バックエンド変更不要という判断は正しい。`all` を enum から外さない判断（ADR-001 — 内部ファセット集計に `all` を使うため）も妥当。
- `navigate` 現状は `period: patch.period === null ? undefined : patch.period`。計画の `=== null || === "all"` への拡張で「すべて」選択時に URL から落ちる。整合。
- 構造再編（ADR-003 / 課題B）— チップ行を `useOptimistic` 楽観状態とともに 1 アイランドに保ったまま `filter-bar` の兄弟として描く方針は、楽観状態の二重管理・ちらつきを避ける正しい判断。backdrop/drawer は `fixed` なので DOM 位置に依らず影響なし、という注記も正しい（`DRAWER`/`DRAWER_BACKDROP` ともに `fixed inset-0`/`fixed top-0 right-0 bottom-0`）。

---

## 問題点（要修正）

問題点ゼロ。

要修正レベルの設計欠陥・実現不能な記法・見落とされた消費者・アーキテクチャ違反は見つからなかった。

---

## 改善提案（検討推奨）

- **[S-001]** 既存テスト `SearchFilterDrawer.test.tsx` の `すべて` 部分一致アサートが脆い点を、課題1 のテスト追加時に明示的に堅牢化する
  - 理由: 既存ケース 3（test:74-81）は `expect(html).toContain("すべて")` で期間ラジオ「すべて」ラベルの存在を確認しているが、`すべて` は「すべて解除」「すべてリセット」にも部分一致するため、ラジオが消えても誤って green になりうる。計画 AC-2（未指定時に「すべて」ラジオが `checked`）の新規ケースでは、`すべて` 文字列ではなく `name="search-period"` + `value`（または「すべて」ラベルに対応する radio の `checked` 属性を持つ要素）を SSR markup で特定してアサートすると、デフォルト化のリグレッションを確実に捕捉できる。計画ステップ7 (b) は既にこの方向を示しているので、その意図を「`すべて` の素朴な部分一致に頼らない」と一段具体化する程度でよい。

- **[S-002]** 計画ステップ3 の「`selectedPeriodCount` を `facetByPeriod.get(optimistic.period ?? "all") ?? 0` に統一」は挙動同等だが、`?? "all"` の前提（`all` ファセットが常に facets に含まれる）が崩れないことを一言担保する
  - 理由: 現状 `facets` には `all` を含む 4 件（test の `FACETS` も `all:31` を持つ）が `countPublicSearchFacets` から渡る前提。計画は「`all` ファセットは内部集計用に維持」と書いており前提は保たれるが、`optimistic.period` が `"all"`（明示選択された瞬間の楽観状態）になりうるケースで `facetByPeriod.get("all")` が引けること（= `all` キーが Map に必ず存在）を、テストか短い注記で担保しておくと安全。リファクタの簡潔化自体は妥当。

- **[S-003]** `DRAWER_RESET` のモバイルタップ高（計画ステップ5 の「必要なら `max-sm:min-h-[44px]`」）を「採用する/しない」を確定させる
  - 理由: 計画は条件付き（必要なら）で曖昧。モバイルボトムシート footer で「すべてリセット」もタップ操作対象になるため、`DRAWER_APPLY` を 48px フルサイズにする一方で `DRAWER_RESET` が小さいままだとタッチターゲットの一貫性を欠く。mobileモックの該当要素を確認のうえ、付ける/付けないをステップで断定しておくと実装時の判断ブレを防げる（スコープ外の新規追加ではなく、既に挙げている候補の確定なので追加コストは小）。

- **[S-004]** ステップ6 の「`PublicSearch` 側の `FILTER_BAR`/`FILTER_BAR_RIGHT` 組み立てをアイランドへ移す」具体形を、`FILTER_BAR_LEFT`（件数）の所有者と合わせて 1 行で確定させる
  - 理由: 現状 `PublicSearch.tsx` は `FILTER_BAR`（`flex justify-between flex-wrap`）の中に `FILTER_BAR_LEFT`（件数）と `FILTER_BAR_RIGHT`（drawer + sort）を並べ、`SearchFilterDrawer` はそのフラグメント内にチップ行を描く。ADR-003 (C) は「アイランドがフィルターバー右側＋直下チップ行を所有、`PublicSearch` は左側スロットだけ与える」とするが、`FILTER_BAR` 自体（`flex-wrap` で件数とボタン群を横並びにし、チップ行はその外＝兄弟に出す）をどちらが組むかが計画では曖昧。`resultsCount`/`countIsLowerBound`/`facets`/`sort` はサーバー算出なので、「`PublicSearch` が `FILTER_BAR`（件数 + 右スロット）+ その直後にチップ行プレースホルダ、を組み、`SearchFilterDrawer` は右スロット内のボタン群とチップ行の中身を埋める」のような責務分担を 1 行で確定しておくと、実装者が `SearchSortToggle` の配置（`FILTER_BAR_RIGHT` 内維持）と矛盾しないレイアウトを一発で書ける。これは設計の欠陥ではなく粒度の改善。

---

## 良い点

- **コアの技術的前提を ADR で明示的に検証対象として挙げている。** 「translate 系は CSS 変数合成」「`max-sm:translate-x-0` 併記要否」「`data-[open]` 両軸の併存」を plan「リスクと注意点」と ADR-002 Consequences で先回りして言語化しており、実機検証で**すべて正しい**ことが確認できた。記法の動く/動かないを計画自身が自覚的に扱っている。
- **CLAUDE.md Styling 規約への忠実さ。** ユーティリティのみ・`data-*` バリアント・`styles.ts` 定数集約・safe-area の `pb-[calc(... + env(safe-area-inset-bottom))]` 書式・既存先例（modal/dropdown/BulkActionBar/SORT_MENU_PANEL）の踏襲、いずれも規約準拠。新規 CSS / `@apply` ゼロを明言。
- **ユーティリティ衝突の根因分析が正確。** 「同一プロパティ二重指定は className の並びでなく生成 CSS の規則出現順で勝敗が決まる」という ADR-001 の説明は Tailwind の実挙動どおりで、`w-7 h-7` がベースに残ると後勝ちで 28px に化けるという診断も正しい。「打ち消し（A）」「コンポーネント化（C）」を退け「ベース＋サイズ分離（B）」を採る判断は最小修正・構造的解決として妥当。
- **AUTHOR_AVATAR 全消費者を漏れなく特定**し、`PublicNoteDetail` の 28px 維持（`AUTHOR_AVATAR_MD`）まで波及対応に織り込んでいる。
- **バックエンド非干渉のスコープ判断が的確。** `periodToDateRange` / route schema / `countPublicSearchFacets` が既に `period` 欠落を正しく扱うことを確認したうえで「フロントのみ」と切っており、`all` を enum に残す理由（内部集計）も整合。
- **楽観状態の扱いを最優先にした構造再編（ADR-003）。** チップ行を別アイランド化（楽観二重管理）や portal（SSR 煩雑）を退け、1 アイランド保持のままレイアウトだけ兄弟化する判断は、`useOptimistic` のちらつき回避という非機能要件を正しく優先している。
- **px 完全一致を求めない方針**を #642 のブラウザ検証（root font-size フルード clamp）コメントに基づいて明文化しており、rem ベース慣習との整合が取れている。
