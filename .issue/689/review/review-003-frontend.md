# PR #712 レビュー Round 3 — Frontend / UX / a11y / スタイリング規約

対象: Issue #689（P12 エディター残存乖離: タグ行 / タイトル / ディレクトリ行 / 本文枠線）
観点: Frontend / UX / a11y / Styling 規約準拠（CLAUDE.md）
基準: plan.md AC-1〜AC-7 / ADR-001〜006 / `spec/design/pages/P12-editor.html`
種別: ゼロベースのフルレビュー（Round 1・2 修正後の最新差分）

## サマリ

AC-1/AC-3/AC-4/AC-5 はいずれも実装されており、`pnpm test:unit`（3783 件）緑。Round 2 W-001（listbox option を Tab 順から外す）と Round 2 が確認した3点は、最新コミット `4ccdb975` で正しく反映されている:

- **Tab 順からの除外**: directory option 本体（`DirectoryTreeSelect.tsx:329`）/ create option（`:277`）/ 展開キャレット（`:304`）/ Rename・Delete（`:389, 398`）すべてに `tabIndex={-1}` が付与され、検索 input から Tab すると（`onFocusOut` の non-null relatedTarget 経由で）パネルが閉じる設計どおりの挙動になった。`__tests__/DirectoryTreeSelect.test.tsx:352-357` に option の `tabIndex === -1` を検証するテストも追加済み。新たな副作用は見当たらない。
- **`aria-selected={isActive}` + `data-selected={isSelected}`**: Round 2 のコミット `4ccdb975` で `aria-selected` を active option（`aria-activedescendant` 対象）へ戻し、確定選択は `data-selected` で表現する形に統一した（`:278, 330-332`）。これは既存リファレンス `DirectorySelectField.tsx:290-292` および同 PR 内の方針と一致しており、コードベース横断で同一規約になっている（後述 N-001 でこの規約自体の WAI-ARIA 上の含意のみ記録）。
- **検索クエリ変更時の activeIndex リセット**（`:252-258`）、**combobox の aria-label 一本化**（`:250` のみ、listbox は `aria-labelledby={labelId}`）も維持されている。

スタイリング規約・モック準拠（値一致）・React パターン・lockstep（AC-2）・UX 退行封じ込め（Ingestion `fieldset` 無変更）はおおむね良好。新規の Blocker / Warning はなし。Note を3件記録する。

---

### Frontend / UX / a11y

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** `role="option"` の `aria-selected` が「確定選択」ではなく「`aria-activedescendant` のハイライト」を指す（コードベース既存規約）。
  - 場所: `DirectoryTreeSelect.tsx:278`（create）, `:330`（directory）— ともに `aria-selected={isActive}`。確定選択は `data-selected={isSelected}`（`:332`、視覚のみ）。
  - 内容: WAI-ARIA APG の single-select listbox + `aria-activedescendant` パターンでは、`aria-selected="true"` は「選ばれている option」を表し、`aria-activedescendant` が指す option は「ハイライト中（仮想フォーカス）」を表す別概念とされる。本実装は両者を `isActive` に束ね、実際に選択中のディレクトリ（チェックアイコン行）は `aria-selected` 上は false のまま、矢印でハイライトした行が `aria-selected="true"` と読み上げられる。モック HTML（`P12-editor.html:1011`）は `.selected` 行にだけ `aria-selected="true"` を付けており、厳密にはモック/APG とずれる。
  - ただし: これは本コンポーネント単体の判断ではなく、リファレンス実装 `DirectorySelectField.tsx:290`（`aria-selected={isActive}` + `data-selected={isSelected}`）と同一の**コードベース横断の既存規約**であり、Round 2 で意図的にこの規約へ揃えた経緯がある（コミット `4ccdb975`）。本 PR だけを APG 厳密形（`aria-selected={isSelected}` + `aria-current` などで active を別表現）へ変えると `DirectorySelectField` と非対称になり一貫性が崩れる。よって本 PR のスコープでの修正対象とはせず、規約自体の見直しは（もし行うなら）`DirectorySelectField` を含む横断 Issue として扱うのが妥当。Note 止まりとする。

- **[N-002]** ディレクトリ行の可視ラベル「ディレクトリ」（`<span id={labelId}>`, `DirectoryTreeSelect.tsx:206-211`）が listbox には `aria-labelledby` で結びつくが、pill トリガーボタンには関連付いていない。
  - 場所: `DirectoryTreeSelect.tsx:206-233`。`labelId` は `role="listbox"` の `aria-labelledby`（`:262`）に使われるが、トリガー `<button className={dirPillTrigger}>`（`:222-233`）は `aria-labelledby` / `aria-label` を持たず、アクセシブル名は内容（フォルダーアイコン + `triggerLabel` テキスト + キャレット）から算出される。
  - 影響: 未選択時の `triggerLabel` は「ディレクトリを選択」、選択時は `path`、新規時は「新規: {name}」で、いずれも自己記述的なため AT 利用者がトリガーの用途を理解できないわけではない。ただし可視ラベル「ディレクトリ」がトリガーと無関係になっており、「ラベル + コントロール」の関係が a11y ツリー上は表現されていない（モックの `.dir-row` も `.dir-label` と `.dir-pill` を視覚並置のみで関連付けていないため、モック準拠としてはそのまま）。トリガーに `aria-labelledby={labelId}`（＋必要なら内容との合成）を付けると関係が明示でき尚良い。実害は小さく Note 止まり。

- **[N-003]** 検索 input が `type="search"` のため、一部ブラウザで Escape が「入力クリア」のネイティブ挙動を持つ。
  - 場所: `DirectoryTreeSelect.tsx:239`（`type="search"`）。
  - 内容: `usePopover` の Escape は document レベルの keydown リスナ（`usePopover.ts:206-212`）でパネルを閉じる。`type="search"` の input にフォーカスがある状態で Escape を押すと、ブラウザによっては input の検索ワードクリアが先に走り、ユーザーの「Escape で閉じる」期待と挙動が分岐し得る（クリア → もう一度 Escape で閉じる、等）。document リスナは `stopPropagation` するが、これは他リスナへの伝播を止めるだけでブラウザのネイティブ search-clear は抑止しない。閉じる動作自体は document リスナで担保されるため致命的ではないが、検索ワードが入った状態での Escape の体感が環境依存になる点を記録する。`type="text"` + `inputMode="search"` にする、または onKeyDown で Escape を明示ハンドルする選択肢がある。安全側のため Note 止まり。

#### 確認できた良好な点（参考・指摘ではない）

- **AC-1 タグ行**: `TagsInput`（`ul`/`li`、ADR-005-4）。`#{name}` チップ + 末尾 borderless input。Enter/`,` 確定は `isComposing` ガード（`TagsInput.tsx:39`）、空 draft Backspace で末尾削除（`:45-49`）、onBlur 確定（`:80-82`、ADR-005-5、`addTag` 冪等で二重確定無害）。`aria-label="タグ"`（行）/「新規タグ」（input）/「{name} を削除」（削除）。styles 値はモック `.tag-chip`（26px/pill/surface/12.5px/accent-ink/hover）・`.tag-input`（borderless/min-w-140px）と一致。
- **AC-2 lockstep**: `resolveTagNames`（`editorState.ts:600-613`）を submit と autosave snapshot の双方が通る。`setTagDraft` は dirty にしない（`:481-487`）が autosave deps に `tagDraft` を含めて draft 救済が成立（Round 2 N-005 と同様、現状維持で正しい）。`addTag` の「新規ゼロ件なら draft クリアのみ・dirty 据え置き」分岐（`:467-472`）も適切。
- **AC-3 タイトル**: `titleInput`（`styles.ts:16-17`）に `font-heading` + `leading-[1.12]` + `mb-5`、モック `.title-input`（`line-height:1.12`）一致。
- **AC-4 ディレクトリ**: combobox（検索 input）+ 兄弟 listbox（ADR-005-1 の `haspopup="dialog"` 妥協）。可視 option フラット列は純粋関数 `visibleDirectoryOptions`（`directoryTreeModel.ts`）で算出し vitest 済み。ゼロ件ゲート（`hasListbox`, `:96`）は create option 常時 append で恒真になる構造（Round 2 N-002 と同じ・害なし）。新規作成 → `onSetPendingName`、既存選択 → `onSelectExisting`、`directoryId` XOR `pendingDirectoryName` 排他維持。Rename/Delete は `close()` → ダイアログ open 順（`:195-202`、ADR-005/S-004）。`onMouseDown` preventDefault で各 option/コントロールのフォーカスを検索 input に保持（dialog 分岐は Popover 側ガードが無いため個別付与・`Popover.tsx:140-151` と整合）。
- **AC-5 本文枠線**: `WysiwygEditor.tsx:576` と `InlineEditor.tsx:863` の両方から `rounded-md border border-hairline` のみ除去、`p-4`/`min-h-[480px]`/`focus-within:border-accent focus-within:shadow-focus`/`transition-[border-color,box-shadow]`（#692 範囲）温存。ADR-006 のとおり編集画面の実エディタ（`inline` モード）まで揃っている。HTML textarea / `<details>` は無変更で正しい。
- **Styling 規約**: 新規 utility（`tagsRow`/`tagChip`/`tagChipRemove`/`tagInputControl`/`dirPillTrigger`/`dirDropdownPanel`/`dirDropdownSearch`/`dirTreeItem`/`dirTreeItemNew`）はすべて `editor/styles.ts` に module-scoped 定数 + JSDoc。`data-[active]:`/`data-[selected]:` variant + `data-x={value || undefined}` 形・`motion-reduce:transition-none` 付与。handwritten CSS / `@apply` の持ち込みなし。トークンは bridge 済み utility 経由。
- **UX 退行封じ込め**: `variant="fieldset"`（Ingestion）ブランチ無変更（`DirectoryPicker.tsx:192-217`）、`row` のみ早期 return で委譲（hooks は分岐前に無条件実行で順序維持）。props 契約・`parseTagInput` シグネチャ不変で `NoteEditor`/reducer/submit/autosave/Ingestion へ波及なし。
- **React パターン**: `options`/`selected` を `useMemo`、activeIndex クランプは `options.length` 変化時のみの関数更新 effect（`:92-94`）、open 時 `setTimeout(0)` で検索 input フォーカス + close 時 transient state リセット（`:106-118`）、`creating` 切替で `newNameRef.focus()`（`:120-122`）、active option `scrollIntoView({block:"nearest"})`（`:101-104`）— いずれも健全。option key は `option.id` / `"__create__"` で安定。

---

## 結論

AC-1/AC-3/AC-4/AC-5 は満たされ、Round 2 W-001（option を Tab 順から除外）を含む前ラウンドの全指摘は最新差分で修正済み。品質ゲート（unit 3783 件）緑。新規の Blocker・Warning はなし。Note は3件（N-001 既存規約に基づく `aria-selected` の意味づけ・横断 Issue 案件 / N-002 トリガーとラベルの a11y 関連付け / N-003 `type="search"` の Escape ネイティブ挙動）で、いずれも安全側で実害小。本 PR は Frontend / UX / a11y / スタイリング規約の観点でマージ可能水準にある。
