# 実装計画 — Issue #660: a11y: 表示モード segmented の role=tablist が APG Tabs パターン不完全（矢印キーナビ・aria-controls 不在）

**Issue:** #660
**作成日:** 2026-06-25
**複雑度:** 中〜大規模

---

## 目的

表示モード segmented（list/tile/calendar）の不完全な `role="tablist"` 契約を、UI の実体（相互排他の単一選択・実体 tabpanel 不在）に意味的に一致する `radiogroup`/`radio` へ置き換え、矢印キーナビゲーション（roving tabindex）を伴う APG Radio Group パターン準拠にする。あわせて、コメントで同時対応を求められた共通 `menuItem` 系の focus-visible コントラスト不足（WCAG 2.4.7）を ADR-011 の方針で統一する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 表示モード segmented のコンテナが `role="radiogroup"`（`aria-label="表示形式"`）、各ボタンが `role="radio"` + `aria-checked`（選択 true / 非選択 false）を持ち、`role="tablist"`/`role="tab"`/`aria-selected` が存在しない | W-002 / ADR-001 | 2,3 |
| AC-2 | 選択中ボタンのみ `tabIndex=0`、非選択は `tabIndex=-1`（roving tabindex）。Tab キーで segmented 全体に1つだけフォーカス停止する | W-002 / APG Radio Group | 1,2,3 |
| AC-3 | segmented にフォーカスがある状態で ArrowRight/ArrowDown → 次、ArrowLeft/ArrowUp → 前、Home → 先頭、End → 末尾へフォーカスが移り、移動と同時に表示モードが切り替わる（両端ラップ）。home では矢印移動が navigate（`replace: true`）を伴う | W-002 / APG Radio Group | 1,2,3,6 |
| AC-4 | キーボードフォーカス時に accent outline（`focus-visible:outline-2 outline-accent`）でフォーカス位置が知覚可能（WCAG 2.4.7、コントラスト 3:1 以上） | AC-9（#649）/ ADR-001 | 2,3 |
| AC-5 | DisplayModeSwitch（home P10）と PublicTopControls（public top P30）の両方が radiogroup 化される。選択・URL ナビゲーション・localStorage 永続（home）等の既存挙動は不変 | 調査事実 1,2 / W-002 本筋 | 2,3,6 |
| AC-6 | 共通 `menuItem`（`common/styles.ts`）、`SORT_MENU_ITEM`（`public/styles.ts`）、`TAG_ADD_OPTION_ITEM`（`PublicTopControls.tsx` 内ローカル定数）の focus-visible が accent inset outline を持ち、白パネル上で 3:1 以上のコントラストで現在位置が知覚可能（WCAG 2.4.7）。danger 項目（NoteActions 削除等）も accent outline で統一（理由は ADR-003） | コメント / ADR-011 / ADR-003 | 4 |
| AC-7 | spec モック（P10-home.html / P30-user-public-top.html）の表示モード segmented の `tablist`/`tab`/`aria-selected` マークアップと注記が radiogroup/radio/aria-checked へ更新される | 規約（モックは正） | 5 |
| AC-8 | 既存テスト（DisplayModeSwitch.test.tsx / PublicTopControls.test.tsx）の role 契約アサーションが radiogroup/radio/aria-checked へ更新され、矢印キーナビの回帰テストが追加される | 調査事実（テストロック） | 6 |
| AC-9 | `pnpm typecheck && pnpm lint && pnpm test` が通る | CLAUDE.md | 全ステップ |

## スコープ

### 含まれるもの（受け入れ基準で表現）
- DisplayModeSwitch（home P10）と PublicTopControls の表示モード segmented の radiogroup 化（AC-1〜5, 7, 8）
- segmented 専用 roving フックの新設（AC-2, 3）
- 共通 menuItem 系の focus-visible 統一（AC-6）

### 含まれないもの
- **TagListToolbar の並び替え軸 segmented（P18）**: Issue title は「**表示モード** segmented」。これは「表示形式（list/tile/calendar）」ではなく**並び替え軸**で、`aria-label="並び替え軸"`。意味的には「相互排他の単一選択」なので radiogroup が正しいのは同じだが、(a) Issue / W-002 の本筋は表示モード（list/tile/calendar）であり、(b) P18 の segmented は #626 ADR-001 の適用範囲外（「非表示モード用途の .segmented は対象外」と明記）で白カード active 表現も別系統。本 Issue で表示モード系と一緒に変えると #626 が意図的に分けた2系統を混在させて扱うことになる。**本 Issue では見送り、必要なら別 Issue で並び替え軸 segmented 群を横断して扱う**（同テーマだが別系統のため）。
- **EditorModeSwitch（編集モード WYSIWYG/HTML、P12）**: これは「表示モード」ではなく編集モードで、かつ list/tile/calendar と異なり**実体パネル（editor 本文）が存在する**。tabpanel が実在するため radiogroup 化が意味的に正しいとは限らず（むしろ APG Tabs を `aria-controls` 補完で完成させる方が正確になりうる）、設計判断が表示モード系とは別物。Issue title・W-002 のスコープ外。**本 Issue では見送り**、必要なら editor 本文を `tabpanel` 化する別 Issue で扱う。
- 表示モードの永続化方式・loaderDeps 設計（#650 / #219 で確定済み、本 Issue は触らない）
- ビュー本体（NoteListViews / PublicNoteViews）への `tabpanel` 付与（radiogroup は対パネルを要求しないため不要）

## 調査結果

- 関連ファイル:
  - `app/components/note/list/DisplayModeSwitch.tsx` — home P10 の表示モード segmented。W-002 が直接指す。`role="tablist"`/`role="tab"`/`aria-selected`/`data-active`。
  - `app/components/public/PublicTopControls.tsx`（368行付近）— public top P30 の表示モード segmented。同契約。
  - `app/components/note/list/styles.ts`（`DISPLAY_SEGMENTED` / `DISPLAY_SEGMENTED_BTN`）/ `app/components/public/styles.ts`（`SEGMENTED` / `SEGMENTED_BTN`）— segmented の utility 定数。既に `focus-visible:outline-2 outline-accent` を持つ（DisplayModeSwitch 側）。public 側 `SEGMENTED_BTN` は focus-visible outline が無いため追加が必要。
  - `app/components/common/useRovingMenu.ts` — 既存 roving プリミティブ（menu/listbox 専用、縦方向、open 必須）。
  - `app/components/common/styles.ts`（`menuItem` 425行付近）— 共通メニュー項目。`focus-visible:bg-surface` のみ。danger 変種（`data-[danger]:text-error data-[danger]:focus-visible:bg-error-surface`）を持つ。
  - `app/components/public/styles.ts`（`SORT_MENU_ITEM` 119行付近）— public のソート項目。`focus-visible:bg-surface` のみ。
  - `app/components/public/PublicTopControls.tsx`（`TAG_ADD_OPTION_ITEM` 653行・ファイル内ローカル定数のテンプレートリテラル、`${TOUCH_TARGET}` を内挿）— `public/styles.ts` には**存在しない**。`focus-visible:bg-surface` のみ。
  - `app/components/note/list/ViewSwitcher.tsx`（`OPTION_ITEM`）— ADR-011 で accent inset outline を確立した参照実装。
  - `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx` — `role="tablist"`/`role="tab"`/`aria-selected` をロック。
  - `app/components/public/__tests__/PublicTopControls.test.tsx` — `aria-selected="true"` をアサート（148行付近）。
  - spec モック: `spec/design/pages/P10-home.html`（1133行付近）/ `spec/design/pages/P30-user-public-top.html`（581行付近）に表示モード segmented のマークアップ + `tablist`/`tab` 契約注記。

- あるべきアーキテクチャ:
  - これはフロントエンド（プレゼンテーション層）専用の変更。ドメイン/アプリケーション/アダプター層への影響なし。
  - スタイリング規約（CLAUDE.md）: utility-first、`data-*` 属性 + `data-[name]:` variant、focus-visible は token（`outline-accent`）で表現、繰り返し utility は module-scope 定数へ集約。
  - a11y: WAI-ARIA APG 準拠が正。実体に一致するセマンティクスを選ぶ（radiogroup vs tabs は実体 tabpanel の有無で判断 — ADR-001）。
  - roving tabindex の既存パターン: `useRovingMenu`（menu/listbox 用、ADR-001 #467）。

- 既存実装の状態:
  - segmented の `tablist`/`tab` は **APG Tabs として不完全**（roving/矢印キー/aria-controls/tabpanel 全て不在）。実体 tabpanel も存在しない。乖離 = ARIA 契約が UI 実体と不一致。本 Issue で radiogroup へ是正する。
  - 共通 `menuItem` の focus-visible は ADR-011 で「過渡的差異」として未修正のまま据え置かれていた。本 Issue で解消（ADR-003）。

- 依存関係:
  - DisplayModeSwitch / PublicTopControls の選択・ナビゲーション挙動（#219 loaderDeps / #650 永続化 / public の useOptimistic）は**不変**に保つ。roving とセマンティクス変更は表示層のみで、select ハンドラのロジックには触れない。
  - 新設 roving フックは `common/` に置き、両コンポーネントで共有。
  - menuItem 変更は `Menu.tsx` 利用全箇所（オーバーフロー/アバター/ディレクトリメニュー）の focus-visible 見た目に波及（outline 追加のみ）。

## 設計

### ドメインモデルへの影響
なし（プレゼンテーション層のみの a11y / スタイル変更）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

採用セマンティクス: **radiogroup / radio**（ADR-001）。実体 tabpanel が無く「相互排他の単一選択」が UI の実体であるため。

1. **roving プリミティブ**: segmented 専用の軽量フック `useRovingTablist`（仮称、`common/`）を新設（ADR-002）。`useRovingMenu` は menu/listbox 専用のまま変更しない。横方向（ArrowLeft/Right）+ 縦（ArrowUp/Down）+ Home/End、両端ラップ、移動先へ DOM フォーカスを移し、移動と同時に `onSelect(index)` を呼ぶ（APG Radio Group の「矢印で即選択」）。選択値（current mode）から `tabIndex` を導出（選択中=0 / それ以外=-1）。常時表示前提で `open` 概念を持たない。
2. **DisplayModeSwitch**: コンテナ role を `radiogroup`、各ボタン role を `radio`、`aria-selected` → `aria-checked`、roving フックで `tabIndex` と container `onKeyDown` を供給。`select` ハンドラ・localStorage 永続・navigate 挙動は不変。
3. **PublicTopControls**: 表示モード segmented（368行付近）を同様に radiogroup 化。`selectDisplayMode` ハンドラ・useOptimistic・URL ナビゲーションは不変。public 側 `SEGMENTED_BTN`（`public/styles.ts`）に focus-visible accent outline を追加（現状欠落）。
4. **共通 focus-visible 統一**（ADR-003）: `menuItem`（`common/styles.ts`）/ `SORT_MENU_ITEM` / `TAG_ADD_OPTION_ITEM`（`public/styles.ts`）に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2` を追加（`focus-visible:bg-surface` は残す）。
5. **spec モック更新**: P10/P30 の表示モード segmented を radiogroup/radio/aria-checked へ、契約注記も更新。
6. **テスト更新 + 追加**: 既存 role 契約アサーションを radiogroup/radio/aria-checked へ更新し、矢印キーナビ（ArrowLeft/Right/Home/End で選択が移る）の回帰テストを追加。

## 実装ステップ

依存方向順（共有プリミティブ → 利用コンポーネント → スタイル → モック → テスト）。

### 1. segmented 用 roving フック新設

- **対象ファイル:** `app/components/common/useRovingTablist.ts`（新規）
- **変更内容:** 常時表示・横並び segmented 用の roving tabindex フック。入力 `{ orientation?: "horizontal" | "vertical"; count: number; selectedIndex: number; onSelect: (index: number) => void }`、出力 `{ getTabIndex(index): 0 | -1; onKeyDown(event); containerRef }`。ArrowRight/ArrowDown→次・ArrowLeft/ArrowUp→前（両端ラップ）・Home→先頭・End→末尾。移動時 `event.preventDefault()`、移動先 index の `role="radio"` 要素へ `.focus()` し、`onSelect(index)` を呼ぶ。DOM フォーカス実行は container 配下の `[role="radio"]` を querySelector で取得（`useRovingMenu` と同流儀、フォーカス実行のみ・index は caller 所有）。ライブラリ JSDoc を付す（WHY: なぜ useRovingMenu を流用しないか = ADR-002 要約）。
- **理由:** AC-2/3。両コンポーネントで共有する roving の単一実装。
- **実装時評価（arch S-001）:** `onSelect` をフック内で呼ぶ（radiogroup は arrow で即選択が APG 仕様なのでフック内包も妥当）か、`useRovingMenu` 同様「フォーカス移動のみ・選択は caller の onClick/onKeyDown」に留めるかは、実装時にどちらが既存 roving プリミティブと整合するか確認して確定する（どちらでも AC は満たせる）。
- **JSDoc（2周目 arch S-001）:** `useRovingMenu` と同じく「宣言順 = DOM 順が `.focus()` の正しさの前提（`[role="radio"]` は segmented 直下の唯一の該当要素）」という index-discipline を JSDoc に1行残す。
- **未処理キーの扱い（2周目 arch S-002）:** ArrowLeft/Right/Up/Down/Home/End 以外のキー（Tab / Space / Enter 等）では `preventDefault` を掛けず素通しする（Tab のフォーカス離脱・ネイティブ button の Space/Enter 活性化を壊さない）。回帰テストで「未処理キーでは preventDefault されない / フォーカスが segmented から離れる」1ケースを固定する。

### 2. DisplayModeSwitch を radiogroup 化

- **対象ファイル:** `app/components/note/list/DisplayModeSwitch.tsx`
- **変更内容:** `<div role="tablist">` → `role="radiogroup"`（`aria-label="表示形式"` 維持、container ref / onKeyDown を roving フックから付与）。各 `<button role="tab" aria-selected={active}>` → `role="radio" aria-checked={active} tabIndex={roving.getTabIndex(i)}`。`onClick={() => select(mode)}` は維持（roving の onSelect も同じ `select` を呼ぶよう配線）。`data-active` / `aria-label` / `title` / アイコンは不変。`select` ハンドラ・`writeDisplayPreference`・navigate ロジックは一切変更しない。
- **理由:** AC-1/2/3/5。W-002 が直接指すコンポーネント。

### 3. PublicTopControls の表示モード segmented を radiogroup 化

- **対象ファイル:** `app/components/public/PublicTopControls.tsx`（368行付近）、`app/components/public/styles.ts`（`SEGMENTED_BTN`）
- **変更内容:** 表示モード segmented のみを radiogroup/radio/aria-checked + roving 化（手順は 2 と同形）。`selectDisplayMode` / useOptimistic / navigate は不変。`SEGMENTED_BTN` に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` を追加（現状フォーカス outline 欠落）。**SortPopover / TagAddPopover の `useRovingMenu` 利用部分には触れない**（それらは menu/listbox で正しい）。public `SEGMENTED_BTN` の focus-visible outline は home の `DISPLAY_SEGMENTED_BTN` と同様「外側・offset 無し」（`p-[2px]` の隙間に外側 outline が乗る前提）。menu 系の `-outline-offset-2`（内側）と取り違えて `SEGMENTED_BTN` へ `-outline-offset-2` を付けないこと。
- **理由:** AC-1/2/3/4/5。W-002 が指す P30 の実体。

### 4. 共通メニュー系 focus-visible の統一

- **対象ファイル:** `app/components/common/styles.ts`（`menuItem`, 425行）、`app/components/public/styles.ts`（`SORT_MENU_ITEM`, 119行）、`app/components/public/PublicTopControls.tsx`（ファイル内ローカル定数 `TAG_ADD_OPTION_ITEM`, 653行・テンプレートリテラル）。`TAG_ADD_OPTION_ITEM` は `public/styles.ts` には**無い**ので注意。
- **変更内容:** 各定数に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2` を追加（`focus-visible:bg-surface` は残す）。`menuItem` の JSDoc に「accent inset outline でフォーカス位置を知覚可能にする（#660 / ADR-011 横展開）」の WHY を追記。`TAG_ADD_OPTION_ITEM` はテンプレートリテラルなので `focus-visible:bg-surface` の直後に追記する。
- **danger 項目の扱い（arch P-001 / 理由は ADR-003）:** `menuItem` は danger 変種（`data-[danger]:text-error data-[danger]:focus-visible:bg-error-surface`、NoteActions「削除」等）を持つが、danger 項目含め accent outline で統一する（error 色 outline の分岐は作らない）。focus-visible の outline は「フォーカス位置インジケーター」として全項目で accent に揃え、danger のセマンティクスは text=error + bg=error-surface が担う。参照実装 ViewSwitcher の `OPTION_ITEM`/`TRIGGER` も accent 統一。
- **理由:** AC-6。コメント要件 / ADR-003。ViewSwitcher の `OPTION_ITEM` と表現を揃え、過渡的差異を解消。

### 5. spec モック更新

- **対象ファイル:** `spec/design/pages/P10-home.html`（1133行付近 + 561-565行注記）、`spec/design/pages/P30-user-public-top.html`（581行付近 + 390-394行注記）
- **変更内容:** 表示モード segmented の `class="segmented" role="tablist"` → `role="radiogroup"`、各 `<button role="tab" aria-selected="...">` → `role="radio" aria-checked="..."`。`.segmented` 注記の「role="tablist" / role="tab" / aria-selected の契約は維持」を「role="radiogroup" / role="radio" / aria-checked（#660 で APG Radio Group 化、矢印キー roving 対応）」へ書き換え。
- **理由:** AC-7。モックは正。radiogroup 化に追従させる。

### 6. テスト更新 + 矢印キー回帰テスト追加

- **対象ファイル:** `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`、`app/components/public/__tests__/PublicTopControls.test.tsx`
- **変更内容:**
  - **矢印キーの動的回帰テストは DisplayModeSwitch.test のみ**に追加する（PublicTopControls.test は冒頭で `renderToStaticMarkup`（SSR 静的マークアップ）を使い、`createRoot` クライアントレンダー / `dispatchEvent` での KeyboardEvent 発火ができないため。動的キーボードテストには harness 新設が必要で過剰）。
  - DisplayModeSwitch.test: `role="tablist"`/`role="tab"`/`aria-selected` のアサーションを `role="radiogroup"`/`role="radio"`/`aria-checked` へ更新。`tabByLabel` のセレクタ `[role="tab"]` → `[role="radio"]`。roving の回帰: 選択中のみ `tabIndex=0`・他は `-1`、container への ArrowRight/Home/End KeyboardEvent で `aria-checked` と navigate が移ることを検証。さらに **連続矢印 → 連続 navigate（home `replace: true`）の回帰を固定**する（ArrowRight×2 連続で navigate が各回呼ばれ、両端ラップで先頭/末尾に戻る）。public 側は useOptimistic + transition 経由で同様だが、SSR harness のため本ケースは DisplayModeSwitch 側で固定する。
  - PublicTopControls.test: 148行付近の `aria-selected="true"` を `aria-checked="true"` へ更新（role/aria-checked の**静的契約アサーション更新に留める**）。矢印キーの動的検証は行わない。
  - 矢印キーは happy-dom 上で `dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))` を container に投げて検証（React の合成イベント経由）。
- **理由:** AC-8 / AC-3 / AC-5。ロック契約を新セマンティクスへ更新し、矢印キーナビと既存挙動の不変を回帰として固定。

### 7. 検証

- **対象:** 全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit`。手動: home / public top で Tab → segmented に1停止、ArrowLeft/Right で表示が切り替わること、focus-visible outline が見えることを確認（必要なら manual-test）。
- **理由:** AC-9。

## 設計判断

- **radiogroup / radio を採用**（ADR-001）— 実体 tabpanel が存在せず「相互排他の単一選択」が UI の実体であるため。full-tabs（tabpanel 化）はコンポーネント間の id 結合を増やし操作モデルとも不一致、button-group（aria-pressed）は単一選択をグループとして表現できず情報量後退。
- **segmented 専用 roving フックを新設**（ADR-002）— `useRovingMenu` は menu/listbox 専用（open 必須・縦方向・panel 前提）で、一般化は既存利用箇所への波及リスクが高い。横並び・常時表示の単純な前提に閉じた軽量フックが適切。
- **menuItem focus-visible 統一をスコープに含める**（ADR-003）— コメントで同時対応を明示要求、ADR-011 が方針を確定済みで横展開のみ、同一 WCAG テーマ（2.4.7）。
- **TagListToolbar / EditorModeSwitch は見送り**（plan「含まれないもの」）— それぞれ並び替え軸 / 編集モードで「表示モード」ではなく、後者は実体パネルを持つため設計判断が別物。

## リスクと注意点

- happy-dom 上で React 合成イベント（onKeyDown）経由の矢印キーを `dispatchEvent` で発火する際、`act()` でラップしないと state 更新が反映されない。テストは既存 DisplayModeSwitch.test の `act` 流儀に従う。
- PublicTopControls の表示モード segmented を radiogroup 化する際、同ファイル内の SortPopover / TagAddPopover（`useRovingMenu`・menu/listbox）に誤って手を入れないこと。変更は表示モード segmented のブロックに限定。
- roving の「矢印移動で即選択」は home では navigate を伴う。連続矢印で連続 navigate（`replace: true`）が走るが、既存の click 経由 select と同じ挙動なので新たな問題は生じない。public 側は useOptimistic + transition 経由で同様。
- radiogroup 化により SR の告知が「タブ」→「ラジオボタン」へ変わる。これは意図した改善だが、既存ユーザーの慣れとの差異がある（受け入れ済みのトレードオフ）。
- `aria-checked` は `aria-selected` と異なり「選択済み/未選択」の二値。`aria-checked={active}`（boolean）が `"true"`/`"false"` 文字列にシリアライズされることをテストで確認。
- menuItem の outline 追加は Menu 全利用箇所に波及。視覚回帰は focus-visible 時のみ（通常時は不変）。
- DOM フォーカス移動（`containerRef` 配下 `querySelector('[role="radio"]')` + `.focus()`）は keydown ハンドラ内でのみ実行し、render / SSR 経路には載らない（`useRovingMenu` と同流儀）。両コンポーネントとも `"use client"` のクライアントアイランドで、SSR は初期 markup（`tabIndex` の静的値）のみ出すため hydration mismatch も生じない（hydration 非干渉）。

## テスト方針

- ユニット（vitest, happy-dom）:
  - DisplayModeSwitch: radiogroup/radio/aria-checked 契約、roving tabindex（選択中=0/他=-1）、ArrowRight/ArrowLeft/Home/End で aria-checked と navigate が移る、既存の navigate/localStorage 挙動が不変であること。**連続矢印 → 連続 navigate（home `replace: true` / public は useOptimistic + transition）の回帰を固定**する（DisplayModeSwitch 側で。public 側は SSR harness のため動的検証不可）。
  - PublicTopControls: 表示モード segmented の radiogroup/radio/aria-checked の**静的契約アサーション更新のみ**（SSR `renderToStaticMarkup` harness のため動的キーボードテスト不可）、selectDisplayMode 挙動が不変であること。矢印キーの動的回帰は DisplayModeSwitch 側に集約。
- 既存テストの全グリーン維持（`pnpm test:unit`）。
- 手動 / ブラウザ（任意・manual-test）: Tab フォーカス停止が segmented に1回、ArrowLeft/Right/Home/End での移動と即時表示切り替え、focus-visible outline の視認、SR（VoiceOver 等）で「ラジオボタン n/N」と告知されること。
- コントラスト: focus-visible accent outline が白パネル / surface 上で 3:1 以上（既存 `outline-accent` トークンが #649 N-004 で確認済みの値を流用）。

## レビュー履歴

- **1周目:** coverage P-001（`TAG_ADD_OPTION_ITEM` の所在誤り）/ arch P-001（danger 項目への accent outline）を反映。改善提案 coverage S-001（矢印キー回帰は DisplayModeSwitch のみ・public は静的契約のみ）/ S-002（AC-3 に home navigate replace:true 補足）/ S-003（AC-5 にテストステップ6を紐付け）・arch S-002（DOM フォーカスは keydown 内のみ・hydration 非干渉）/ S-003（連続矢印→連続 navigate の回帰固定）/ S-004（public SEGMENTED_BTN は外側・offset 無し）を取り込み。arch S-001（`useRovingTablist` の onSelect 内包の是非）は実装時評価としてステップ1に記録。
- **2周目:** 両視点とも問題点ゼロで収束。改善提案 arch S-001（JSDoc に index-discipline を残す）/ arch S-002（未処理キーで preventDefault しない + 回帰1ケース固定）をステップ1に取り込み。
