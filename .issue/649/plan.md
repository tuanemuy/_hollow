# 実装計画 — Issue #649: #626 確定デザインの実装反映 — P10 ツールバー（segmented 降格・CTA ヘッダー集約）と P30 系 segmented の追従

**Issue:** #649
**作成日:** 2026-06-12
**複雑度:** 中〜大規模

---

## 目的

#626（PR #648、R2/R3 リファイン込み）で確定した P10 ホーム上部のデザイン — 見出し = ビュー切り替えトリガー（ADR-004）、選択/ビュー保存のアイコンのみ化（ADR-005）、「すべてクリア」のチップ末尾 × 化（ADR-006）、件数とツールバー右群の1行統合（ADR-007）、segmented の右端移動 + ink 濃度差 active（ADR-001）、CTA のヘッダー集約（ADR-002）— を実装に反映し、P30 系モックの表示モード segmented を確定表現に追従させる。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `NoteListToolbar` から新規作成 / アップロード CTA が削除されている（CTA はヘッダーのみ、#628 ADR-001/003 のまま） | Issue 本文 / #626 ADR-002 | 4 |
| AC-2 | 保存ビュー `<select>` が廃止され、ページ見出しがビュー切り替えトリガーになっている。見出しには現在のビュー名（既定「すべてのノート」、保存ビュー適用時はそのビュー名、検索時は「「q」の検索結果」 — 検索時にビュー名より検索文言を優先する規則はモック未定義のため本計画で確定、`.issue/649/adr.md` ADR-005）を表示し、クリックでビュー一覧（すべてのノート / 各保存ビュー）のドロップダウンが開く。選択時の遷移挙動は既存 `onSelectView` と同一（viewId 選択時は `display` を落として #219 のリダイレクト正規化に乗せる / 「すべてのノート」選択時は display のみ保持） | Issue コメント / ADR-004 | 2, 3, 5 |
| AC-3 | 見出しトリガーの a11y: `aria-haspopup="listbox"` + `aria-expanded`、`aria-label` に現在のビュー名を含む（例「ビューを切り替え: 現在 すべてのノート」）、`title` 併記、モバイルで min-height 44px | ADR-004 | 3 |
| AC-4 | 「選択」「ビューとして保存」がアイコンのみ（デスクトップ 36px 角の `pill-btn ghost icon`、モバイルは 44px タッチ床維持）。`aria-label` 必須・`title` 併記。「選択」は `aria-pressed` 維持 | Issue コメント / ADR-005 | 4 |
| AC-5 | 表示モード segmented がツールバー右端・アイコンのみ（13px = `--icon-xs`）・ボタン 32×28px（デスクトップ）/ 36×32px（モバイル）。active は ink 濃度差（非アクティブ `text-ink-tertiary` / アクティブ `text-ink`）で白カード + shadow なし。`role="tablist"` / `role="tab"` / `aria-selected` 契約維持 + 各ボタンに `aria-label`（リスト / タイル / カレンダー）と `title` | Issue 本文 / ADR-001 | 1, 4 |
| AC-6 | 件数サブタイトル（「N 件のノート」）とツールバー右群（選択 / ビュー保存 / segmented）が1行（左 = 件数、右 = 操作群）に統合され、狭幅では flex-wrap で折り返す | Issue コメント / ADR-007 | 4, 5 |
| AC-7 | FilterBar の「すべてクリア」pill が廃止され、チップ列末尾に円形 ×（デスクトップ 28px / モバイル 32px、ink-tertiary、hover で surface + ink）が置かれる。フィルタ未適用時は非表示。`aria-label="フィルタをすべてクリア"` + `title` | Issue コメント / ADR-006 | 6 |
| AC-8 | モバイルのタップターゲット: segmented 各ボタン・チップ末尾 × は見た目寸法を維持したまま当たり判定が 44×44px 相当（padding / 擬似要素等） | Issue 本文 / ADR-001・006 | 1, 6 |
| AC-9 | アイコンのみ化した全コントロール（segmented ボタン・選択・ビュー保存・クリア ×・見出しトリガー）に `focus-visible` のフォーカスリングが明示されている | Issue 本文 | 1, 3, 4, 6 |
| AC-10 | `ToolbarSkeleton` が確定スケルトンモック（見出しバー + 件数ライン/アイコンボタン×2 + segmented プレースホルダの1行）に追従している | Issue 本文 / ADR-007・`P10-home-skeleton.html` | 7 |
| AC-11 | 既存の aria 契約テストが新構造で維持・更新され、`pnpm test:unit` / `pnpm typecheck` / `pnpm lint` が通る | Issue 本文 | 8 |
| AC-12 | `spec/design/pages/P30-user-public-top.html` / `mobile/P30-user-public-top.html` の表示モード segmented が確定表現（アイコンのみ・ink 濃度差・aria-label、デスクトップは title 併記）に追従している。非表示モード用途の `.segmented`（P15/P16/P18 等）は変更しない | Issue 本文 / ADR-001 適用範囲 | 9 |

## スコープ

### 含まれないもの

- **P30 実装（`PublicTopControls.tsx` / `public/styles.ts` の `SEGMENTED*`）の追従** — #619「P30 をモックに完全一致させる」が OPEN であり、P30 はソート・期間フィルタ等を含むモック完全一致をまとめて扱う。本 Issue では正モックのみ確定表現へ更新し、実装追従は #619 に委ねる（#619 に追従点をコメントで残す）。Issue 本文の「#619 との関係を確認のうえ調整」に対応する判断。
- **「+ タグ」ゴーストチップ（#626 ADR-008）の実装** — 本 Issue の対象は ADR-001〜007。ADR-008 自体が「ピッカー UI の設計は実装フォローアップに委ねる」としており、Issue 本文・コメントにも要件として含まれていない。別 Issue として起票するのが妥当。
- **表示モード前回値の永続化（#626 ADR-003）** — Proposed のままで本 Issue スコープ外（#219 loaderDeps 設計と関わるためフォローアップ）。
- **ビュー切り替えドロップダウンの開状態のピクセルパーフェクト** — 正モックは閉状態のみ。開状態は drafts の参考フレームと既存ポップオーバー部品（`popoverSheetPanel` 等）の流儀に従う。

## 調査結果

- 関連ファイル:
  - `app/components/note/HomePage.tsx` — 見出し `<h1>`（同期描画）、ToolbarSection（savedViews を await）、FilterSection、NotesSection（件数 `<p>` + 一覧）の Suspense 構成。
  - `app/components/note/list/NoteListToolbar.tsx` — 現状: 左 = DisplayModeSwitch + 保存ビュー select、右 = 選択 / ビュー保存（アイコン+ラベル）+ 新規作成 / アップロード CTA（`max-lg:hidden`）。`onSelectView` に #215/#219 のナビゲーション規約が実装済み。
  - `app/components/note/list/DisplayModeSwitch.tsx` — アイコン+ラベル、`role="tablist"`/`aria-selected`。#219 の URL-only ナビゲーション。
  - `app/components/note/list/styles.ts` — `DISPLAY_SEGMENTED` / `DISPLAY_SEGMENTED_BTN`（白カード active）、`filterChip*`、`filterBar`。
  - `app/components/note/list/FilterBar.tsx` — `clearAll`（すべてクリア pill、`hasAnyFilter` 時のみ表示）。
  - `app/components/note/list/skeletons.tsx` — `ToolbarSkeleton`（旧レイアウト: select バー + CTA pill）。
  - `app/components/note/list/listSelectors.ts` — `homeHeadingText(q)`（viewId 非対応）。
  - `app/components/common/Popover.tsx` / `usePopover.ts`（`PopupRole = "dialog" | "menu"` — `"listbox"` なし）/ `useRovingMenu.ts`（`itemRole` 指定可）。
  - `app/components/common/styles.ts` — `pillBtn` / `pillBtnGhost` / `pillBtnIcon`（40px 角・44px 床）、`TOUCH_TARGET(_SQUARE)`。
  - テスト: `__tests__/NoteListToolbar.test.tsx`（#382 CTA アイコンのみ契約 — CTA 削除で前提が消える）、`DisplayModeSwitch.test.tsx`（`textContent` でタブ特定 — ラベル削除で壊れる）、`FilterBar.test.tsx`、`listSelectors.test.ts`。
- あるべきアーキテクチャ: 確定モック `spec/design/pages/P10-home.html` / `mobile/P10-home.html` / `P10-home-skeleton.html` と `.issue/626/adr.md`（ADR-001〜008）が正。スタイルは utility-first（`styles.ts` の module-scope 定数 + `data-*` バリアント）。
- 既存実装の状態: P10 上部は R0（#620 時点）の構成のままで、確定モックと全面的に乖離。`SaveViewDialog` / `SelectionContext` / `homeSearchUpdater` 等の挙動ロジックはそのまま再利用できる。
- 依存関係: ヘッダー CTA（#628）は実装済み（CLOSED）なのでツールバー CTA 削除で重複が解消されるだけ。P30 実装は #619（OPEN）が引き取る。

## 設計

### ドメインモデルへの影響
なし（純粋な presentation/UI 変更。保存ビューの取得は既存の `loadSavedViewsByKind` をそのまま使う）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

**Suspense 境界の再構成（HomePage）** — ADR-004 で見出しが「現在のビュー名」を表示するため、見出しは savedViews（viewId → ビュー名解決）に依存する。スケルトンモックも「見出し = ビュー名取得に依存するためスケルトン」と明記している。よって:

- 見出し（ViewSwitcher トリガー）を ToolbarSection 相当の async 境界の中へ移す。境界は「見出し + 件数/操作の1行（page-meta-row）」をまとめて持ち、フォールバックは新 `ToolbarSkeleton`（見出しバー + meta-row プレースホルダ）。
- 件数（`owned.count`）は現在 NotesSection にあるが、meta-row の左スロットに移す。`loadOwnedNotes` は `cache(serverData(...))` で同一レンダー内デデュープされるが、React の `cache` のメモ化キーは引数の **参照同一性**（`Object.is`）であり、構造的に等しい別オブジェクトリテラルではキャッシュミスして二重クエリになる。よって `OwnedNotesQuery` オブジェクトは同期の `HomePage` 本体で **1回だけ構築し、同一参照を meta-row 境界と NotesSection の両方へ props で渡す**（現在 NotesSection 内にあるクエリ組み立てを HomePage へ引き上げる）。境界の分割粒度は実装時に2案から選ぶ（詳細 `.issue/649/adr.md` ADR-002）。推奨: 見出し+meta-row を1境界にし、その中で `loadSavedViewsByKind` と `loadOwnedNotes(sharedQuery)` を `Promise.all`。
- 検索中（`isSearchActive(q)`）は見出しテキストを従来どおり「「q」の検索結果」とし、トリガー機能（ビュー選択で q を含まない検索へ遷移）は維持する。このとき `aria-label` を「ビューを切り替え: 現在 {ビュー名}」のままにすると可視テキスト（検索結果）と乖離するため、合成規則を「検索時は `aria-label="ビューを切り替え"`（「現在 …」を付けない）/ 非検索時は `aria-label="ビューを切り替え: 現在 {ビュー名}"`」と確定し、`listSelectors.ts` のセレクタ仕様として実装・単体テストする（ADR-005）。

**ViewSwitcher（新規クライアントコンポーネント）** — `app/components/note/list/ViewSwitcher.tsx`。`<h1>` 内のトリガーボタン + ビュー一覧ドロップダウン（listbox）。ナビゲーションは `NoteListToolbar` の `onSelectView` をそのまま移植（#215/#219 コメント込み）。`PopupRole` に `"listbox"` を追加し共通 `Popover` を再利用、項目は `role="option"` + `aria-selected`、`useRovingMenu`（`itemRole: "option"`）でキーボード操作（ADR-001 参照）。savedViews が 0 件でもトリガーは表示する（「すべてのノート」1 項目の listbox。現行は select 自体を隠していたが、見出し=トリガーの恒常性を優先。実装時に隠す判断をしてもよいが、その場合も見出しテキストは維持）。

**NoteListToolbar の再構成** — props から `savedViews` を外し、`count` を受ける形に変更（または meta-row コンテナを HomePage 側に持ち、左スロット=件数 / 右スロット=既存 Toolbar 残部とする）。CTA 2 つと select を削除し、右群 = 選択（`aria-pressed` 維持）/ ビュー保存 / DisplayModeSwitch の順。アイコンボタンは `pillBtn + pillBtnGhost + pillBtnIcon` をベースに、デスクトップ 36px 角へ縮める override（`sm:h-9 sm:min-h-9 data-[icon]:sm:w-9` 相当の定数を `note/list/styles.ts` に追加。`pillBtnIcon` の `max-sm:min-w-[44px]` + `TOUCH_TARGET` でモバイル 44px 床は既に立つ）。

**DisplayModeSwitch / styles.ts** — ラベル `<span>` を削除しアイコンのみ化。`LABELS` は `aria-label` / `title` に転用。`DISPLAY_SEGMENTED_BTN` を「`w-8 h-7 max-sm:w-9 max-sm:h-8`（32×28 / 36×32）・`justify-center`・`text-ink-tertiary` → `hover:text-ink-secondary` → `data-[active]:text-ink`、白カード/shadow 廃止」へ書き換え。44px 当たり判定は `relative` + `after:absolute after:-inset-y-2 after:-inset-x-1`（max-sm 限定、見た目不変）等の擬似要素拡張で確保。`focus-visible:outline-2 focus-visible:outline-accent`（既存 `dialogCloseButton` と同系）を明示。

**FilterBar** — 末尾の「すべてクリア」pill を、チップ列末尾の円形 × ボタン（新定数 `filterClearX`: `w-7 h-7 max-sm:w-8 max-sm:h-8 rounded-full text-ink-tertiary hover:bg-surface hover:text-ink` + focus-visible リング + 擬似要素で 44px 当たり判定）に置換。表示条件（`hasAnyFilter`）と `clearAll` ロジックは既存のまま。

**title の扱い** — 「デスクトップのみ必須・モバイル省略可」は禁止ではないため、属性は全環境で常時レンダーする（メディアクエリで属性を出し分ける合理的手段がなく、タッチ環境の title は無害。ADR-003 参照）。

## 実装ステップ

### 1. segmented スタイルの確定表現化（styles.ts + DisplayModeSwitch）

- **対象ファイル:** `app/components/note/list/styles.ts`, `app/components/note/list/DisplayModeSwitch.tsx`
- **変更内容:** `DISPLAY_SEGMENTED_BTN` をアイコンのみ・固定寸法（デスクトップ 32×28 / モバイル 36×32）・ink 濃度差 active・focus-visible リング・max-sm の擬似要素 44px 当たり判定へ書き換え。`DisplayModeSwitch` は可視ラベルを削除し各 `role="tab"` ボタンへ `aria-label={LABELS[mode]}` / `title={LABELS[mode]}` を付与。`role="tablist"` / `aria-selected` / ナビゲーション規約（replace, search updater）は不変。コメント（#620 複製の注記）を #626 ADR-001 参照へ更新。
- **理由:** AC-5 / AC-8 / AC-9。

### 2. `PopupRole` に `"listbox"` を追加

- **対象ファイル:** `app/components/common/usePopover.ts`, `app/components/common/Popover.tsx`, `app/components/common/useRovingMenu.ts`
- **変更内容:** `PopupRole = "dialog" | "menu" | "listbox"` へ拡張。`Popover.tsx` のパネル分岐は現状 `haspopup === "menu"` ? menu : dialog の二分岐なので、listbox 枝を追加して「`role="listbox"` パネル + `onMenuKeyDown` 配線 + menu 枝と同じ `onMouseDown` preventDefault（blur→close でクリックが落ちる Safari/Firefox 対策）」を持たせる。`useRovingMenu.ts` の `itemRole` 型（現状 `"menuitem" | "menuitemradio"`）へ `"option"` を追加。既存 dialog / menu 利用箇所の挙動は不変。
- **理由:** AC-3 の `aria-haspopup="listbox"` 契約をモック通りに満たすため（ADR-001）。

### 3. ViewSwitcher の新規作成と見出しの置き換え

- **対象ファイル:** `app/components/note/list/ViewSwitcher.tsx`（新規）、`app/components/note/list/listSelectors.ts`（見出しテキスト・aria-label 導出の viewId / q 対応）、`app/components/note/HomePage.tsx`
- **変更内容:** `<h1>` 内にモックの `.view-switcher` 相当のトリガー（ビュー名 + chevron(ink-tertiary・縦中央=items-center)、hover surface、`-ml` で左端を維持、`overflow-wrap:anywhere`、モバイル min-h-11、focus-visible リング、`aria-haspopup="listbox"` / `aria-expanded` / `aria-label`（非検索時「ビューを切り替え: 現在 {名前}」/ 検索時「ビューを切り替え」— ADR-005）/ `title`）を置く。ドロップダウンは「すべてのノート」+ savedViews の listbox（`role="option"` + `aria-selected`、roving focus）。選択時の遷移は既存 `onSelectView` ロジックを移植。見出しテキストは `viewId → ビュー名`（不在時フォールバック「すべてのノート」）と `isSearchActive(q)` の検索表示を合成するセレクタで導出。
- **理由:** AC-2 / AC-3 / AC-9（ADR-004）。

### 4. NoteListToolbar の再構成（CTA 削除・アイコンのみ化・右群整列）

- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`, `app/components/note/list/styles.ts`（36px 角 icon ボタン定数）, `app/components/common/styles.ts`（必要なら override 補助のみ）
- **変更内容:** 新規作成 `Link` / `UploadButton` / 保存ビュー select / `CTA_LABEL` を削除（`onSelectView` は ViewSwitcher へ移動済み）。残る右群は 選択（`aria-pressed`・`aria-label="選択モード"`・`title`）/ ビュー保存（`aria-label="ビューとして保存"`・`title`。disabled 条件と既存 title 文言は維持しつつ、disabled でないとき `title="ビューとして保存"`）/ `DisplayModeSwitch` の順でアイコンのみ。`SaveViewDialog` 連携は不変。古い `max-lg:hidden` コメント（#588/#628 経緯）は削除。
- **理由:** AC-1 / AC-4 / AC-5（配置）/ AC-9（ADR-002・005）。

### 5. HomePage の境界再構成（見出し async 化・件数とツールバーの1行統合）

- **対象ファイル:** `app/components/note/HomePage.tsx`
- **変更内容:** 同期 `<h1>` を撤去し、「見出し（ViewSwitcher）+ page-meta-row（左 = `{count} 件のノート`、右 = NoteListToolbar 右群）」を1つの async セクション（`Promise.all([loadSavedViewsByKind(...), loadOwnedNotes(sharedQuery)])`、フォールバック = 新 ToolbarSkeleton）として描画。`OwnedNotesQuery` は同期の `HomePage` 本体で1回だけ構築し（現在 NotesSection 内の組み立てを引き上げる）、**同一オブジェクト参照**を meta-row 境界と NotesSection の両方へ props で渡す — React `cache` のキーは参照同一性なので、これがデデュープ成立の条件（ADR-002）。NotesSection から件数 `<p>` を撤去（一覧と空状態のみ残す）。meta-row は `flex justify-between items-center flex-wrap`（モック `.page-meta-row`、`mb-[var(--space-5)]` 相当）。`SectionErrorBoundary` の section 名・resetKey 設計は踏襲。
- **理由:** AC-2 / AC-6（ADR-004・007、`.issue/649/adr.md` ADR-002）。

### 6. FilterBar — すべてクリア pill → チップ末尾 ×

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`, `app/components/note/list/styles.ts`
- **変更内容:** `hasAnyFilter` 時の `すべてクリア` pill（`ml-auto`）を削除し、チップ列の末尾（内部リンク参照トリガーの後）に `filterClearX` 定数による円形 ×（28px / max-sm 32px、`aria-label="フィルタをすべてクリア"`、`title` 併記、focus-visible リング、max-sm 擬似要素 44px 当たり判定）を追加。`clearAll` ロジック不変。
- **理由:** AC-7 / AC-8 / AC-9（ADR-006）。

### 7. skeletons.tsx の追従

- **対象ファイル:** `app/components/note/list/skeletons.tsx`
- **変更内容:** `ToolbarSkeleton` を skeleton モックへ追従: 見出しバー（h-[34px] w-[35%] rounded-md。現行 `ToolbarSkeleton` は「3つ目の『読み込み中』アナウンスを重ねない」意図で `aria-hidden` 装飾 — 境界再構成後にどの skeleton が `role="status"` を持つかを再設計し、アナウンスは1つに集約。NotesSection / FilterBar 側の既存 `role="status"` と重複・欠落しないこと）+ meta-row（左 = 件数ライン w-[110px]、右 = 36px 角 ×2（rounded-full）+ segmented プレースホルダ 104×32 rounded-[9px]）。CTA / select プレースホルダ削除。あわせて `NoteListSkeleton` 先頭の件数ラインプレースホルダ（`h-4 w-24 mb-7` バー）を削除する — 件数行が meta-row 側へ移るため、残すと読み込み中に「meta-row の件数プレースホルダ + 一覧スケルトンの件数バー」が二重表示になる。
- **理由:** AC-10（ADR-007・スケルトンモック）。

### 8. テスト更新

- **対象ファイル:** `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`, `__tests__/NoteListToolbar.test.tsx`, `__tests__/FilterBar.test.tsx`, `__tests__/listSelectors.test.ts`, `app/components/note/list/__tests__/ViewSwitcher.test.tsx`（新規）
- **変更内容:**
  - DisplayModeSwitch: タブ特定を `textContent` から `aria-label` ベースへ変更し、aria 契約（tablist / tab / aria-selected / aria-label / title、可視テキストなし）を固定するテストを追加。#219/#215 のナビゲーション契約テストは維持。
  - NoteListToolbar: #382 の CTA テストを「CTA が存在しないこと + 選択/ビュー保存がアイコンのみ（aria-label / title あり・可視テキストなし・aria-pressed）」の契約へ書き換え。
  - ViewSwitcher: トリガーの aria 契約（haspopup=listbox / expanded / aria-label にビュー名、検索時は「ビューを切り替え」のみ — ADR-005 の合成規則）と、選択時の navigate 契約（viewId 選択 → `{ viewId }` のみ / すべてのノート → display のみ保持）を移植・固定。
  - FilterBar: すべてクリアの取得を `aria-label="フィルタをすべてクリア"` に変更、未適用時に非表示の検証を維持。
  - listSelectors: 見出しテキスト・aria-label 導出（viewId / q の組み合わせ、ADR-005 の合成規則込み）の単体テスト。
  - スケルトン/ライブ領域: 境界再構成後の `role="status"` が重複・欠落しない（読み込みアナウンスが集約されている）ことを固定するテスト。
- **理由:** AC-11（既存契約の維持・更新）。

### 9. P30 系モックの segmented 追従

- **対象ファイル:** `spec/design/pages/P30-user-public-top.html`, `spec/design/pages/mobile/P30-user-public-top.html`
- **変更内容:** 表示モード `.segmented` の CSS（ボタン固定寸法・ink 濃度差・白カード/shadow 廃止）とマークアップ（ラベル削除・`role="tablist"`/`role="tab"`/`aria-selected` 付与・`aria-label`、デスクトップは `title` 併記）を P10 確定モックと同表現へ更新。位置（ツールバー左・ソートとの並び）は P30 既存のまま。P10 同様の出典コメント（#626 ADR-001 / 非表示モード用途は対象外）を残す。実装追従が #619 で行われる旨を #619 へコメント。
- **理由:** AC-12（#620 統一の維持、ADR-001 適用範囲）。

### 10. フォローアップ Issue 起票（「+ タグ」ゴーストチップ）

- **対象ファイル:** なし（GitHub Issue）
- **変更内容:** #626 ADR-008「+ タグ」ゴーストチップ（確定モックには `chip-add` あり / FilterBar 実装は未対応）の実装フォローアップ Issue を起票し、本 Issue と #626 ADR-008 を参照で紐づける。モックと実装の乖離が追跡されないままになるのを防ぐ。
- **理由:** スコープ外節の「別 Issue として起票」の実作業化（ステップ 9 の #619 コメントと対称）。

### 11. 仕上げ

- **対象ファイル:** 全変更ファイル
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`。
- **理由:** AC-11。

## 設計判断

詳細は `.issue/649/adr.md`:

- **ADR-001:** ビュー切り替えドロップダウンは共通 `Popover` を `PopupRole: "listbox"` 拡張で再利用（独自実装・menu 流用ではなく）。
- **ADR-002:** 見出し + 件数/操作行を1つの async Suspense 境界に統合。`loadOwnedNotes` のデデュープは React `cache` の参照同一性キーに依存するため、クエリオブジェクトは HomePage で1回構築し同一参照を両境界へ props で共有する。
- **ADR-003:** `title` 属性は全環境で常時レンダー（デバイス条件付き出し分けはしない）。
- **ADR-004:** P30 実装追従は #619 に委譲、本 Issue はモックのみ更新。
- **ADR-005:** 検索時（q 有効）の見出しは検索文言を優先（トリガー機能は維持）、aria-label は検索時「ビューを切り替え」/ 非検索時「ビューを切り替え: 現在 {ビュー名}」の合成規則で確定。

## リスクと注意点

- **境界再構成の波及:** 件数を NotesSection から meta-row へ移すと、ノート一覧読み込み中も件数行は先に出る（meta-row 境界が先に解決した場合）。React `cache` のメモ化キーは引数の参照同一性（`Object.is`）なので、meta-row と NotesSection で **同一のクエリオブジェクト参照を共有**しないと（構造的に等しくても）デデュープが効かず二重クエリになる点に注意（ADR-002）。
- **`ml-auto` 削除による FilterBar レイアウト:** すべてクリアの右寄せがなくなりチップ直後配置になる。モバイル横スクロール行（`max-sm:flex-nowrap`）での × の `shrink-0` を忘れない。
- **44px 当たり判定の重なり:** segmented ボタン（36px 幅）に 44px 当たり判定を張ると隣接ボタンと干渉する。擬似要素は縦方向を優先的に拡張し、横は控えめ（モック注記も「44×44px 相当」）。隣接要素のクリックを奪わないことを手動確認。
- **saved view 0 件時の見出しトリガー:** 現行 select は 0 件時に非表示だった。トリガー常時表示にする場合、項目1つの listbox の意味が薄い — 実装時にどちらでも見出しテキスト・a11y 契約は崩さないこと。
- **`PopupRole` 拡張の波及:** `usePopover` / `Popover` / `Menu` の型に触れるため、既存利用箇所（dialog / menu）の挙動を変えない最小差分にする。
- **テストの暗黙依存:** `DisplayModeSwitch.test.tsx` の `tabByLabel` は可視テキスト依存で必ず壊れる。`NoteListToolbar.test.tsx` は CTA 前提ごと書き換え。
- **検索結果ヘッダーとの合成:** `q` 有効時の見出し文言（検索結果）とビュー名表示の優先順位はモック未定義。検索表示を優先しトリガー機能は維持、aria-label は検索時「ビューを切り替え」のみ、で固定（ADR-005）。
- **境界統合によるエラー巻き込み:** meta-row 境界が `loadOwnedNotes` を await するため、一覧クエリの失敗が見出し + ViewSwitcher も `SectionErrorBoundary` フォールバックへ落とす（従来は見出し=同期で影響外）。ビュー切り替えは「条件を変えてエラーから脱出する」導線でもあるため UX 上の後退になりうるが、resetKey（URL 変更でリセット）による回復経路が残ることを根拠に許容（ADR-002 トレードオフ）。

## テスト方針

- 単体（happy-dom）: ステップ8 の各契約テスト（aria 契約・ナビゲーション契約・表示条件）。
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test:unit` を通す。
- 手動（ローカルサーバー、`docs/test.md` の流儀）:
  - デスクトップ/モバイル幅で P10 上部が確定モックと一致（見出しトリガー・1行統合・アイコンのみ右群・segmented 右端 ink 濃度差・クリア ×）。
  - ビュー切り替え: すべてのノート ⇄ 保存ビューの遷移と URL 正規化（#219 リダイレクト）が従来どおり。
  - キーボード操作: Tab で各コントロールに focus-visible リング、listbox の矢印キー移動・Enter 選択・Esc クローズ。
  - モバイル実機相当（DevTools touch）: segmented / クリア × のタップが 44px 相当で反応し、隣接要素を誤爆しない。
  - スケルトン: ネットワークスロットリングで ToolbarSkeleton が新レイアウトで出る。
  - P15/P16/P18 等の非表示モード `.segmented` が変わっていないこと（モック diff 確認）。

## レビュー履歴

### 1周目
**修正した点**:
- P-001 への対応: 「`cache(serverData(...))` は引数完全一致でデデュープされる」という前提を訂正。React `cache` のメモ化キーは参照同一性（`Object.is`）のため、`OwnedNotesQuery` を同期の HomePage 本体で1回だけ構築し、同一オブジェクト参照を meta-row 境界と NotesSection の両方へ props で渡す設計に変更（設計節・ステップ5・リスク節・設計判断サマリー・adr.md ADR-002 を修正）。

**取り込んだ改善提案**:
- coverage S-001: 「+ タグ」（#626 ADR-008）のフォローアップ Issue 起票をステップ 10 として追加。
- coverage S-002 / arch S-004: 検索時の見出し優先順位と aria-label 合成規則（検索時は「ビューを切り替え」のみ）を adr.md ADR-005 として明文化し、AC-2 注記・listSelectors の仕様・ステップ 8 のテスト対象に反映。
- arch S-001: ステップ 2 の対象に `useRovingMenu.ts`（`itemRole: "option"` 型拡張）と `Popover.tsx` の listbox 枝（`role="listbox"` パネル + `onMenuKeyDown` 配線 + `onMouseDown` preventDefault）を明記。
- arch S-002: 境界統合による一覧エラーの見出し巻き込みトレードオフを adr.md ADR-002 の Consequences とリスク節に明記（resetKey による回復経路を根拠に許容）。
- arch S-003: skeleton の `role="status"` 再設計（アナウンス集約・重複/欠落回避）をステップ 7 に具体化し、ステップ 8 にその固定テストを追加。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 2周目
問題点ゼロ。改善提案2件（S-001: `NoteListSkeleton` の件数バー削除をステップ7に追記 / S-002: 見出し async 化による `<h1>` 欠落の a11y 後退を ADR-002 のトレードオフに明記）を反映して終了。
