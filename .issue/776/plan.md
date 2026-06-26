# 実装計画 — Issue #776: 残りの不完全 role=tablist パターン（並び替え軸 segmented / 編集モード tabs）を APG 準拠に是正（#660 follow-up）

**Issue:** #776
**作成日:** 2026-06-26
**複雑度:** 中〜大規模

---

## 目的

#660 で表示モード segmented に確立した APG パターンと `useRovingTablist` を正として、残る 2 つの不完全 `role="tablist"` を是正する: 並び替え軸 segmented（TagListToolbar）は radiogroup へ、編集モード switch（EditorModeSwitch）は実体 tabpanel を配線した APG Tabs（manual activation）へ。いずれも既存挙動は不変に保つ。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | TagListToolbar 並び替え軸 segmented が `role="radiogroup"`（`aria-label="並び替え軸"` / `aria-orientation="horizontal"`）+ 各ボタン `role="radio"` + `aria-checked`（選択 true / 非選択 false）を公開し、`role="tablist"`/`role="tab"`/`aria-selected` が残らない | Issue Tasks 1 / AC / ADR-001 | 2 |
| AC-2 | 並び替え軸 segmented が roving tabindex（選択 `tabIndex=0`・他 `-1`）と ArrowLeft/Right/Up/Down + Home/End ナビ（automatic = 移動で即選択、両端ラップ）を公開 | Issue AC / #660 ADR-004 | 1,2 |
| AC-3 | 既存の tag sort/order 選択・URL 処理（`run`/`router.navigate`/`useOptimistic`/`aria-busy`）が不変 | Issue AC（既存挙動維持）| 2,6 |
| AC-4 | EditorModeSwitch が APG Tabs（manual activation）を完成: `role="tablist"`/`role="tab"`/`aria-selected` 維持 + 各 tab に `aria-controls` → 実体 `role="tabpanel"`（editor body）。roving tabindex は**フォーカス追従**（`focusedIndex` 由来）= 現在フォーカス中の tab が `tabIndex=0`・他 `-1`（初回レンダーは `focusedIndex===selectedIndex` なので選択 tab が `tabIndex=0`、矢印移動後はフォーカスした非選択 tab が `tabIndex=0`）。矢印（ArrowLeft/Right + Home/End、両端ラップ）は**フォーカス移動のみ**で選択は変えない（`onChange` 非発火）。活性化は Enter/Space/click。Tab 離脱→再 Tab-in は最後にフォーカスした tab へ戻る（標準 APG manual activation 挙動・blur で `focusedIndex` はリセットしない） | Issue Tasks 2 / AC / ADR-002 | 1,3,4 |
| AC-5 | editor body（html/inline/wysiwyg の 3 分岐）が単一 `role="tabpanel"` で囲まれ、`id` + `aria-labelledby`（アクティブ tab）を持つ。FrontMatterEditor は tabpanel 外（#697） | ADR-002 | 4 |
| AC-6 | 既存の editor モード選択挙動が不変: `onChange`（確認ゲート）は click/Enter/Space 経由でのみ発火、未保存 `window.confirm` と WYSIWYG 装飾喪失 `ConfirmDialog` ゲート、surface 別タブ inventory が不変 | Issue AC（既存挙動維持）| 3,4,7 |
| AC-7 | 並び替え軸 `SEGMENTED_ITEM`・編集モード tab に `DISPLAY_SEGMENTED_BTN` と同形の専用 focus-visible outline（`focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`）を付与し、#660 segmented パターンと **parity** を取る。前提: グローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（`app/styles/index.css` 176-178 行 / `--shadow-focus: 0 0 0 2px var(--color-accent)`）が全 focusable に既に適用済みで WCAG 2.4.7 自体は充足済み。本 AC は新規 outline の必須要件ではなく #660 との視覚的統一の parity 確認 | #660 segmented parity | 2,3 |
| AC-8 | spec モック P18（radiogroup/radio/aria-checked）・P12（tablist/tab/aria-selected + aria-controls/tabpanel）のマークアップと注記が選択した ARIA 契約に更新される | Issue Tasks 3 / AC | 8 |
| AC-9 | 関連テストの role 契約アサーション更新 + 矢印キー回帰テスト追加（並び替え軸 radiogroup・編集モード tabs manual） | Issue Tasks 4 / AC | 6,7 |
| AC-10 | `pnpm typecheck && pnpm lint && pnpm test` が通る | Issue AC / CLAUDE.md | 全ステップ |

## スコープ

### 含まれないもの
- 表示モード segmented（DisplayModeSwitch / PublicTopControls）— #660 / PR #774 で is完了済み。本 Issue は触らない。
- editor body 各エディタ（HtmlEditor/InlineEditor/WysiwygEditor）の内部実装・モード切替ロジック（`onModeChange` の確認ゲート）— 不変に保つ。tabpanel ラッパーの追加のみ。
- P12 モックの FrontMatter タブ（#697 で削除済みの stale 表記）の完全な再同期 — 本 Issue では ARIA 契約（tablist/tab/aria-selected + aria-controls/tabpanel）の更新に限定し、inventory の乖離はモック注記で触れる程度に留める（spec-sync 領域）。
- `useRovingMenu`（menu/listbox 用）— 別系統、無改変。

## 調査結果

- 関連ファイル:
  - `app/components/common/useRovingTablist.ts` — #660 新設の roving プリミティブ。現状 automatic activation 専用・stateless（`selectedIndex` から tabIndex 導出、矢印で `onSelect` 即発火）。consumer は DisplayModeSwitch / PublicTopControls の 2 箇所のみ。
  - `app/components/tag/TagListToolbar.tsx`（134 行付近）— 並び替え軸 segmented。`SEGMENTED`/`SEGMENTED_ITEM`（`tag/styles.ts`、TagListToolbar からのみ参照）。`SEGMENTED_ITEM` に **focus-visible outline が無い**。ソートは `run()` → `router.navigate({to:"/tags", search})`、`useOptimistic`、`aria-busy`。
  - `app/components/note/editor/EditorModeSwitch.tsx` — 純粋な編集モード tab control（`surface`/`mode`/`onChange` を受け取るのみ）。`role="tablist"`/`role="tab"`/`aria-selected`、`${pillBtn} ${pillBtnPrimary}`（pillBtn は focus-visible outline を持たない）。tab inventory は new=[wysiwyg,html] / edit=[inline,wysiwyg,html]。
  - `app/components/note/editor/NoteEditor.tsx` — orchestrator。493-544 行で `state.mode` に応じ body エディタを条件レンダー（html→HtmlEditor / inline→InlineEditor / wysiwyg→WysiwygEditor、各 + MediaUploader）。549 行に常時マウントの FrontMatterEditor（#697）。`onModeChange`（223-293 行）が未保存 `window.confirm` + WYSIWYG 装飾喪失 `ConfirmDialog` をゲート。EditorModeSwitch は `editorTopbar` 内、body はずっと下。
  - `app/components/note/list/DisplayModeSwitch.tsx` — #660 の radiogroup 参照実装（`useRovingTablist` automatic 利用、`role="radiogroup"` + `aria-orientation` + `role="radio"` + `aria-checked` + `biome-ignore useSemanticElements`）。
  - `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx` — radiogroup / 矢印キー回帰テストの参照パターン（`dispatchEvent(new KeyboardEvent("keydown", {key, bubbles:true}))` を radiogroup 要素へ、`act` でラップ）。
  - `app/components/tag/__tests__/TagListToolbar.test.tsx` — `div[role="tablist"] button` / `aria-selected="true"` をロック（80, 219, 301 行）。
  - `app/components/note/editor/__tests__/editorModeSwitch.test.tsx` — `[role="tab"]` で tab inventory をロック（57 行）。
  - `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx` — `[role="tab"]` で tab を特定し click（128 行）。確認ゲート挙動をロック。
  - spec モック: `spec/design/pages/P18-tags.html`（785-790 行: segmented tablist + 注記 775-776 行）/ `spec/design/pages/P12-editor.html`（967-971 行: mode-tabs tablist + 注記 964-966 行、editor body はその下）。
- あるべきアーキテクチャ:
  - フロントエンド（プレゼンテーション層）専用。ドメイン/アプリ/アダプター層への影響なし。
  - a11y: WAI-ARIA APG 準拠が正。radiogroup vs tabs は**実体 tabpanel の有無**で判断（#660 ADR-001）。並び替え軸は tabpanel 不在 → radiogroup、編集モードは実体 tabpanel あり → Tabs（ADR-001/002）。
  - スタイリング規約: utility-first、focus-visible は `outline-accent` トークン、繰り返し utility は module-scope 定数（`DISPLAY_SEGMENTED_BTN` が `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` の参照形）。
- 既存実装の状態:
  - 並び替え軸 / 編集モードとも **APG Tabs として不完全**（roving/矢印/aria-controls/tabpanel 不在）。#660 で意図的に deferral（#660 plan「含まれないもの」）。本 Issue で是正。
  - 並び替え軸は実体 tabpanel 不在 → #660 表示モードと同型 → radiogroup（ADR-001）。
  - 編集モードは実体 tabpanel あり + 重い副作用（TipTap マウント + 確認ダイアログ）→ Tabs manual activation（ADR-002）。
- 依存関係:
  - `useRovingTablist` 変更は既存 2 consumer に後方互換（automatic 既定、ADR-003）。
  - EditorModeSwitch ↔ NoteEditor 間は静的 id 命名（`editorModeTabId(mode)` / `EDITOR_BODY_PANEL_ID`）で結合し、生成 id 引き回しはしない。
  - tabpanel ラッパー追加は body エディタ群のレイアウト（各 `mb-*` margin）に影響しないことを確認する。

## 設計

### ドメインモデルへの影響
なし（プレゼンテーション層の a11y 変更）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

依存方向順（共有プリミティブ → 利用コンポーネント → スタイル → モック → テスト）。

1. **`useRovingTablist` に manual activation を追加**（ADR-003）: `manualActivation?: boolean`（既定 false）。`focusedIndex` state は条件分岐の外で常に宣言する（Rules of Hooks。automatic 経路はこの state を**参照しない**＝ `getTabIndex` は `selectedIndex` 由来・矢印は `onSelect` 即発火）。manual 経路は `getTabIndex` を `focusedIndex` 由来にし、矢印はフォーカス移動のみ・`onSelect` 非発火。`selectedIndex` 外部変化時のレンダー中調整（`prevSelected` ref 比較→`setFocusedIndex`）で `focusedIndex` を追従させる。blur では `focusedIndex` をリセットしない（再 Tab-in は最後にフォーカスした tab へ戻る＝標準 APG manual activation 挙動）。既存 2 consumer 後方互換。
2. **TagListToolbar 並び替え軸を radiogroup 化**（ADR-001）: container `role="radiogroup"` + `aria-orientation` + ref/onKeyDown、各 button `role="radio"` + `aria-checked` + `tabIndex` + `biome-ignore useSemanticElements`。`useRovingTablist`（automatic）配線、`onSelect` → 既存 `run({type:"setSort"})`。`SEGMENTED_ITEM` に focus-visible accent outline 追加。`run`/navigate/useOptimistic/aria-busy は不変。
3. **EditorModeSwitch を APG Tabs（manual）化**（ADR-002）: `role="tablist"`/`role="tab"`/`aria-selected` 維持、`aria-orientation` + 各 tab に `id={editorModeTabId(mode)}` + `aria-controls={EDITOR_BODY_PANEL_ID}` + `tabIndex`。`useRovingTablist`（manual）配線、矢印はフォーカス移動のみ・既存 `onClick={() => onChange(mode)}` 維持。tab に focus-visible accent outline 追加。`editorModeTabId` / `EDITOR_BODY_PANEL_ID` を export。
4. **NoteEditor で body を tabpanel 化**（ADR-002）: html/inline/wysiwyg の 3 条件分岐（493-544 行）を 1 つの `<div role="tabpanel" id={EDITOR_BODY_PANEL_ID} aria-labelledby={editorModeTabId(state.mode)}>` で囲む。FrontMatterEditor は外。`onModeChange` ロジックは不変。
5. **focus-visible スタイル**（ステップ 2/3 に内包）: `SEGMENTED_ITEM`（tag/styles.ts）と編集モード tab に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`（`DISPLAY_SEGMENTED_BTN` と同形・外側 outline、`-outline-offset` は付けない）。
6. **spec モック更新**: P18 を radiogroup/radio/aria-checked、P12 を tablist/tab/aria-selected + aria-controls/tabpanel へ。注記も更新。
7. **テスト更新 + 矢印キー回帰追加**。

## 実装ステップ

### 1. `useRovingTablist` に manual activation モードを追加

- **対象ファイル:** `app/components/common/useRovingTablist.ts`
- **変更内容:** `UseRovingTablistOptions` に `manualActivation?: boolean`（既定 `false`）を追加。`focusedIndex` の `useState(selectedIndex)` は Rules of Hooks に従い**条件分岐の外で常に宣言**する（`if (manualActivation) useState(...)` のような条件付きフック呼び出しはしない）。automatic 経路はこの state を**参照しない**（`getTabIndex` は `selectedIndex` 由来、矢印/Home/End で `.focus()` + `onSelect(next)` 即発火）＝挙動は現状維持。manual 経路は `getTabIndex` を `focusedIndex` 由来にし、矢印/Home/End は `focusedIndex` 更新 + 対象要素へ `.focus()` のみ（`onSelect` 非発火）。`selectedIndex` 外部変化時のレンダー中調整（`prevSelected` ref 比較→`setFocusedIndex`）で `focusedIndex` を追従させる。このレンダー中調整は automatic で発火しても無害（automatic は `focusedIndex` を読まない）か manual 限定にガードするかを実装時に固定する。blur では `focusedIndex` をリセットしない＝**再 Tab-in は最後にフォーカスした tab へ戻る（標準 APG manual activation 挙動）**。manual では `.focus()` 対象セレクタを `[role="radio"]` ではなく role 非依存に（`[role="radio"],[role="tab"]` 双方、または container 直下の `button`）。未処理キー（Tab/Space/Enter 等）は両経路とも `preventDefault` しない（#660 ステップ1の素通し規律を踏襲）。JSDoc に automatic/manual 2 経路の差（state は常設・automatic は不参照）と「宣言順=DOM順が `.focus()` の前提」index-discipline を明記。**安全弁（arch-risk S-001）:** manual の「常に厳密に 1 つの tab が `tabIndex=0`」不変条件は `focusedIndex ∈ [0, count)` に依存する（範囲外だと全 tab が `tabIndex=-1` でグループが Tab 到達不能になる）。`count`（surface 別タブ集合サイズ）はマウント中不変のため現計画では破綻しないが、`getTabIndex` 側で範囲外を 0 番目へフォールバックするか、JSDoc に「`focusedIndex` は常に `[0,count)`（tab 集合はマウント中不変が前提）」と index-discipline と並べて明記し、将来 surface 可変化した際の安全弁とする。
- **理由:** AC-2/AC-4。radiogroup（automatic）と tabs（manual）の両 APG パターンを 1 フックで賄う（ADR-002/003）。
- **実装時評価:** API 形（`manualActivation: boolean` + `onSelect` 常時 vs discriminated union で automatic=onSelect必須/manual=onSelect不要）は、既存 2 consumer の型推論を壊さない範囲で実装時に確定（ADR-003）。

### 2. TagListToolbar 並び替え軸を radiogroup 化

- **対象ファイル:** `app/components/tag/TagListToolbar.tsx`、`app/components/tag/styles.ts`（`SEGMENTED_ITEM`）
- **変更内容:** `<div role="tablist">` → `role="radiogroup"`（`aria-label="並び替え軸"` 維持、`aria-orientation="horizontal"` 追加、`useRovingTablist` の `containerRef`/`onKeyDown` 付与）。各 `<button role="tab" aria-selected>` → `role="radio" aria-checked={s === optimistic.sort} tabIndex={roving.getTabIndex(i)}` + `biome-ignore lint/a11y/useSemanticElements`（理由併記）。`useRovingTablist({ count: TAG_LIST_SORTS.length, selectedIndex: TAG_LIST_SORTS.indexOf(optimistic.sort), onSelect: (i) => run({type:"setSort", sort:TAG_LIST_SORTS[i]}, {sort:TAG_LIST_SORTS[i]}) })`（automatic 既定）。`onClick` の `run(...)` は維持（click と矢印が同一ハンドラへ収束）。`SEGMENTED_ITEM` に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` 追加。`data-active` / labels / order toggle / `run`/navigate/useOptimistic/aria-busy は不変。
- **理由:** AC-1/2/3/7。Issue Tasks 1（ADR-001）。

### 3. EditorModeSwitch を APG Tabs（manual activation）化

- **対象ファイル:** `app/components/note/editor/EditorModeSwitch.tsx`、`app/components/note/editor/styles.ts`（tab の focus-visible 用 or 既存 className へ追記）
- **RSC 境界:** `EditorModeSwitch.tsx` は現状 `"use client"` ディレクティブを持たない（client な `NoteEditor` 配下でのみレンダーされ成立している）。`useRovingTablist`（`useState`/`useRef`）導入後は client フックを直接呼ぶため、参照実装 `DisplayModeSwitch.tsx` に倣い**先頭に `"use client"` を付与する**。付けなくても client サブツリー内で動く見込みだが、整合性と将来の単独利用に備え明示し、typecheck/build で境界を割らないことを確認する。
- **変更内容:** `editorModeTabId = (mode: EditorMode) => \`editor-mode-tab-${mode}\`` と `EDITOR_BODY_PANEL_ID = "editor-body-panel"` を export。container `<div role="tablist">` に `aria-orientation="horizontal"` + `useRovingTablist`（**manualActivation: true**）の `containerRef`/`onKeyDown` 付与。`useRovingTablist({ manualActivation: true, count: tabs.length, selectedIndex: tabs.findIndex(t=>t.mode===mode), onSelect: ... })`（manual では onSelect は使われないが API 上渡す/省略は実装時確定）。各 button: `role="tab"` + `aria-selected={isActive}`（維持）+ `id={editorModeTabId(tab.mode)}` + `aria-controls={EDITOR_BODY_PANEL_ID}` + `tabIndex={roving.getTabIndex(i)}` + 既存 `onClick={() => onChange(tab.mode)}` 維持。tab className に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` を追加（pillBtn は focus-visible を持たないため）。tab inventory / `data-primary` / surface 別ロジックは不変。
- **理由:** AC-4/6/7。Issue Tasks 2（ADR-002）。`role="tab"` 維持で既存テストの `[role="tab"]` セレクタを温存。

### 4. NoteEditor で editor body を tabpanel 化

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** 493-544 行の html/inline/wysiwyg 条件分岐 3 ブロックを 1 つの `<div role="tabpanel" id={EDITOR_BODY_PANEL_ID} aria-labelledby={editorModeTabId(state.mode)}>...</div>` で囲む（`editorModeTabId`/`EDITOR_BODY_PANEL_ID` を EditorModeSwitch から import）。FrontMatterEditor（549 行〜）は wrapper の**外**に置く（#697）。ラッパー div は無装飾（既存 body エディタ群の `mb-*` margin を阻害しないことを確認）。panel は内部に focusable エディタを常に含むため `tabIndex` は付けない（APG: focusable 子があれば panel 自体の tabIndex 不要）。`onModeChange` / 各エディタの props・ロジックは不変。
  - **不変条件（arch-risk S-004、調査済みで既に充足）:** `aria-labelledby={editorModeTabId(state.mode)}` の参照先 tab は常にレンダー済みである。`state.mode` は常に当該サーフェスの可視タブ集合の要素（new=`[wysiwyg, html]` / edit=`[inline, wysiwyg, html]`）で、new サーフェスで `inline` に遷移する経路は存在しない（inline タブ非表示、`onInitFailed → setMode("html")` は edit のみ）。よって dangling idref にならない。実装メモにこの不変条件を明記する。
- **理由:** AC-5/6。実体 tabpanel を配線して APG Tabs を完成（ADR-002）。

### 5. テスト更新 + 矢印キー回帰追加（並び替え軸 radiogroup）

- **対象ファイル:** `app/components/tag/__tests__/TagListToolbar.test.tsx`
- **変更内容:** `getSortButtons` のセレクタ `div[role="tablist"] button` → `div[role="radiogroup"] button`（80 行）。`aria-selected` アサーション（219, 301 行）→ `aria-checked`。radiogroup/radio/aria-checked の静的契約と roving tabindex（選択=0/他=-1）を検証。矢印キー回帰: radiogroup 要素へ `dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight"/"Home"/"End",bubbles:true}))`（`act` でラップ）→ `aria-checked` 移動 + `router.navigate` 発火（automatic = 移動で即選択、両端ラップ）を DisplayModeSwitch.test のパターンに倣い追加。既存 sort/order/search の navigate 挙動テストは不変で全グリーン維持。
- **理由:** AC-1/2/3/9。

### 6. テスト更新 + 矢印キー回帰追加（編集モード tabs manual）

- **対象ファイル:** `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`、必要なら `noteEditorModeChange.test.tsx`
- **変更内容:** editorModeSwitch.test に、tab の `aria-controls`/`id`/`aria-selected` 契約アサーションを追加（`[role="tab"]` セレクタは維持）。roving tabindex は manual activation の**フォーカス追従**を 2 ケースに分けて検証する: (a) **初回レンダー**は `focusedIndex===selectedIndex` なので選択 tab が `tabIndex=0`・他 `-1`、(b) **矢印移動後**はフォーカスした非選択 tab が `tabIndex=0`・他 `-1`（選択＝`aria-selected` は不変のまま、`onChange` 未発火）。矢印キー回帰: tablist 要素へ ArrowRight/Home/End KeyboardEvent → **フォーカスが移動するが `onChange` は呼ばれない・`aria-selected` も不変**（manual activation）ことを検証（`onChange` mock を渡し、矢印では未呼出を確認）。Enter/Space/click では `onChange` が呼ばれることも 1 ケース固定。`focusedIndex` は blur でリセットされない（再 Tab-in が最後にフォーカスした tab へ戻る標準挙動）方針なので、テストは「選択 tab が常に tabIndex=0」を前提にしない。noteEditorModeChange.test は `[role="tab"]` click 経由のため不変で全グリーン維持（必要なら tabpanel の `aria-labelledby` がアクティブ tab id を指す回帰を 1 つ追加）。
- **理由:** AC-4/6/9。manual activation（矢印=フォーカスのみ / 活性化=Enter/click）と確認ゲート不変を回帰固定。

### 7. spec モック更新

- **対象ファイル:** `spec/design/pages/P18-tags.html`（785-790 行 + 注記 775-776 行）、`spec/design/pages/P12-editor.html`（967-971 行 + 注記 964-966 行、+ editor body 要素）
- **変更内容:**
  - P18: `class="segmented" role="tablist"` → `role="radiogroup"`、各 `<button ... role="tab" aria-selected>` → `role="radio" aria-checked`。注記に「#776 で APG Radio Group 化（radiogroup/radio/aria-checked、roving tabindex + 矢印キー）」を追記。
  - P12: mode-tabs（963-971 行）の `role="tablist"`/`role="tab"`/`aria-selected` は維持しつつ各 tab に `id`（例 `editor-mode-tab-wysiwyg`）+ `aria-controls="editor-body-panel"` を付与。**tabpanel 化の対象要素**は editor body 領域 = `.toolbar`（`role="toolbar"` aria-label="書式設定"、1047 行）+ `.editor` content area（`role="textbox"` aria-label="ノート本文"、1069 行）。この 2 つは mode-tabs の兄弟だが単一ラッパーが無いため、両者を囲む新規 `<div role="tabpanel" id="editor-body-panel" aria-labelledby="editor-mode-tab-wysiwyg">`（アクティブ=WYSIWYG）を追加する。`role="tabpanel"` は `role="textbox"` を持つ `.editor` 自身ではなくラッパー側に置く（role 衝突回避）。注記を「#776 で APG Tabs 完成（manual activation、aria-controls → tabpanel、roving tabindex + 矢印フォーカス）」へ更新。FrontMatter タブの stale 表記（#697 で削除済み）は本 Issue の範囲外として注記で触れるに留める。
- **理由:** AC-8。モックを選択した ARIA 契約に追従。

### 8. 検証

- **対象:** 全体
- **変更内容:** 開発手順として `pnpm typecheck && pnpm lint:fix && pnpm format`（CLAUDE.md フロー）を回す。**AC 検証ゲート**は Issue AC 文言どおり素の `pnpm typecheck && pnpm lint && pnpm test` が pass することを基準とする（`lint:fix` は自動修正で違反を隠しうるため、最終確認は fix なしの `pnpm lint` で行う）。手動（任意）: /tags で並び替え軸へ Tab → 1 停止、矢印で sort 切替 + URL 反映、focus-visible outline 視認。editor で編集モードへ Tab → 1 停止、矢印でフォーカスのみ移動（mode 不変）、Enter/click で切替（WYSIWYG 装飾喪失ダイアログが矢印通過で暴発しないこと）。
- **理由:** AC-10。

## 設計判断

- **並び替え軸 = radiogroup/radio**（ADR-001）— 実体 tabpanel 不在 + 相互排他の単一選択。#660 表示モードと同型で `useRovingTablist` を automatic で無改変再利用。
- **編集モード = APG Tabs（manual activation）**（ADR-002）— 実体 tabpanel（body エディタが React state で直接差し替わる）が存在し #660 ADR-001 基準で Tabs が正。かつ WYSIWYG 切替が重いマウント + 確認ダイアログを伴うため、APG 推奨の manual activation を採る（矢印で wysiwyg を通過してもダイアログが暴発せず、既存確認ゲートが完全保存される）。radiogroup フォールバック / automatic tabs はこの暴発問題を解消できず不採用。
- **`useRovingTablist` に manual モード追加**（ADR-003）— manual activation は focusedIndex 追従が必要。automatic 既定で既存 2 consumer 後方互換。

## リスクと注意点

- `useRovingTablist` の manual 経路で `focusedIndex` を「レンダー中 setState（`prevSelected` ref 比較）」で `selectedIndex` に追従させる際、無限ループにならないよう条件分岐を厳密にする（React の derived-state 調整パターン）。automatic 経路の stateless 性は崩さない。
- happy-dom で矢印キーを `dispatchEvent(KeyboardEvent)` 発火する際は `act()` でラップ（DisplayModeSwitch.test 流儀）。editor の manual テストは「矢印で `onChange` が呼ばれない」ことの検証が肝。
- NoteEditor の tabpanel ラッパー div は body エディタ群の `mb-*` margin・レイアウトを阻害しないことを確認（無装飾コンテナ）。FrontMatter を誤って tabpanel 内に含めない。
- `aria-controls` の参照先 id は単一 panel 固定 id。常に 1 モードのみマウントされるため参照先は常に存在する（非存在 id 参照にならない）。
- EditorModeSwitch / NoteEditor の static id 命名は両ファイルで一致させる（`editorModeTabId` を import 共有して文字列の手書き重複を避ける）。
- P12 モックは #697 で削除済みの FrontMatter タブが残る stale 状態。本 Issue は ARIA 契約更新に集中し、inventory 完全同期は spec-sync 領域として深追いしない。

## テスト方針

- ユニット（vitest, happy-dom）:
  - TagListToolbar: radiogroup/radio/aria-checked 静的契約 + roving tabindex、ArrowRight/Home/End で aria-checked と navigate が移る（automatic）、既存 sort/order/search の navigate・aria-busy・useOptimistic 挙動が不変。
  - EditorModeSwitch: tablist/tab/aria-selected + aria-controls/id + roving tabindex の契約、矢印で `onChange` 未呼出（manual）/ Enter/click で `onChange` 呼出、tab inventory（new/edit）不変。
  - noteEditorModeChange: 既存の確認ゲート挙動（click 経由）が全グリーン維持。tabpanel の aria-labelledby 回帰を任意追加。
- 既存テスト全グリーン維持（`pnpm test`）。
- 手動 / ブラウザ（任意）: 並び替え軸の矢印=即選択 + URL 反映、編集モードの矢印=フォーカスのみ（wysiwyg 通過でダイアログ非暴発）+ Enter/click=切替、focus-visible outline 視認、SR 告知（並び替え軸「ラジオボタン n/N」/ 編集モード「タブ n/N」）。

## レビュー履歴

### 1周目

**修正した点**:
- **[coverage P-001 / arch-risk P-001]（同一テーマ・最重要）**: manual activation の roving tabindex セマンティクスを標準 APG 挙動に統一した。AC-4・実装ステップ1/6・ADR-002/003 を「矢印はフォーカスのみ移動し選択は変えない」「roving tabindex は `focusedIndex` 由来でフォーカス中 tab が `tabIndex=0`・他 `-1`（初回は選択 tab、矢印後はフォーカス中 tab）」「blur で `focusedIndex` をリセットせず再 Tab-in は最後にフォーカスした tab へ戻る（標準 APG manual activation 挙動）」で一貫させ、ADR-003 にあった「再 Tab-in は選択中 tab に戻る」という内部矛盾を解消。focusedIndex の blur 非リセットを明記。ステップ6 のテストを「初回=選択 tab tabIndex=0」「矢印後=フォーカス中 tab tabIndex=0・onChange/aria-selected 不変」の 2 ケースに分割。

**取り込んだ改善提案**:
- **[arch-risk S-003]**: ステップ3 に RSC 境界の扱いを追記。`EditorModeSwitch.tsx` は現状 `"use client"` 無しのため、フック導入に伴い `DisplayModeSwitch` に倣い `"use client"` を付与する旨を明記。
- **[arch-risk S-001]**: ADR-003 / ステップ1 の「automatic は stateless」を Rules of Hooks 上正確な記述（`focusedIndex` state は常に宣言されるが automatic 経路は参照しない＝条件付きフック呼び出しはしない）に修正。ADR-002/003 の Consequences も同趣旨に更新。
- **[coverage S-003]**: 最終検証ゲートを Issue AC 文言の素の `pnpm typecheck && pnpm lint && pnpm test` を基準に明記（CLAUDE.md の `lint:fix && format` フローは開発手順として別途残す）。ステップ8 を更新。
- **[coverage S-002]**: P12 モックで tabpanel 化する対象要素を特定。editor body 領域 = `.toolbar`（1047 行）+ `.editor` content area（`role="textbox"`、1069 行）を新規 `<div role="tabpanel" id="editor-body-panel" aria-labelledby>` で囲む（role 衝突回避のためラッパー側に `role="tabpanel"`）と明記。
- **[arch-risk S-002]**: AC-7 を「focus 指標の新設」から「#660 segmented パターンとの parity」へ書き換え。グローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（index.css 176-178 行）で WCAG 2.4.7 は既に充足済みである前提を明記。
- **[arch-risk S-004]**: ステップ4 に tabpanel の `aria-labelledby` が常にレンダー済み tab を指す不変条件（`state.mode` は常に可視タブ集合内、dangling idref にならない）を調査済みの事実として明記。

**見送った提案とその理由**:
- なし（メインが取り込み対象とした指摘はすべて反映）。coverage S-001（AC-7 のテスト検証手段欠如）は AC-7 を parity 確認へ緩めた（arch-risk S-002）ことで必須機械検証の対象から外れたため、別途のテスト追加はしない。

### 2周目

両視点とも問題点ゼロ（coverage: 問題 0 / 改善提案 0、arch-risk: 問題 0）で終了。arch-risk の改善提案 [S-001]（低優先・任意）の安全弁のみ反映: manual roving の「常に 1 つだけ `tabIndex=0`」不変条件が `focusedIndex ∈ [0, count)` に依存する点を、ステップ1（useRovingTablist 拡張）と ADR-003 に「範囲外フォールバックまたは JSDoc で `focusedIndex ∈ [0,count)` を明記する安全弁」として一行追記。
