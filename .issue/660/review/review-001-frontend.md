# Review 001 — Frontend（コンポーネント設計・状態管理・スタイリング規約）

対象 PR: #774 / Issue #660
観点: 新設フック `useRovingTablist` の設計品質、既存ロジックの不変性、roving 配線の副作用混入、スタイリング規約準拠、DRY、biome-ignore 妥当性、React 19 / RSC 境界。
検証: `pnpm typecheck`（pass）/ `pnpm test:unit`（267 files / 4171 tests pass）/ biome lint（変更6ファイルは clean、残 25 warnings は無関係の既存ファイル由来）。

## Frontend

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-1] `useRovingTablist` の API 設計は素直で state レス設計が正しい**（`app/components/common/useRovingTablist.ts`）
  - `selectedIndex` から `getTabIndex`（`index === selectedIndex ? 0 : -1`）を導出し、内部 state を持たない。radiogroup の「選択中 = 唯一の tabbable」という不変条件を型・実装の両方で素直に表現できており、ADR-002/004 の方針どおり。`useRovingMenu` が持つ `activeIndex` state / open-reset / focus-restore / disabled 走査をすべて削ぎ落とした適切な縮小。caller は `{ count, selectedIndex, onSelect }` の3つだけ渡せばよく、API の素直さは高い。

- **[N-2] `orientation` パラメータは horizontal 固定でなく実際に分岐しているが、両軸を常に受理する設計のため過剰設計ではない**
  - `nextKey`/`prevKey` が `orientation` で切り替わる一方、`onKeyDown` 内では `event.key === nextKey || event.key === "ArrowDown"`（および prev 側で `|| "ArrowUp"`）と**両軸のキーを常に受理**する。結果として現状2 caller がいずれも `orientation` 未指定（horizontal 既定）でも ArrowUp/Down も効く。これは APG Radio Group が縦横どちらの矢印も受けるべきという仕様に忠実で、`orientation` は「どちらを primary とみなすか」を表すだけのため、未使用パラメータの過剰設計には当たらない。コメント（65-66行）でこの意図が明示されている点も良い。ただし `orientation: "vertical"` を渡しても挙動が変わらない（両軸受理のため）ので、厳密には `orientation` パラメータは現状ほぼ no-op に近い。将来 vertical 専用 segmented で「横矢印を無視したい」要件が出たとき初めて意味を持つ。現状 caller がいないので削っても良いが、APG 準拠の将来拡張点として残す判断も妥当。Blocker/Warning ではない。

- **[N-3] `onSelect` 内包の責務分担は `useRovingMenu` と非対称だが ADR-004 で根拠が確立済み**
  - `useRovingMenu` は「フォーカス移動のみ・選択は caller の Space/Enter」、`useRovingTablist` は「矢印移動 = 即 `onSelect(next)`」。操作モデルの差（menu = フォーカス→明示確定 / radiogroup = 移動即選択）に忠実な意図的な非対称で、JSDoc（28-32行）にも明記。caller 側は `onSelect: (index) => select(DISPLAY_MODES[index])` / `(index) => selectDisplayMode(DISPLAY_OPTIONS[index].mode)` という index→mode アダプタ1本のみで、click 経路（`onClick={() => select(mode)}`）と同一ハンドラへ収束する。二重管理は生じておらず責務分担は整合的。

- **[N-4] 既存 select/navigate/writeDisplayPreference/useOptimistic ロジックは完全に不変、roving 配線による副作用混入なし**（`DisplayModeSwitch.tsx` / `PublicTopControls.tsx`）
  - home: `select`（writeDisplayPreference → guard → navigate replace:true）はそのまま、roving は `onSelect` で同じ `select` を呼ぶだけ。public: `selectDisplayMode`（`if (mode === display) return` 早期 return → navigate replace:true）も不変、useOptimistic / transition 経路に一切手が入っていない。roving が追加したのは container の `ref`/`role`/`onKeyDown` と各 button の `role`/`aria-checked`/`tabIndex` のみ。`data-active`/`aria-label`/`title`/アイコンも不変。テスト（DisplayModeSwitch.test の write-before-guard / 永続 / 早期 return 群）が全て新セレクタでグリーンを保っており、不変性が回帰として固定されている。

- **[N-5] `DISPLAY_MODES.indexOf(current)` / `findIndex` は常に有効 index を返す（-1 リスクなし）**
  - home の `current = useEffectiveDisplayMode()` は戻り型 `DisplayMode`（`urlDisplay ?? persisted ?? "list"`）で、undefined / 未知値を返す経路がない。public の `display = route.useSearch({ select: selectDisplay })` も `s.display ?? "list"` で必ず `DisplayMode`。`DISPLAY_MODES` / `DISPLAY_OPTIONS` は全 mode を網羅するので `indexOf`/`findIndex` は常に 0..2 を返す。`selectedIndex = -1` は構造的に発生しない（万一 -1 でも `getTabIndex` は全要素 -1 を返し radiogroup 全体が Tab 不能になるが、その状態には到達しない）。型レベルで illegal state が排除されており妥当。

- **[N-6] スタイリング規約準拠 — focus-visible トークン / outline-offset の内外使い分けが plan どおり正確**
  - segmented（`DISPLAY_SEGMENTED_BTN` / public `SEGMENTED_BTN`）= `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`（**offset 無し = 外側**、`p-[2px]` の隙間に乗る）。menu/option 系（`menuItem` / `SORT_MENU_ITEM` / `TAG_ADD_OPTION_ITEM`）= 同文字列 + `focus-visible:-outline-offset-2`（**内側**）。public `SEGMENTED_BTN`（styles.ts:113）に `-outline-offset-2` が混入していないこと、`SORT_MENU_ITEM`（styles.ts:120）には付いていることをコード確認。plan ステップ3/4 の「segmented=外側 / menu=内側」の書き分けと完全一致し、取り違えなし。token（`outline-accent`）経由・utility-first・module-scope 定数への集約という CLAUDE.md 規約に整合。

- **[N-7] danger 項目への accent outline 統一は ADR-003 どおり、JSDoc に WHY 追記済み**（`common/styles.ts:417-440`）
  - `menuItem` の danger 変種（`data-[danger]:text-error data-[danger]:focus-visible:bg-error-surface`）に対し outline は accent で統一。JSDoc に「focus indicator は neutral / danger は text+bg が担う / 二重 outline color を作らない（#660 ADR-003）」の WHY が明記され、ViewSwitcher `OPTION_ITEM` との一貫性も取れている。意図的選択として妥当。

- **[N-8] focus-visible 文字列の散在は DRY 違反ではなく既存規約に沿う**
  - `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent (focus-visible:-outline-offset-2)` が 6 定数に inline で散在するが、コードベース全体に共有 `FOCUS_RING` 定数は存在せず（grep 確認）、Tailwind JIT がリテラルを走査する都合上「module-scope 定数ごとに文字列を inline で持つ」のが確立パターン（ViewSwitcher / NoteCheckbox / FilterBar も同様）。本 PR はこの既存規約を踏襲しており、新規に重複を増やしたわけではない。将来的に共通 fragment を切り出す余地は理論上あるが、本 Issue のスコープ外であり、ここで切り出すと既存 5 箇所との不統一を生むため現状維持が妥当。

- **[N-9] biome-ignore（`role="radio"` on `<button>`）は妥当**
  - 両コンポーネントで `lint/a11y/useSemanticElements` を ignore し、理由（`<input type="radio">` ではアイコンのみ segmented design を再現できず、button で Space/Enter 活性化・focus-visible・data-active を維持しつつ APG Radio Group を表現）を明記。ADR-005 / コードベース既存慣例（`NoteCheckbox` の `role="checkbox"`、FilterBar の `role="group"`）に倣っており妥当。`radiogroup` を付した `<div>` はルール非対象で ignore 不要なのも正しい。

- **[N-10] React 19 / RSC 境界・key・レンダリング効率 — 問題なし**
  - 両コンポーネントとも `"use client"` クライアントアイランド。DOM フォーカス実行（`containerRef.querySelectorAll('[role="radio"]')` + `.focus()`）は `onKeyDown` ハンドラ内のみで、render / SSR 経路に載らないため hydration mismatch は生じない（`tabIndex` 静的値のみ SSR markup に出る）。`key={mode}` は安定一意。`useRovingTablist` は毎レンダーで `onKeyDown` / `getTabIndex` クロージャを再生成するが、container は素の `<div>`、各 button も memo 化されていないネイティブ要素のため、`useCallback`/`memo` 不要（メモ化しても再レンダーは親由来で発生し利得なし）。固定3要素の軽量コンポーネントでありメモ化の要否は「不要」が正しい判断。

- **[N-11] 連続矢印 → 連続 navigate の実害は低く、回帰で固定済み**
  - home は #219 で `display` を loaderDeps 除外済み + `replace: true` のため、連続矢印でも履歴は汚れずレンダーは1パスで閉じる。public は `selectDisplayMode` の早期 return（`mode === display`）+ `replace: true` で連打耐性あり（ただし roving は常に異なる index へ移るので早期 return は実質効かない / それでも replace:true で履歴非増加）。DisplayModeSwitch.test の「fires a navigate per arrow press for consecutive arrows」（351行）で ArrowRight×2 → navigate×2 / replace:true 各回 を固定、TC-004（manual-test）で `history.length` 不変も実機確認済み。debounce/transition を将来足した際の回帰も捕捉できる。実害なし。

- **[N-12] テスト品質が高い**（`DisplayModeSwitch.test.tsx`）
  - radiogroup/radio/aria-checked 契約、旧 tablist/tab/aria-selected の不在、roving tabindex（選択中=0 / 他=-1）、ArrowRight/ArrowLeft ラップ / Home / End、連続矢印、**未処理キー（Tab）で preventDefault されず navigate も走らない**（388行）まで網羅。`aria-checked` の `"true"`/`"false"` 文字列シリアライズも検証。PublicTopControls 側は `renderToStaticMarkup` の制約から静的契約アサーション（`aria-checked="true"`）のみに留め、動的 roving を home 側へ集約という plan の書き分けに忠実。

## 総評

新設フック `useRovingTablist` は state レス・責務明確・JSDoc 充実で設計品質が高い。既存 select/navigate/persist/useOptimistic ロジックは完全に不変で、roving 配線は role/tabIndex/onKeyDown の付与に限定され副作用混入なし。`indexOf`/`findIndex` の -1 リスクは型レベルで排除済み。スタイリング規約（focus-visible トークン、segmented=外側 / menu=内側の offset 使い分け、utility-first、module-scope 定数）に正確に準拠。biome-ignore も既存慣例どおり妥当。typecheck / 4171 tests / 変更ファイルの lint いずれもグリーン。**Frontend 観点で要修正・要警告の指摘なし。** Notes はいずれも設計判断の確認・将来拡張余地の記録であり、実装の修正を要するものではない。
