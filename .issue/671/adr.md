# ADR — Issue #671: 公開検索(P32)フィルターUIの改善

## ADR-001: `AUTHOR_AVATAR` をサイズなしベースとサイズ付きバリアントに分離する

### Status
Proposed

### Context
`styles.ts` の `AUTHOR_AVATAR` は `w-7 h-7`（28px）と `text-[11px]` を含むサイズ込みの定数で、これを小さいアバターのベースとして文字列合成していた:

- `ACTIVE_CHIP_AVATAR = `${AUTHOR_AVATAR} w-4 h-4 ...``（16px 意図）
- `TOKEN_AVATAR = `${AUTHOR_AVATAR} w-4 h-4 ... shrink-0``（16px 意図）
- `SUGGESTION_AVATAR = `${AUTHOR_AVATAR} w-5 h-5 ... shrink-0``（20px 意図）
- `PublicSearch.tsx` の検索ヒット行 `${AUTHOR_AVATAR} w-[18px] h-[18px] ...`（18px 意図）

要素に `w-7 h-7` と `w-4 h-4`（等）が**同時に付く**。Tailwind/CSS の同一プロパティ二重指定は className の並び順では決まらず、**生成 CSS の規則出現順**で勝敗が決まる。Tailwind は値を昇順で出力するため `w-7`/`h-7` が後勝ちし、意図 16px のアバターが 28px で描画される（コメント1 の根因）。

選択肢:
- (A) 各消費者で `w-7 h-7` を打ち消す（`!important` や個別上書き）— 衝突を増やすだけで根治しない。
- (B) ベースからサイズを抜き、サイズなしベース＋サイズ付きバリアントに分離する。
- (C) アバターをコンポーネント化して props でサイズを受け取る — 本 Issue のスコープ（最小修正）に対して過剰。

### Decision
(B) を採用。`AUTHOR_AVATAR` を「グラデ・`rounded-full`・centering・色・フォント太さ」だけのサイズなしベースに再定義し、サイズ（と対応フォントサイズ）は各消費者が**1 回だけ**指定する。28px が必要な唯一の正規消費者（`PublicNoteDetail`）向けに `AUTHOR_AVATAR_MD`（`${AUTHOR_AVATAR} w-7 h-7 text-[11px]`）を用意する。

### Consequences
- 良い点: 同一プロパティの二重指定が構造的に発生しなくなり、生成 CSS の順序に依存しない。CLAUDE.md「サイズを文字列合成で上書きする設計を避ける」に合致。
- 良い点: 各サイズ（16/18/20/28px）が定義箇所から一目で分かる。
- トレードオフ: ベースを参照する全消費者（4 + 詳細 1）を更新する必要がある（漏れるとサイズ消失）。テスト・typecheck で担保する。

---

## ADR-002: モバイルボトムシートは既存先例の `max-sm:` バリアント方式で実装する

### Status
Proposed

### Context
mobileモックではドロワーが右スライドではなくボトムシート（`left/right:0; bottom:0; max-height:88vh; border-radius:lg lg 0 0; transform:translateY(100%)→0`、footer は `env(safe-area-inset-bottom)` 対応）。現状 `DRAWER` は全ビューポートで右スライド固定。CLAUDE.md は新規 CSS / `@apply` を禁じ、状態は `data-*`、繰り返す文字列は `styles.ts` 定数、と定める。

選択肢:
- (A) JS でビューポートを判定して別コンポーネントを出し分ける — 不要な分岐とハイドレーション差異リスク。
- (B) 既存の `DRAWER` 定数に `max-sm:` バリアントを足し、`data-[open]` 駆動のトランジションは維持したまま「軸（translate-x → translate-y）・位置・角丸・max-height・safe-area padding」だけを切り替える。

リポジトリ既存先例: `common/styles.ts` の modal（`rounded-t-lg sm:rounded-lg ... max-sm:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]`）と dropdown（`max-sm:fixed max-sm:bottom-0 max-sm:rounded-b-none`）、`note/list/BulkActionBar.tsx`（`max-sm:rounded-t-lg max-sm:pb-[calc(10px+env(safe-area-inset-bottom))]`）、`styles.ts` の `SORT_MENU_PANEL`。いずれも (B) の方式。

### Decision
(B) を採用。`DRAWER`/`DRAWER_FOOTER`/`DRAWER_APPLY`（必要に応じ `DRAWER_RESET`）に `max-sm:` バリアントを追加する。開閉トランジションは現行の `data-[open]:translate-*` 機構を流用し、`max-sm:translate-x-0 max-sm:translate-y-full max-sm:data-[open]:translate-y-0` で軸を差し替える。safe-area は既存先例と同じ `pb-[calc(... + env(safe-area-inset-bottom))]` 書式で書く。

### Consequences
- 良い点: 既存パターンと一貫し、新規 CSS ゼロ、ハイドレーション差異なし、`data-*` 規約準拠。
- 良い点: px 完全一致を狙わず（コメント合意）、`max-h-[88vh]` 等の相対値で root font-size のフルード clamp に追従する。
- トレードオフ: translate 系を sm 境界で切り替えるため、`max-sm:translate-x-0`（右スライド軸の無効化）と既定 `data-[open]:translate-x-0` の併存を検証する必要がある。

---

## ADR-003: アクティブチップ行をフィルターバー外の独立全幅行に出す（アイランド内に保持）

### Status
Proposed

### Context
モックでは `.active-chips` は `.filter-bar` の**兄弟（直下の独立全幅行）**。実装では `SearchFilterDrawer`（client island）が「フィルターボタン＋チップ行＋backdrop＋drawer」を 1 フラグメントで返し、それを `PublicSearch` の `FILTER_BAR_RIGHT`（`flex items-center gap-2`）内に置いている。結果、チップ行がフィルターボタンとソートトグルの間に**同一 flex 行のアイテムとして**挟まり、`ACTIVE_CHIPS` の `pb-3 / border-b / mb-1` でチップ本体が垂直中央より上にずれ、下線も孤立して出る（コメント2 の根因。全チップ共通）。

制約: アクティブチップ行はクライアントの `useOptimistic` 楽観状態に依存するため、サーバーコンポーネント `PublicSearch` 単体には持てない（URL から再 select する別アイランドにすると楽観状態が共有されずデスクトップでもちらつく）。

選択肢:
- (A) React portal でチップ行を `filter-bar` 外のプレースホルダへ送る — SSR でのポータル先確保が煩雑で、本件には過剰。
- (B) `PublicSearch` 側でチップ行を別アイランドとして `filter-bar` の後ろに置く — 楽観状態が二重管理になりデスクトップ挙動が悪化。
- (C) フィルターバー（右側＋直下チップ行）の構成を `SearchFilterDrawer` アイランドが所有し、チップ行を `filter-bar` の**兄弟**として描画する構造に再編する。`PublicSearch` は左側（件数）と右側スロットの枠だけを与える。

### Decision
(C) を採用。portal は使わない。`SearchFilterDrawer` アイランドが「フィルターバー領域」全体を 1 フラグメントで所有し、`SearchSortToggle` は children として受け取る。確定 DOM は次のとおり（縦並び）:

1. `<div className={FILTER_BAR}>`（`flex items-center justify-between flex-wrap`）
   - 左: `<div className={FILTER_BAR_LEFT}>` … 件数表示（`RESULTS_COUNT`。`resultsCount`/`countIsLowerBound` はサーバー算出値を props で受ける）
   - 右: `<div className={FILTER_BAR_RIGHT}>`（`flex items-center gap-2`）… `[フィルターボタン FILTER_BTN（バッジ付き）]` ＋ `{children}`（`<SearchSortToggle>`）
2. `{activeCount > 0 ? <div className={ACTIVE_CHIPS}>…</div> : null}` — **filter-bar の兄弟**（`FILTER_BAR_RIGHT` の flex の外）の全幅独立行
3. `<div className={DRAWER_BACKDROP} .../>`（`fixed`）
4. `<aside className={DRAWER} …>…</aside>`（`fixed`）

責務分担（arch-risk S-004 を確定）: 件数（`FILTER_BAR_LEFT`）の値とソートトグル要素はサーバー（`PublicSearch`）が props/children で供給するが、filter-bar とチップ行の DOM 組み立てはアイランドが行う。`PublicSearch` は `hasKeyword` 時に `<SearchFilterDrawer facets resultsCount countIsLowerBound>{<SearchSortToggle sort/>}</SearchFilterDrawer>` を 1 つだけ置く。Props は `{ facets, resultsCount, countIsLowerBound, children }` に拡張する。

これにより「`SearchSortToggle` を `FILTER_BAR_RIGHT` 内に維持」「チップ行を `filter-bar` の兄弟に出す」「チップ行を楽観状態とともに単一アイランドに保持」の 3 つが portal なしで同時に成立する。backdrop/drawer は `fixed` なので DOM 位置に依らず従来どおり。

### Consequences
- 良い点: モック構造（`filter-bar` の兄弟の独立行）に一致し、`pb-3/border-b/mb-1` が独立行として正しく機能、チップの上下ずれ・孤立下線が解消（全チップ共通）。
- 良い点: 楽観状態を単一アイランドに保ち、ちらつき/二重管理を避ける。
- トレードオフ: `PublicSearch` と `SearchFilterDrawer` のレイアウト責務分担を少し動かす（フィルターバーの組み立て位置が変わる）。既存 SSR テストは標準のままだが、構造変更に合わせてアサートの見直しが要る場合がある。

---

## ADR-004: 期間ラジオに `value={p}` を付与してテストの曖昧一致を排除する

### Status
Accepted（実装時に確定）

### Context
plan.md ステップ7 / arch-risk S-001 は「期間ラジオを `name="search-period"` ＋ `value` ＋ `checked` で特定し、`すべて` の素朴な部分一致でアサートしない」ことを必須とした。実装前の `<input type="radio" name="search-period">` には `value` 属性が無く、SSR markup から「どの期間のラジオが checked か」を属性だけで一意に特定できなかった（ラベル文字列に依存するしかなく、`すべて` が「すべて解除」「すべてリセット」に部分一致して誤 green になる懸念がそのまま残る）。

### Decision
`PeriodFacetSection` の各 radio に `value={p}`（`7d`/`30d`/`1y`/`all`）を付与する。これにより SSR markup 上で `name="search-period"` ＋ `value="..."` ＋ `checked` の有無を正規表現で確定的に検証できる（テストの `isPeriodRadioChecked(html, value)` ヘルパ）。`value` はネイティブ送信に乗らない（フォーム送信は JS の `onChange` 経由で `router.navigate` するため）ので機能的な副作用は無い。

### Consequences
- 良い点: arch-risk S-001 の「曖昧一致禁止」を属性ベースで満たせる。ラジオの意味論としても `value` を持つのは正しい。
- トレードオフ: なし（描画・挙動とも不変。属性が 1 つ増えるのみ）。
