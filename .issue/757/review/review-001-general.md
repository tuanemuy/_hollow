# General Review — PR #758 (Issue #757)

対象: `spec/design/` モック2ファイルを #754 の集約フィルター（トリガー + ボトムシート）実装へ同期するドキュメント系 PR。
- `spec/design/pages/mobile/P10-home.html`
- `spec/design/pages/P10-home.html`
- 付随ドキュメント（`.issue/757/{plan,testing,manual-test/result}.md`）

正とした実装: `app/components/note/list/FilterBar.tsx` / `app/components/note/list/styles.ts` / `app/components/common/styles.ts`。

## General Review

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** AC-1〜AC-5 すべて満たしている。
  - AC-1: mobile モックは横スクロール（`overflow-x: auto` + `flex-wrap: nowrap` の `.filter-bar`/`.filter-tags`）を完全撤去し、`.mobile-filter-trigger`（SlidersHorizontal + 「絞り込み」+ `.mobile-filter-count` 件数バッジ2 + `.filter-clear-x`）へ置換（`mobile/P10-home.html:1207`〜）。
  - AC-2: ボトムシート showcase（`.filter-sheet-stage`）にタグ（折り返しチップ）/ 期間（プリセット3列グリッド + date入力 + 期間クリア）/ 公開状態（`<fieldset>` ラジオ群）/ 内部リンク参照（「ノートを選択」ゴースト）/ 全クリアを網羅（`mobile/P10-home.html:1413`〜）。
  - AC-3: desktop モックは base で `.mobile-filter-bar { display: none }`、`@media (max-width: 640px)` で `.filter-bar { display: none }` + `.mobile-filter-bar { display: flex }`。既存 `.filter-bar` base ルール（`P10-home.html:593`）は無改変でデスクトップ不変。
  - AC-4: 両ファイルのコメントに「#749 ADR-001 の横スクローラ前提を #754 が集約シート方式へ更新」を明記（`mobile/P10-home.html:583`、`P10-home.html:180,234,243`）。
  - AC-5: 使用 CSS 変数（`--radius-md/lg/pill/full` / `--shadow-md` / `--color-success/warning/ink*/surface*/hairline*/bg` / `--weight-medium` / `--text-lg/sm/xs` / `--space-*` / `--transition-bg/color`）は当該ファイルで全て定義済みと確認。新トークン追加なし。

- **[N-002]** 実装忠実性が高い。a11y 契約が実装どおり: トリガーは `aria-haspopup="dialog"` + `aria-expanded` のみで `aria-pressed`/`aria-checked` を付けていない（`FilterBar.tsx:470` / mock `mobile:1531`,`P10-home:259`）。件数バッジは `aria-hidden="true"` + 隣接 `.sr-only` で「（適用中のフィルタ N 件）」を補足（実装 `FilterBar.tsx:481-487` と一致）。公開状態はネイティブ `<fieldset>` + ラジオで、デスクトップ Popover の `menuitemradio`/`listbox` を流用していない（実装 `FilterBar.tsx:567-594` と一致）。内部リンク参照は「ノートを選択」ゴーストが `aria-haspopup="dialog"` で別動線（シートを閉じて NotePickerDialog を開く / ネスト Dialog なし）— 実装 `FilterBar.tsx:617-633` と一致。

- **[N-003]** デスクトップ不変が担保されている。追加 CSS は `.mobile-filter-bar`/`.mobile-filter-trigger`/`.mobile-filter-count`/`.sr-only`（いずれも base `display:none` 含む新規クラス）と `@media (max-width: 640px)` 内の2行のみ。既存 `.filter-bar` の desktop ルール・寸法には未介入。desktop モックの `filter-sheet` 参照2件はいずれも mobile モックを指すコメント文（CSS/markup 実体なし）で、シート本体は desktop に漏れていない。

- **[N-004]** HTML 妥当性 OK。`section`/`fieldset`/`div` の開閉バランスは両ファイルとも一致（mobile: section 3/3・fieldset 1/1・div 100/100、desktop: div 103/103）。`<fieldset class="filter-sheet-section"><legend class="filter-sheet-label">公開状態</legend>` の構造は適切。`label`/`for`/`id` 対応も `sheetFrom`/`sheetTo` の date 入力で正しく取れている。`role="dialog" aria-modal="true" aria-labelledby="filterSheetTitle"` と `<h2 id="filterSheetTitle">` の対応も整合。

- **[N-005]** モック内のクラス温存/削除が plan のリスク管理どおり。mobile モックは横スクロール固有部（`.filter-bar` の `overflow-x`/`nowrap`、`.filter-tags`）を CSS・markup の両方から完全削除（孤立 CSS なし）。シートで再利用する `.filter-chip`/`.filter-chip-ghost`/`.chip-count`/`.chip-caret`/`.filter-clear-x` は温存し、実際にシート showcase で参照されている。新規 `.filter-sheet-*` クラスも全て markup から参照済みで、孤立クラスは検出されなかった。

- **[N-006]** スコープ遵守。変更は spec モック2ファイルと `.issue/757/` のドキュメントのみ。アプリ実装コード・他モック（`mobile/P10-filterbar-popovers.html` 等）は未変更で、plan.md のスコープ（2ファイル限定・デスクトップ不変・他モック未変更）に一致。

- **[N-007]** （参考・非問題）シート内「ノートを選択」ゴーストの `<span class="chip-caret">▾</span>` は `.filter-chip-ghost` の子だが、CSS 規則は `.filter-chip .chip-caret`（`.filter-chip` 子孫のみ）にスコープされており、ゴースト側のキャレットには `font-size:10px; opacity:0.6` が当たらない。ただしこれは**既存パターンの踏襲**で、desktop モックの従来ゴーストチップ（`P10-home.html:1163-1165` の期間/公開状態/内部リンク参照）でも同じ書き方をしており本 PR の新規回帰ではない。showcase 上の見栄えへの影響も軽微なため Blocker/Warning にはしない。実装側（`filterChipCaret` を className で直接付与）では問題にならない。

- **[N-008]** （参考・非問題）`.filter-sheet-title` は `margin-bottom: var(--space-5)`(20px) だが、実装は `dialogTitle`(`mb-4`=16px) + `pr-10`。`padding-right: 40px` ↔ `pr-10` は一致。見出し下マージンの 16px↔20px の僅差は showcase の許容範囲で、実装が `dialogTitle` を正としているため実害なし。
