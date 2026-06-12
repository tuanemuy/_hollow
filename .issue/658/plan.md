# 実装計画 — Issue #658: P10 FilterBar に「+ タグ」ゴーストチップ（タグピッカー導線）を実装する（#626 ADR-008）

**Issue:** #658
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

#626 R3 で確定した P10 デザインモックの「+ タグ」ゴーストチップ（タグフィルタ追加導線）を FilterBar に実装し、表示中以外のタグで絞り込めるタグピッカー UI（モック未定義のため本計画で設計）を提供する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | FilterBar のチップ列に「+ タグ」ゴーストチップが、タグチップ群（もっと見るトグル含む）の直後・期間ゴーストチップの前に表示される | Issue本文 / #626 ADR-008 並び順 | 2, 3 |
| AC-2 | チップは既存 `filterChipGhost`（破線枠・透明背景・h-7）と同スタイルで、先頭に `+` アイコン（lucide `Plus`、11px 相当）+ ラベル「タグ」を持つ（他チップの `▾` ではなく `+` で「追加」を描き分け） | モック `.filter-chip-ghost`（`origin/main` の `spec/design/pages/P10-home.html` L1108 / `mobile/P10-home.html` L1040） | 3 |
| AC-3 | トリガーに `aria-haspopup="listbox"` と `aria-label="タグで絞り込み"` が付き、`title="タグで絞り込み"` も併記される（モバイルモックの「title なし」からの意図的逸脱 — ADR-004 / #649 前例準拠） | Issue本文 / #626 ADR-008 a11y 契約 / ADR-004 | 3 |
| AC-4 | クリック/タップで全タグ（件数バッジ付き）の `role="listbox"`（`aria-multiselectable="true"`）パネルが開き、各タグが `role="option"` + `aria-selected` で適用状態を表す | Issue本文「タグ一覧ピッカー UI の設計・実装」 | 4 |
| AC-5 | オプションのクリックでタグ選択がトグルされ、既存タグチップと同じ楽観的反映（`useOptimistic` + URL ナビゲーション）で一覧が絞り込まれる。マルチセレクトのためパネルは選択後も開いたまま | ADR-008「表示中以外のタグで絞り込む」/ 既存 FilterBar 規約 | 4 |
| AC-6 | キーボード操作: 矢印キーでオプション間をロービングフォーカス移動、Enter/Space でトグル、Escape / 外側クリックで閉じてトリガーへフォーカス復帰（既存 `Popover` + `useRovingMenu` の挙動） | WAI-ARIA Listbox / 既存 ViewSwitcher 規約 | 4 |
| AC-7 | モバイル（< sm）ではパネルが画面下部の全幅シートとして表示される（`popoverSheetPanel` の既存ボトムシート挙動） | Issue本文「モバイルはボトムシート想定」 | 4 |
| AC-8 | 「+ タグ」を開くと他のフィルタポップオーバー（期間 / 公開状態）が閉じ、相互排他が保たれる | 既存 #476 相互排他規約 | 4 |
| AC-9 | タグが 0 件のときは「+ タグ」チップを表示しない（追加できるタグが存在しないため） | 設計判断（ADR-002） | 3 |
| AC-10 | ユニットテスト（FilterBar.test.tsx）で AC-1〜AC-6, AC-8, AC-9 相当の挙動が検証される。AC-7 はシート化の挙動自体は jsdom で検証できないため、パネルが `FILTER_POPOVER_PANEL`（= `popoverSheetPanel` ベース）のクラスを持つ構造アサーションで担保する | プロジェクトのテスト規約（docs/test.md） | 5 |
| AC-11 | `spec/manual-tests/browse.md` に「+ タグ」導線の手動テスト手順が追記される | #649 の testing 追従と同様のドキュメント規約 | 6 |

## スコープ

### 含まれないもの
- タグピッカー内の検索入力（combobox 化）— タグ件数の現実的な規模では `max-h` + スクロールで足り、ADR-008 の `aria-haspopup="listbox"` 契約からも逸脱するため初版では見送る（ADR-001 参照）
- 既存「もっと見る (+N)」トグルの削除・変更 — インライン展開（件数を見ながらの一覧把握）とピッカー（選択操作）は役割が異なり、削除は本 Issue の要件外（ADR-002 参照）
- バックエンド（ドメイン / ユースケース / アダプター）の変更 — 全タグは既に `loadAllTags` で FilterBar に渡っており、新規データ取得は不要
- スケルトン（`P10-home-skeleton.html` 相当）の追従 — ADR-008 自身が「追従不要」と明記
- モックHTML（`spec/design/pages/*.html`）の変更 — モックは確定済み（main に反映済み）。本 Issue は実装側の追従
- `NotePickerDialog`（内部リンク参照）との相互排他 — `pickerOpen` は `openPopover` union の外にある既存構造で、ダイアログとフィルタポップオーバーは現状も同時に開き得る。既存挙動の踏襲とし、本 Issue では対象外（AC-8 は期間 / 公開状態との排他のみ）
- VISIBLE_TAG_LIMIT（12件）超のタグを選択した際の `visibleTags` への繰り上げ — チップ列の表示は既存どおり選択状態と無関係に維持する。選択中なのにチップがバーに見えないケースは既知の制限として手動テストに明記（ADR-002 参照。必要なら別 Issue）

## 調査結果

- 関連ファイル:
  - `app/components/note/list/FilterBar.tsx` — チップ列本体。`DatePopover` / `VisibilityPopover` / `NotePickerDialog` トリガーと、`openPopover: "date" | "visibility" | null` の相互排他、`useOptimistic` + `run()` による楽観的フィルタ反映、`toggleTag()` が既にある
  - `app/components/note/list/styles.ts` — `filterChip` / `filterChipGhost`（`TOUCH_TARGET` 込みで 44px 当たり判定確保済み）/ `filterChipRemove` / `filterClearX`
  - `app/components/common/Popover.tsx` — `haspopup: "dialog" | "menu" | "listbox"` 対応のレンダープロップポップオーバー。listbox ブランチは #649（ViewSwitcher）で実装済み。外側クリック / Escape / フォーカス復帰 / `clampToViewport` を内包
  - `app/components/common/useRovingMenu.ts` — `itemRole: "option"` 対応のロービングフォーカス
  - `app/components/note/list/ViewSwitcher.tsx` — `haspopup="listbox"` + `useRovingMenu({ itemRole: "option" })` の参照実装（単一選択）
  - `app/components/common/styles.ts` — `popoverSheetPanel`（< sm で全幅ボトムシート化）、`FILTER_POPOVER_PANEL`（FilterBar 内のローカル定数）が既にこの上に構築済み
  - `app/components/note/HomePage.tsx` の `FilterSection` — `loadAllTags` で全タグ（id / name / noteCount）を取得して `FilterBar` に渡している
  - `app/components/note/list/__tests__/FilterBar.test.tsx` — 楽観反映・各ポップオーバー・クリア × のテストが揃っている
  - モック: `spec/design/pages/P10-home.html` L1105–1110 / `spec/design/pages/mobile/P10-home.html` L1038–1043（いずれも origin/main。`+` SVG 11px + 「タグ」、デスクトップのみ title、`aria-haspopup="listbox"` / `aria-label="タグで絞り込み"`）
  - ADR 原典: `.issue/626/adr.md` ADR-008（git 履歴 199ad59e。並び順・役割区別・a11y 契約・44px 当たり判定の要求）
- あるべきアーキテクチャ: 純フロントエンド変更。CLAUDE.md の styling 規約（utility-first、`data-*` 状態、定数文字列へのホイスト）、共通ポップオーバー部品（`Popover` + `useRovingMenu`）の再利用、`useOptimistic` + transition によるフィルタ反映が確立済みパターン
- 既存実装の状態: あるべき姿と一致。FilterBar の「未設定フィルタ = 破線ゴーストチップでピッカーを開く」語彙（期間 / 公開状態 / 内部リンク参照）に「+ タグ」を加えるだけで、新規部品・新トークンは不要
- 依存関係: FilterBar のみ。`Popover` / `useRovingMenu` / styles は変更なしで再利用。バックエンド・ルーティング・スキーマへの影響なし
- 注意: 現在のブランチ（issue/619）には #649 の成果（`filterClearX` 等）とモックの「+ タグ」追記が含まれていない。**実装ブランチは origin/main（PR #659 マージ済み）から切ること**

## 設計

### ドメインモデルへの影響
なし。タグの絞り込みは既存の URL search（`tagNames`）契約のままで、新しい概念は増えない。

### ユースケース / アプリケーションロジック
なし。全タグは既存の `loadAllTags` で取得済み。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
- FilterBar に `TagPickerPopover` コンポーネント（同ファイル内のローカルコンポーネント。`DatePopover` / `VisibilityPopover` と同格）を追加する
  - トリガー: `filterChipGhost` + lucide `Plus`（`size-[11px]`、`strokeWidth={2}`、`aria-hidden`）+「タグ」。`aria-haspopup="listbox"`（`Popover` の `haspopup="listbox"` が付与）、`label="タグで絞り込み"`、`title` 併記
  - パネル: `Popover` の listbox モード。`aria-multiselectable="true"` を `panelRef` 経由ではなく `Popover` 直下のオプション側でなく — `Popover.tsx` の listbox ブランチは `role="listbox"` を自前で描画するため、`aria-multiselectable` を渡せるよう `Popover` に任意 prop を 1 つ追加する（ADR-001）。パネルクラスは `FILTER_POPOVER_PANEL` を基礎に `max-h-[min(60vh,400px)] overflow-y-auto`（ViewSwitcher と同じ上限）を重ねる。< sm では `popoverSheetPanel` 由来のボトムシートになる
  - オプション: 全タグを `role="option"` + `aria-selected={selected}` + `data-active` で描画。表示は `#name` + 件数バッジ（既存タグチップと同じ語彙）。クリックで `toggleTag(tag.name)`（既存の楽観反映をそのまま使う）。マルチセレクトのため選択後も閉じない
  - ロービング: `useRovingMenu({ itemRole: "option", initialIndex: 0 })`。Enter/Space はネイティブ button のクリックに任せる（ViewSwitcher と同様）
  - 相互排他: `openPopover` の union を `"date" | "visibility" | "tag" | null` に拡張
  - 配置: タグチップ群の `</div>` 直後（もっと見るトグルの後）・`DatePopover` の前。`tags.length > 0` のときのみ描画
- 状態スタイルは `data-*` + Tailwind variant、新規 CSS なし。オプション行は ViewSwitcher の `OPTION_ITEM`（focus-visible アウトライン込み）と同形の文字列を FilterBar 側に定義（既存 `VISIBILITY_OPTION_ITEM` と並置。共通化は #649 ADR-011 の共通課題に委ねる）

## 実装ステップ

### 1. ブランチ準備
- **対象ファイル:** なし
- **変更内容:** origin/main（PR #659 マージ後）から `issue/658/p10-filterbar-tag-picker` を切る
- **理由:** 現ブランチには #649 の FilterBar 変更とモックの「+ タグ」追記が含まれていないため

### 2. Popover に `aria-multiselectable` サポートを追加
- **対象ファイル:** `app/components/common/Popover.tsx`（必要なら `app/components/common/__tests__/Popover.test.tsx`）
- **変更内容:** listbox ブランチの `role="listbox"` 要素に伝播する任意 prop `multiselectable?: boolean` を追加し、`aria-multiselectable` として描画（未指定時は属性なし = 既存 ViewSwitcher 非破壊）
- **理由:** タグピッカーは複数選択 listbox であり、WAI-ARIA 上 `aria-multiselectable="true"` が必要。listbox の role 描画は `Popover` 内部にあるため外から付与できない

### 3. 「+ タグ」ゴーストチップトリガーの追加
- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** `openPopover` union に `"tag"` を追加し、タグチップ群直後・`DatePopover` 前に `TagPickerPopover` を配置。トリガーは `filterChipGhost` + `Plus` アイコン + 「タグ」、`label="タグで絞り込み"` / `title="タグで絞り込み"`。`tags.length === 0` では非描画
- **理由:** AC-1〜AC-3, AC-8, AC-9。`filterChipGhost` は `TOUCH_TARGET` 込みで ADR-008 の 44px 当たり判定要求を満たす

### 4. タグピッカー listbox パネルの実装
- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** `TagPickerPopover`（props: `tags`, `selected: ReadonlySet<string>`, `open`, `onOpenChange`, `onToggle`）を実装。`Popover haspopup="listbox" multiselectable` + `useRovingMenu({ itemRole: "option" })`、パネルは `FILTER_POPOVER_PANEL` + `max-h` + `overflow-y-auto`、オプションは `#name` + 件数 + `aria-selected` / `data-active` / 選択時 ✓（VisibilityPopover の語彙踏襲）。クリックで `onToggle`（= 既存 `toggleTag`）、閉じない。listbox ブランチは option 上の mousedown を preventDefault するためクリックで roving の `activeIndex` が動かず、開いたままのマルチセレクトでは「option N をクリック → ArrowDown」で先頭付近へ飛ぶ不整合が露出する — option のクリックハンドラで該当 index に `activeIndex` を同期する
- **理由:** AC-4〜AC-7。既存部品の再利用で、新規 CSS・新トークンなしに ADR-008 の契約を満たす。`activeIndex` 同期は単一選択（選択即クローズ）の ViewSwitcher では露出しなかった、本ピッカー固有の対処

### 5. ユニットテスト
- **対象ファイル:** `app/components/note/list/__tests__/FilterBar.test.tsx`
- **変更内容:** describe「FilterBar — + タグ TagPicker (Issue #658 / #626 ADR-008)」を追加。(a) チップの存在・並び順（タグ群の後・期間の前）・`aria-haspopup="listbox"` / `aria-label` / `title`、(b) 開くと `role="listbox"`（`aria-multiselectable="true"`）+ 全タグの `role="option"` と `aria-selected`、(c) オプションクリックでナビゲーションが発火し楽観的に `aria-selected` が反転・パネルは開いたまま、(d) Escape で閉じてトリガーへフォーカス復帰、(e) 「+ タグ」を開くと期間ポップオーバーが閉じる、(f) `tags=[]` で非描画、(g) パネルが `FILTER_POPOVER_PANEL`（= `popoverSheetPanel` ベース）のクラスを持つ構造アサーション（AC-7 の自動検証。シート化 CSS 自体は jsdom で再現できないため、シート化するスタイル基盤に乗っていることを担保）、(h) option クリック後に ArrowDown で次の option へフォーカスが移る（`activeIndex` 同期の検証）。`Popover.test.tsx` には multiselectable 属性の有無のテストを追加
- **理由:** AC-10。既存テストの設備（router モック等）をそのまま使う

### 6. 手動テスト手順の追記
- **対象ファイル:** `spec/manual-tests/browse.md`
- **変更内容:** 「+ タグ」チップからのタグ絞り込み（デスクトップ: ポップオーバー、モバイル: ボトムシート、キーボード操作）の手順を追記。VISIBLE_TAG_LIMIT 超のタグをピッカーで選択した場合に対応チップがバーに現れない既知の制限（解除は「もっと見る」展開・ピッカー再オープン・クリア × のいずれか）も明記する
- **理由:** AC-11。#649 と同様、デザイン追従の動作確認を手順化しておく

### 7. 品質ゲート
- **対象ファイル:** なし
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit`
- **理由:** CLAUDE.md の必須チェック

## 設計判断

- ADR-001: ピッカーは検索入力なしのスクロール式マルチセレクト listbox（`Popover` listbox モード + `aria-multiselectable`）。combobox 化は見送り — 詳細は `.issue/658/adr.md`
- ADR-002: 既存「もっと見る (+N)」トグルは残置し、「+ タグ」と併存させる — 詳細は `.issue/658/adr.md`
- ADR-003: モバイルのボトムシートは `popoverSheetPanel`（#588 ADR-003 の既存パターン）をそのまま使い、専用シート部品は作らない — 詳細は `.issue/658/adr.md`
- ADR-004: `title` はデバイスを問わず常時併記する（#626 ADR-008・モバイルモックの「title はデスクトップのみ」からの意図的逸脱。#649 のクリア × の前例準拠） — 詳細は `.issue/658/adr.md`

## リスクと注意点

- 現ブランチが main より古い（#649 未取り込み）。main から切り直さないと FilterBar が衝突する
- `useRovingMenu` はマルチセレクト listbox での「選択してもパネルを閉じない」用途を想定済みか要確認（フォーカスがクリックした option に残るか）。クリック時の `activeIndex` 同期はステップ4 で対処し、ステップ5 (h) で検証する
- タグ件数が多い場合のパネル高 — `max-h-[min(60vh,400px)] + overflow-y-auto` で抑制するが、#649 R4 で対応した「listbox パネル上の mousedown（スクロールバー）で閉じない」ガードが効いていることをモバイル/Firefox で確認する
- 楽観反映中（transition pending）に連打しても既存 `run()` 規約上ドロップされない設計だが、listbox 内トグルでも同じであることをテストで担保する
- `aria-pressed`（既存タグチップ）と `aria-selected`（option）で同じタグの選択状態を二重表現することになるが、role が異なるためそれぞれの規約に従うのが正

## テスト方針

- ユニット（vitest + testing-library）: ステップ5 の (a)〜(h)。既存 FilterBar.test.tsx の router モック・popover テスト設備を再利用
- `Popover.test.tsx`: `multiselectable` prop の属性描画（true で `aria-multiselectable="true"`、未指定で属性なし）
- 手動（`spec/manual-tests/browse.md` 追記分）: デスクトップでのポップオーバー表示位置・title ツールチップ、モバイル幅でのボトムシート表示・44px 当たり判定、キーボード一巡（Tab → Enter → 矢印 → Space → Escape）、VISIBLE_TAG_LIMIT 超タグ選択時の既知の制限の確認

## レビュー履歴

### 1周目
両視点とも問題点ゼロ。改善提案5件を反映して終了。

**取り込んだ改善提案**:
- coverage S-001: title 常時併記が #626 ADR-008 原文・モバイルモックと字面上異なる点を、#649 前例準拠の意図的逸脱として ADR-004 に記録。AC-3 の由来にも紐づけた
- coverage S-002: AC-7 のボトムシートについて、パネルが `FILTER_POPOVER_PANEL`（= `popoverSheetPanel` ベース）のクラスを持つ構造アサーションをステップ5 (g) に追加し、AC-10 に検証手段を明記
- arch-risk S-001: VISIBLE_TAG_LIMIT 超のタグをピッカーで選択した際にチップがバーに見えないエッジケースを、既知の制限として見送る判断を ADR-002 とスコープ外に明記し、手動テスト（ステップ6）にも記載することにした
- arch-risk S-002: マウスクリック後の roving `activeIndex` 不整合への対処（クリック時に `activeIndex` を同期）をステップ4 に、その検証をステップ5 (h) に落とした
- arch-risk S-003: `NotePickerDialog` との相互排他は既存挙動の踏襲として対象外である旨をスコープ外セクションに明記

**見送った提案とその理由**:
- なし
