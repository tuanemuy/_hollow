# 実装計画 — Issue #587: モバイルモック(#536)の実装追従 ① 共通基盤（shell drawer / dialog ボトムシート / タッチ床 / フォーム1カラム）

**Issue:** #587
**作成日:** 2026-06-08
**複雑度:** 中〜大規模

---

## 目的

#536 / PR #584 で新設したモバイルモック（実体は `spec/design/pages/mobile/PXX-*.html`、全49画面・390px基準）を、実装（`app/`）の**横断的なモバイル基盤**へ追従させる。drawer・ヘッダー省スペース・Dialog ボトムシート化・Popover フルワイドシート化・タッチ床44px・フォーム1カラムを、共通コンポーネント（`app/components/layout/` / `app/components/common/`）と `styles.ts` で一括対応し、個別画面（#588）・admin テーブル（#589）の追従が継承できる土台を提供する。

ゼロからの新規実装ではなく、既存共通基盤（`layout/` の drawer 骨格、`common/` の Dialog/Popover primitive、`pillBtn`/`ICON_BTN` のタッチ床）を**モック仕様に精緻化**する作業。

## スコープ

### 含まれるもの

- サイドバー drawer の精緻化（幅 `max-w` 上限・トランジション質感）
- Dialog のボトムシート化（**最大の乖離・最重要**）
- Popover 狭幅フルワイドシート用の共通 panel 定数の提供
- **下部固定 CTA バーの共通 frame（chrome）の提供** — `fixed`・safe-area・`--header-bg`/blur・`border-top`・z-index ポリシー・タッチ床を持つ再利用可能な枠を `layout/` に新設。各画面が CTA 内容を差し込んで継承できる土台（受け入れ基準2「下部固定CTAが共通コンポーネント側で表現され、各画面が継承できる」に対応）
- ヘッダー省スペース化の確認・補完（タッチ床・アイコン化）
- タッチ床44px の横断適用の確認・補完（`fieldControl` のモバイル44px床を含む横断適用）
- フォーム1カラム化の確認（既存実装で達成済みの確認が主）

### 含まれないもの

- 個別画面のレイアウト追従（→ #588）
- admin テーブルのカード化（→ #589）
- **各画面の下部固定 CTA バーへの「CTA 内容の配置・Header からの移設配線」**（list系画面固有 = #588）。本Issueは枠（chrome）のみ提供し、どのボタンを載せるか・Header の既存 CTA をどう退避するかは画面別 #588 に引き渡す
- `FilterBar` の `FILTER_POPOVER_PANEL`（domain-owned = #588。本Issueは common primitive と共通定数の提供まで）
- Popover の role/focus 改善（→ #506）、scroll cue（→ #272）、disabled hover 一貫性（→ #331）。ただし基盤実装で自然に触れる範囲（safe-area の下パディング = #271 由来）は取り込む

## 実装ステップ

### 1. Dialog をボトムシート化（最重要・最大の乖離）

- **対象ファイル:** `app/components/common/styles.ts`（`dialogBackdrop` / `dialog` / 必要なら grabber 定数）、`app/components/common/Dialog.tsx`（grabber 要素の描画と `aria-hidden`）
- **変更内容:**
  - `dialogBackdrop`: 狭幅で下端寄せ。現行 `flex items-center justify-center p-4` を base=下端吸着・パディング無し / `sm`以上=従来の中央モーダルへ（`flex justify-center items-end p-0 sm:items-center sm:p-4` 相当）。
  - `dialog`: 狭幅でフルワイド・上端のみ角丸・safe-area 下パディング。`rounded-lg` → `rounded-t-lg sm:rounded-lg`、base はフルワイド（backdrop `items-end` + panel `w-full`）。`max-h-[90vh]` → 狭幅は **モック実体に逐語追従して `max-sm:max-h-[calc(100%-var(--space-8))]`**（`dialogBackdrop` が `fixed inset-0` でビューポート高なので `100%` がモックの `calc(100% - --space-8)` と同義になり、`dvh` の WebKit 互換懸念が不要になる）/ `sm:max-h-[90vh]`。下パディング `max-sm:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]`。
  - grabber: `dialog` panel の**純粋な先頭**（close button より前）に `max-sm:` でのみ表示する装飾ハンドル（36×4px・`--radius-full`・`--color-hairline-strong`・下マージン `max-sm:mb-4` 相当でモックの `margin:0 auto var(--space-4)` に追従）。`Dialog.tsx` に `aria-hidden` の非 focusable `<span>` を追加（`INITIAL_FOCUS_SELECTOR`/`FOCUSABLE_SELECTOR` に掛からず、`focusables[0]` が従来通り close button のままになること）。
- **理由:** `index.md §3`「狭幅では下端シート寄せ」をモックの実体（`justify-content:flex-end`+top-only radius+grabber+safe-area）に追従。`Dialog` primitive を継承する全ダイアログへ一括反映され、各 P10-*-dialog の追従（#588）が土台を継承できる。

### 2. Popover の狭幅フルワイドシート用 共通 panel 定数を新設

- **対象ファイル:** `app/components/common/styles.ts`（新 panel 定数）、`app/components/common/Popover.tsx` / `usePopover.ts`（JSDoc で狭幅シート方針を明記）
- **変更内容:**
  - 共通 panel chrome 定数を `common/styles.ts` に追加: `rounded-lg border border-hairline bg-bg shadow-md p-4` をベースに、狭幅 `max-sm:left-0 max-sm:right-0 max-sm:w-auto`（フルワイド）/ `sm:` で従来の浮きカード。backdrop は付けない（`usePopover` は非モーダルのまま、role/focus は #506 据え置き）。
  - `usePopover.ts` の `clampToViewport`（`shiftX`）はフルワイド時に不要。JSDoc に方針を記載（実分岐は #588 の FilterBar 側で本定数へ寄せる際に行う）。
- **理由:** Popover フルワイド化の「共通土台」を提供。domain-owned の `FILTER_POPOVER_PANEL` 置換は #588 へ引き渡す（スコープ厳守）。

### 3. サイドバー drawer の精緻化

- **対象ファイル:** `app/components/layout/styles.ts`（`APP_SIDEBAR` / `SIDEBAR_BACKDROP`）
- **変更内容:**
  - `APP_SIDEBAR`: 現行 `max-lg:w-[280px]` にモック準拠の上限 `max-lg:max-w-[86vw]` を追加（モック `P10-home.html` `.sidebar { width:280px; max-width:86vw }` 由来。320px極狭でも本文側を残し横スクロールを防ぐ）。`shadow-md`・`-translate-x-full`/`data-[open]:translate-x-0`・`z-[100]` は現状維持。
  - `SIDEBAR_BACKDROP`: `bg-black/20`・`z-[90]`・`data-[open]:max-lg:block` は現状維持。必要なら `transition-opacity`（`motion-reduce:transition-none` 付き）で開閉の質感をモックに合わせる。
- **理由:** drawer 骨格（focus trap/scroll lock/inert/Escape/route/lg クローズ）は既存で要件をほぼ満たすため精緻化に留める。`AppShellDrawer.tsx` のロジックは変更不要。

### 4. ヘッダー省スペース化の確認・補完 + 下部固定CTAバーの共通 frame 新設

- **対象ファイル:** `app/components/layout/Header.tsx` / `MenuButton.tsx` / `UserMenu.tsx` / `layout/styles.ts`（`MENU_BTN` / `APP_HEADER` / 新 `BOTTOM_ACTION_BAR`）、新規 `app/components/layout/BottomActionBar.tsx`
- **変更内容:**
  - **下部固定CTAバーの共通 frame（chrome）を新設**: モック `P10-home.html` `.cta-bar`（`position:fixed; left/right:0; bottom:0; z-index:40; display:flex; gap:--space-2; padding:10px --space-4; padding-bottom:calc(10px+env(safe-area-inset-bottom)); background:var(--header-bg); backdrop-filter:var(--header-blur); border-top:1px solid --color-hairline`、`@supports not (backdrop-filter)` で `bg --color-bg` フォールバック）に追従した再利用可能な枠を `layout/` に提供する。`BOTTOM_ACTION_BAR` 定数 + 薄い frame コンポーネント `BottomActionBar`（`children` を受け CTA 内容を画面が差し込む）を新設し、`lg:hidden`（desktop 非表示）・safe-area・backdrop-filter は CLAUDE.md backdrop-filter パターン（always-on base の `bg-[--header-bg]` + `supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)]` + `-webkit-` 版）で表現。**backdrop-filter は SSOT トークン `var(--header-blur)` をトークン経由で使う**（既存 `APP_HEADER` 群は `--header-blur` を参照せずリテラル `saturate(180%) blur(20px)` を直書きしているが、これは既存負債であり本Issueでは合わせない／触らない。新設コードは tokens.md・モック準拠で `var(--header-blur)` を使う）。z-index は 40（モック `.cta-bar` 準拠）。
  - **z-index ポリシーの依存を明記**: モック P10 は bulk-bar(45) > cta-bar(40) の積層を意図するが、実装の `BulkActionBar`（`note/list/BulkActionBar.tsx`）は現状 `z-40 sticky bottom-4` の中央浮きピルで fixed full-width ではない。bulk-bar のモバイル fixed 化・z=45 引き上げは #588（list系画面追従）で行う。CTA と bulk-bar は**排他表示**（モック注記）なので本Issueで両者が z-40 同値でも実害は出ない。`BOTTOM_ACTION_BAR` は最終形の 40 を先取りして固定する。**どのボタンを載せるか・Header の既存 CTA をどう退避するかは画面別 #588**。本Issueは枠と継承点の提供まで（受け入れ基準2の「下部固定CTAが共通側で表現され各画面が継承できる」を満たす）。
  - `MENU_BTN`（`lg:hidden`・`max-sm:min-w/h-[44px]`）・CTA ラベル `max-sm:hidden`（アイコン化）は実装済み。現状維持で要件充足を確認。
  - `APP_HEADER` の `gap-5 px-6` は 320px で overflow しないか検証。overflow が出る場合のみ `max-sm:px-4 max-sm:gap-2.5` をトークン spacing で追加。
- **理由:** 下部固定CTAバーは Issue 本文スコープ②・受け入れ基準2・モック実体（`P10-home.html`）で共通基盤側の成果物として明記されている。frame（chrome）は横断的な共通責務であり、各画面が CTA 内容を差し込む設計にすることで P11/P21 等への副作用を避けつつ共通側で表現する。アイコン化・タッチ床は既存実装済み。

### 5. タッチ床44px の横断適用の確認・補完

- **対象ファイル:** `app/components/common/styles.ts`（`pillBtn` / `pillBtnIcon` / `dialogCloseButton` / `fieldControl`）、`app/components/layout/styles.ts`（`ICON_BTN` / `MENU_BTN`）
- **変更内容:** `pillBtn`/`ICON_BTN`/`dialogCloseButton`/`MENU_BTN` は `max-sm:min-h-[44px]`（icon系は `min-w` も）適用済み。`index.md §3`/§7.1 の二段原則（44床/24許容、admin は `data-[sm]:max-sm:min-h-0` で解除）と一致。`fieldControl`（`h-10`=40px）に `max-sm:min-h-[44px]` を追加し、モックの `field-control { min-height: 44px }` に追従する。これは **common primitive のため設定画面・auth 等あらゆるモバイルフォームの input 高が 40→44px に横断波及する**が、これは §3 のタッチ床横断適用の**意図どおり**（シート内限定ではない）。admin 専用の `FIELD_INPUT`（`layout/styles.ts`）は密度優先（§7.1）のため据え置く。
- **理由:** 既存が二段原則を満たすため確認主体。`fieldControl` のモバイル44px床のみモックに合わせ横断補完。

### 6. フォーム1カラム化の確認

- **対象ファイル:** `app/components/layout/styles.ts`（`FIELD_ROW`）、`app/components/common/styles.ts`（`field` / `fieldControl` / `formError`）、`app/components/auth/styles.ts`（`FORM` / `FIELD`）
- **変更内容:** `FIELD_ROW`=`grid gap-4 md:grid-cols-2` は base 1カラム＝モック準拠で変更不要。`field`/`FORM` は元から縦1カラム。新規変更は不要。受け入れ基準「フォーム系共通スタイルが狭幅1カラムを継承できる」が満たされていることを確認し、Step 1 のシート内フォームでも崩れない（`min-w-0` 等）ことを確認。
- **理由:** フォーム1カラムは既存実装で達成済み。スコープ外のリファクタを足さない。

### 7. 品質ゲート

- **対象:** 全変更ファイル
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。既存 `common/__tests__`（Dialog/ConfirmDialog/Popover）・`layout/__tests__`（UserMenu）が壊れないか確認。Dialog に grabber DOM を足す場合は focus trap の focusable 数に影響しないよう `aria-hidden`+非 focusable span にする。

## 設計判断

詳細は `adr.md` 参照。要点:

- **ADR-001**: Dialog のシート化は `data-*` ではなく responsive variant（`max-sm:`/`sm:`）で表現（静的なビューポート分岐であり、JS でのモバイル判定を足さず SSR/hydration の揺れを避ける）。
- **ADR-002**: grabber は `Dialog.tsx` の panel 先頭（close button より前）に `aria-hidden` 装飾 span を追加（focus trap 無影響・`focusables[0]` 不変を明示）。
- **ADR-003**: ボトムシートの max-height はモック逐語追従で `max-h-[calc(100%-var(--space-8))]`（`100dvh` を使わない。backdrop が `fixed inset-0` なので `100%` で同義、互換懸念解消）。
- **ADR-004**: safe-area は `env(safe-area-inset-bottom)` の arbitrary calc を `max-sm:` 限定で導入（新規トークンは作らない）。
- **ADR-005**: Popover フルワイド化は common primitive + 共通定数の提供まで（domain-owned 置換は #588）。
- **ADR-006**: 下部固定CTAバーは共通 frame（chrome）のみ提供、CTA 内容の配置は #588（frame と内容の分離）。
- **ADR-007**: `fieldControl` のモバイル44px床は全フォームへ横断適用（§3 の意図どおり、admin `FIELD_INPUT` は据え置き）。

## リスクと注意点

- `dialogBackdrop`/`dialog` は**全ダイアログに一括波及**。`sm`以上は従来挙動を維持するので desktop 影響は無いが、狭幅で長いフォーム/リストを持つダイアログ（note-picker, move-note）は `max-sm:max-h-[calc(100%-…)]` + `overflow-y-auto` が効くか個別目視が要る（#588 で画面別に確認される土台）。
- grabber を `Dialog.tsx` に足すと `role="alertdialog"`（ConfirmDialog）でも先頭に出る。ConfirmDialog の先頭は見出し行（`mb-4`）、通常 Dialog は `dialogTitle`（`mb-4`）。grabber の下マージン（`max-sm:mb-4`）と見出しの `mb-4` が**二重マージン**にならないか agent-browser で目視確認する。grabber が `INITIAL_FOCUS_SELECTOR`/`FOCUSABLE_SELECTOR` に掛からないこと（非 focusable span）を必ず担保し、既存 `Dialog.test.tsx` の `focusables[0] === closeBtn` 前提を維持する。
- grabber span 追加で既存テストの DOM スナップショット・子要素 count アサーションが揺れないか確認（`getBackdrop()` の `.fixed.inset-0` セレクタは維持されるので無影響）。
- `fieldControl` に `max-sm:min-h-[44px]` を足すと、textarea 合成（`min-h-[320px]`）と競合しないか（`min-h` 同士は大きい方が勝つので無害、ADR-004 同様）を確認。全モバイルフォームの input 高が 40→44px に変わるのは §3 の意図どおり。
- drawer `max-w-[86vw]` 追加は 320px 幅で 280px→約275px に微縮小。視覚回帰は軽微。

## テスト方針

- **agent-browser で overflow=0 検証**: 代表シェル画面 P10 を 390px で目視（受け入れ基準）。加えて 320 / 375 / 430px で `document.documentElement.scrollWidth <= clientWidth` を確認。drawer 開（backdrop・focus trap・Escape クローズ）、Dialog 開（下端シート・grabber・safe-area 下余白）、Popover（フルワイドシートの見え）を目視。
- **既存ユニットテスト**: `common/__tests__/{Dialog,ConfirmDialog,Popover}.test.tsx`、`layout/__tests__/UserMenu.test.tsx` を `pnpm test:unit` で回し退行が無いことを確認。Dialog の focus trap が grabber 追加後も「最初の意味ある control」にフォーカスすることをアサート追加すると堅い。
- **静的ゲート**: `pnpm typecheck && pnpm lint:fix && pnpm format`。`env()` の arbitrary calc が Biome/lightningcss を通るか build まで確認。`layout/styles.ts`/`common/styles.ts`（ファイル名 `styles.ts`）は `biome.json` の `!**/styles/**/*`（`app/styles/` ディレクトリ向け除外）には**該当せず lint 対象**だが、Biome `recommended` は未使用 *export* を検知しない（`noUnusedVariables` はモジュール内ローカル束縛が対象）ため、`BOTTOM_ACTION_BAR` / Popover 共通 panel 定数 / 新設 `BottomActionBar.tsx` が #588 まで未消費でも lint は通る。
- **frame 継承点の確認**: `BottomActionBar` に `children`（CTA ボタン）を差し込んだ最小サンプルを一度だけレンダリングし、「children 差し込み → 枠内に描画される」ことを agent-browser で確認（受け入れ基準2「各画面が継承できる」を機械的に追う）。
- **APP_HEADER overflow 判定の記録**: 320px で `APP_HEADER` に overflow が出るか検証し、結果（`max-sm:px-4 max-sm:gap-2.5` を適用したか／無変更か）を実装メモに残す（#588 着手時に Header 対応済みか曖昧にしない）。
- **トークン準拠の機械確認**: 新規リテラルpx を持ち込んでいないこと（safe-area の `env()` と §3 が許す `44px`/`86vw`/drawer `280px`/grabber 装飾寸法を除く）を grep で自己チェック。

## レビュー履歴

### 1周目（2視点並列: 要件カバレッジ / アーキ・リスク）

**修正した点（要修正）**:
- [要件 P-001] 下部固定CTAバーが Issue 本文スコープ②・受け入れ基準2・モック `P10-home.html` で共通基盤側成果物として明記されているのにスコープ外（#588）へ逃がしていた → **frame（chrome）を共通基盤スコープに戻し**、Step 4 を「ヘッダー省スペース + 下部固定CTAバー共通 frame 新設」に拡張。CTA 内容の配置のみ #588 へ引き渡し（ADR-006 新設）。
- [アーキ P-001] `max-h` がモック実体（`calc(100% - --space-8)`）と乖離して `100dvh` を持ち込んでいた → モック逐語追従の `max-sm:max-h-[calc(100%-var(--space-8))]` に修正。`dvh` 互換懸念が消えるため ADR を ADR-003 として確定（Accepted）、リスク欄の dvh 項を削除。
- [アーキ P-002] grabber span の DOM 位置が focus 順・初期フォーカスと干渉しうる → grabber を panel **純粋な先頭（close button より前）**・非 focusable に固定し `focusables[0] === closeBtn` 維持を明記（ADR-002 更新）。
- [アーキ P-003] ConfirmDialog（alertdialog）でも grabber が出て見出しと二重マージンになりうる → grabber 下マージン（`max-sm:mb-4`）と見出し `mb-4` の二重化を agent-browser 目視確認対象に追加（リスク欄・ADR-002）。

**取り込んだ改善提案**:
- [アーキ S-001] `fieldControl` への 44px 床は全モバイルフォームへ横断波及する点を明示（ADR-007 新設、Step 5 更新、admin `FIELD_INPUT` は据え置き）。
- [アーキ S-003] `max-w-[86vw]` の出所をモック `.sidebar { max-width:86vw }` と明記（Step 3）。
- [要件 S-002 / アーキ S-002] grabber span 追加の既存テスト・スナップショット影響、Popover 共通定数の未使用 export 検知をテスト方針・静的ゲートに追記。

**見送った提案とその理由**:
- なし（両視点の指摘はすべて反映または確認対象として取り込み）。

### 2周目（2視点並列: 要件カバレッジ / アーキ・リスク）

**要件カバレッジ: 問題点ゼロ**（下部固定CTA frame 復帰・100% 修正・スコープ境界が受け入れ基準に厳密一致と確認）。

**修正した点（要修正）**:
- [アーキ P-001] `BOTTOM_ACTION_BAR` の backdrop-filter 表現が未確定（spec/モックは `var(--header-blur)` 正、既存 `APP_HEADER` 群はリテラル直書きで両立しない）→ **SSOT トークン `var(--header-blur)` を採用し既存ヘッダーのリテラル負債には合わせない**方針を Step 4・ADR-006 に明記。
- [アーキ P-002] z-index「bulk-bar(45)の下=40」の根拠が実装 bulk-bar（z-40 sticky 中央ピル）と不一致 → モック準拠で z=40 を採用、bulk-bar の fixed 化・z=45 引き上げは #588 依存、CTA と bulk-bar は排他表示で同値でも実害なし、と Step 4・ADR-006 に依存明記。

**取り込んだ改善提案**:
- [アーキ S-001] `biome.json` が `styles/**` を lint 除外している事実を反映し、未使用 export 懸念をテスト方針で正確化。
- [要件 S-001] `BottomActionBar` の children 差し込み描画を最小サンプルで確認する手順をテスト方針に追加。
- [要件 S-002] `APP_HEADER` overflow 判定結果を実装メモに残す運用をテスト方針に追加。

**見送った提案とその理由**:
- [アーキ S-002/S-003] grabber 二重マージンの確認観点の微調整・Dialog backdrop と drawer の z-[100] 同値の#588引き渡し注記 → いずれも本Issue範囲では対応不要の補足。既存のリスク欄・目視確認でカバー済みのため計画本体への追記は見送り。

### 3周目（収束確認: アーキ・リスク）

**問題点ゼロ**。2周目の2つのP指摘（backdrop-filter の SSOT トークン採用・z-index 40 の依存明記）が技術的に正しく実現可能な形で解消されたことを実コード（`tokens.css:132` の `--header-blur` 実在、`APP_HEADER` のリテラル直書き、`biome.json` の lint includes）で確認。**収束**。

**訂正した点**:
- [S-001] テスト方針の biome lint 除外の根拠が事実誤認だった（`!**/styles/**/*` は `app/styles/` ディレクトリ向けで、ファイル名 `styles.ts` は lint 対象）→ 「`recommended` は未使用 export を検知しない」を正しい根拠に訂正。結論（未消費でも lint は通る）は不変。

**終了理由**: 3周目で両視点とも問題点ゼロに収束（要件カバレッジは2周目で既にゼロ、アーキ・リスクは3周目でゼロ）。
