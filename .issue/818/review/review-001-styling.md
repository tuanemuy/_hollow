# レビュー — Issue #818 / PR #822（観点: Styling / デザイン規約整合・レスポンシブ・モック忠実性）

対象: `app/components/note/editor/{styles.ts,NoteEditor.tsx,DirectoryTreeSelect.tsx,WysiwygEditor.tsx,HtmlEditor.tsx,InlineEditor.tsx,directoryTreeModel.ts}` / `app/components/layout/styles.ts` / `spec/design/pages/mobile/P12-editor.html`
参照: `.issue/818/plan.md` / `.issue/818/adr.md` / CLAUDE.md（Styling）

実装は SSOT モック・確立済みプリミティブ・CLAUDE.md 規約のいずれにも高い忠実度で追従している。参照トークン/ユーティリティは全て実在を確認、新規 CSS・`@apply`・新規トークンの持ち込みは無し。以下のとおり Blocker・Warning とも無し。

### Styling

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** 下部固定バー（`editorActions` の mobile 化）が `BulkActionBar` / `APP_HEADER`(ADR-005) に忠実。`max-sm:fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-[var(--header-bg)] px-4 py-3 pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]` + `supports-[backdrop-filter]:max-sm:[backdrop-filter:var(--header-blur)]`（`-webkit-` も併記）。mock `.save-bar`（padding `var(--space-3) var(--space-4) calc(var(--space-3)+env(...))`・背景 `--header-bg`・border-top hairline・z 40）と数値まで一致。`--header-bg`/`--header-blur`/`--space-3` は `tokens.css` に、`bg-[var(--header-bg)]` は `APP_HEADER` と同一記法で実在確認済み。フォーム側 `max-sm:pb-[calc(96px+env(safe-area-inset-bottom))]` も mock `.editor-wrap`(L389) の 96px reserve と一致し、バー実高(≈64px+safe)に対し十分なクリアランス。

- **[N-002]** メタ折りたたみ定数が既存ユーティリティを正しく参照。`metaDisclosure`(`bg-surface-elevated`/`border-hairline`/`rounded-lg`/`overflow-hidden`)、`metaSummary`(`px-3 py-2.5 text-[13px] text-ink-secondary` + `TOUCH_TARGET`=44px床)、`metaSummaryPreview`(`min-w-0 flex-1 truncate text-ink`)、`metaBody`(`max-sm:border-t max-sm:border-hairline max-sm:px-3 max-sm:pt-3`) が mock `.meta-disclosure`/`.meta-summary`/`.meta-preview`/`.meta-body`(L506-545) と対応。`surface-elevated`/`surface-hover`/`hairline` は `tokens.css` + `index.css @theme inline` でユーティリティ化済み（`bg-[var(--color-...)]` ヘッジ不要）。ハードコード・新規 CSS なし。

- **[N-003]** `data-open` の配置が ADR-004 / ADR-005 / data-* 規約（ADR-003）に準拠。`data-open={metaOpen || undefined}`（falsy で属性消滅）を `data-[open]:` を消費する `metaBody` 自身とキャレット `<span>` 自身に付与。`Icon` が `data-*` を SVG へ転送しないためキャレットを span でラップする判断も妥当（ADR-005）。`group-data-*` 不使用でリポジトリ既存規約と一貫。条件付きクラス文字列による代替も無し。

- **[N-004]** `tagChipRemove` の寸法統一が方針どおり。`inline-flex h-4 w-4 items-center justify-center` で他チップ ×（`filterChipRemove` = `w-4 h-4`）とヒット領域寸法のみ統一し、`filterChipRemove` は import せず（白オン濃色専用のため）、色は `ink-tertiary→ink`・背景箱なしとタグ文脈で独立。mock `.tag-chip .x`（裸グリフ・13px・`min-height:auto`）の様式を尊重し 44px 床は非適用（arch S-005）。JSDoc に理由明記あり。矛盾なし。

- **[N-005]** `dirTreeItem`/`dirTreeItemNew`/`dirDropdownSearch` のサイズ変更が標準に沿う。検索入力 `h-[30px]→h-10`（`fieldControl` 標準高）+ `max-sm:min-h-[44px]`、ツリー行に `max-sm:min-h-[44px]`。いずれも `max-sm:` 追加で mobile 44px 床を satisfy しつつ、`px-2`/`py-1.5`/`text-[13px]`/`bg-surface`/`rounded-sm` は据え置き。検索入力の desktop 高（30px→40px）は AC-4 の全ビューポート統一に基づく意図的変更（plan S6/S1 明記）。キャレットは `top-1.5→top-1/2 -translate-y-1/2 py-2`（縦のみ拡大・幅据え置き・`z-10` 維持）で行選択タップを奪わない（arch S-001）。mock `.dir-tree-item`(44px) / `.dir-dropdown-search`(44px) と整合。

- **[N-006]** 本文 `min-h` が 3 ファイル一貫でモバイルファースト順（`min-h-[52vh] sm:min-h-[480px]`）。`WysiwygEditor`/`HtmlEditor`/`InlineEditor` すべて `sm:` min-width が base を確実に上書きし source-order 非依存（arch S-002 の `HEADER_CTA_COLLAPSE` 前例回避）。WYSIWYG は `[&_.ProseMirror]:min-h-[calc(52vh-2rem)] sm:[&_.ProseMirror]:min-h-[440px]` で `p-4`(=2rem) 分を差し引く配慮も適切。

- **[N-007]** `APP_MAIN` の `max-sm:px-4` は ADR-002 に沿い全 `/_app` 共通で適用（コメントで根拠明記、desktop は `px-6` 維持）。負マージンの局所相殺を避け SSOT を直す判断は妥当。manual-test TC-D5/D6 で他画面（一覧/tags/trash/詳細）への波及が 16px 詰まり・横スクロールなしと確認済み。

- **[N-008]** モックへの注記（`.save-bar` 近傍コメント）が「save-status 非複製・ボタン等幅化は実装が意図的に差分」を SSOT 単体で自己説明。tokens.css は未変更（新規トークン追加なし）。plan の意図的差分 3 点と一致。

- **[N-009]（軽微・情報）** 下部固定バーは `max-sm:rounded-t-lg` を持つ（`BulkActionBar` 準拠、plan L114 で「BulkActionBar/APP_HEADER 準拠」と明示）。一方 mock `.save-bar` は border-radius を持たず角は直角。確立済み primitive への追従を優先した意図的判断で問題ないが、plan の「意図的差分」リスト（3 点）には含まれていない。厳密なモック一致を将来求めるなら差分リストへの追記を検討（対応不要）。

- **[N-010]（軽微・情報）** `WysiwygEditor`/`HtmlEditor` は `[overflow-wrap:anywhere]` と `break-words`（=`overflow-wrap:break-word`）を同一要素に併記しており、同一プロパティに 2 値が当たる（生成 CSS 順で片方が dead）。本文は flex min-width 依存が無く `break-word` 単独でも横溢れ防止に足りるため実害なし。整理するなら `[overflow-wrap:anywhere]` 一本化で十分（対応不要）。

- **[N-011]** backdrop フォールバックは mock の `@supports not (backdrop-filter) { background: bg }`（不透明化）ではなく ADR-005 パターン（`bg-[var(--header-bg)]` 常時 + `supports-[backdrop-filter]:` で blur のみ）を採用。CLAUDE.md が `not-supports-` を Safari/Chrome で unreliable とする指針・`APP_HEADER` と一貫しており正しい選択。

#### 規約適合チェック（CLAUDE.md Styling）

- 新規 CSS ファイル / `@apply`: なし ✓
- トークン SSOT（tokens.css 追加なし・全参照が実在）: ✓
- `data-*` 属性 + `data-[name]:` バリアント（条件付きクラス文字列での代替なし）: ✓
- 繰り返しユーティリティの module-scoped 定数化（`metaDisclosure` 等 4 定数を styles.ts へ集約）: ✓
- ブレークポイント（`max-sm:`/`sm:` の既存方針踏襲、リテラル px 追加なし）: ✓
- backdrop-filter（ADR-005 always-on base + `supports-[backdrop-filter]:`）: ✓

#### desktop 回帰の確認（構造変更の影響）

メタ折りたたみで `DirectoryPicker`(row)/`TagsInput` が `metaDisclosure > metaBody` の 2 段ネストに入るが、desktop では両ラッパーの全クラスが `max-sm:` のため実質プレーン block。`metaDisclosure` は form(flex-col) の flex item = BFC となり、子（`dirRow` mb-3 / `tagsField` mb-5）のマージンが従来どおり保持・収束され、前後間隔・全幅 stretch とも現行維持（回帰なし）。manual-test TC-D1〜D3 とも整合。
