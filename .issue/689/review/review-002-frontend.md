# PR #712 レビュー Round 2 — Frontend / UX / a11y / スタイリング規約

対象: Issue #689（P12 エディター残存乖離: タグ行 / タイトル / ディレクトリ行 / 本文枠線）
観点: Frontend / UX / a11y / Styling 規約準拠（CLAUDE.md）
基準: plan.md AC-1〜AC-7 / ADR-001〜006 / `spec/design/pages/P12-editor.html`
種別: ゼロベースのフルレビュー（Round 1 修正後の最新差分）

## サマリ

AC-1/AC-3/AC-4/AC-5 は実装されており、`pnpm test:unit`（3777 件）緑。Round 1 の3指摘はいずれも修正済みを確認した:

- **DirectoryTreeSelect の `aria-selected`**: directory option は `aria-selected={isSelected}`（= `option.id === directoryId`、チェックアイコン行）になっており、`data-active={isActive}` と分離済み（`DirectoryTreeSelect.tsx:327-329`）。create option は `aria-selected={false}`（`:277`）。Round 1 W-001（`aria-selected={isActive}` への束ね）は解消。
- **検索クエリ変更時の activeIndex リセット**: `onChange` で `setActiveIndex(0)`（`:252-258`）。フィルタで可視集合が同長のまま入れ替わるケースを length-only クランプ effect が取りこぼす問題を補っている。
- **combobox の aria-label 一本化**: 検索 input は `aria-label="ディレクトリ検索"` のみ（`:250`）で `aria-labelledby` は付いていない。listbox 側だけ `aria-labelledby={labelId}`（`:262`）。Round 1 N-002 は解消。

その上で、Round 1 では拾われていなかった a11y の Tab フォーカス順序に1件の Warning を挙げる。スタイリング・モック準拠・React パターン・UX 退行封じ込めはおおむね良好。

---

### Frontend / UX / a11y

#### Blockers

なし

#### Warnings

- **[W-001]** combobox + listbox（`aria-activedescendant` 仮想フォーカス）モデルなのに listbox の option が Tab フォーカス順に乗っている（実フォーカスが検索 input から逃げる）
  - 場所: `app/components/note/editor/DirectoryTreeSelect.tsx:270-286`（create option `<button>`）, `:301-318`（展開キャレット `<button>`）, `:320-352`（directory option `<button>`）, `:384-399`（Rename/Delete `<button>`）— いずれも `tabIndex={-1}` を持たない通常の `<button>`
  - 理由: ADR-003 / ADR-005 と本コンポーネント JSDoc（`:29-35`）は「**実フォーカスは常に検索 input に留め**、ArrowUp/Down で `aria-activedescendant` を可視 option 列に移動させる（DOM フォーカスは動かさない）」という WAI-ARIA combobox + popup listbox モデルを明示している。ところが option/キャレット/作成/Rename/Delete はすべて素の `<button>`（フォーカス可能・Tab 順に乗る）であり、`tabIndex={-1}` が付いていない。`onMouseDown={e => e.preventDefault()}` は**ポインタ操作時のフォーカス移動だけ**を抑止するもので、キーボードの Tab には効かない。結果として、検索 input にフォーカスがある状態で Tab を押すと、ウィジェットの外へ抜けるのではなく**最初の option ボタンへ実フォーカスが移る**。`Popover` の `onFocusOut` はフォーカスがコンテナ内に残る限り閉じない（`usePopover.ts:221-234`）ため、ユーザーは Tab を連打すると全ディレクトリ option / キャレット / 作成 / Rename / Delete を1つずつ DOM フォーカスでなぞることになる。この間、検索 input 上の `aria-activedescendant` は実フォーカス位置と乖離し（仮想フォーカスと実フォーカスの2系統が同時に存在）、設計が回避しようとした「2モデル衝突」がキーボード経路で実際に発生する。combobox/listbox option を非モーダルポップアップで仮想フォーカス駆動する場合、option は Tab 順から外す（`tabIndex={-1}` か非ボタン要素）のが WAI-ARIA APG の前提。
  - 提案: listbox 配下の `role="option"` 本体ボタン2種（directory / create）と展開キャレットボタンに `tabIndex={-1}` を付け、Tab 順から外す。これにより検索 input から Tab すると（`onFocusOut` の non-null relatedTarget 経由で）パネルが閉じてウィジェットを抜ける、設計どおりの挙動になる。Rename/Delete は「listbox の外（dialog パネル内の補助アクション）」なので Tab で到達できてよい設計余地はあるが、少なくとも option 群とキャレットは仮想フォーカスモデルと整合させるため Tab 順から外すべき。`DirectorySelectField`（リファレンスとされた既存実装）が option をどう扱っているかと突き合わせて方式を統一すると尚良い。

#### Notes

- **[N-001]** `role="listbox"` の直下に role を持たない `<div>` ラッパーが入っている。directory option は `<div key={option.id} className="relative">` で（キャレット + 本体ボタンの relative ラッパー、`:293`）、create option は `<div key="__create__">`（区切り線 `<div className="my-1 h-px bg-hairline" />` + ボタン、`:268-269`）で包まれており、いずれも `role="listbox"` の子として option 以外の要素（presentational な `div` / 区切り線）が混在する。WAI-ARIA 上 listbox の子は `option` / `group` のみが正で、多くの AT は presentational ラッパーを透過するため実害は小さいが、厳密には不整合。`relative` ラッパーは `button-in-button` 回避（ADR-005-3）のため不可避な構造なので、必要なら当該ラッパーに `role="presentation"` を付けると意図が明確になる。区切り線も listbox の外（検索 input と listbox の間、または create option を listbox 外の独立行）に出す選択肢がある。安全側のため Note 止まり。

- **[N-002]** plan/ADR で繰り返し強調された「検索ゼロ件時の `role="listbox"` 非描画 + `aria-activedescendant` 宙吊り防止ゲート」（arch S-001）は構造上ほぼ起動しない。`visibleDirectoryOptions` は常に末尾へ `{ kind: "create" }` を append する（`directoryTreeModel.ts:141`）ため `options.length >= 1` が恒真で、`hasListbox`（`:96`）はパネルが開いている限り常に true、`aria-expanded={hasListbox}`（`:243`）も実質「開いていれば常に true」。`aria-activedescendant` が実在しない id を指す状態は元々起こり得ない。安全側に倒っており害はないが、ゲートのコメント/設計意図と実体の間に齟齬がある点を記録する（`returns only the create option when nothing matches` テストが構造的に「ゼロ件 listbox は発生しない」ことを示している）。

- **[N-003]** `aria-haspopup="dialog"`（trigger）+ 内側 `role="combobox"` は ADR-005-1 の意図した妥協。`Popover` の `haspopup="listbox"` モードはパネル自身に `role="listbox"` を付けてしまい「combobox と listbox を兄弟に」という制約と両立しないため `haspopup="dialog"`（汎用 dialog パネル）を採用し、その内側に combobox 検索 input + 兄弟 listbox を自前描画している（`DirectoryTreeSelect.tsx:218`, Popover dialog 分岐 `Popover.tsx:140-151`）。trigger の `aria-haspopup` は厳密には combobox を指さないが、開いた直後に実フォーカスが検索 input へ移り以降は combobox+listbox が a11y を担うため実害は小さい、という ADR 判断は妥当。設計どおりの実装であることを確認した。

- **[N-004]** IME 配慮は良好。`TagsInput`（Enter/`,` 確定の前に `event.nativeEvent.isComposing` ガード、`TagsInput.tsx:39`）、検索 input の Enter（`DirectoryTreeSelect.tsx:185`）、新規ディレクトリ名 input の Enter（`:371`）すべてで変換確定中の Enter による誤確定を防いでいる。`TagsInput` の `onBlur` 確定（`:80-82`）は ADR-005-5 のとおりで、reducer の `addTag` が冪等（既存タグとの重複を無視、`editorState.ts:462-466`）なので二重確定も無害。空 draft Backspace で末尾チップ削除（`:45-49`）もモック挙動に一致。

- **[N-005]** lockstep（AC-2）は型とテストで担保。`resolveTagNames` 単一ヘルパー（`editorState.ts:600-613`）を submit（`NoteEditor.tsx:235`）と autosave snapshot（`useAutosave.ts:191-202` → `snapshotForSubmit` → `resolveTagNames`）の双方が通り、`useMemo` deps も `tagNames` + `tagDraft` の両方に更新済み（`useAutosave.ts:201`）。`setTagDraft` は `tags` を dirty にしない（`editorState.ts:481-487`）が、`tagDraft` を deps に含めることで「draft を残して別フィールドへ移動 → 次の dirty 契機で救済」が成立する。`addTag` の「新規ゼロ件なら draft だけクリア（dirty 据え置き）」分岐（`:467-472`）も適切。

- **[N-006]** スタイリング規約は遵守。新規 utility（`tagsRow` / `tagChip` / `tagChipRemove` / `tagInputControl` / `dirPillTrigger` / `dirDropdownPanel` / `dirDropdownSearch` / `dirTreeItem` / `dirTreeItemNew`）はすべて `editor/styles.ts` に module-scoped 定数として集約され JSDoc 付き（`styles.ts:80-144`）。`data-[active]:` / `data-[selected]:` variant + `data-x={value || undefined}` 形（`DirectoryTreeSelect.tsx:278, 328-329`）も規約どおり。`motion-reduce:transition-none` も各所に付与。handwritten CSS / `@apply` の持ち込みなし。トークンは `font-heading` / `leading-[1.12]` / `accent-ink` / `accent-surface` / `surface-hover` / `shadow-md` / `rounded-lg` / `rounded-pill` を bridge 済み utility 経由で使用。

- **[N-007]** モック準拠は良好で値が一致。`.title-input`（`font-heading` + `font-regular` + `tracking-tightest` + `leading-[1.12]` + `mb-5`、`styles.ts:16-17` / モック `:468-481` の `line-height:1.12` / `margin-bottom:space-5`）、`.dir-row`（`mb-3` = mock `space-3`、`:205`）、`.dir-label`（`text-xs uppercase tracking-[0.06em] text-ink-tertiary`、`:206-211` / mock `:496-501`）、`.tag-chip`（h-26px / pill / surface / 12.5px / accent-ink / hover:surface-hover）、`.dir-pill`（h-30px / pill / surface / hover:surface-hover）、`.dir-dropdown`（w-280px / rounded-lg / border-hairline / shadow-md / `max-sm` フル幅）、`.dir-tree-item`（selected = accent-surface/accent-ink + Check アイコン）が一致。タグチップは `#{name}` プレフィックス（`TagsInput.tsx:56`）でモックの `#tag` 表記に沿う。子インデント（`paddingLeft: indent + 22`、`indent = 8 + depth*16`、`:291, 331`）はモックの `.dir-tree-child { padding-left:18px }` を depth ベースで一般化したもので妥当。ラベル文言は SSOT「ディレクトリ」を維持（`DirectoryTreeSelect.tsx:59` 既定 / `DirectoryPicker.tsx:195` fieldset）。

- **[N-008]** 本文枠線撤去は ADR-006 のとおり `WysiwygEditor.tsx:576` と `InlineEditor.tsx:863` の両方から `rounded-md border border-hairline` のみを除去し、`p-4` / `min-h-[480px]` / `focus-within:border-accent focus-within:shadow-focus` / `transition-[border-color,box-shadow]`（#692 範囲）を温存。編集画面の実エディタ（`inline` モード = `InlineEditor`）まで揃えており、ブラウザ検証 TC-body の FAIL を踏まえた ADR-006 の対応が反映されている。HTML モードの textarea や `<details>` は本文キャンバスでなくフォームコントロールなので無変更で正しい。

- **[N-009]** UX 退行封じ込めは適切。`variant="fieldset"`（Ingestion）ブランチ（`DirectoryPicker.tsx:192-217`）は無変更で `DirectorySelectField` を維持し、`row` ブランチのみ早期 return で `DirectoryTreeSelect` へ委譲（`:98-110`、hooks は条件分岐の前に無条件実行で hook 順序を維持）。props 契約（`onSelectExisting` / `onSetPendingName` / `pendingDirectoryName` / `directoryId` / `tree` / `allowExistingActions`）不変のため `NoteEditor` 呼び出し・reducer・submit・autosave への波及なし。`parseTagInput` のシグネチャも不変。Rename/Delete は ADR-005/S-004 のとおり `close()`（フォーカスをトリガーへ戻す）→ ダイアログ open の順序（`DirectoryTreeSelect.tsx:195-202`）で、非モーダル `Popover` 前提の `previousActiveRef` 取りこぼし回避が正しい。新規作成→`onSetPendingName`、既存選択→`onSelectExisting` で `directoryId` XOR `pendingDirectoryName` 排他も維持（トリガーラベル `:124-129`）。

- **[N-010]** React パターンは健全。`DirectoryTreeSelect` の `options` は `useMemo`（`:85-88`）、`selected` も `useMemo`（`:79-83`）。activeIndex クランプは `options.length` 変化時のみ走る effect で関数更新形（`:92-94`）。パネル open 時は `setTimeout(…, 0)` で検索 input にフォーカス、close 時に transient state（query/creating/newName）をリセット（`:106-118`）。option key は `option.id`（directory）/ `"__create__"`（create）で安定。active option の `scrollIntoView({ block:"nearest" })`（`:101-104`）も開いている時のみ。`creating` 切替時の `newNameRef.focus()`（`:120-122`）も適切。

---

## 結論

AC-1/AC-3/AC-4/AC-5 は満たされ、Round 1 の3指摘（`aria-selected` の選択状態反映 / 検索時 activeIndex リセット / combobox aria-label 一本化）はいずれも修正済み。品質ゲート（unit 3777 件）も緑。

新規指摘は **W-001（listbox option を Tab 順から外して仮想フォーカスモデルと整合させる）** の1件。ADR が掲げた「実フォーカスは検索 input に留める」combobox モデルがキーボード Tab 経路で崩れている点で、`tabIndex={-1}` の付与で解消できる。Blocker はなし。N-001/N-002 は安全側だが整合のため整理が望ましい。
