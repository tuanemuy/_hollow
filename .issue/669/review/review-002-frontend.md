# PR #676 レビュー — Round 2 / Frontend・UI 観点（ゼロベース）

レビュー対象: PR #676（Issue #669: P12 デザインモック整合 + 編集中フォーカス喪失の修正）
照合資料: `.issue/669/plan.md`（AC-1〜AC-6）/ `.issue/669/adr.md` / `spec/design/pages/P12-editor.html` / CLAUDE.md スタイル規約 / Round 1 記録（`.issue/669/review/review-001-frontend.md`）

## Round 1 指摘の修正確認

- **W-001（row variant の可視ラベル二重表示）→ 修正確認 OK。** `DirectorySelectField` に `labelHidden` prop（JSDoc 付き、`sr-only` 化で `<label htmlFor>` の a11y 関連付けは維持）を追加し、`DirectoryPicker` の row variant のみ `labelHidden={variant === "row"}` で opt-in。fieldset variant（Ingestion 側）はデフォルト `false` で従来表示のまま。修正は指摘の提案どおりで副作用なし。
- **W-002（pill input スタイルの裸文字列）→ 修正確認 OK。** `app/components/note/editor/styles.ts` に `dirRowPillInput` として hoist され、JSDoc にモック `.dir-pill` 由来と再利用指針が記録されている。`editorToolbar` / `titleInput` と同列の確立パターンに整合。

## AC 検証（UI 系 AC-1〜AC-6、モック実値との突き合わせ）

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 ツールバー | 満たす | `editorToolbar` = `sticky top-[calc(var(--header-height)+var(--space-2))] z-20 mb-4 inline-flex flex-wrap items-center gap-[2px] self-start rounded-pill border border-hairline bg-bg p-1 shadow-xs` — モック `.toolbar`（P12-editor.html:601-614: sticky / top calc(header+space-2) / z 20 / inline-flex / align-items center / gap 2px / padding 4px / bg / hairline / radius-pill / mb space-4 / shadow-xs）と全項目一致。`--radius-pill` / `--shadow-xs` は `@theme inline` で bridge 済み（index.css:93,103）。`max-sm` の横スクロールレール（#522: `self-stretch flex-nowrap overflow-x-auto` + scrollbar 非表示 + `[&>*]:shrink-0`）も維持。単一要素で sticky と overflow を両立する判断は ADR-004 どおりで CSS 仕様上正しい（sticky を壊すのは祖先の overflow） |
| AC-2 タイトル | 満たす | `titleInput` に `py-1 mb-5` — モック `.title-input` の `padding: 4px 0` / `margin-bottom: var(--space-5)`（=20px）と一致 |
| AC-3 右寄せ | 満たす | `editorActions` の `ml-auto` は既存どおり（plan の「検証のみ」と整合、diff でも不変） |
| AC-4 ディレクトリ行 | 満たす | `variant="row"` で fieldset 撤去、行 root `mb-3`（モック `.dir-row` の space-3）、ラベル span はモック `.dir-label`（12px=`text-xs` / uppercase / `tracking-[0.06em]` / ink-tertiary）一致、新規名入力は `dirRowPillInput`（h-30px / rounded-pill / bg-surface / px-3=12px / 13px = モック `.dir-pill` 実値）。labelHidden で二重ラベル解消済み。Ingestion 側は default `"fieldset"` で見た目凍結（fieldset 分岐の JSX は共通片の抽出のみで実質不変） |
| AC-5 タグ判断 | 満たす | adr.md ADR-001 に判断記録（シンプル入力踏襲・差分許容）。タグ行は `mb-5`（モック `.tags-row` の space-5）のみモックに合わせる、と ADR の決定どおり |
| AC-6 min-height 480px | 満たす | Wysiwyg `min-h-[480px]`（内側 `.ProseMirror` 440px = 480 − padding 16×2 で整合）、Inline ホスト `min-h-[480px]`、HtmlEditor textarea `min-h-[480px]`。共通 `fieldTextarea`（320px）は不参照・不変で、Tailwind の同一プロパティ競合を構造的に回避（ADR-005 どおり） |

## スタイル規約・構造の検証

- utility-first 準拠: 新規 CSS ファイル / `@apply` なし。繰り返しスタイルは `styles.ts` に hoist（`dirRowPillInput` 追加を含む）。
- `data-*` 規約: 変更箇所に新規の state スタイルなし。既存 `data-acked={isAcked || undefined}` 等は不変。
- 要素順序: `topbar → title → dir 行 → tags 行 → editor`（WYSIWYG ではツールバーが editor 直前）にモック準拠で並べ替え済み。
- `gap-4` 撤去に伴う余白移譲（ADR-006）: form 直下の全子要素を確認 — EditLockBanner `mb-4`（denied 以外は `null` を返すので幽霊余白なし）/ topbar `mb-4` / title `mb-5` / dir 行 `mb-3` / tags 行 `mb-5` / WysiwygEditor 内 unsupported バナー `mb-3`・ツールバー `mb-4` / FrontMatterEditor 既存 `mt-4` / MediaUploader 既存 `mt-4` / submit error `mt-4`。InlineEditor / HtmlEditor / WysiwygEditor の wrapper `mt-4` は撤去済みで付け漏れ・二重マージンなし。
- arbitrary value（`gap-[2px]` / `tracking-[0.06em]` / `text-[13px]` / `h-[30px]`）: モック側も literal でトークン未定義のため、トークン追加せず literal とする判断は tokens SSOT 方針と矛盾しない。
- InlineEditor の effect 分離（ADR-007）: mount-once effect が `rebuild` を ref 公開し、`[value]` リシンク effect は self-emit（`value === lastEmittedHtmlRef.current`）をスキップ。cleanup での `lastEmittedHtmlRef = null` リセットで StrictMode 再マウントの空ホスト化を防止し、`rebuild` 内で pending debounce timer の破棄と失敗パスでの observer 再 observe も一貫。round-trip のノード同一性 pin と StrictMode pin のテストが契約として適切。
- `routerInvalidate` のエディター除外: `EDITOR_ROUTE_IDS` 定数 + AND 合成で `_app` 除外と同型。テストは除外 2 ルート / 表示系ルート維持 / 追加 filter でのすり抜け不可 / `appShellInvalidate` 不変を pin しており plan ステップ1 の要求を満たす。

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** `routerInvalidate.ts` の `EDITOR_ROUTE_IDS` JSDoc が「re-running the loader … destroys in-progress edits (RSC tree swap remounts the editor and drops focus)」と断定しているが、TC-009 の実測（adr.md ADR-003 末尾の補正）では生 invalidate 後も同一インスタンスへの props 更新で済み、未保存編集は維持された。場所 `app/components/common/routerInvalidate.ts:59-65` 付近。理由: コード内ドキュメントが実測で補正済みの旧前提を断定形で残すと、将来の読者が「remount する」を確定事実として設計判断する恐れがある。提案: 「may destroy / 実測では props 更新で済むケースもある（ADR-003 補正参照）」程度に弱めるか、ADR-003 の補正節への参照を一言添える。除外の正当性自体（loader は seed 専用・invalidate に恩恵なし）は補正後も揺るがないため Note 扱い。→ 対応済み: 断定を「may destroy」に弱め、TC-009 実測と ADR-003 補正節への参照を JSDoc に追記。
- **[N-002]** row variant の行コンテナは `items-start`（モック `.dir-row` は `align-items: center`）。Round 1 N-002 の残置で、select 部が選択時に「選択中: …」行を積んで複数行になる現状では妥当な選択。将来 select 部を pill トリガー1行に痩せさせる際は `items-center` へ戻すとモックの垂直リズムに一致する。場所 `app/components/note/editor/DirectoryPicker.tsx`（row variant root）。
- **[N-003]** `HtmlEditor.tsx` の `font-mono text-mono resize-y` 直書きは Round 1 N-001 で許容済みの drift リスク（共通 `fieldTextarea` の将来変更に追従しない）。インラインコメントで出自（mock 480px floor / #669）が説明されており現状許容。

## 結論

Blocker・Warning ともなし。Round 1 の W-001 / W-002 は提案どおり正しく修正されている。AC-1〜AC-6 はモック実値（P12-editor.html の `.toolbar` / `.title-input` / `.dir-row` / `.dir-pill` / `.tags-row` / `.editor`）との突き合わせですべて満たされ、CLAUDE.md スタイル規約（utility-first / styles.ts hoist / data-* / トークン SSOT）への違反もない。
