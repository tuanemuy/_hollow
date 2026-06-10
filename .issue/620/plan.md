# 実装計画 — Issue #620: design: ホーム画面（P10）のデスクトップ／モバイルのデザインモックが不整合（表示モードスイッチ等）

**Issue:** #620
**作成日:** 2026-06-10
**複雑度:** 中〜大規模

---

## 目的

ホーム画面（P10）の表示モードスイッチ・ツールバーボタン・保存ビュー select が、デスクトップモック（`P10-home.html`）とモバイルモック（`mobile/P10-home.html`）で別コンポーネント表現になっている不整合を解消する。**segmented control（P30 / モバイルを SSOT）に統一**し、デザインモックを直したうえで実装（`DisplayModeSwitch` / `NoteListToolbar`）とテストを追従させる。あわせて、本決定により上書きされる設計ドキュメント（`spec/design/index.md` §7.1 / `.issue/292/adr.md` ADR-002）の記述を更新する。

## スコープ

### 含まれるもの
1. デスクトップモック `spec/design/pages/P10-home.html` の表示モードスイッチを pill タブ群（`.display-tabs > .display-tab`）から segmented control（`.segmented > button`、白カード+shadow、アイコン付き）へ書き換え（マークアップ・CSS・437行付近のコメント）。
2. ツールバー「選択」「ビューとして保存」ボタンの表現を両モックで統一（**統一先は desktop = 実装と一致する `.pill-btn`**。mobile モックの `.tool-btn` ghost を `.pill-btn` トーンに寄せる。狭幅でのラベル畳みはレスポンシブとして許容）。実装は変更しない。
3. 保存ビュー select の **option 文言** を両モックで統一（後述の設計判断で「保存ビューを選択」に決定）。配置の左右差はレスポンシブ適応として許容（変更しない）。
4. 実装追従:
   - `app/components/note/list/DisplayModeSwitch.tsx` を segmented 表現に書き換え（pill → segmented、lucide アイコン付与）。
   - `app/components/note/list/NoteListToolbar.tsx` の保存ビュー select の option 文言を統一（「選択」「ビューとして保存」ボタンの扱いは設計判断セクション参照）。
5. segmented スタイル定数の配置（設計判断で決定 — `note/list/styles.ts` に P10 用 segmented 定数を新設）。
6. 設計ドキュメントの追従:
   - `spec/design/index.md` §7.1（行 157 / 170）の「`DisplayModeSwitch` はテキストのみ」という記述を、segmented + アイコン採用に合わせて更新。
   - `.issue/292/adr.md` ADR-002 の決定が本 Issue で上書きされた旨を、本 Issue の `adr.md` に記録（過去 ADR は改変せず追記方針で参照）。
7. テスト追従:
   - `DisplayModeSwitch.test.tsx`：`role="tab"` セレクタ・ラベル一致のテストが segmented 化後も通るか確認、必要なら追従。
   - `NoteListToolbar.test.tsx`：「選択」「ビューとして保存」の扱いを変える場合のみ追従。

### 含まれないもの
- レスポンシブ適応として妥当な差分（Issue 本文で明示されたスコープ外）: 新規作成/アップロード CTA の配置、一括操作バーの配置、ノート行の日付位置。
- 保存ビュー select の **左右の所属グループ位置**（デスクトップ=左 / モバイル=右）はレスポンシブ適応として許容、変更しない。
- 表示モード切替の**ナビゲーション挙動**（`replace: true` / URL-only swap / `loaderDeps` 除外）の変更。見た目（pill→segmented）のみの変更で、挙動は現状維持。
- P30 `PublicTopControls` / `public/styles.ts` の変更（既に SSOT なので触らない）。
- tag 系 `SEGMENTED`（`tag/styles.ts`、別値の独自定数）の統廃合。

## 実装ステップ

### 1. デスクトップモック `P10-home.html` の CSS を segmented に差し替え

- **対象ファイル:** `spec/design/pages/P10-home.html`（CSS: 436–474 行付近）
- **変更内容:**
  - `.display-tabs` / `.display-tab` の CSS ブロック（455–474 行）を削除し、P30 と同一の `.segmented` / `.segmented button` / `.segmented button.active` を追加する。値は P30 SSOT（`P30-user-public-top.html:385-406`）に合わせる:
    - `.segmented { background: var(--color-surface); border-radius: 9px; padding: 2px; display: inline-flex; }`
    - `.segmented button { padding: 6px 14px; border-radius: 7px; font-size: 13px; font-weight: var(--weight-medium); color: var(--color-ink); background: transparent; transition: all 0.18s ease; display: inline-flex; align-items: center; gap: 5px; }`
    - `.segmented button.active { background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04); }`
  - 「選択」「ビューとして保存」ボタンの `.pill-btn`（surface 塗り）CSS は**維持する**。設計判断セクション（ADR-003 改訂）の結論に従い、不整合 #2 は **mobile モックの `.tool-btn` を desktop の `.pill-btn` に寄せて統一**する方向に倒す（実装 `pillBtn` と一致させるため）。desktop の `.pill-btn` は触らない。
- **理由:** Issue の最重要決定（segmented 統一）を、デスクトップモックの真実として反映する。ツールバーボタンは現状 desktop モック=実装で一致しているため、desktop を ghost に変えると逆に乖離する（レビュー P-001）。

### 2. デスクトップモック `P10-home.html` のマークアップとコメントを修正

- **対象ファイル:** `spec/design/pages/P10-home.html`（マークアップ: 946–973 行、コメント: 436–439 / 454 行）
- **変更内容:**
  - 949–953 行の `.display-tabs > .display-tab`（3 つの pill）を、モバイル版（`mobile/P10-home.html:954-967`）と同じ `.segmented > button`（リスト/タイル/カレンダーの各 SVG アイコン + ラベル、`role="tab"`/`aria-selected`/`active` を維持）に書き換える。
  - 436–439 行のツールバーコメント「実装は表示モードをセグメントではなく pill-btn タブ群で表現し… (#292 ADR-002…)」と、454 行「表示モードタブ = pill-btn を data-primary でアクティブ表現」を、segmented 統一に合わせて修正する。`#292 ADR-002` 参照は本 Issue (#620) で上書きされた旨に差し替える。
  - 959–965 行の「選択」「ビューとして保存」の `.pill-btn` マークアップは**維持**（desktop は実装と一致しているため触らない）。統一は mobile モック側で行う（ステップ 3a 参照）。
  - 954–956 行の保存ビュー select の option 文言は「保存ビューを選択」のまま維持（モバイル側を合わせる）。
- **理由:** マークアップとコメントが旧方針（pill タブ群）のままだと、実装時に「どちらが正か」が再び曖昧になる。

### 3. モバイルモック `mobile/P10-home.html` の保存ビュー文言を統一

- **対象ファイル:** `spec/design/pages/mobile/P10-home.html`（978 行）
- **変更内容:** `<option>保存ビュー</option>` を `<option>保存ビューを選択</option>` に変更する。
- **理由:** option 文言は両モックで揃えるべき（Issue 不整合 #3）。文言の統一先は設計判断セクションの結論（実装の現行値「保存ビューを選択」に合わせ、差分を最小化）。

### 3a. モバイルモック `mobile/P10-home.html` のツールバーボタンを `.pill-btn` に統一

- **対象ファイル:** `spec/design/pages/mobile/P10-home.html`（「選択」「ビューとして保存」ボタン、970–976 行付近 + 対応 CSS）
- **変更内容:** モバイル版の `.tool-btn`（ghost）で表現された「選択」「ビューとして保存」を、desktop と同じ `.pill-btn`（surface 塗り）トーンに寄せる。ただし狭幅のため「ビューとして保存」のラベル畳み（アイコンのみ）はレスポンシブ適応として残してよい（実装の `max-sm:hidden` と一致）。
- **理由:** Issue 不整合 #2 を解消する。実装 `NoteListToolbar.tsx` は `pillBtn` を採用しており desktop モックと既に一致しているため、統一先は `.pill-btn` 側。mobile を寄せることでモック⇔実装⇔モックの三者が一致する（レビュー P-001）。実装側は変更不要（ADR-003）。

### 4. segmented スタイル定数を `note/list/styles.ts` に新設

- **対象ファイル:** `app/components/note/list/styles.ts`
- **変更内容:** P30 `public/styles.ts` の `SEGMENTED` / `SEGMENTED_BTN` と同値の定数を `note/list/styles.ts` に新設（複製）する。命名は用途を冠して **`DISPLAY_SEGMENTED` / `DISPLAY_SEGMENTED_BTN`** に確定する（`tag/styles.ts` の別値 `SEGMENTED` との grep ノイズ・import 混同を避ける）。`// = public/styles.ts SEGMENTED を複製（#620 ADR-001）` のコメントを添えて将来の同期漏れに気づけるようにする。値:
  - `"bg-surface rounded-[9px] p-[2px] inline-flex"`
  - `"px-[14px] py-[6px] rounded-[7px] text-[13px] font-medium text-ink bg-transparent inline-flex items-center gap-[5px] transition-all duration-[180ms] motion-reduce:transition-none data-[active]:bg-white data-[active]:shadow-xs"`
- **理由:** 設計判断セクション参照（複製 vs 共通化のトレードオフ。tag 系も独自 SEGMENTED を持つ前例があり、surface ごとの局所定数が確立済みパターン）。

### 5. `DisplayModeSwitch.tsx` を segmented 化

- **対象ファイル:** `app/components/note/list/DisplayModeSwitch.tsx`
- **変更内容:**
  - import を `pillBtn`/`pillBtnPrimary`（`@/components/common/styles`）から、ステップ 4 で新設した `note/list/styles.ts` の segmented 定数に差し替える。
  - 外側 `<div role="tablist">` に segmented コンテナ定数を付与。
  - 各 `<button>` を segmented ボタン定数 + lucide アイコン（`List` / `LayoutGrid` / `Calendar`）+ ラベルに変更。アクティブ表現は `data-primary` → `data-active`（segmented 定数が `data-[active]:` を参照）に変更。アイコンは P30 `PublicTopControls` と同じく **`Icon` ラッパーを使わず lucide を直接** `className="size-[var(--icon-xs)]" strokeWidth={1.8} aria-hidden="true"` で描画（`Icon` は strokeWidth=1.5・size 16/20/24 固定のため segmented の 13px/stroke1.8 を表現できない。`spec/design/index.md` §7 の SSOT に準拠した既存判断を踏襲）。
  - **既存の `LABELS` を活用**し、mode→lucide アイコンの `Record<DisplayMode, LucideIcon>`（list→List / tile→LayoutGrid / calendar→Calendar）だけを追加して合成する（P30 `DISPLAY_OPTIONS` の構造をそのまま持ち込む必要はない。差分最小化）。
  - `role="tab"` / `aria-selected` は維持（a11y 契約・テスト依存）。ナビゲーション挙動（`router.navigate` / `replace: true` / `homeSearchUpdater`）は一切変更しない。
- **理由:** Issue の実装追従。見た目のみ segmented へ、挙動は不変。

### 6. `NoteListToolbar.tsx` の保存ビュー文言とツールバーボタンの統一

- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:**
  - 保存ビュー select の option 文言「保存ビューを選択」は現状維持（モック側をこれに合わせるため変更不要）。`aria-label="保存済みビュー"` も維持。
  - 「選択」「ビューとして保存」ボタンの実装 `pillBtn`/`pillBtnPrimary` は**変更しない**（ADR-003 改訂: モックを実装 = desktop の `.pill-btn` に揃える方向に統一したため、実装は据え置きで三者一致）。
- **理由:** Issue 不整合 #2/#3 のうち、文言はモック側統一で吸収。ボタンは desktop モック=実装で既に一致しているため実装は触らず、mobile モックを寄せる（ステップ 3a）。回帰リスクを避け Issue の主眼（segmented 統一）に集中する。

### 7. 設計ドキュメント `spec/design/index.md` の追従

- **対象ファイル:** `spec/design/index.md`（行 157 / 170 付近 §7.1）
- **変更内容:**
  - 行 157「タブ／セグメント／トグルグループ（例: `DisplayModeSwitch` …）— … テキストのみが適する」を、segmented + アイコン採用に整合する記述へ更新（例の文言を「テキストのみ／アイコン併用のいずれも選択 UI として妥当」等に緩和、あるいは P30/P10 segmented を例示に変更）。
  - 行 170「選択 UI（タブ／セグメント／トグルグループ）は別カテゴリ…（`DisplayModeSwitch` …[#292 ADR-002]）」の `DisplayModeSwitch` 例示と #292 参照を、本 Issue (#620) の決定に合わせて更新する。
  - **書き換えは慎重に**: §7.1 の「選択 UI は別カテゴリ」という分類の根拠（混在ルールの例外扱い）は維持したまま、「選択 UI でもアイコン併用は可（segmented の慣行）」と**形態の自由度だけを広げる**書き方にする。単に「テキストのみ」を「アイコン併用可」へ反転させると §7.1 の他の規範と自己矛盾するため、カテゴリの性質は壊さない（レビュー S-003）。
- **理由:** Issue 本文が「`CLAUDE.md` 由来の pill-btn タブ群方針を上書きする」と明記。その方針の実体は `spec/design/index.md` §7.1 と #292 ADR-002 に存在するため、ドキュメントを同期しないと SSOT がモックと矛盾し続ける。

### 8. 本 Issue の ADR 記録

- **対象ファイル:** `.issue/620/adr.md`
- **変更内容:** (1) segmented 定数の配置（複製 vs 共通化）の判断、(2) #292 ADR-002 の上書き、(3) 「選択」「ビューとして保存」ボタン実装を維持しモックのみ統一する範囲確定、を記録。
- **理由:** トレードオフのある設計判断を残す。

### 9. テスト追従

- **対象ファイル:** `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`, `NoteListToolbar.test.tsx`
- **変更内容:**
  - `DisplayModeSwitch.test.tsx`：`tabByLabel` は `[role="tab"]` を引き `textContent.trim()` でラベル一致を見る。segmented 化でラベルテキストは残る（アイコンは `aria-hidden` の SVG で textContent に出ない）ため**現行テストはそのまま通る見込み**。実行して確認し、万一アイコン由来で textContent が変わる場合のみセレクタを調整。ナビゲーション挙動のアサーションは不変。
  - `NoteListToolbar.test.tsx`：新規作成/アップロードの icon-only 契約（#382）を検証。「選択」「ビューとして保存」ボタンの実装を変えない方針なら追従不要。文言のみの変更なら影響なし。
  - `NoteListRowClick.test.tsx`：トールバー/スイッチに非依存のため影響なしと想定（確認のみ）。
- **理由:** a11y/挙動の回帰を防ぐ。

### 10. 品質ゲート

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し、関連テスト（`pnpm test:unit` の note/list 配下）を通す。
- **理由:** CLAUDE.md の必須手順。

## 設計判断

詳細は `.issue/620/adr.md` を参照。要点:
- **ADR-001 segmented 定数の配置**: P30 の `SEGMENTED`/`SEGMENTED_BTN` を `note/list/styles.ts` に**複製**する（共通化＝`common/styles.ts` への昇格はしない）。理由は ADR 参照。
- **ADR-002 アイコン描画は `Icon` ラッパー非経由**: P30 既存実装と同様、lucide を直接描画（13px/stroke1.8 は `Icon` の固定値では表現不可）。
- **ADR-003 ツールバーボタン実装の変更範囲**: 「選択」「ビューとして保存」の**実装 `pillBtn` は維持**し、モックの統一に留める。
- **ADR-004 #292 ADR-002 の上書き**: 本 Issue で「DisplayModeSwitch はテキストのみ」方針を上書き。`spec/design/index.md` §7.1 を更新。

## リスクと注意点

- **テスト破壊リスク（低〜中）**: `DisplayModeSwitch.test.tsx` の `tabByLabel` は `textContent.trim()` 一致。lucide SVG は `aria-hidden` で textContent に寄与しないため通る見込みだが、実行確認は必須。
- **a11y 属性の維持**: `role="tablist"`/`role="tab"`/`aria-selected`/`aria-label="表示形式"` を必ず残す。アクティブ表現は `data-primary`→`data-active` に変わるが、`aria-selected` が真の a11y SSOT。
- **`data-*` 規約（CLAUDE.md ADR-003）**: `data-active={active || undefined}` で falsy 時に属性が消える形を厳守（P30 実装と同形）。
- **トークン整合**: segmented の `9px`/`7px`/`13px`/`180ms` は任意値ユーティリティ（`rounded-[9px]` 等）で、`public/styles.ts` の SSOT と完全一致させる。`shadow-xs` トークンが mock の box-shadow に対応していることは P30 で確立済み。
- **モック間の許容差分を壊さない**: 保存ビュー select の左右配置、CTA/一括操作バー/日付位置は触らない。
- **ドキュメント同期漏れ**: §7.1（index.md）と #292 ADR-002 を更新しないと、モック・実装・ドキュメントの三者で SSOT が再び割れる。ステップ 7/8 を省略しない。

## テスト方針

- ユニット: `DisplayModeSwitch.test.tsx` / `NoteListToolbar.test.tsx` / `NoteListRowClick.test.tsx` を実行し緑を確認。必要に応じてセレクタのみ追従。
- 手動（ブラウザ）: P10 ホームで表示モードスイッチが segmented（白カード+shadow+アイコン）で表示され、リスト/タイル/カレンダー切替が機能すること、アクティブセグメントが視覚・`aria-selected` 双方で正しいことを確認。詳細は `.issue/620/testing.md`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキテクチャ・リスク の2視点で自己レビュー）

**確認・検証した点（いずれも plan を補強する形で確定）**:
- Issue の不整合 #1（segmented 統一）#2（ツールバーボタン）#3（保存ビュー文言）がそれぞれステップ 1–6 に対応し、437 行コメント・§7.1 ドキュメント追従・テスト追従も網羅されていることを確認。スコープ外（CTA/一括操作バー/日付位置/select 左右配置）は明示的に除外済み。
- トークン実在を検証: `--icon-xs: 13px`（segmented アイコン寸法）/ `--shadow-xs`（`data-[active]:shadow-xs`）が `tokens.css` に存在。segmented の任意値（`rounded-[9px]`/`rounded-[7px]`/`text-[13px]`/`duration-[180ms]`）は P30 SSOT と完全一致。
- テスト破壊リスクを検証: `note/list/__tests__/` 内に `data-primary`/`data-active` を直接参照するテストは無し（参照は `FilterBar.test.tsx` のタグチップのみ）。`DisplayModeSwitch.test.tsx` は `[role="tab"]` + `textContent.trim()` でラベル一致を見るため、`data-primary`→`data-active` 変更・lucide SVG（`aria-hidden`、textContent 非寄与）追加でも通る見込み。→ 実行確認は必須（ステップ 9）。
- `Icon` ラッパー非経由の妥当性を確認: `Icon` は strokeWidth=1.5・size 16/20/24 固定で segmented の 13px/stroke1.8 を表現不可。P30 既存実装が同様に lucide 直描画している前例あり（ADR-002 として確定）。
- 配置判断の根拠を補強: `tag/styles.ts` が**別値の独自 `SEGMENTED`**（`p-0.5 rounded-md`）を持つことを確認。「segmented」名で値が複数あるため common 昇格は不適、surface ごと局所定数（複製）が既存パターンと整合（ADR-001 として確定）。

**修正した点**: 構造的な要修正（P-XXX）は検出されず。検証結果を本レビュー履歴と adr.md に反映。

**見送った提案**: なし（スコープ内で追加すべき項目は検出されず）。

両視点とも構造的な問題点ゼロ（自己レビュー）。

### 2周目（メインによる2視点並列レビュー — 実エージェント）

**要件カバレッジ視点 / アーキ・リスク視点の両方から [P-001] を検出**:
- **[P-001] ツールバーボタンのモック⇔実装乖離方針の矛盾**: 当初案はデスクトップモックの「選択」「ビューとして保存」を mobile の `.tool-btn` ghost に寄せる方針だったが、現状 desktop モック（`.pill-btn`）= 実装（`pillBtn`）で一致している。desktop を ghost に変えると、本 Issue が解消したい不整合を別形（モック⇔実装の乖離）で生んでしまう。
  - **対応**: 統一先を desktop の `.pill-btn`（= 実装と一致する側）に倒すよう plan ステップ 1/2/6・スコープ・ADR-003 を改訂。mobile モックの `.tool-btn` を `.pill-btn` に寄せる新ステップ 3a を追加。実装は据え置きで三者一致。

**取り込んだ改善提案**:
- [S-001/S-002] segmented 定数の命名を `DISPLAY_SEGMENTED` / `DISPLAY_SEGMENTED_BTN` に確定（`tag/styles.ts` の別値 `SEGMENTED` との混同回避）。P30 複製である旨のコメントを添える（ステップ 4）。
- [S-002] `DisplayModeSwitch` のアイコンは既存 `LABELS` を活かし mode→Icon の `Record` 追加で合成する形に明記（ステップ 5）。
- [S-003] index.md §7.1 の書き換えは「選択 UI カテゴリの性質は維持、形態の自由度だけ広げる」慎重な書き換えとする旨を追記（ステップ 7）。

**見送った提案**: なし。

P-001 反映後は両視点とも未解決の要修正なし。レビューループ終了。
