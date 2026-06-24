# Review 002 — Frontend（2回目フルレビュー）

対象 PR: #774 / Issue #660
観点: 新設フック `useRovingTablist` の設計品質、既存 select/navigate/persist/useOptimistic ロジックの不変性、roving 配線の副作用混入、スタイリング規約準拠、DRY、biome-ignore 妥当性、RSC 境界、連続 navigate の実害。今回の差分焦点: `aria-orientation="horizontal"` 追加・テスト追加（public 側 APG Radio Group 静的契約テスト / home 側 roving 動的テスト群）。
検証: `pnpm typecheck`（pass）/ `pnpm test:unit`（267 files / 4174 tests pass、round-1 から +3）/ biome lint（変更7ファイル clean）。

## Frontend

問題点ゼロ（要修正・要警告の指摘なし）。Blocker / Warning なし。Note は確認事項と軽微な sync gap の記録のみ。

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-1] `aria-orientation="horizontal"` は今回追加。意味的に正しく、テストも追加されているが spec モックには未反映（軽微な sync gap）**
  - 両コンポーネント（`DisplayModeSwitch.tsx:81` / `PublicTopControls.tsx:380`）が `aria-orientation="horizontal"` を新たに付与。横並び segmented の APG Radio Group としては妥当（`radiogroup` のデフォルト orientation は `horizontal` なので a11y 上は冗長だが、明示は害なく意図が読める）。public 側は静的契約テスト（`PublicTopControls.test.tsx:162`）でアサート済み。
  - 一方、`spec/design/pages/P10-home.html` / `P30-user-public-top.html` の segmented マークアップには `aria-orientation` が無く、注記も「radiogroup / radio / aria-checked の契約」止まりで orientation に触れていない。プロジェクト規約「モックは正」/ AC-7 の観点では実装が mock を1属性上回っている軽微な乖離。
  - ただし `aria-orientation="horizontal"` は radiogroup のデフォルト値の明示なので **a11y 上の挙動差はゼロ**（SR 告知も変わらない）。実害が無いため Blocker/Warning ではなく Note 留め。整合させるなら (a) mock 側の `<div class="segmented" role="radiogroup">` に `aria-orientation="horizontal"` を足す、または (b) デフォルト値の明示なので両コンポーネントから外す、のいずれかで一貫させると mock と完全一致する。どちらでも機能影響なし。

- **[N-2] `useRovingTablist` の state レス設計・責務分担は round-1 評価から不変で適切**（`app/components/common/useRovingTablist.ts`）
  - `getTabIndex = index === selectedIndex ? 0 : -1` で内部 state ゼロ。`onSelect` をフック内で発火（矢印移動=即選択、ADR-004）し、caller は `selectedIndex`（current mode 由来）と `onSelect`（index→既存 select アダプタ）だけ渡す。`useRovingMenu` の open-reset / focus-restore / disabled 走査をすべて削いだ適切な縮小。JSDoc に「なぜ useRovingMenu を流用しないか」「index discipline（宣言順=DOM順）」「未処理キーは preventDefault しない」が明記され、`useRovingMenu` の JSDoc 流儀と揃っている。

- **[N-3] `orientation` パラメータは両軸常時受理のため現状ほぼ no-op だが APG 準拠の拡張点として妥当**
  - `onKeyDown` は `event.key === nextKey || event.key === "ArrowDown"`（および prev で `|| "ArrowUp"`）で**両軸のキーを常に受理**するため、`orientation: "vertical"` を渡しても挙動は変わらない。これは「radiogroup は縦横どちらの矢印も受けるべき」という APG 仕様への忠実さで、`orientation` は nextKey/prevKey の primary 軸選択にしか影響しない。現状 caller がいないので削っても良いが、将来 vertical segmented で「横矢印を無視」要件が出たとき意味を持つ拡張点。コメント（65-66行）で意図明示済み。過剰設計には当たらない。

- **[N-4] 既存ロジック完全不変・roving 配線による副作用混入なし**（`DisplayModeSwitch.tsx` / `PublicTopControls.tsx`）
  - home `select`（writeDisplayPreference → guard `mode === urlDisplay` → navigate replace:true）/ public `selectDisplayMode`（早期 return `mode === display` → navigate replace:true）は1行も変わっていない。roving が追加したのは container の `ref`/`role`/`aria-orientation`/`onKeyDown` と各 button の `role`/`aria-checked`/`tabIndex` のみ。`data-active`/`aria-label`/`title`/アイコン/useOptimistic/transition は不変。public の `onSelect` は常に異なる index へ移すため早期 return は実質効かないが、`replace: true` で履歴非増加は担保される（round-1 N-11 と同じ理解）。

- **[N-5] `indexOf` / `findIndex` の -1 リスクは型レベルで排除済み**
  - home `current = useEffectiveDisplayMode()`（戻り型 `DisplayMode`）、public `display = ... ?? "list"`（必ず `DisplayMode`）で undefined/未知値を返す経路なし。`DISPLAY_MODES` / `DISPLAY_OPTIONS` は全 mode 網羅のため `indexOf`/`findIndex` は常に 0..2。`selectedIndex = -1` は構造的に到達不能。

- **[N-6] スタイリング規約準拠 — segmented=外側 / menu=内側の offset 使い分けが正確、`SEGMENTED_BTN` に `-outline-offset-2` 混入なし**
  - segmented（`DISPLAY_SEGMENTED_BTN` / public `SEGMENTED_BTN` styles.ts:113）= `focus-visible:outline-accent`（**offset 無し=外側**、`p-[2px]` 隙間に乗る）。menu/option 系（`menuItem`:442 / `SORT_MENU_ITEM`:120 / `TAG_ADD_OPTION_ITEM`:669）= 同文字列 + `focus-visible:-outline-offset-2`（**内側**）。コード上 public `SEGMENTED_BTN` に `-outline-offset-2` 混入なし・menu 系には全て付与済みを確認。plan ステップ3/4 の書き分けと完全一致。token 経由・utility-first・module-scope 定数集約という CLAUDE.md 規約に整合。

- **[N-7] danger 項目への accent outline 統一は ADR-003 どおり、JSDoc に WHY 追記済み**（`common/styles.ts:432-439`）
  - `menuItem` の danger 変種（`data-[danger]:text-error data-[danger]:focus-visible:bg-error-surface`）に対し outline は accent 統一。JSDoc に「focus indicator は neutral / danger は text+bg が担う / 二重 outline color を作らない（#660 ADR-003）」「ViewSwitcher OPTION_ITEM との統一（ADR-011 横展開）」が明記。

- **[N-8] focus-visible 文字列の inline 散在は DRY 違反ではない（既存規約に沿う）**
  - `focus-visible:outline-accent` 系がコードベース全体で 15 箇所 inline、共有 `FOCUS_RING` 定数は存在しない（grep 確認）。Tailwind JIT がリテラルを走査する都合上「module-scope 定数ごとに inline」が確立パターン（ViewSwitcher/NoteCheckbox/FilterBar 同様）。本 PR は既存規約を踏襲、新規に共通化すると既存箇所との不統一を生むため現状維持が妥当。

- **[N-9] biome-ignore（`role="radio"` on `<button>`）は妥当・ADR-005 / 既存慣例どおり**
  - 両コンポーネントで `lint/a11y/useSemanticElements` を ignore し理由（`<input type="radio">` ではアイコン segmented design 再現不可・button で Space/Enter 活性化・focus-visible・data-active 維持しつつ APG Radio Group 表現）を明記。`radiogroup` を付した `<div>` はルール非対象で ignore 不要も正しい。lint clean を確認。

- **[N-10] RSC 境界・hydration・メモ化要否 — 問題なし**
  - 両コンポーネント `"use client"` アイランド。DOM フォーカス実行（`containerRef.querySelectorAll('[role="radio"]')` + `.focus()`）は `onKeyDown` 内のみで render/SSR 経路に載らず hydration mismatch なし（`tabIndex`/`aria-orientation` 静的値のみ SSR markup に出る）。`key={mode}` 安定一意。固定3要素・素の `<div>`/native button のため `useCallback`/`memo` 不要。

- **[N-11] テスト品質 — round-1 から public 側に静的 APG Radio Group 契約テストが追加され網羅が向上**
  - home（`DisplayModeSwitch.test.tsx`）: radiogroup/radio/aria-checked 契約、旧 tablist/tab/aria-selected の不在、roving tabindex（選択中=0/他=-1）、ArrowRight/ArrowLeft ラップ/Home/End、連続矢印×2→navigate×2（replace:true 各回）、未処理キー（Tab）で preventDefault されず navigate も走らない、まで網羅。
  - public（`PublicTopControls.test.tsx:152`）: SSR 静的 markup で `role="radiogroup"` / `aria-orientation="horizontal"` / radio×3 / tabindex 0×1・-1×2 / tablist 不在 をアサートする新規ケース追加。`renderToStaticMarkup` の制約で動的キーボードは home 側集約という plan 書き分けに忠実。
  - 全 4174 tests グリーン。

## 総評

round-1 の問題点ゼロ評価を再確認したうえで、round-2 で追加された `aria-orientation="horizontal"` とテスト群を精査。`useRovingTablist` は state レス・責務明確・JSDoc 充実で設計品質が高く、既存 select/navigate/persist/useOptimistic は完全不変、roving 配線は role/tabIndex/aria-orientation/onKeyDown の付与に限定され副作用混入なし。スタイリング規約（segmented=外側/menu=内側 offset、token、utility-first、module-scope 定数）に正確に準拠、biome-ignore も既存慣例どおり妥当。typecheck / 4174 tests / lint いずれもグリーン。**Frontend 観点で要修正・要警告の指摘なし（問題点ゼロ）。** 唯一の Note N-1（`aria-orientation` が spec モックに未反映）は a11y 挙動差ゼロの軽微な sync gap であり、mock 側に1属性足すか実装から外すかで完全一致できるが、機能・アクセシビリティ影響は無い。
