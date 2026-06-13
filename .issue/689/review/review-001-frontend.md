# PR #712 レビュー — Frontend / UX / a11y / スタイリング規約

対象: Issue #689（P12 エディター残存乖離: タグ行 / タイトル / ディレクトリ行 / 本文枠線）
観点: Frontend / UX / a11y / Styling 規約準拠（CLAUDE.md）
基準: plan.md AC-1〜AC-7 / ADR-001〜006 / `spec/design/pages/P12-editor.html`

## サマリ

AC-1〜AC-7 はおおむね満たされている。タグの二層 state（`tagNames` + `tagDraft`）と `resolveTagNames` lockstep、ディレクトリの combobox + 兄弟 listbox（`haspopup="dialog"` 採用）、本文枠線撤去（`WysiwygEditor` / `InlineEditor` 両方）、タイトルの `font-heading` + `leading-[1.12]` がいずれも実装され、`pnpm test:unit`（3748 件）/ `pnpm typecheck` ともに緑。スタイリングは utility-first・`data-*` 規約・トークン bridge・styles.ts 集約を遵守している。

Blocker はなし。a11y の `aria-selected` セマンティクスに 1 件の Warning（仕様上の不整合）と、plan で予告したゼロ件ゲートが実質デッドになっている点ほか数点を指摘する。

---

### Frontend / UX / a11y

#### Blockers

なし

#### Warnings

- **[W-001]** `role="option"` の `aria-selected` が「選択中（chosen）」ではなく「アクティブ（activedescendant ハイライト）」を反映している
  - 場所: `app/components/note/editor/DirectoryTreeSelect.tsx:272`（create option）, `:322`（directory option）— いずれも `aria-selected={isActive}`
  - 理由: combobox + listbox（`aria-activedescendant` 仮想フォーカス）モデルでは、`aria-activedescendant` が「いまフォーカス相当の option」を既に伝える。`aria-selected` は本来「ユーザーが選んだ option（= 現在の `directoryId`、チェックアイコンが付く行）」を示すべき属性。現状は `aria-selected` を `isActive` に束ねているため、スクリーンリーダーは矢印移動で通過しただけの option を「選択済み」とアナウンスし、実際に選ばれている（`data-selected` + Check アイコン付き）ディレクトリには `aria-selected` が一切付かない。単一選択 listbox の a11y 契約（選択状態を `aria-selected` で表す）と視覚表現（チェックマーク = 選択）が乖離している。
  - 提案: directory option は `aria-selected={isSelected}`（= `option.id === directoryId`）にする。アクティブ位置は `aria-activedescendant` が担うので二重に持たせない。`isSelected` を持たない create option は `aria-selected` を省略（または `false`）。`data-active` による視覚ハイライトはそのまま `isActive` 駆動で維持してよい。

#### Notes

- **[N-001]** plan/ADR で繰り返し強調された「検索ゼロ件時の `role="listbox"` 非描画 + `aria-activedescendant` 宙吊り防止ゲート」（arch S-001）は、実装上ほぼ起動しない。`visibleDirectoryOptions` は常に末尾へ `{ kind: "create" }` を append する（`directoryTreeModel.ts:141`）ため `options.length >= 1` が恒真で、`hasListbox` も常に true（パネルが開いている限り）。結果として `aria-activedescendant` が実在しない id を指す状態は元々起こり得ず、`aria-expanded={hasListbox}` も実質「開いていれば常に true」。安全側に倒っており害はないが、テスト `returns only the create option when nothing matches`（`directoryTreeModel.test.ts:84`）が示すとおり「ゼロ件 listbox」は構造上発生しないので、ゲートのコメント/設計意図と実体に齟齬がある点だけ記録しておく。
- **[N-002]** combobox 検索 input に `aria-labelledby={labelId}` と `aria-label="ディレクトリ検索"` の両方が付いている（`DirectoryTreeSelect.tsx:244, 251`）。WAI-ARIA では `aria-label` が `aria-labelledby` より優先されるため `aria-labelledby` は実質デッド属性（読み上げは「ディレクトリ検索」になる）。listbox 側 `aria-labelledby={labelId}`（`:257`）は妥当。検索 input の `aria-labelledby` は削るのが素直（害はないので Note 止まり）。
- **[N-003]** `aria-haspopup="dialog"`（trigger）と内側 `role="combobox"` の組み合わせは、ADR-005-1 で意図的に選択された妥協（`Popover` の `haspopup="listbox"` モードはパネル自体に `role="listbox"` を付けてしまい「combobox と listbox を兄弟に」という WAI-ARIA 制約と両立しないため `haspopup="dialog"` を採用）。trigger の `aria-haspopup` は厳密には combobox を指さないが、開いた直後に実フォーカスが combobox（検索 input）へ移り以降は combobox+listbox が a11y を担うため実害は小さい、という ADR の判断は妥当。設計意図どおりに実装されていることを確認した。
- **[N-004]** キーボードのみでツリー展開キャレットを直接トグルできない点は ADR-005-3 で明示的に許容された設計（キャレットは絶対配置の兄弟 `<button>`、キーボードからの展開は検索の祖先自動展開で代替）。`button-in-button` 回避のため `role="option"` 本体ボタンと展開キャレットを兄弟に分けた構造は HTML 妥当で、`onMouseDown` の `preventDefault()` で検索 input へのフォーカス保持も全コントロール（option / キャレット / create / Rename / Delete）に一貫して付与されている（`:276, :306, :328, :382, :391`）。実フォーカスが検索 input に保持される設計は正しく実装されている。
- **[N-005]** IME 配慮は良好。`TagsInput`（Enter/`,` 確定、`:39` `isComposing` ガード）、検索 input の Enter（`:185`）、新規ディレクトリ名 input の Enter（`:366`）すべてで `nativeEvent.isComposing` をチェックしており、変換確定中の Enter による誤確定を防いでいる。`TagsInput` の `onBlur` 確定（`:80`）は ADR-005-5 のとおりで、reducer の `addTag` が冪等（重複無視）なので二重確定も無害（`editorState.ts:467`）。
- **[N-006]** lockstep（AC-2）は型とテストの両面で担保されている。`resolveTagNames` 単一ヘルパーを submit（`NoteEditor.tsx:235`）と autosave snapshot（`useAutosave.ts:191-202` → `snapshotForSubmit` → `resolveTagNames`）の双方が通り、`useMemo` deps も `tagNames` + `tagDraft` 両方に更新済み（`:201`）。`setTagDraft` が `tags` を dirty にしない（`editorState.ts:481-487`）ため「draft だけ変えても autosave が走らない」一方、`tagDraft` を deps に含めることで「draft を残して別フィールドへ移動 → 次の dirty 契機で救済」も成立する。テスト `resolveTagNames`（`editorState.test.ts:761-`）/ `snapshotForSubmit`（`:738-`）/ `addTag`・`removeTag`・`setTagDraft`（`:327-375`）が網羅的。
- **[N-007]** スタイリング規約は遵守。新規 utility（`tagsRow` / `tagChip` / `tagChipRemove` / `tagInputControl` / `dirPillTrigger` / `dirDropdownPanel` / `dirDropdownSearch` / `dirTreeItem` / `dirTreeItemNew`）はすべて `editor/styles.ts` に module-scoped 定数として集約され JSDoc 付き（`styles.ts:80-144`）。`data-[active]` / `data-[selected]` variant + `data-x={value || undefined}` 形（`DirectoryTreeSelect.tsx:273, 323-324`）も規約どおり。handwritten CSS / `@apply` の持ち込みなし。トークンは `font-heading` / `leading-[1.12]` / `accent-ink` / `accent-surface` / `surface-hover` / `shadow-md` / `rounded-lg` / `rounded-pill` を bridge 済み utility 経由で使用。
- **[N-008]** モック準拠は良好。`.tag-chip`（h-26px / pill / surface / 12.5px / accent-ink / hover:surface-hover）、`.tag-input`（borderless / transparent / min-w-140px）、`.dir-pill`（h-30px / pill / surface / hover）、`.dir-dropdown`（w-280px / rounded-lg / border-hairline / shadow-md / `max-sm` フル幅）、`.dir-tree-item`（selected = accent-surface/accent-ink + Check）が `spec/design/pages/P12-editor.html` の値と一致。タグチップ表示は `#{name}` プレフィックス付き（`TagsInput.tsx:56`）でモックの `#tag` 表記に沿う。子インデント（`paddingLeft: indent + 22`、`indent = 8 + depth*16`）はモックの `.dir-tree-child { padding-left: 18px }` を depth ベースで一般化したもので、ネスト表現として妥当。
- **[N-009]** UX 退行リスクは適切に封じ込められている。`variant="fieldset"`（Ingestion）ブランチ（`DirectoryPicker.tsx:192-217`）は無変更で `DirectorySelectField` を維持、`row` ブランチのみ `DirectoryTreeSelect` へ差し替え（`:98-110`）。props 契約（`onSelectExisting` / `onSetPendingName` / `pendingDirectoryName` / `directoryId` / `tree` / `allowExistingActions`）不変のため `NoteEditor` 呼び出し・reducer・submit・autosave への波及なし。`parseTagInput` のシグネチャも不変で `IngestionPreviewForm`（`:33, 195, 311`）は無影響。Rename/Delete は ADR-005/S-004 のとおり `close()`（フォーカスをトリガーへ戻す）→ ダイアログ open の順序（`DirectoryTreeSelect.tsx:195-202`）で実装され、非モーダル `Popover` 前提の `previousActiveRef` 取りこぼし回避が正しい。
- **[N-010]** 本文枠線撤去は ADR-006 のとおり `WysiwygEditor.tsx:576` と `InlineEditor.tsx:863` の両方から `rounded-md border border-hairline` のみを除去し、`p-4` / `min-h-[480px]` / `focus-within:border-accent focus-within:shadow-focus`（#692 範囲）を温存。`transition-[border-color,box-shadow]` も残っており #692 着手時のコンフリクトを避ける限定変更になっている。
- **[N-011]** React パターンは健全。`DirectoryTreeSelect` の `options` は `useMemo`（`:85-88`）、`activeIndex` クランプは `options.length` 変化時のみ走る effect（`:92-94`）でフィルタ/折りたたみ時の宙吊りを防ぐ。option key は `option.id`（directory）/ `"__create__"`（create）で安定。パネル open 時の検索 input フォーカスは `setTimeout(…, 0)`（`:116`）でマウント後に確実に当て、close 時に transient state（query/creating/newName）をリセット（`:106-113`）。`activeIndex` クランプ effect で `setActiveIndex` を関数更新形にしている点も再レンダー誘発を抑えており良い。

---

## 結論

機能・a11y・スタイリング・モック準拠のいずれも plan/ADR の設計どおりに実装され、品質ゲート（typecheck / unit）も緑。**W-001（`aria-selected` を選択状態に束ね直す）** のみ a11y 仕様の正確性として対応を推奨する。N-001 / N-002 は安全側だが整合のため整理すると望ましい。
