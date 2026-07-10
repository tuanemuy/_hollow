# 実装計画 — Issue #818: feat(note): ノート編集画面（P12）のモバイル表示を最適化する（デザイン→実装）

**Issue:** #818
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

ノート編集画面（P12 / `NoteEditor`）のモバイル表示を、確定済みモバイルモック `spec/design/pages/mobile/P12-editor.html` の中核設計に追従させる。具体的には「下部固定 保存 CTA バー」「場所/タグのメタ折りたたみ」を実装し、あわせてコントロールサイズの不統一・横スクロール要因・タップターゲット床の欠落を解消する。UI/プレゼンテーション層のみの変更。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | モバイル（≤639px, `max-sm`）で保存/キャンセルが**下部固定バー**に表示され、本文を長くスクロールしても常時到達できる。`sm` 以上ではトップバー内の現行位置を維持する | Issue 課題1 / mock `.save-bar` L1010-1029 | S2, S3 |
| AC-2 | 下部固定バーは always-on 背景 + `supports-[backdrop-filter]:` blur（ADR-005）と `env(safe-area-inset-bottom)` 下パディングを持ち、フォーム下端に固定バー分の余白（mock `96px`）が確保され本文末尾が隠れない | mock `.save-bar` / `.editor-wrap` `padding-bottom` L389 | S2, S3 |
| AC-3 | モバイルで場所（`DirectoryPicker`）とタグ（`TagsInput`）が**メタ折りたたみ**に格納され、要約プレビュー（場所パス・タグ）+ `data-open` トグルで開閉する。`sm` 以上では現行どおり常時インライン展開する | Issue 課題1 / mock `.meta-disclosure` L506-553 | S4 |
| AC-4 | ディレクトリツリー行・展開キャレット・ディレクトリ検索入力が周辺の標準コントロールとサイズ統一され、モバイルで操作対象**行**はタップ床（44px）を満たす。タグ削除 × は他チップの × とヒット領域寸法を統一する（背景箱の有無・色はモックのタグチップ様式に従い、チップ肥大回避のため 44px 床は適用しない。S5 参照） | Issue 課題2 / mock `.dir-dropdown-search` L591-603・`.dir-tree-item` L604-619・`.tag-chip .x` L642-648 | S5, S6 |
| AC-5 | WYSIWYG 本文（TipTap `EditorContent`）と HTML textarea の長い無空白文字列が折り返され、横スクロール要因にならない | Issue 課題3 / mock `.editor p/code` `overflow-wrap: anywhere` | S7 |
| AC-6 | モバイル幅（≤390px）でページ全体に横スクロールが出ない（`APP_MAIN` 横パディングのモバイル縮小 `max-sm:px-4` を含む） | Issue 課題3 / mock `.editor-wrap` `padding: var(--space-4)` | S8, and S5-S7 |
| AC-7 | 本文エディタの `min-h` がモバイルでビューポート相対（mock `min-height: 52vh`）になり、固定の 480px が縦を占有しない | Issue 課題4 / mock `.editor` L828 | S7 |
| AC-8 | 既存のデスクトップレイアウト・エディタ機能（保存/自動保存/編集ロック/モード切替の挙動）に回帰がない。`pnpm typecheck && pnpm lint:fix && pnpm format` が通過する | Issue スコープ外条件 | 全ステップ / S9 |

## スコープ

### 含まれないもの
- **デスクトップレイアウトの変更**（Issue 明示のスコープ外）。全変更は `max-sm:` バリアントで囲い、`sm` 以上の見た目・DOM を不変に保つ。例外は「コントロールサイズ統一」（AC-4）で、これは全ビューポート共通の一貫性修正だが既存デスクトップ寸法の意図を尊重して最小限に留める。
- **エディタ機能の挙動変更**（保存ロジック・自動保存・編集ロック・モード切替ゲート）。Issue 明示のスコープ外。
- **ヘッダー簡略タイトル（mock `.header-doc` L227-235 / 要素 L1042）**。共有アプリシェル（`_app/route.tsx` が全 `/_app` 配下で構築する `AppShell` ヘッダー）への横断的な配管（ヘッダー↔エディタ間の context/portal）が必要で、「エディタのモバイル最適化」という本 Issue の粒度を超える。`.header-doc` の機能は本文スクロール中に編集対象タイトルを見失わないための**方向づけ（orientation）**であって、下部固定保存バー（AC-1）はこれを代替しない（保存バーはアクション到達性を担うが title orientation は担わない）。ただし a11y 上は `aria-hidden="true"` の装飾で、Issue は機能的な受け入れ条件を課しておらず、横断配管コストが大きい。→ ADR-001 参照。フォローアップ Issue へ切り出す。
- **WYSIWYG ツールバーの圧縮/オーバーフローメニュー化**（Issue「その他」の(検討)項目）。現状 `overflow-x-auto` で横スクロール隔離済みでページ overflow は出ない。UI 再設計を要するため別 Issue。
- **ネイティブダイアログ（`window.confirm` / `window.prompt`）のカスタム UI 化**（Issue「その他」の(検討)項目）。挙動・a11y に踏み込む変更のため別 Issue。

## 調査結果

### 関連ファイル
- `app/components/note/editor/NoteEditor.tsx` — オーケストレーター。`return` L409-624。保存/キャンセルは L434-458 でトップバー内に配置。場所/タグは L480-503 で常時インライン展開。フォーム下部余白は L414 の `max-sm:pb-[env(safe-area-inset-bottom)]` のみ（固定バー分なし）。
- `app/components/note/editor/styles.ts` — P12 専用ユーティリティ文字列定数。`editorActions`(L70)・`editorTopbar`(L31)・`tagChipRemove`(L109-110)・`dirTreeItem`(L180-181)・`dirDropdownSearch`(L172-173) 等。
- `app/components/note/editor/TagsInput.tsx` — タグ × は L256-264（`tagChipRemove`）。
- `app/components/note/editor/DirectoryTreeSelect.tsx` — ツリー行 L321-354（`dirTreeItem` = `py-1.5`）、展開キャレット L301-319（`absolute top-1.5`、タップ床なし）、検索入力 L236-259（`dirDropdownSearch` = `h-[30px]`）。「新規ディレクトリ名」入力 L363-378 も `dirDropdownSearch` を流用。
- `app/components/note/editor/DirectoryPicker.tsx` — `variant="row"` で `DirectoryTreeSelect` に委譲（L96-108）。
- `app/components/note/editor/{HtmlEditor,WysiwygEditor,InlineEditor}.tsx` — 本文 `min-h-[480px]`（HtmlEditor L45 / WysiwygEditor L594 / InlineEditor L863）。`InlineEditor` は `note-detail-content`（#791 で `overflow-wrap` 適用済み）だが、`WysiwygEditor`（`EditorContent` の `[&_.ProseMirror]`）と `HtmlEditor`（`fieldControl` textarea）は未適用。
- `app/components/layout/styles.ts` — `APP_MAIN`(L129-130) = `px-6`（全 `/_app` 共有）、`APP_HEADER`(L6) が backdrop-filter の参照パターン。
- `app/routes/_app/notes/$noteId/edit.tsx` / `new.tsx` — RSC ルート。`NoteEditor` を `mode` 切替で描画。**本 Issue では変更不要**（props も UI 挙動も不変）。

### 流用する確立済みプリミティブ
- **下部固定バー**: `app/components/note/list/BulkActionBar.tsx` L46 が完成形の同型パターン（`max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-lg max-sm:px-4 max-sm:py-2.5 max-sm:pb-[calc(10px+env(safe-area-inset-bottom))]`）。save-bar はこれを踏襲。
- **backdrop-filter**: `APP_HEADER`（`bg-[var(--header-bg)] supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)]`）= ADR-005 パターン。
- **横スクロール隔離**: `scrollbarHidden`（`common/styles.ts` L256）— 既に mode-tabs / toolbar で使用済み。
- **タップ床トークン**: `TOUCH_TARGET` / `TOUCH_TARGET_SQUARE`（`common/styles.ts` L25-28）。
- **チップ × のヒット領域寸法**: `filterChipRemove`（`note/list/styles.ts` L93-94）= `inline-flex items-center justify-center w-4 h-4`。タグ × の**寸法**の参照先。ただし `filterChipRemove` は `text-white/85 hover:bg-white/[0.18]`（濃色チップ `filterChip[data-active]` 専用）なので**import せず**、`tagChipRemove` は形（寸法）だけ揃えて色/背景箱はタグ文脈（淡色 surface チップ）で独立に定義する（arch S-004）。
- **`data-*` 開閉トグル**: `data-[open]:` バリアント（`APP_SIDEBAR` のドロワー `AppShellDrawer.tsx` L200、mock `.meta-disclosure[data-open]` と同型）。**規約**: `data-open` は `data-[open]:` バリアントを消費する**要素自身**に置く（既存コードは group-data を使わず、`<aside>`/backdrop それぞれが自分の `data-open` を持つ）。
- **セーフエリア pad**: `dialog` / `popoverSheetPanel`（`common/styles.ts`）の `max-sm:pb-[calc(var(--space-N)+env(safe-area-inset-bottom))]` 記法。

### あるべきアーキテクチャ
- ヘキサゴナル + DDD。本変更は**プレゼンテーション層（コンポーネント）限定**。ドメイン/ユースケース/アダプターには一切触れない。
- スタイリング規約（CLAUDE.md）: Tailwind ユーティリティ直書き、新規 CSS ファイル・`@apply` 禁止、トークンは `tokens.css` が SSOT、状態は `data-*` 属性 + `data-[name]:` バリアント、繰り返しは module-scoped 文字列定数（`styles.ts`）へ集約。ブレークポイントは既存 `--bp-sm`(640px) の `max-sm:` 方針を踏襲。

### 既存実装の状態（あるべき姿との乖離）
| モックの中核設計 | 実装の現状 | 乖離 |
|---|---|---|
| 下部固定保存バー（mock L1010-1029） | 保存/キャンセルがトップバー内（NoteEditor L434-458） | **未実装** → S2-S3 |
| メタ折りたたみ（mock L506） | 場所/タグを常時インライン展開（L480-503） | **未実装** → S4 |
| フォーム下部余白 96px（mock L389） | `max-sm:pb-[env(safe-area-inset-bottom)]` のみ（L414） | 固定バー分なし → S3 |
| タグ × のヒット領域寸法統一（Issue 課題2 要件） | `text-[13px]` 裸グリフ（styles L109）。mock `.tag-chip .x` L642-648 も同じ裸グリフ（`font-size:13px; min-height:auto;` 背景箱なし） | **視覚はモックと一致済み**。乖離は Issue が求める「他チップ × と寸法統一」のみ → S5（寸法だけ揃え、背景箱・色はモックのタグチップ様式を尊重） |
| ツリー行/キャレット/検索の統一（mock L591-620） | `py-1.5`/`top-1.5`/`h-[30px]`、タップ床なし | 不統一 → S6 |
| 本文 `overflow-wrap`（mock L839） | WYSIWYG/HTML 未適用 | 横スクロール要因 → S7 |
| 本文 `min-height: 52vh`（mock L828） | 固定 `min-h-[480px]` | モバイルで縦占有 → S7 |
| `APP_MAIN` 横 16px（mock L389） | `px-6`（24px） | 過大 → S8 |
| ヘッダー簡略タイトル（mock L227 / 要素 L1042） | 未実装 | 横断的でスコープ外（ADR-001） |

### デザイン確定（Phase 1）

**トークン**: `--header-bg` / `--header-blur` / `--header-height` / `--space-3` / `--space-4` は `app/styles/tokens.css`（L83-140）に既存。`env(safe-area-inset-bottom)` は CSS 環境変数。`bg-surface-elevated` / `bg-surface-hover` / `border-hairline` は `index.css` の `@theme inline` でユーティリティ化済み（そのまま参照可）。**新規トークン追加は不要**。`spec/design/tokens.md` との整合も現状トークンで足りる。

**モックとの意図的差分（SSOT 同期の判断）**: 本 Issue は「デザイン（既存モックの確定）→実装」だが、モック本体は**更新せず据え置く**。以下の 3 点は実装がモックから意図的に外れる箇所であり、後続レビュー・実装者が乖離を欠陥と誤認しないようここに記録する（差分は意図的、モックは触らない）:

1. **タグ × の扱い** — mock `.tag-chip .x`（L642-648）は裸グリフ（背景箱なし・`ink-tertiary`・13px）で、現行実装 `tagChipRemove` と視覚的に一致している。Issue 課題2 の「他チップの × と寸法統一」要件に応じて**ヒット領域寸法**のみ他チップ × と揃える（`inline-flex items-center justify-center w-4 h-4`）が、**背景箱の有無・色はモックのタグチップ様式を尊重**して裸グリフのまま・色はタグ文脈で独立（`filterChipRemove` は白オン濃色専用のため import しない、arch S-004）。モックは既に目標形なので更新不要。
2. **save-status を固定バーへ複製しない** — mock `.save-bar` は内部に save-status を複製する（L1026-1027）が、実装は AutosaveIndicator を topbar に単一保持し、二重 `aria-live` 読み上げを避ける。副作用（下方スクロール中に保存状態が視界外）はリスク項に記載。
3. **保存/キャンセルの mobile 等幅化** — mock は save-status `flex:1` + ボタン非等幅（primary `padding:0 24px`）だが、save-status を省く帰結として実装は `max-sm:[&>button]:flex-1` でボタンを等幅フル化する。

いずれも「モックを差分どおりに書き換える」より「実装側の a11y/レイアウト判断を優先し、差分を計画に明記する」方針を採る（モック更新のコストと、複数モック横断の一貫性への影響を避ける）。

### 依存関係
- `APP_MAIN` は全 `/_app` 配下ページ共有。`max-sm:px-4` 変更は編集画面以外にもモバイルで波及する（ADR-002 / リスク参照）。
- 下部固定バーの `position: fixed` は、`main` の祖先に transform/backdrop-filter/filter を持つ要素が無いことを確認済み（`APP_HEADER` の backdrop-filter は `main` の兄弟、ドロワー aside の transform も兄弟）。よって viewport 基準で正しく固定される。z-index は 40（ドロワー scrim z-90 / drawer z-100 より下 = ドロワー展開時は背後に隠れる、意図どおり）。

## 設計

### ドメインモデルへの影響
なし。UI 表示最適化のみで、エンティティ・値オブジェクト・不変条件・ポートに変更なし。

### ユースケース / アプリケーションロジック
なし。保存/自動保存/編集ロックのユースケース呼び出し（`NoteEditor` の既存フロー）は不変。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
- **下部固定保存バー**: 保存/キャンセルボタンは**単一の DOM のまま**、`editorActions` コンテナに `max-sm:fixed` 系ユーティリティを付与して mobile でのみ視覚的に viewport 下部へ切り離す（BulkActionBar パターン）。ボタンを二重描画しないため状態分岐は不要。フォームに mobile 下部余白（96px 相当）を付与。
- **メタ折りたたみ**: `DirectoryPicker`（row）と `TagsInput` を disclosure ラッパーで囲む。**DOM は保持**（両コンポーネントが持つ Popover/候補パネルの state を壊さない）。mobile 専用の summary `<button>` が `useState` の `open` をトグルする。`data-[open]:` バリアントを消費する **body（`metaBody`）自身**に `data-open` を付与する（既存 `APP_SIDEBAR` と同じく、バリアントを持つ要素自身に `data-open` を置く規約。**外側 container に置くと Tailwind は親属性を参照せず開閉が効かない** — arch P-001）。body は `max-sm:hidden data-[open]:max-sm:block sm:block`、container（`metaDisclosure`）は枠/surface のみで開閉非依存、summary は `sm:hidden`。preview は `props.tree` から解決したディレクトリパス + `state.tagNames` を結合（view-only UI 状態なので reducer ではなく orchestrator `useState`、既存 `pendingWysiwygSwitch` と同方針）。パス解決は `DirectoryTreeSelect` の `triggerLabel` 導出と重複するため純関数に抽出し共有する（arch S-007）。
- **コントロールサイズ統一**: `styles.ts` の該当定数を修正（`tagChipRemove` はヒット領域**寸法だけ**他チップ × と揃え背景箱・色はモックのタグチップ様式を尊重、`dirTreeItem` に mobile タップ床、`dirDropdownSearch` を標準入力高へ）。`DirectoryTreeSelect` のキャレットボタンは縦位置を中央基準にし、タップ領域拡大は**縦方向のみ**に限定（行選択タップを奪わない、arch S-001）。
- **横スクロール/折り返し**: `WysiwygEditor` の `[&_.ProseMirror]` と `HtmlEditor` textarea に `[overflow-wrap:anywhere]`（+ `break-words`）。本文 `min-h` を `min-h-[52vh] sm:min-h-[480px]`（モバイルファースト順、source-order 依存回避。S7 参照）に。
- **`APP_MAIN`**: `max-sm:px-4` 追加。

## 実装ステップ

すべてプレゼンテーション層。内側レイヤー変更が無いため、スタイル定数 → オーケストレーター → 部品 → 共有レイアウトの順に、影響の局所的なものから並べる。

### 1. styles.ts にモバイル最適化の定数を追加/更新（P12 エディタ）
- **対象ファイル:** `app/components/note/editor/styles.ts`
- **変更内容:**
  - `editorActions` を拡張: 既存の `ml-auto inline-flex items-center gap-2`（`sm` 以上の現行位置）に、`max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:ml-0 max-sm:gap-3 max-sm:border-t max-sm:border-hairline max-sm:bg-[var(--header-bg)] max-sm:px-4 max-sm:py-3 max-sm:pb-[calc(var(--space-3)+env(safe-area-inset-bottom))] max-sm:rounded-t-lg supports-[backdrop-filter]:max-sm:[backdrop-filter:var(--header-blur)] supports-[backdrop-filter]:max-sm:[-webkit-backdrop-filter:var(--header-blur)] max-sm:[&>button]:flex-1` を追加（BulkActionBar / APP_HEADER 準拠、ADR-005）。JSDoc に「mobile は下部固定 CTA バー、sm 以上はトップバー内 `ml-auto`」を明記。
  - メタ折りたたみ用の定数を新規追加: `metaDisclosure`（mobile のみ枠+surface: `max-sm:mb-4 max-sm:rounded-lg max-sm:border max-sm:border-hairline max-sm:bg-surface-elevated max-sm:overflow-hidden`）、`metaSummary`（`sm:hidden` の summary button: `flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-ink-secondary` + `TOUCH_TARGET`）、`metaSummaryPreview`（`flex-1 min-w-0 truncate text-ink`）、`metaBody`（`max-sm:hidden data-[open]:max-sm:block sm:block` + mobile 内側パディング）。`surface-elevated` トークンが Tailwind ユーティリティ化済みか確認し、無ければ `bg-[var(--color-surface-elevated)]` で参照。
  - `tagChipRemove` は他チップ × と**ヒット領域寸法だけ**統一: `text-[13px]` 裸グリフ → `inline-flex items-center justify-center w-4 h-4 text-ink-tertiary hover:text-ink ...`（既存 disabled/focus クラスは保持）。**背景箱は付けない**（mock `.tag-chip .x` L642-648 は裸グリフ・背景箱なし。チップ自体が hover を持つ）。**色はタグ文脈で独立**（`ink-tertiary`→`ink`）。`filterChipRemove`（`w-4 h-4 rounded-full text-white/85 hover:bg-white/[0.18]`）は濃色チップ専用のため **import せず寸法のみ参照**（arch S-004）。× のグリフ `×` は保持、`aria-label` 不変。
  - `dirTreeItem` / `dirTreeItemNew` に mobile タップ床: `max-sm:min-h-[44px]`（mock `.dir-tree-item { min-height: 44px }`）。行内アイコン中央寄せは既存 `items-center` で担保。
  - `dirDropdownSearch` の `h-[30px]` を標準入力高へ: `h-10`（`fieldControl` 準拠）+ mobile タップ床は `h-10`=40px なので `max-sm:min-h-[44px]` を付与。desktop の見た目差分を最小化するため `text-[13px]`・`bg-surface`・`rounded-sm` は維持。
- **理由:** 繰り返しユーティリティは module-scoped 定数へ集約する規約（CLAUDE.md）。JIT が静的文字列を走査するため挙動は inline と同一。

### 2. NoteEditor: 保存/キャンセルを下部固定バー化
- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** L434-458 の `<div className={editorActions}>`（保存/キャンセル）はそのまま（S1 で `editorActions` 側に mobile 固定化を持たせるため JSX 変更は最小）。トポロジー上、`editorActions` は `editorTopbar` の子として残るが `max-sm:fixed` で viewport 下部へ切り離される。AutosaveIndicator（保存状態）はトップバー内に据え置き（mobile での二重 `aria-live` 読み上げ回避のため固定バーには複製しない — mock の save-bar 内 save-status 複製は採用しない）。
- **理由:** ボタンを単一 DOM に保つことで、`isPending`/`saveDisabled`/ラベルの状態を一箇所で管理でき、二重描画による分岐・不整合を避ける（AC-1, AC-2）。

### 3. NoteEditor: フォーム下部余白を固定バー分確保
- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** L414 のフォーム `className` の `max-sm:pb-[env(safe-area-inset-bottom)]` を `max-sm:pb-[calc(96px+env(safe-area-inset-bottom))]`（mock `.editor-wrap` の `padding-bottom` L389）へ変更。
- **理由:** 下部固定バーに本文末尾が隠れないようにする（AC-2）。

### 4. NoteEditor: 場所/タグをメタ折りたたみ化
- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`（+ S1 の定数）
- **変更内容:**
  - orchestrator に `const [metaOpen, setMetaOpen] = useState(false)` を追加（mobile 初期は折りたたみ）。
  - `DirectoryPicker`（L480-493）+ `TagsInput`（L495-503）を disclosure ラッパー `<div className={metaDisclosure}>` で囲む（**container には `data-open` を付けない**）。先頭に mobile 専用 summary `<button type="button" className={metaSummary} aria-expanded={metaOpen} aria-controls="editor-meta-body" onClick={() => setMetaOpen(v => !v)}>`（フォルダアイコン + preview span + キャレット）。両コンポーネントは `<div id="editor-meta-body" className={metaBody} data-open={metaOpen || undefined}>` 内に配置。
    - **`data-open` は body（`metaBody`）自身に置く**（arch P-001）。Tailwind の `data-[open]:` は当該要素自身の属性を見るため、container に置くと開閉が効かない。既存 `APP_SIDEBAR`（`AppShellDrawer.tsx` L200）も `data-[open]:` を持つ `<aside>` 自身に `data-open` を付与しており、この規約に従う。group-data 方式は既存コードに無いため採らない。
    - summary の `type="button"` を厳守（`<form>` 内なので `submit` 誤発火を防ぐ）。`aria-controls="editor-meta-body"` で body と関連づけ（arch S-006）。キャレット回転を入れる場合は summary の `aria-expanded` を `aria-expanded:` バリアントで参照（group 不要）。
  - preview 文字列: `props.tree` から `state.directoryId` のパス（または `state.pendingDirectoryName` の「新規: …」、未設定は「未設定」）+ `state.tagNames` を `#tag` 連結。**このパス解決は `DirectoryTreeSelect` の `triggerLabel` 導出と重複するため、純関数（例 `resolveDirectoryPath(tree, id)`）に抽出して preview と trigger の両方から呼ぶ**（二重管理でパス表記が片方だけ古くなるのを防ぐ。arch S-007。スコープ内の軽微なリファクタ）。
- **理由:** モバイルの縦スペース圧迫を解消（AC-3）。DOM を保持することで Popover/候補パネルの内部 state を壊さない。`sm` 以上は `metaBody` が常時 `block`・summary が `hidden` で現行の常時インライン展開を維持（デスクトップ不変）。

### 5. TagsInput: チップ × の寸法統一（確認のみ、実体は S1）
- **対象ファイル:** `app/components/note/editor/TagsInput.tsx`
- **変更内容:** L256-264 の × ボタンは `tagChipRemove`（S1 で更新済み）を参照するため JSX 変更は基本不要。× のグリフ `×` は保持。既存テスト（`__tests__/TagsInput.test.tsx` が `button[aria-label$="を削除"]` を参照）が壊れないこと（`aria-label` は不変）を確認。
- **タップ床の非適用（明文化）:** タグ × には 44px タップ床を**適用しない**（`w-4 h-4`=16px のまま）。チップを肥大させないための意図的判断であり、mock `.tag-chip .x`（`min-height:auto`）および mock 方針（L159「44px 床は主要アクションに限定。チップは膨張させない」）と整合する。行/入力側でタップ床を担保するため、削除操作の押しやすさは損なわない（arch S-005）。
- **理由:** チップ × を他チップと**ヒット領域寸法**で統一しつつ、視覚（背景箱・色）と密度はモックのタグチップ様式を尊重（AC-4）。

### 6. DirectoryTreeSelect: ツリー行/キャレット/検索の統一
- **対象ファイル:** `app/components/note/editor/DirectoryTreeSelect.tsx`（+ S1 の定数）
- **変更内容:**
  - ツリー行（`dirTreeItem`）・検索/新規名入力（`dirDropdownSearch`）は S1 更新済みの定数参照で反映。行高が上がるため、展開キャレットボタン（L301-319）の絶対配置 `top-1.5` を縦中央基準（`top-1/2 -translate-y-1/2`）へ変更し、`indent`/`paddingLeft` の整合を再確認。
  - **キャレットのタップ領域は縦方向のみ拡大**（例 `py` で縦を稼ぎ**幅は据え置き**）。`TOUCH_TARGET_SQUARE`（`min-w` も 44px）は**付けない** — キャレットは `absolute left:${indent}px`、行選択ラベルは `paddingLeft: indent+22` で始まるため、当たり判定を横 44px に広げると選択行の左端に重なり、`z-10` でキャレットが上に来てフォルダ名タップが「選択」でなく「展開」に化ける（arch S-001）。行全体のタップ床は `dirTreeItem` の `max-sm:min-h-[44px]`（モック同様、行側）で担保する。`z-10` は維持。
  - `dirDropdownSearch` が `h-10` になることで「新規ディレクトリ名」入力（L363-378）も統一される（同定数流用）。
- **理由:** リスト行/入力の高さをアプリ標準（`h-10` / 44px タップ床）に揃える（AC-4）。

### 7. 本文エディタ: overflow-wrap と min-h のビューポート相対化
- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`（L592-594）、`app/components/note/editor/HtmlEditor.tsx`（L45）、`app/components/note/editor/InlineEditor.tsx`（L863、min-h のみ）
- **変更内容:**
  - `WysiwygEditor`: `EditorContent` の className に `[&_.ProseMirror]:[overflow-wrap:anywhere] [&_.ProseMirror]:break-words`（および長い `code`/`pre` は既存 `[&_pre]:overflow-x-auto` を維持）を追加。`min-h-[480px]` を **`min-h-[52vh] sm:min-h-[480px]`** へ（下記の source-order 注意）。
  - `HtmlEditor`: textarea に `[overflow-wrap:anywhere] break-words`（`fieldControl` は等幅 textarea なので折り返し担保）を追加。`min-h-[480px]` を **`min-h-[52vh] sm:min-h-[480px]`** へ。
  - `InlineEditor`: `note-detail-content` は #791 で `overflow-wrap` 適用済みのため折り返し追加は不要。`min-h-[480px]` を **`min-h-[52vh] sm:min-h-[480px]`** へ（一貫性）。
  - **source-order 注意（arch S-002）:** `min-h-[480px] max-sm:min-h-[52vh]`（base + `max-sm:` 上書き）は同一プロパティ・同一詳細度のためモバイルでどちらが勝つかが生成 CSS の出現順に依存する（このリポジトリは `HEADER_CTA_COLLAPSE` で同種の source-order 事故を踏み `!` を要した前例あり）。**モバイルファースト順の `min-h-[52vh] sm:min-h-[480px]`（`sm:` min-width が base を確実に上書き）へ反転**し、並び順依存を消す。3 ファイル（`WysiwygEditor.tsx` L594 / `HtmlEditor.tsx` L45 / `InlineEditor.tsx` L863）で統一。
- **理由:** 長い無空白文字列でページ横スクロールが出るのを防ぐ（AC-5, AC-6）。モバイルで本文が縦を占有しすぎないようビューポート相対に（AC-7）。

### 8. APP_MAIN: モバイル横パディング縮小
- **対象ファイル:** `app/components/layout/styles.ts`（L129-130）
- **変更内容:** `APP_MAIN` に `max-sm:px-4` を追加（`px-6` → mobile 16px）。ADR-002 の判断に従い、全 `/_app` ページ共通の縮小として適用する。
- **理由:** モック（16px）より過大な 24px を縮小し、狭幅での横方向の余白過多と横スクロール圧を減らす（AC-6）。

### 9. 検証（Phase 3）
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。手動/ブラウザ検証（manual-test / agent-browser）で ≤390px の横スクロール無し・下部固定バーの到達性・メタ折りたたみ開閉・タップ操作性を確認。`sm` 以上でデスクトップ表示に回帰が無いことを確認。
- **理由:** AC-8。

## 設計判断

- **ADR-001**: ヘッダー簡略タイトルは共有シェル横断のため本 Issue から切り出す（スコープ外）。
- **ADR-002**: `APP_MAIN` の `max-sm:px-4` は編集画面ローカルではなく全 `/_app` 共通で適用する。
- **ADR-003**: 下部固定バーはボタンを二重描画せず、単一 DOM に `max-sm:fixed` を付与して mobile でのみ切り離す（BulkActionBar パターン）。
- **ADR-004**: メタ折りたたみの `data-open` は `data-[open]:` バリアントを消費する要素自身（`metaBody`）に置く（container/group 経由にしない）。
- 詳細は `.issue/818/adr.md` を参照。

## リスクと注意点

- **`APP_MAIN` 変更の波及**: `max-sm:px-4` は全 `/_app` ページに影響する。他のモバイルモック（P10 等）も本文パディング 16px を想定しているか検証で確認し、意図しない回帰が出る画面がないか目視する（ADR-002 の前提）。
- **`position: fixed` の含有ブロック**: 現状 `main` の祖先に transform/backdrop-filter/filter が無いことを確認済みだが、将来シェルにそれらが入ると固定バーが崩れる。実装時に実機/ブラウザで viewport 固定を確認。
- **メタ折りたたみと Popover の相互作用**: `DirectoryTreeSelect` の Popover / `TagsInput` の候補パネルは `data-open` の CSS 開閉（DOM 保持）下でも正しく開く必要がある。`display:none`（`max-sm:hidden`）に畳まれた body 内で Popover を開くケース（= 折りたたみ中に開くことは UI 上起きない）を確認。折りたたみ中はトリガー自体が非表示なので実害は無い想定。
- **キャレット再配置**: ツリー行の高さ変更に伴うキャレット絶対配置の縦位置ズレ。`indent` 計算（`8 + depth*16`、`paddingLeft: indent+22`）との整合を崩さないこと。キャレットのタップ領域拡大は縦方向のみに限定し、行選択のタップを奪わないこと（arch S-001）。
- **二重 `aria-live`**: モックは save-status を topbar と save-bar に複製するが、実装では AutosaveIndicator を一箇所に留めて二重読み上げを避ける（意図的な mock との差分）。
- **保存状態の可視性トレードオフ（arch S-002 / coverage S-002）**: save-status を固定バーへ複製しない帰結として、**mobile で本文を下方スクロール中は自動保存状態（AutosaveIndicator）が視界外になる**。モックが save-bar に status を置く狙い（スクロール中の保存状態可視）を意図的に手放す判断であり、検証時はこれを「欠陥」ではなく仕様として扱う。
- **z-index 遮蔽（arch S-003）**: 下部固定保存バー（`max-sm:z-40`）と、メタ内の `dirDropdownPanel` / `tagSuggestPanel`（z-30、`top-[calc(100%+6px)]` 下向き展開）が空間的に重なると、保存バーが候補パネル末尾を覆いうる。実運用ではメタ折りたたみが本文（52vh）より上＝画面上部寄りに来るため実害は小さいが、検証項目に「メタ展開中に候補を開いたとき末尾が保存バーに隠れないこと」を含める。必要なら候補パネルを `max-sm` でボトムシート化（既存 `popoverSheetPanel`）する退避策を検討。

## テスト方針

- `pnpm typecheck` / `pnpm lint:fix` / `pnpm format`（CLAUDE.md 必須手順）。
- 既存ユニットテスト（`app/components/note/editor/__tests__/`、特に `TagsInput.test.tsx` の `aria-label` セレクタ、`DirectoryTreeSelect` 系）が緑であること。`aria-label` / `role` / DOM 構造の非退行を担保。
- 手動/ブラウザ検証（≤390px）:
  - 下部固定保存バーが表示され、本文長文スクロール中も保存/キャンセルへ到達できる。フォーム末尾がバーに隠れない。
  - 場所/タグがメタ折りたたみに格納され、summary タップで開閉。preview に場所パス+タグが出る。`sm` 以上では常時展開。
  - タグ ×・ツリー行・キャレット・検索入力のサイズ/タップ床が統一され押しやすい。タグ × は他チップ × と寸法が揃い、キャレット拡大が行選択タップを奪わない（arch S-001）。
  - メタ展開中にディレクトリ検索ドロップダウン / タグ候補パネルを開いたとき、候補の末尾が下部固定保存バー（z-40）に隠れない（arch S-003）。
  - 本文 `min-h` がモバイルで 52vh 相当・`sm` 以上で 480px となり、source-order に依存せず期待どおり切り替わる（arch S-002）。
  - 長い無空白文字列（URL 等）を本文に入れてもページ横スクロールが出ない。
  - `sm` 以上でデスクトップ表示・DOM が現行と一致（回帰なし）。

## レビュー履歴

### 1周目

**修正した点**:
- **coverage P-001（タグ × のモック矛盾・引用誤り）**: モック `spec/design/pages/mobile/P12-editor.html` L642-648 を実際に確認し、`.tag-chip .x` が裸グリフ（背景箱なし・`ink-tertiary`・13px、`min-height:auto`）で現行実装と視覚一致していることを検証。乖離表を「タグ × はモックと視覚一致済み、乖離は Issue が求める寸法統一のみ」に訂正し、モックが箱型 × を示すという事実誤認を除去。AC-4 の由来を誤引用（L591-620 はタグ × を含まない）から `.dir-dropdown-search` L591-603・`.dir-tree-item` L604-619・`.tag-chip .x` L642-648 の正しい参照へ修正。結論方針を明記: タグ × は Issue 要件どおりヒット領域寸法のみ他チップと統一し、背景箱の有無・色はモックのタグチップ様式を尊重（`filterChipRemove` は import せず色/箱は独立）。
- **arch P-001（data-open 参照バグ・最重要）**: 既存コードを確認し group-data 方式が不在・`data-open` は `data-[open]:` バリアントを持つ要素自身に置く規約（`APP_SIDEBAR` / `AppShellDrawer.tsx` L200）であることを検証。`data-open` を container ではなく **body（`metaBody`）自身**に置くよう S1/S4/UI 設計/流用プリミティブ節を修正。ADR-004 として明文化。
- **coverage S-001 / arch ADR-001 論点**: ADR-001 と plan スコープ節から「主要アクション到達性は保存バーが満たすから不要」という論点ズレの論拠を除去。`.header-doc` は title orientation 要素で保存バーは代替しないこと、除外根拠は「aria-hidden の装飾／Issue が機能 AC を課さない／横断配管コスト大／フォローアップ切り出し」であることに訂正（adr.md の ADR-001 Context/Decision を修正）。
- **coverage S-003 / arch save-bar 行番号**: mock `.save-bar` の行番号を実確認し L1010-1029（L1009 はコメント）へ訂正（AC-1・乖離表）。header-doc の行番号も L227/要素 L1042 に訂正。

**取り込んだ改善提案**:
- **coverage P-002**: 「デザイン確定（Phase 1）」節を新設し、モックとの意図的差分3点（タグ × の扱い・save-status 非複製・保存/キャンセルの mobile 等幅化）を「モックは触らず差分を計画に明記する」方針として記録。
- **coverage S-002**: save-status を固定バーへ複製しない副作用（mobile 下方スクロール中に自動保存状態が視界外）をリスク項に明記。
- **arch S-001**: キャレットのタップ領域拡大を縦方向のみに限定し `TOUCH_TARGET_SQUARE` を付けない旨を S6・UI 設計・リスク・テストに反映（行選択タップを奪わない）。
- **arch S-002**: 本文 `min-h` を `min-h-[52vh] sm:min-h-[480px]`（モバイルファースト順）へ反転し source-order 依存を除去。3ファイルで統一する旨を S7 に明記。テスト項目も追加。
- **arch S-003**: 保存バー z-40 とメタ内 Popover/候補パネル z-30 の遮蔽リスクをリスク項・テスト項目（Phase 3）に追加。
- **arch S-004**: `filterChipRemove` は白オン濃色専用のため import せず寸法のみ参照・`tagChipRemove` は色/箱独立、を流用プリミティブ節・S1 に明記。
- **arch S-005**: タグ × に 44px タップ床を適用しない意図（チップ肥大回避・行側で担保）を S5 に明文化。
- **arch S-006**: メタ summary に `aria-controls`（+ body に `id="editor-meta-body"`）を付与する旨を S4 に追記。
- **arch S-007**: preview のディレクトリパス解決を純関数（`resolveDirectoryPath` 等）に抽出し trigger と共有する方針を S4・UI 設計に追記。

**見送った提案とその理由**:
- なし（両レビューの全指摘を取り込み）。

### 2周目

2周目: 両視点とも問題点ゼロで終了（要件カバレッジ・アーキ/リスクとも要修正なし＝APPROVED）。

**任意の nit（実装時に対応）**:
- モック `.save-bar` 近傍に「save-status 非複製・ボタン等幅化は実装が意図的にモックと差分」の1行コメントを残すと SSOT 単体の自己説明性が上がる（coverage S-001）。
- `metaDisclosure` / `metaBody` 定数に「data-open は開閉を制御する body 自身に置く（container/group ではない）」why コメントを付す（arch S-001、`directory/styles.ts` L18 の前例と整合）。
