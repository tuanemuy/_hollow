# 実装計画 — Issue #671: 公開検索(P32)フィルターUIの改善（期間「すべて」チップ化解消・モバイルモック追従・チップ崩れ修正）

**Issue:** #671
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

公開検索(P32 `/search`)のフィルター UI を「あるべき姿（デザインモック）」に合わせる。期間「すべて」をデフォルト扱いにし、モバイルでドロワーをボトムシート化・チップ行を横スクロール・適用ボタンをフルサイズにし、チップのレイアウト崩れ（アバターのサイズ衝突／チップ行の描画位置ずれ）を解消する。フロントエンド（プレゼンテーション層）のみの変更。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 期間ラジオで「すべて」を選ぶと URL に `period=all` が**載らない**（`period` パラメータが消える） | 課題1 / Issue本文 | 3 |
| AC-2 | 期間未指定（URL に `period` なし）のとき、ドロワーの期間ラジオ「すべて」が `checked` になる | 課題1 / Issue本文 | 3 |
| AC-3 | 期間が「すべて」/未指定のとき、アクティブチップ「すべて」が**表示されない** | 課題1 / Issue本文 | 3 |
| AC-4 | 期間が「すべて」/未指定のとき、フィルターボタンのバッジ（`activeCount`）に**数えられない** | 課題1 / Issue本文 | 3 |
| AC-5 | 期間 `7d`/`30d`/`1y` を選んだ場合は従来どおりチップ表示・バッジ加算・URL 反映される（リグレッションなし） | 課題1（裏返し） | 3 |
| AC-6 | モバイル幅でドロワーが**ボトムシート**（下端固定・上角丸・下から `translateY` でせり上がる・`max-height` でビューポート内に収まる）として表示され、モバイルでも `data-[open]` 駆動の開閉トランジション（下からのせり上がり）と backdrop のフェードが機能する | 課題3 / mobileモック / coverage S-003 | 5 |
| AC-7 | モバイル幅でドロワー footer の「適用」ボタンが**フルサイズ**（`flex-1` + 48px 相当のタップ高）になる | 課題3 / mobileモック | 5 |
| AC-8 | モバイル幅でアクティブチップ行が**折り返さず横スクロール**する（`flex-nowrap` + `overflow-x-auto`、各チップは縮まない） | 課題3 / mobileモック | 4 |
| AC-9 | モバイル幅でチップ高さ・remove ボタンのタップターゲットがモック相当（chip 32px / chip-remove 22px 程度）に拡大される | 課題3 / mobileモック | 4 |
| AC-10 | チップ内アバターが 16px（意図サイズ）で描画される（28px にならない）。`AUTHOR_AVATAR` のサイズ衝突が解消されている | 追加課題A / コメント1 | 1, 2 |
| AC-11 | アクティブチップ行がフィルターバーの**外（直下）に全幅の独立行**として描画され、チップがフィルターボタン/ソートボタンと同一 flex 行に挟まらない（上下ずれが消える） | 追加課題B / コメント2 | 6 |
| AC-12 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通過する | 完了条件 | 全 |
| AC-13 | 既存ユニットテスト（`SearchFilterDrawer.test.tsx` / `PublicSearch.test.tsx`）が更新後も通り、課題1（all デフォルト化）の挙動がテストで保証され、かつチップ行が `filter-bar` の flex 内に含まれない（=兄弟である）ことが SSR markup の包含関係でアサートされる | テスト方針 / coverage S-004 | 7 |
| AC-14 | モバイル幅でチップ行内の「すべて解除」ボタン（`ACTIVE_CHIPS_CLEAR`）もモック相当（高さ32px・`shrink-0`・`whitespace-nowrap`）になり、横スクロール行内でチップと高さが揃い潰れない | coverage S-001 / mobileモック | 4 |
| AC-15 | モバイル幅でドロワー footer の「すべてリセット」リンク（`DRAWER_RESET`）がタップしやすい高さ（`max-sm:min-h-[44px]`）になり、footer のリセット/適用ボタンがモック相当のタップターゲット（リセット44px・適用48px）になる | coverage S-002 / arch-risk S-003 / mobileモック | 5 |

## スコープ

### 含まれないもの

- **課題2（ソート「関連度順」の無意味表示）** — PR #674（#642 実装）でマージ済み。ソートは `SearchSortToggle`（関連度順⇄新着順トグル）に置き換わっており、本 Issue では触らない。
- バックエンド/ドメイン/ユースケース/アダプターの変更 — フロントのみ。`searchPublicNotes` / `countPublicSearchFacets` / `periodToDateRange` のロジックは変更しない（`periodToDateRange` は `all` を `null` に正しくマップ済み）。
- ルート `validateSearch` のスキーマ変更 — `period` は既に `.optional().catch(undefined)` で URL から落とせる。スキーマ変更は不要（`all` を enum から外す案は採らない。理由は ADR-001）。
- モバイルの px 完全一致 — コメント合意により rem ベースの既存慣習に合わせる（root font-size がフルードな clamp のため。`.issue/642/.manual-test/results/analysis.md`）。
- デスクトップのフィルターバー/チップ/ドロワーの見た目 — 概ねモック一致済み。構造修正（AC-11）の副作用以外は触らない。

## 調査結果

> 注意: 本 Issue は PR #674 マージ後の `origin/main` を基点に実装する。ローカルの `main` および現在のブランチ `issue/669/...` は #674 を含まない古い状態なので、実装着手時に `origin/main` から新規ブランチを切ること。以下のファイル状態・行番号は `origin/main`（#674 反映後）を基準に記載する。

- 関連ファイル:
  - `app/components/public/PublicSearch.tsx` — サーバーコンポーネント。`FILTER_BAR` を組み立て、`FILTER_BAR_RIGHT` 内に `<SearchFilterDrawer>` と `<SearchSortToggle>` を並べる。`resultsCount` / `countIsLowerBound` をサーバー側で算出。検索ヒット行のアバターに `${AUTHOR_AVATAR} w-[18px] h-[18px] text-[9px]`（衝突あり）。
  - `app/components/public/SearchFilterDrawer.tsx` — `"use client"` アイランド。URL を単一の真実とし `useOptimistic` で楽観反映。フィルターボタン（バッジ付き）＋アクティブチップ行＋ backdrop ＋ドロワーを**1 つのフラグメントで返す**。`activeCount` は user/tags/period をそれぞれ 1 件として数える。`navigate({period:p})` で `period==="all"` もそのまま URL に書く。チップ行（`ACTIVE_CHIPS`）もこのフラグメント内にある。
  - `app/components/public/styles.ts` — P32 のユーティリティ文字列定数群。`AUTHOR_AVATAR`（`w-7 h-7`=28px を含む）を `ACTIVE_CHIP_AVATAR` / `TOKEN_AVATAR` / `SUGGESTION_AVATAR` がベースとして合成し、後段で `w-4 h-4` 等を足してサイズ衝突。`ACTIVE_CHIPS` / `ACTIVE_CHIP` / `DRAWER` / `DRAWER_APPLY` / `DRAWER_BACKDROP` 等もここ。
  - `app/components/public/searchPeriod.ts` — `SEARCH_PERIODS`（`7d/30d/1y/all`）、`PERIOD_LABELS`、`periodToDateRange`（`all`→`null`）。変更不要。
  - `app/routes/search.tsx` — `validateSearch` の `searchSchema`。`period` は `.optional().catch(undefined)`。変更不要。
  - `app/components/public/SearchSortToggle.tsx` — #674 で追加。`reduceSortSearch` が `sort==="relevance" ? undefined` で URL をクリーンに保つパターン。**課題1 の period 扱いの直接の手本**になる。
  - `app/components/public/PublicNoteDetail.tsx:112` — `AUTHOR_AVATAR` を**サイズ込みのまま（28px 意図）正しく**使っている唯一の消費者。サイズ分離時にここの 28px を維持すること。
  - テスト: `app/components/public/__tests__/SearchFilterDrawer.test.tsx`（period チップ/バッジ/ラジオを SSR markup でアサート）、`app/components/public/__tests__/PublicSearch.test.tsx`。
- モック差分:
  - デスクトップ `spec/design/pages/P32-public-search.html:879-916` — `.active-chips` は `.filter-bar` の**兄弟（直下の独立全幅行）**。実装はチップ行が `FILTER_BAR_RIGHT` の flex 内 → AC-11 の構造バグ。
  - `.chip .avatar-tiny` は `width/height:16px` 固定（同 :417-425）。実装は 28px に化ける → AC-10。
  - mobile `spec/design/pages/mobile/P32-public-search.html:575-591` — `.drawer` は `left/right:0; bottom:0; max-height:88vh; border-radius:lg lg 0 0; transform:translateY(100%)`、`.open` で `translateY(0)`。`.drawer-footer` は `padding-bottom: calc(14px + env(safe-area-inset-bottom))`。`.apply-btn` は `flex:1; min-height:48px`。`.active-chips` は `flex-wrap:nowrap; overflow-x:auto; scrollbar 非表示`、`.chip` は `height:32px; flex-shrink:0; white-space:nowrap`、`.chip-remove` は `22px`。
- あるべきアーキテクチャ（`CLAUDE.md` Styling 節）:
  - ユーティリティファースト（`className` に Tailwind 直書き、新規 CSS / `@apply` 禁止）。
  - 状態は `data-*` 属性 + `data-[name]:` バリアント。`data-x={value || undefined}`。
  - トークンは `tokens.css` が SSOT。`--radius-lg`=12px / `--radius-pill` / `--radius-full` は既存。
  - 繰り返すユーティリティ文字列はモジュールスコープ定数（`styles.ts`）へ。Tailwind JIT がリテラルを走査するので挙動は inline と同一。
  - **ユーティリティ衝突（同一プロパティの複数指定）は生成 CSS の順序で勝敗が決まり className の並びに依らない** → サイズを文字列合成で上書きする設計を避ける（課題A の根因）。
  - safe-area / ボトムシートは既存先例あり: `common/styles.ts`（modal: `rounded-t-lg sm:rounded-lg ... max-sm:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]`、dropdown: `max-sm:fixed max-sm:bottom-0 max-sm:rounded-b-none`）、`note/list/BulkActionBar.tsx`（`max-sm:rounded-t-lg max-sm:pb-[calc(10px+env(safe-area-inset-bottom))]`）、`styles.ts` の `SORT_MENU_PANEL`。**このパターンを踏襲する。**
- 既存実装の状態:
  - 課題1: ルート/`periodToDateRange` は `all`=デフォルトを既にサポート。乖離はアイランド側のみ（`navigate` が `all` を URL に書く・`activeCount` が period!=null で数える・チップを描く・ラジオが period なしで未選択）。
  - 課題3: モバイル未追従。`DRAWER` は全ビューポートで右スライド固定、`DRAWER_APPLY` は `h-10 px-5` 固定、`ACTIVE_CHIPS` は `flex-wrap`。
  - 課題A/B: 上記のとおり構造・合成バグが現存。
- 依存関係: 変更は P32 検索画面のプレゼンテーション層に閉じる。`AUTHOR_AVATAR` のサイズ分離は `PublicNoteDetail`（28px）にも波及するため、分離後にこの消費者がサイズを失わないようにする（ベース＋サイズ付きバリアントを用意 or 消費側で明示）。

## 設計

### ドメインモデルへの影響
なし。本 Issue はプレゼンテーション層のみ。`SearchPeriod`（`all` を含む）も `periodToDateRange`（`all`→`null`）も既存のまま正しい。

### ユースケース / アプリケーションロジック
なし。`searchPublicNotes` / `countPublicSearchFacets` は不変。「すべて」は引き続き `period` 未指定＝日付制約なしとして既存ロジックがファセット合計 `facets.find(f => f.period === (period ?? "all"))` を返す（`all` ファセットは内部集計用に維持）。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

4 つの独立した修正をプレゼンテーション層内で行う。

1. **AUTHOR_AVATAR のサイズ分離（課題A / AC-10）** — `styles.ts`。`AUTHOR_AVATAR` から `w-7 h-7`（とフォントサイズ `text-[11px]`）を抜き、**サイズなしのベース**（グラデ・`rounded-full`・centering・色）に再定義。サイズ込みの 28px バリアントを別名で用意（例 `AUTHOR_AVATAR_MD`）。各消費者は「ベース＋単一のサイズ指定」で合成し、同一プロパティの二重指定をなくす。詳細は ADR-001。

2. **AUTHOR_AVATAR 消費者の追従** — `ACTIVE_CHIP_AVATAR`/`TOKEN_AVATAR`/`SUGGESTION_AVATAR`（`styles.ts`）と `PublicSearch.tsx:221`（検索ヒット行）、`PublicNoteDetail.tsx:112`（28px）を新ベースに合わせて書き換え。

3. **期間「すべて」のデフォルト化（課題1 / AC-1〜5）** — `SearchFilterDrawer.tsx`。`SearchSortToggle.reduceSortSearch` の手本に倣う:
   - `navigate({period})` の `period` 反映を「`all` または `null` → `undefined`（URL から外す）」に変更（`period: patch.period === null || patch.period === "all" ? undefined : patch.period`）。
   - `activeCount` の period 項を `optimistic.period !== null && optimistic.period !== "all"` で数える。
   - アクティブチップの period 描画条件を同上に変更（`all`/`null` ではチップを出さない）。
   - 期間ラジオの `checked`: 現在 `selected === p`。`selected`（=`optimistic.period`）が `null` のとき「すべて」(`p === "all"`)を checked にする（`(selected ?? "all") === p`）。
   - フッターの `selectedPeriodCount` は現状 `period===null` で `all` カウントを使う実装なので変更不要（`all` 明示選択時も `all` カウントを引ければよい — `facetByPeriod.get(optimistic.period ?? "all")` に統一すると簡潔）。

4. **モバイルのボトムシート化・チップ横スクロール・適用ボタン（課題3 / AC-6〜9）** — `styles.ts` の `DRAWER`/`DRAWER_FOOTER`/`DRAWER_APPLY`/`ACTIVE_CHIPS`/`ACTIVE_CHIP`/`ACTIVE_CHIP_REMOVE` に `max-sm:` バリアントを追加。`data-[open]` 駆動の開閉トランジションは維持し、`max-sm:` で `translate-x-full→translate-y-full`、位置・角丸・`max-h`・safe-area padding を切替える。詳細は ADR-002。

5. **チップ行をフィルターバー外へ分離（課題B / AC-11）** — 構造修正。アクティブチップ行はクライアントの楽観状態（`optimistic`）に依存するためサーバー側 `PublicSearch` には持てない。`SearchFilterDrawer` アイランドが「フィルターバー全体（右側＋直下のチップ行）」を所有する形に再編する。詳細は ADR-003。

## 実装ステップ

内側（共有スタイル定数）→ 外側（コンポーネント構造）→ テストの順。

### 1. `AUTHOR_AVATAR` をサイズなしベースに再定義し、28px バリアントを追加

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:** `AUTHOR_AVATAR` を「グラデ・`rounded-full`・`inline-flex items-center justify-center`・`text-white font-medium`」だけのサイズなしベースに変更（`w-7 h-7 text-[11px]` を除去）。28px 用に `AUTHOR_AVATAR_MD = `${AUTHOR_AVATAR} w-7 h-7 text-[11px]`` を新設。
- **理由:** サイズを合成で「足す」とベースの `w-7/h-7` と新サイズが同一プロパティで二重指定になり、生成 CSS の値昇順順序で 28px が後勝ちする（課題A 根因）。ベースからサイズを外せば各消費者がサイズを 1 回だけ指定でき衝突が消える。

### 2. `AUTHOR_AVATAR` 消費者をベース+単一サイズに書き換え

- **対象ファイル:** `app/components/public/styles.ts`（`ACTIVE_CHIP_AVATAR`/`TOKEN_AVATAR`/`SUGGESTION_AVATAR`）、`app/components/public/PublicSearch.tsx`（検索ヒット行 :221）、`app/components/public/PublicNoteDetail.tsx`（:112）
- **変更内容:**
  - `ACTIVE_CHIP_AVATAR = `${AUTHOR_AVATAR} w-4 h-4 text-[8px]``（16px、衝突なしに）
  - `TOKEN_AVATAR = `${AUTHOR_AVATAR} w-4 h-4 text-[8px] shrink-0``（16px）
  - `SUGGESTION_AVATAR = `${AUTHOR_AVATAR} w-5 h-5 text-[9px] shrink-0``（20px、モック維持）
  - `PublicSearch.tsx`: `${AUTHOR_AVATAR} w-[18px] h-[18px] text-[9px]`（18px、衝突解消）
  - `PublicNoteDetail.tsx`: `AUTHOR_AVATAR` → `AUTHOR_AVATAR_MD`（28px 維持）
- **理由:** ベース変更後、各消費者がそれぞれ単一のサイズを持つようにして意図どおりに描画する。チップ/トークンが 16px、サジェスト 20px、ヒット行 18px、ノート詳細 28px。

### 3. 期間「すべて」をデフォルト扱いにする

- **対象ファイル:** `app/components/public/SearchFilterDrawer.tsx`
- **変更内容:**
  - `navigate` の period 分岐: `next.period = (patch.period === null || patch.period === "all") ? undefined : patch.period`。
  - `activeCount`: period 項を `optimistic.period !== null && optimistic.period !== "all" ? 1 : 0`。
  - アクティブチップ: period チップの描画ガードを「`all`/`null` 以外」に。
  - 期間ラジオ `checked`: `(selected ?? "all") === p`（未指定時「すべて」checked）。
  - `selectedPeriodCount`: `facetByPeriod.get(optimistic.period ?? "all") ?? 0` に統一（挙動同等で簡潔化）。
- **注記（arch-risk S-002）:** この統一は「`all` ファセットが `facetByPeriod` Map に常在する」前提に立つ。`countPublicSearchFacets` は `7d/30d/1y/all` の 4 件を必ず返し（テストの `FACETS` も `all:31` を含む）、計画でも「`all` ファセットは内部集計用に維持」としているため前提は保たれる。万一欠落しても `?? 0` でフォールバックするので例外にはならない。
- **理由:** `all` は無指定と同義（デフォルト）。URL に載せず・チップに出さず・バッジに数えず・未指定時にラジオ「すべて」を checked にする（AC-1〜5）。`SearchSortToggle` の `relevance` 既定値の扱いと一貫させる。

### 4. アクティブチップ行をモバイル横スクロール対応にする

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:**
  - `ACTIVE_CHIPS` に `max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden` を追加（既定の `flex-wrap` は sm+ のまま）。
  - `ACTIVE_CHIP` に `max-sm:h-8 max-sm:shrink-0 max-sm:whitespace-nowrap`（chip 32px・縮まない・改行しない）。
  - `ACTIVE_CHIP_REMOVE` に `max-sm:w-[22px] max-sm:h-[22px]`（タップターゲット 22px）。
  - `ACTIVE_CHIPS_CLEAR`（モックの `.clear-all`「すべて解除」。現状 `h-7`・`shrink` 指定なし）に `max-sm:h-8 max-sm:shrink-0 max-sm:whitespace-nowrap` を追加。横スクロール行内でチップと高さ（28px→32px）を揃え、`flex-nowrap` 下で潰れないようにする（coverage S-001）。
- **理由:** モバイルではチップが折り返さず横スクロール、各チップ・クリアボタンは縮まず高さ 32px、remove は 22px（mobileモック §387-438, AC-8/9/14）。

### 5. ドロワーをモバイルでボトムシート化・適用ボタンをフルサイズに

- **対象ファイル:** `app/components/public/styles.ts`
- **変更内容:**
  - `DRAWER`: `max-sm:` で右スライドからボトムシートに切替。`max-sm:top-auto max-sm:right-0 max-sm:left-0 max-sm:bottom-0 max-sm:w-full max-sm:max-h-[88vh] max-sm:rounded-t-lg max-sm:translate-x-0 max-sm:translate-y-full max-sm:data-[open]:translate-y-0` を追加（sm+ の右スライドは現状維持）。
  - `DRAWER_FOOTER`: `max-sm:pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]`（safe-area 対応、既存先例の書式）。
  - `DRAWER_APPLY`: `max-sm:flex-1 max-sm:min-h-[48px]` を追加（フルサイズ）。
  - `DRAWER_RESET`: `max-sm:min-h-[44px] max-sm:inline-flex max-sm:items-center` を**採用する**（条件付きではなく確定タスク）。mobileモックの `.reset-link` は `min-height:44px` で、適用ボタンを48px化する一方でリセットだけ小さいとタッチターゲットの一貫性を欠くため（coverage S-002 / arch-risk S-003）。px 完全一致は不要だがタップ高の floor 確保は UX 要件として残す（AC-15）。
- **理由:** mobileモック §575-651（ボトムシート・適用ボタン `flex:1; min-height:48px`・リセット `min-height:44px`・footer safe-area）。`data-[open]` 駆動の既存トランジション機構（および backdrop のフェード）を保ったまま軸だけ差し替える（AC-6/7/15）。

### 6. アクティブチップ行をフィルターバー外（直下）の独立全幅行へ移す

- **対象ファイル:** `app/components/public/SearchFilterDrawer.tsx`、`app/components/public/PublicSearch.tsx`
- **採用する具体 DOM 構造（ADR-003 で確定）:** portal は使わない。`SearchFilterDrawer` アイランドが「フィルターバー領域」全体（filter-bar 行 ＋ その兄弟のチップ行 ＋ backdrop ＋ drawer）を 1 フラグメントで所有し、`SearchSortToggle` は children として受け取る。責務分担は次のとおり。
  - `PublicSearch`（サーバー）は `hasKeyword` 時に `<SearchFilterDrawer facets={facets} resultsCount={resultsCount} countIsLowerBound={countIsLowerBound}>{<SearchSortToggle sort={sort} />}</SearchFilterDrawer>` を 1 つだけ置く。件数（`resultsCount`/`countIsLowerBound`）は props、ソートトグルは children として渡す。サーバーは「件数表示（左）」と「ソートトグル（右スロット）」の値・要素だけを供給し、filter-bar とチップ行の DOM 組み立てはアイランドに委ねる（`FILTER_BAR_LEFT` の件数所有者はサーバーだが、DOM 配置はアイランドが行う＝ arch-risk S-004 の責務分担を確定）。
    - `SearchFilterDrawer` の Props を `{ facets, resultsCount, countIsLowerBound, children }` に拡張する（`children` に `<SearchSortToggle>` を渡す）。`resultsCount`(number)/`countIsLowerBound`(boolean) はサーバー算出のシリアライズ可能なプリミティブで RSC→client へ渡せる。`children`/`resultsCount`/`countIsLowerBound` の required/optional は実装時に既存呼び出しに合わせて確定する。
    - **フィルターボタン（バッジ付き）は `activeCount`＝楽観状態依存のためアイランドが自前描画する。`children` として外から渡るのは `SearchSortToggle` のみ**（同一 flex 行内にアイランド自前のフィルターボタンと children のソートトグルが混在する構成。フィルターボタンをサーバーに移すのではない）。
    - **作業漏れ防止メモ:** この再編で `FILTER_BAR` / `FILTER_BAR_LEFT` / `RESULTS_COUNT` の import 所有者が `PublicSearch` から `SearchFilterDrawer` へ移る（`RESULTS_COUNT` 内の `<strong>` インラインユーティリティも一緒に移動）。
  - アイランドが返すフラグメントの最終 DOM（縦並び）:
    1. `<div className={FILTER_BAR}>`（filter-bar 行＝`flex items-center justify-between flex-wrap`）
       - 左: `<div className={FILTER_BAR_LEFT}>` … 件数表示（`RESULTS_COUNT`、サーバーから受けた `resultsCount`/`countIsLowerBound`）
       - 右: `<div className={FILTER_BAR_RIGHT}>`（`flex items-center gap-2`）… `[フィルターボタン（FILTER_BTN, バッジ付き）]` ＋ `{children}`（`<SearchSortToggle>`）
    2. `{activeCount > 0 ? <div className={ACTIVE_CHIPS}>…</div> : null}`（**filter-bar の兄弟**＝全幅の独立行。`FILTER_BAR_RIGHT` の flex の外）
    3. `<div className={DRAWER_BACKDROP} .../>`（従来どおり `fixed`、DOM 位置に依らず機能）
    4. `<aside className={DRAWER} …>…</aside>`（従来どおり `fixed`）
  - これにより「`SearchSortToggle` は filter-bar 右側（`FILTER_BAR_RIGHT` 内）に収まる」と「チップ行は filter-bar の兄弟の全幅独立行」が portal なしで両立する。チップ行が楽観状態（`useOptimistic`）に依存する制約も、全要素が単一アイランド内にあるため満たす（ADR-003 で option A=portal / option B=別アイランドを却下した理由と整合）。
- **理由:** 現状チップ行が `FILTER_BAR_RIGHT`（`flex items-center`）の flex アイテムとして挟まり、`ACTIVE_CHIPS` の `pb-3 border-b mb-1` で本体が垂直中央より上にずれ・下線も孤立して出る。モックではチップ行は `filter-bar` の兄弟の全幅独立行（desktopモック :879-916, AC-11）。アイランドが filter-bar 構造ごと所有することで、楽観状態を単一アイランドに保ったままモック構造に一致させる。

### 7. テスト更新・追加

- **対象ファイル:** `app/components/public/__tests__/SearchFilterDrawer.test.tsx`（必要なら `PublicSearch.test.tsx`）
- **変更内容:**
  - 既存 3 ケースが構造変更後も通ることを確認（period `30d` 系は挙動不変）。テストの render が `SearchFilterDrawer` 単体だった場合、Props 拡張（`resultsCount`/`countIsLowerBound`/`children`）に合わせて render 呼び出しを更新する。
  - 課題1 のケースを追加: (a) `period: "all"` のとき「すべて」チップが出ず・バッジに数えない（`activeCount` に含まれない）、(b) `period` 未指定のとき期間ラジオ「すべて」が `checked`、(c) `period: "all"` 指定でも `すべて を解除` チップが出ないこと。
  - **アサートの堅牢化（arch-risk S-001）:** 期間ラジオは曖昧な部分一致（`expect(html).toContain("すべて")`）でアサートしない。`すべて` は「すべて解除」「すべてリセット」にも部分一致して誤 green になりうるため、`name="search-period"` ＋ `value`（または「すべて」ラベルに対応する radio の `checked` 属性を持つ要素）を SSR markup で特定してアサートする。
  - **構造変更のリグレッションテスト（coverage S-004、必須）:** チップ行（`ACTIVE_CHIPS`）が `filter-bar`（`FILTER_BAR`）の flex 内に含まれない＝**兄弟**として描画されることを、SSR markup の包含関係でアサートする（例: `FILTER_BAR` の要素の閉じ後にチップ行が現れる／チップ行が `FILTER_BAR_RIGHT` の子孫でないこと）。ステップ6で確定した DOM 構造に対して検証する。
- **理由:** 課題1 のデフォルト化挙動と構造修正（チップ行の兄弟化）をリグレッションから守る（AC-13）。

### 8. 最終チェック

- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し通過を確認。可能なら `pnpm test:unit` で P32 関連テストを実行。手動確認（モバイル幅でのボトムシート・チップ横スクロール・チップずれ解消・期間「すべて」の挙動）は manual-test に委ねる。
- **理由:** 完了条件 AC-12/13。

## 設計判断

- **ADR-001:** `AUTHOR_AVATAR` を「サイズなしベース＋サイズ付きバリアント」に分離（合成での同一プロパティ二重指定を排除）。
- **ADR-002:** モバイルボトムシートは既存先例（`common/styles.ts` modal/dropdown, `BulkActionBar`）と同じ「`max-sm:` バリアント＋`data-[open]` トランジション軸差し替え＋`env(safe-area-inset-bottom)`」方式で実装し、新規 CSS を書かない。
- **ADR-003:** アクティブチップ行をフィルターバー外の独立全幅行に出すための構造再編（チップ行はクライアント楽観状態に依存するためアイランドに残し、レイアウト上は `filter-bar` の兄弟にする）。

詳細は `.issue/671/adr.md`。

## リスクと注意点

- **基点ブランチ:** ローカル `main`/現ブランチは PR #674 を含まない。必ず `origin/main`（#674 反映後）から新規ブランチを切る。行番号・`SearchSortToggle` 前提が崩れると課題1 の手本が消える。
- **`AUTHOR_AVATAR` の波及:** サイズをベースから抜くと、サイズ未指定の消費者（`PublicNoteDetail` 28px）がサイズを失う。全消費者（4 + 詳細）を漏れなく更新する。検索ヒット行（`PublicSearch.tsx`）も衝突中なので一緒に直す。
- **Tailwind バリアントの衝突:** `max-sm:translate-y-full` と既定 `translate-x-full` は別プロパティ（translate 系は CSS 変数で合成されるため）。`max-sm:translate-x-0` を併記して右スライド軸を無効化する点を忘れない。`data-[open]:translate-x-0`（既定）と `max-sm:data-[open]:translate-y-0` の両立を確認する。
- **スクロールバー非表示の記法:** `[scrollbar-width:none]` と `[&::-webkit-scrollbar]:hidden` は任意プロパティ記法。Biome / lightningcss でエラーにならないか typecheck/format で確認。`.active-chips:empty { display:none }` 相当は呼び出し側で空行を出さない既存方針（`activeCount>0` ガード）を維持。
- **テストの SSR 限定:** 開閉/トランジション/横スクロールはクライアント挙動で SSR markup テストでは検証不可。`checked`・チップ有無・バッジ数のみテストで担保し、見た目は manual-test に委ねる。
- **構造再編（ステップ6）の副作用:** チップ行を移動する際に `data-open` backdrop/drawer の z-index・配置に影響が出ないよう、backdrop/drawer は従来どおり `fixed` で body 直下相当に置く（`filter-bar` の DOM 位置と視覚位置は `fixed` のため無関係）。

## テスト方針

- ユニット（SSR markup, vitest）:
  - 期間「すべて」/未指定でチップ・バッジが出ない（AC-3/4）。
  - 期間未指定でラジオ「すべて」が `checked`（AC-2）。`name="search-period"` ＋ `value`/`checked` 属性で特定し、`すべて` の素朴な部分一致に頼らない（arch-risk S-001）。
  - 期間 `7d/30d/1y` は従来どおりチップ・バッジ・ラジオ checked（AC-5）。
  - チップ行（`ACTIVE_CHIPS`）が `filter-bar`（`FILTER_BAR`）の flex 内に含まれず兄弟として描画される（AC-11/13、coverage S-004）。
  - 既存ドロワー scaffolding（dialog・facet・footer 件数）が通ること。
- 静的: `pnpm typecheck && pnpm lint:fix && pnpm format`（AC-12）。
- 手動（manual-test、モバイル幅）: ボトムシートのせり上がり/角丸/safe-area、チップ横スクロール、適用ボタンのフルサイズ、チップの上下ずれ解消、アバター 16px、期間「すべて」選択で URL から `period` が消える。px 完全一致は求めず rem 慣習で評価。

## レビュー履歴

### 1周目（2026-06-13）

**両視点（要件カバレッジ / アーキテクチャ・リスク）並列レビューを実施**（arch-risk は問題点ゼロ・改善提案4件、coverage は問題点1件・改善提案4件）。

**修正した点:**
- [coverage P-001 + arch-risk S-004] AC-11 の構造再編の具体 DOM 構造を確定。`origin/main` の `PublicSearch.tsx`（`FILTER_BAR`/`FILTER_BAR_LEFT`/`FILTER_BAR_RIGHT` 組み立て）と `SearchFilterDrawer.tsx`（フィルターボタン＋チップ行＋backdrop＋drawer を 1 フラグメントで返す）を確認したうえで、portal を使わず「アイランドが filter-bar 領域全体を所有し、`SearchSortToggle` を children として受け取り、チップ行を filter-bar の兄弟として描画する」案に確定（Props を `{facets, resultsCount, countIsLowerBound, children}` へ拡張）。ステップ6 と ADR-003 Decision に確定 DOM を明記し、件数所有者（サーバー値供給／アイランド DOM 組み立て）の責務分担も確定。
- [coverage S-001] ステップ4 に `ACTIVE_CHIPS_CLEAR`（「すべて解除」）のモバイル対応（`max-sm:h-8 max-sm:shrink-0 max-sm:whitespace-nowrap`）を追加。AC-14 を新設。
- [coverage S-002 / arch-risk S-003] ステップ5 で `DRAWER_RESET` の `max-sm:min-h-[44px]` を条件付きから確定タスクに変更。AC-15 を新設。
- [coverage S-003] AC-6 に「モバイルでも `data-[open]` 開閉トランジションと backdrop フェードが機能する」を追記。
- [coverage S-004] AC-13 とステップ7・テスト方針に「チップ行が `filter-bar` の flex 内に含まれない＝兄弟であることを SSR markup の包含関係でアサート」を必須として明記。
- [arch-risk S-001] ステップ7・テスト方針に「期間ラジオは曖昧な部分一致（『すべて』）でアサートしない。`name="search-period"`/`value`/`checked` で特定する」を明記。
- [arch-risk S-002] ステップ3 に「`all` ファセットが Map に常在する前提（欠落時は `?? 0` でフォールバック）」の注記を追加。

**取り込んだ改善提案:** 上記の全件（coverage S-001〜S-004、arch-risk S-001〜S-004）。

**見送った提案とその理由:** なし（全件取り込み）。

**補足:** arch-risk はコアの技術前提（translate 系の CSS 変数合成・`max-sm:translate-x-0` 併記必須・`max-sm:data-[open]:translate-y-0` のソース順後勝ち）を実機ビルドで検証済みで問題点ゼロ。計画の前提は正しいとして据え置く（リスク欄の記述で十分）。

### 2周目（2026-06-13）

両視点とも問題点ゼロ。軽微な明確化提案（フィルターボタンのアイランド自前描画・Props 詳細・import 所有者移動メモ）をステップ6に反映して終了。
