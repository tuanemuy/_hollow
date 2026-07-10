# レビュー — Issue #818 / PR #822（観点: Styling / デザイン規約整合・レスポンシブ・モック忠実性）2周目

対象（PR #822 実差分・head `issue/818/p12-editor-mobile` ← `main`）:
`app/components/note/editor/{styles.ts,NoteEditor.tsx,DirectoryTreeSelect.tsx,directoryTreeModel.ts,WysiwygEditor.tsx,HtmlEditor.tsx,InlineEditor.tsx}` / `app/components/layout/styles.ts` / `spec/design/pages/mobile/P12-editor.html`
参照: `.issue/818/plan.md` / `.issue/818/adr.md` / CLAUDE.md（Styling）/ review-001-styling.md

**検証手順の注意（重要）**: 作業ツリーの現在ブランチは `issue/723/...`（#818 を土台に FrontMatter 常設パネル `.fm-panel`・WYSIWYG 画像ボタン・`tagSuggestions` 等を積み増す別 Issue）。`git diff main...HEAD` にはこれら #723 の変更が混入するため、本レビューは `gh pr diff 822`（= `main...issue/818/p12-editor-mobile`）の実差分のみを対象にゼロベースで再判定した。PR #822 の実体は下記 9 ファイルに閉じており、`.fm-panel` 追加・画像ツールバーボタン・`ACTIVE_NAV_PROPS` は **#822 の差分に含まれない**（#723 側）。

ゼロベースで再精査した結果、実装は SSOT モック・確立済みプリミティブ・CLAUDE.md 規約のいずれにも高い忠実度で追従。参照トークン/ユーティリティは全て実在を再確認（`--header-bg`=tokens.css:139 / `--header-blur`=140 / `--space-3`=83 / `--color-surface-elevated`=14＋index.css @theme inline:17 / `border-hairline`=index.css:21 / `TOUCH_TARGET`=common/styles.ts:25）。新規 CSS・`@apply`・新規トークンの持ち込み無し（tokens.css 未変更、mock 変更は `.save-bar` 近傍のコメント 1 箇所のみ）。以下のとおり Blocker・Warning とも無し。

### Styling

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** 下部固定バー（`editorActions` mobile 化）がモック `.save-bar`（L1010-1029）と数値まで一致。padding: `max-sm:py-3`(12px=space-3, 上)/`max-sm:px-4`(16px=space-4, 左右)/`max-sm:pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]`(下) は mock の `var(--space-3) var(--space-4) calc(var(--space-3)+env(...))` と厳密一致。`z-40`・`bg-[var(--header-bg)]`・`border-t border-hairline`・`supports-[backdrop-filter]:` blur（`-webkit-` 併記）も一致。フォーム `max-sm:pb-[calc(96px+env(...))]` は mock `.editor-wrap`(L389 の 96px reserve) と一致し、バー実高（≈64px+safe）に十分なクリアランス。`editorActions` の直下は submit/cancel の 2 button のみ（NoteEditor L463-487）で `max-sm:[&>button]:flex-1` の等幅化が過不足なく効く。

- **[N-002]** メタ折りたたみ 4 定数がモック `.meta-disclosure`/`.meta-summary`/`.meta-preview`/`.meta-body`（L506-545）に対応。`metaSummary` の `px-3 py-2.5`(=12px/10px) は mock `.meta-summary` の `padding: 10px var(--space-3)` と一致、`TOUCH_TARGET`(44px床) も mock `min-height:44px` と一致。キャレット回転は `<span data-open>` + `data-[open]:rotate-180 transition-transform motion-reduce:transition-none` で mock `.meta-caret`（`[data-open]` で rotate180）を再現しつつ motion-reduce ガードを上乗せ（規約準拠の上積み、問題なし）。

- **[N-003]** `data-open` の配置が ADR-004/ADR-005 と data-* 規約に完全準拠。`data-open={metaOpen || undefined}`（falsy で属性消滅）を `data-[open]:` を消費する `metaBody` 自身とキャレット `<span>` 自身に付与。`Icon` が `data-*` を SVG へ転送しないためキャレットを span でラップする判断も妥当。`group-data-*` 不使用でリポジトリ既存規約と一貫。条件付きクラス文字列による代替なし。styles.ts の JSDoc に「`data-open` は container/group ではなく body 自身に置く（ADR-004）」の why コメントが残されており（2周目 plan-review の nit を反映）、回帰防止に有効。

- **[N-004]** レスポンシブが source-order 非依存。本文 `min-h` は 3 ファイル（`WysiwygEditor` EditorContent / `HtmlEditor` textarea / `InlineEditor`）すべて mobile-first 順 `min-h-[52vh] sm:min-h-[480px]` で、`sm:`(min-width) が base を確実に上書き（`HEADER_CTA_COLLAPSE` の source-order 前例を回避）。WYSIWYG 内側は `[&_.ProseMirror]:min-h-[calc(52vh-2rem)] sm:[&_.ProseMirror]:min-h-[440px]` と `p-4`(=2rem 縦) 差引きも mobile-first 順で整合。`metaBody` の `max-sm:hidden data-[open]:max-sm:block sm:block` も、開時は `.class[data-open]`（属性セレクタ +1 詳細度）が同一 max-sm メディア内で `max-sm:hidden` にソース順非依存で勝ち、`sm:` は非重複メディアで常時 block（desktop 不変）。全て意図どおり。

- **[N-005]** コントロール寸法統一がモック 44px 系と整合。`dirDropdownSearch` `h-[30px]→h-10`(fieldControl 標準) + `max-sm:min-h-[44px]`、`dirTreeItem`/`dirTreeItemNew` に `max-sm:min-h-[44px]`、いずれも mock `.dir-dropdown-search`/`.dir-tree-item`（ともに `min-height:44px`）に一致。desktop の検索入力高（30→40px）は AC-4 の全ビューポート統一に基づく意図的変更（plan 明記）で、意図せぬ回帰ではない。`tagChipRemove` は `inline-flex h-4 w-4 items-center justify-center` で他チップ ×（`filterChipRemove`=`w-4 h-4`）とヒット領域寸法のみ統一し、`filterChipRemove` を import せず色は `ink-tertiary→ink`・背景箱なし（mock `.tag-chip .x` L642-648 の裸グリフ様式・`min-height:auto` を尊重、44px 床は非適用）。JSDoc に理由明記。

- **[N-006]** キャレット再配置が行選択タップを奪わない（arch S-001）。`DirectoryTreeSelect` L311 のキャレットは `top-1.5 → top-1/2 -translate-y-1/2 py-2`（縦中央基準・当たり判定は縦方向のみ拡大・幅据え置き・`z-10` 維持）。行（`dirTreeItem`）側の `max-sm:min-h-[44px]` でタップ床を担保し、キャレットには `TOUCH_TARGET_SQUARE`（min-w 44px）を付けない設計を実装が忠実に踏襲。コメントで根拠も明記。

- **[N-007]** `APP_MAIN` の `max-sm:px-4` は ADR-002 に沿い全 `/_app` 共通で適用（コメントで根拠明記、desktop は `px-6` 維持）。負マージンの局所相殺を避け SSOT を直す判断は妥当。manual-test（TC-D5/D6）で一覧/tags/trash/詳細への波及が 16px 詰まり・横スクロールなしと確認済み。

- **[N-008]** desktop 回帰なし（メタ折りたたみのネスト影響）。desktop では `metaDisclosure`/`metaBody` の枠・padding・border は全て `max-sm:` のため実質プレーン block。`metaDisclosure` は form(flex-col) の flex item = BFC となり、内包する `DirectoryPicker`(row) の `mb-3` / `TagsInput` の `mb-5` が従来どおり保持・収束され、前後間隔・全幅 stretch とも現行維持。summary は `sm:hidden` で desktop 非表示、body は `sm:block` で常時展開。回帰なし（manual-test TC-D1〜D3 とも整合）。

- **[N-009]（軽微・情報／前回 N-009 の再判定）** 下部固定バーは `max-sm:rounded-t-lg` を持つ（`BulkActionBar` 準拠、plan L114 で「BulkActionBar/APP_HEADER 準拠」と明示）が、mock `.save-bar` は border-radius を持たず角は直角。PR で追記された mock 近傍コメントは「save-status 非複製・ボタン等幅化」の 2 点のみを意図的差分として記録しており、`rounded-t-lg` はこの差分リストに含まれない。**判定: Note のまま据え置き（Blocker/Warning 化は不要）。** 理由: (1) 実害ゼロの純粋な装飾（8px の上角丸のみ）、(2) 同アプリの確立済み下部固定アクションバー `BulkActionBar` と一貫させる方が、この単一モックの直角より整合性が高い、(3) plan に「BulkActionBar 準拠」と根拠が残る。厳密なモック完全一致を将来求めるなら、mock 近傍コメントの意図的差分リストに `rounded-t-lg`（角丸は primitive 追従）を 1 行追記すると SSOT の自己説明性が上がる（対応不要）。

- **[N-010]（軽微・情報）** メタ折りたたみ body 下端の余白がモックより約 8px 大きい。mock `.meta-body` は `padding: 0 space-3 space-3`（下 12px）で `.meta-field { margin-top }` 律動だが、実装は DOM 保持のため `DirectoryPicker`/`TagsInput` 本来の `mb-3`/`mb-5` を再利用し、`metaBody` は `max-sm:px-3 max-sm:pt-3`（下 padding なし）。上端 12px はモックと一致、下端は最終子 `mb-5`(20px) 由来で mock の 12px より 8px 広い。折りたたみ内 Popover/候補 state を壊さない DOM 保持方針（plan の中核判断）の帰結で、機能・レイアウト破綻はなく Note レベル（対応不要）。

- **[N-011]（軽微・情報）** `WysiwygEditor`/`HtmlEditor` は同一要素に `[overflow-wrap:anywhere]` と `break-words`（=`overflow-wrap:break-word`）を併記（同一プロパティに 2 値、生成 CSS 順で片方 dead）。本文は flex min-width 依存が無く `anywhere` 単独で横溢れ防止に十分なため実害なし。整理するなら `[overflow-wrap:anywhere]` 一本化で足りる（前回 N-010 と同旨、対応不要）。

- **[N-012]（参考・堅牢性の確認）** `editorActions` は base `ml-auto` + `max-sm:ml-0` の「同一プロパティ base+max-sm」構成で、これは min-h で回避した source-order パターンと同型に見える。ただし mobile では `max-sm:fixed max-sm:inset-x-0`（left:0/right:0 で全幅ピン）が支配し、abspos の over-constrained 解決で auto マージンは 0 に確定するため、`ml-auto`/`ml-0` のどちらが勝っても結果は不変。min-h と違い視覚的 fragility は生じない。`max-sm:ml-0` は防御的・冗長だが無害。

#### 規約適合チェック（CLAUDE.md Styling）

- 新規 CSS ファイル / `@apply`: なし ✓
- トークン SSOT（tokens.css 追加なし・全参照が実在）: ✓
- `data-*` 属性 + `data-[name]:` バリアント（条件付きクラス文字列での代替なし、falsy で属性消滅の `|| undefined` 記法遵守）: ✓
- 繰り返しユーティリティの module-scoped 定数化（`metaDisclosure`/`metaSummary`/`metaSummaryPreview`/`metaBody` を styles.ts へ集約）: ✓
- ブレークポイント（`max-sm:`/`sm:` の既存方針踏襲、リテラル px の直書き追加なし）: ✓
- backdrop-filter（ADR-005 always-on base + `supports-[backdrop-filter]:` blur、`not-supports-` 不使用）: ✓
- レスポンシブ source-order 依存（本文 min-h・metaBody とも非依存を確認）: ✓
- desktop 意図せぬ変化（`sm` 以上の DOM・見た目は不変、検索入力高の変更のみ AC-4 由来の意図的統一）: ✓

#### 総評

2周目のゼロベース再判定でも Blocker・Warning ともゼロ。前回 review-001 の全 Note が PR #822 の実差分に対して成立することを確認し、加えて N-010（meta-body 下端余白）・N-012（editorActions の margin source-order の無害性）を新規の情報 Note として補足した。前回 Note だった N-009（`rounded-t-lg` の意図的差分未記載）は、実害なし・確立済み primitive 追従・plan に根拠ありのため Note のまま据え置きが妥当（Blocker/Warning 化不要）と判断した。
