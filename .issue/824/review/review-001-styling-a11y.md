# Review 001 — Styling / A11y（PR #828 / Issue #824）

**観点:** スタイリング規約・アクセシビリティ・レスポンシブ・mock 準拠
**対象差分:** `app/components/layout/{HeaderCenter,Header,EditorTitleContext,AppShellDrawer}.tsx`, `styles.ts`, `app/components/note/editor/{NoteEditor,useEditorTitleSync}.ts(x)`
**mock:** `spec/design/pages/mobile/P12-editor.html` `.header-doc`（L227-235）/ 要素 L1045

## Styling / A11y

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** mock 準拠は完全。`HEADER_DOC = "sm:hidden truncate text-sm font-medium text-ink min-w-0"`（`styles.ts:47-48`）を mock `.header-doc` と実値照合した:
  - `truncate` = overflow-hidden + text-ellipsis + whitespace-nowrap ＝ mock の `overflow:hidden`/`text-overflow:ellipsis`/`white-space:nowrap`。
  - `text-sm` → `--text-sm`（`tokens.css:55` = clamp(...,13px)、`index.css:48` で bridge）＝ mock `font-size:var(--text-sm)`。
  - `font-medium` → `--font-weight-medium`（`index.css:60` = `var(--weight-medium)` = 500, `tokens.css:66`）＝ mock `font-weight:var(--weight-medium)`。
  - `text-ink` → `--color-ink`（#1d1d1f）＝ mock `color:var(--color-ink)`。
  - **`text-center` を持ち込んでいない**（plan round-1 P-002 の指摘どおり左寄せ）。mock は `text-align` 指定なし＝左寄せで一致。逸脱なし。

- **[N-002]** `min-w-0` の二段配置（ADR-004）が正しく成立している。中央 grid アイテムである `HeaderCenter` root に `${SEARCH_BOX_WRAPPER} min-w-0`（`HeaderCenter.tsx:30`）、descendant の `.header-doc` に `min-w-0`（`HEADER_DOC`）。`APP_HEADER` の中央 `1fr` = `minmax(auto,1fr)` の auto 最小がアイテムの `min-w-0` で 0 に解放され、内側で ellipsize する定石。片方だけでは長文がヘッダーを押し広げる暗黙依存だが両方存在する。manual-test でも `header.scrollWidth > clientWidth === false` かつ ellipsis 実発動を確認済み（AC-2 成立）。

- **[N-003]** a11y（AC-3）成立。`.header-doc` は `aria-hidden="true"`（`HeaderCenter.tsx:32`）の装飾要素。読み上げ対象のエディタ本体 `<input id="note-editor-title">` は sr-only `<label>「タイトル」`（`NoteEditor.tsx:495-497`）を持ち `aria-hidden` は付かない。装飾ラベルと実 input が同時に読み上げられる二重読み上げは発生しない。

- **[N-004]** レスポンシブの breakpoint 境界が意図どおり。header-doc は `sm:hidden`（≥640 で非表示）、検索ラッパーは `data-[doc]:max-sm:hidden`（title 有りかつ <640 で非表示）で、640 を境に相補的:
  - desktop（≥640）: title 非表示 / 検索表示（AC-4）。
  - mobile 編集（<640, title 有）: title 表示 / 検索 `display:none`（AC-8、検索置換）。
  - mobile 非編集（title=null）: header-doc 未レンダー / 検索表示（AC-5, AC-6）。
  `--breakpoint-*` の二重定義（`tokens.css`/`index.css`）には一切触れておらず、既存の `sm:`/`max-sm:` バリアントのみ使用。CLAUDE.md の breakpoint 注意点に抵触なし。`data-doc={hasTitle || undefined}`（`HeaderCenter.tsx:37`）は「属性を消費する要素自身に付与」規約（#818 ADR-004）に一致し、`group-data-*`（プロジェクト未使用）を導入していない。

- **[N-005]** 検索アイコンの絶対配置は `HeaderCenter` ネスト後も破綻しない（検証済み）。`SEARCH_BOX_ICON` は `absolute left-[11px]`、containing block は `relative` を持つ root（`SEARCH_BOX_WRAPPER`）。間に挟まる `data-[doc]:max-sm:hidden` の wrapper は非 positioned・全幅・padding/margin なしの静的ブロックなので、`<input class="w-full">` の左端＝root 左端＝アイコン基準 に変化なし。アイコン位置・input 左端とも従来と同一。

- **[N-006]** スタイル規約準拠: 追加は utility 文字列（`HEADER_DOC`）のみで handwritten CSS / `@apply` の新規追加なし。`.note-detail-content` 例外系にも触れていない。`data-[doc]:max-sm:hidden` は単一使用のため styles.ts への集約は不要（「繰り返し文字列」ではない）。`HeaderCenter.tsx:30` の `${SEARCH_BOX_WRAPPER} min-w-0` インライン連結は、`SEARCH_BOX_WRAPPER` が Header 専用で他用途に `min-w-0` を波及させたくないため妥当な局所化（定数側に足す代替も可だが現状で問題なし）。churn 封じ込め（ADR-006）の `EditorTitleProvider` children-as-prop 構造も `AppShellDrawer.tsx:193-217` で正しく実装され、意図がコメント化されている。

- **[N-007]**（軽微・cosmetic）`HeaderCenter` root が `SEARCH_BOX_WRAPPER`（`max-w-[460px] mx-auto`）を流用するため、viewport 460–640px では header-doc も 460px 幅・中央寄せの箱に収まり、mock の「中央セル全幅左寄せ」から僅かに外れる。ただし主対象は <640（実機 390 で検証済み）で、この帯域では title が従来の検索ボックスと同じ位置・幅に出るため視覚的一貫性はむしろ保たれる。実害なし・修正不要。
