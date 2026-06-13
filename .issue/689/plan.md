# 実装計画 — Issue #689: エディター画面（P12）がデザインモックと依然不一致（タグ行/タイトル/ディレクトリ行）

**Issue:** #689
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

P12 エディター（`NoteEditor`）の残存乖離4箇所（タグ行・タイトル入力・ディレクトリ行・本文枠線）を、デザインモック `spec/design/pages/P12-editor.html` とデザイントークンを正として揃える。#669/PR #676 で見送った判断（タグ・ディレクトリ）を再検討し、本Issueで明確な方針を確定する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | タグ行がモック `.tags-row` / `.tag-chip` / `.tag-input` 準拠のチップUIになっている（既存タグは個別 `×` 削除可能なチップ、末尾に borderless `.tag-input` が同一行に flex 共存、ラベルなし、`mb-5`）。Enter/カンマ確定で追加、空入力での Backspace で末尾チップ削除 | Issue 受け入れ条件1 / ADR-001 | 2, 3, 4 |
| AC-2 | タグの追加・削除・保存・autosave が従来どおり機能し、submit ペイロードの `tagNames` が正しく構成される（重複排除・trim・順序保持を維持）。**さらに、入力途中（Enter 未押下）の `tagDraft` が非空のまま submit / autosave した場合も、当該タグが確定されて `tagNames` に含まれる**（ADR-001 の draft 確定ルール。submit と autosave が同一の純粋ヘルパー `resolveTagNames(state)` を通る） | Issue 重要原則（データ表現変更時の慎重な設計） / ADR-001 | 1, 2, 4 |
| AC-3 | タイトル入力に `font-heading` が適用され、`line-height` がモックの 1.12 相当（`leading-[1.12]`）になっている | Issue 受け入れ条件2 | 5 |
| AC-4 | ディレクトリ行がモックの単一 pill トリガー + ツリードロップダウン構造に移行している（検索 input・折りたたみツリー・選択ハイライト・「新規ディレクトリを作成…」導線を備え、外側クリック/Escape で閉じ、キーボードナビと a11y を満たす）。**a11y モデルは WAI-ARIA「combobox（aria-activedescendant 仮想フォーカス）+ popup listbox」を採用**（検索 input が `role="combobox"`、option 群が `role="listbox"`/`option`、実フォーカスは検索 input 固定。ステップ6b 参照）。**pill トリガー・パネル内の表示ラベルは現行実装の SSOT「ディレクトリ」を維持**（モックの英字 `DIRECTORY` は uppercase 体裁であり日本語表記を変える根拠にしない）。**インライン新規ディレクトリ作成導線が機能する（`pendingDirectoryName` 契約を維持し、新規作成→保存で実体化される）ことを独立に検証する**。既存選択（`directoryId`）契約と submit/autosave を壊さない。`variant="fieldset"`（Ingestion）は無変更 | Issue 受け入れ条件3 / ADR-003 | 6, 6b, 6c |
| AC-5 | WYSIWYG 本文の editor body から `border-hairline` / `rounded-md` が外れ、ボーダーレスな原稿キャンバスになっている（focus 表現は #692 へ温存） | Issue 受け入れ条件4 | 7 |
| AC-6 | 上記の方針判断が `.issue/689/adr.md` に ADR-001（タグのチップ化）/ ADR-002（`TagsInput` 新設）/ ADR-003（ディレクトリ完全移行・combobox+listbox a11y モデル）/ ADR-004（本文枠線撤去・padding/focus 温存）の4件として記録されている | Issue 受け入れ条件 | ADR（全ステップの設計判断を集約） |
| AC-7 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue 受け入れ条件 | 全ステップ後 |

## スコープ

### 含まれないもの

- **エディターの最大幅問題**（詳細760px / 編集1100px の不一致）→ 別Issue #688。本Issueは `editor-wrap` の幅に触れない。
- **フォーカス表現の刷新**（エディタ全体リング廃止・caret-only / タイトルの箱リング / グローバル 4px リング細線化）→ 別Issue #692。本Issue ⑦ は **枠線（border/rounded）の撤去のみ** 行い、`focus-within:border-accent focus-within:shadow-focus` 等のフォーカス表現は温存する（同一 className を触るため連動に注意）。
- **ディレクトリの `variant="fieldset"`（Ingestion 共用）の改修** → 本Issue では `variant="row"` のみを新UIへ移行し、`fieldset` は無変更（ADR-003）。Ingestion 側のUI刷新は本Issue スコープ外。
- ツールバー・要素並び順・各行余白・本文 `min-height` → PR #676 で対応済み。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/NoteEditor.tsx` — オーケストレーター。373-388 がタグ行（縦積みラベル付きカンマ区切り input）、343-355 がタイトル input、358-371 が DirectoryPicker 呼び出し。submit 時 240 行で `parseTagInput(state.tagInput)` を実行。
  - `app/components/note/editor/styles.ts` — 15-16 が `titleInput`（`font-heading` 欠落、`leading-tight`）。76-77 に `dirRowPillInput`（再利用可能な 30px pill input パターン）。
  - `app/components/note/editor/editorState.ts` — `tagInput: string` を保持する reducer。`parseTagInput`（カンマ区切り→配列）、`snapshotForSubmit`、`createInitialEditorState`（`tagInput: init.tagNames.join(", ")`）。`setTagInput` アクション。`EditorSnapshotInput` は `tagInput` を含む。
  - `app/components/note/editor/DirectoryPicker.tsx` — 173-190 が `variant="row"`（`DirectorySelectField` + 新規名 input の2フィールド常時表示）。`variant="fieldset"`（193-219）は Ingestion と共用。props 契約: `tree: FlatDirectory[]` / `directoryId: string|null` / `pendingDirectoryName: string|null` / `onSelectExisting` / `onSetPendingName` / `allowExistingActions`（NoteEditor のみ true）/ `allowNestedPath`（Ingestion のみ true）/ `legendSlot`（Ingestion のみ）/ `variant`。
  - `app/components/directory/DirectorySelectField.tsx` — `row`/`fieldset` 双方が使う検索付きコンボボックス（`role="combobox"` + `role="listbox"`/`option`、client 側フィルタ、IME-safe Enter、`clearable`）。`options: DirectoryOption[]`（`id`/`name`/`path`/`depth`）を props で受ける単一選択。深さインデントは `paddingLeft: 12 + depth*16`。完全移行後の `row` では未使用になるが、本Issue スコープでは削除しない（`fieldset`・他サーフェスが使用）。
  - `app/components/common/Popover.tsx` / `usePopover.ts`（Issue #467） — **再利用する基盤**。`haspopup="listbox"` モード、外側 mousedown / Escape / Tab-out での閉じ、トリガーへのフォーカス復帰、`aria-haspopup`/`aria-expanded`/`aria-controls` 配線、`clampToViewport`（縦横ビューポートクランプ）を提供。フォーカストラップは持たない非モーダル設計。
  - `app/components/common/useRovingMenu.ts`（Issue #467） — `itemRole: "option"` で roving-tabindex（Arrow/Home/End）を提供。`activeIndex` を**実 DOM の `.focus()`** に反映する実フォーカス roving。**本ディレクトリドロップダウンでは使わない**（採用する combobox + `aria-activedescendant` 仮想フォーカスモデルと相反するため。ADR-003 / arch P-001）。
  - `app/components/note/list/ViewSwitcher.tsx` — `Popover haspopup="listbox"` + `useRovingMenu({ itemRole:"option" })` + `role="option"` ボタン群の listbox ドロップダウン実装。検索 input を持たないため roving 方式はそのまま流用できない。combobox + listbox の駆動は `DirectorySelectField` / `NotePickerDialog`（自前 `activeIndex` + `aria-activedescendant`）を直接の実装リファレンスにする。
  - `app/components/directory/DirectoryTree.tsx` — サイドバーの `role="tree"`/`treeitem` 折りたたみツリー（`expanded` map + 子の再帰描画 + Arrow による treeitem 間移動）。a11y 構造（tree+Link ナビ+Rename/Delete メニュー）が listbox ドロップダウンと異なるため流用不可だが、**折りたたみアルゴリズムは参考にする**。
  - ツリーデータ供給: `FlatDirectory`（`id`/`parentId`/`name`/`depth`/`path`）は SSOT が `app/components/note/directoryTree.ts` だが、既存 `DirectoryPicker` / `NoteEditor` は `../loaders`（`loaders.ts:307` が `directoryTree.ts` から re-export）から `import type { FlatDirectory } from "../loaders"` している。**新コンポーネントも既存に合わせ `../loaders` からインポートする**（表記ゆれ防止 / arch S-003）。`loadDirectoryTreeFlat`（RSC loader, `loaders.ts`）/ `getDirectoryTreeFn`（client server-fn, `note/actions.ts`）が SSOT の `flattenDirectoryTree` を通して供給。`parentId` で親子を再構成でき、折りたたみツリー描画に十分。
  - モック `spec/design/pages/P12-editor.html` の `.dir-row`（489-560 / 984-1032）: `.dir-pill`（h-30px・pill・surface・フォルダーアイコン + 現在パス + キャレット、`aria-expanded`/`aria-controls`）。`.dir-dropdown`（w-280px・`top:38px left:76px`、`rounded-lg border-hairline shadow-md`、`max-sm` で `left:0 right:0` フル幅）。内部に `.dir-dropdown-search`（h-30px・surface・`rounded-sm`）、`.dir-tree-item`（caret + フォルダーアイコン + 名前、`.selected` で `accent-surface`/`accent-ink` + チェックアイコン）、`.dir-tree-child`（`padding-left:18px`）、区切り線、`新規ディレクトリを作成…`（accent 色 + プラスアイコン）。**ラベル文言の SSOT（coverage P-001）:** ユーザー向け表記は**現行実装の「ディレクトリ」を SSOT として維持**する（不用意な文言変更を避ける）。モックの英字 `DIRECTORY` は uppercase 体裁の参照であり日本語表記を変える根拠にしない。a11y ロール（`combobox`/`listbox`/`option`）は本計画で確定する WAI-ARIA モデル（後述・ADR-003）に従い、モック HTML の `role` 記述には拘束されない。
  - 新規作成フロー: `pendingDirectoryName: string`（NoteEditor は reducer の `setPendingDirectoryName`、Ingestion は useState）。保存時に `createDirectoryFn`（NoteEditor `getDirectoryIdForSave`、NoteEditor.tsx:224-226）で実体化し id を `createNoteFn`/`saveNoteFn` に渡す。Ingestion は `directoryNameToCreate` ペイロードで commit。既存選択と新規名は相互排他。
  - `app/components/note/editor/WysiwygEditor.tsx` — 576 行の `EditorContent` className に `min-h-[480px] rounded-md border border-hairline bg-bg p-4 ... focus-within:border-accent focus-within:shadow-focus`。
  - `app/components/note/editor/useAutosave.ts` — `snapshotForSubmit` を介して autosave ペイロードを構成（`tagInput` 経由）。
- あるべきアーキテクチャ:
  - フロントエンドの UI スタイリング/構造変更。ドメイン・ユースケース・アダプターへの影響はない。送信ペイロードの形（`tagNames: readonly string[]`）はサーバー側契約として既に確定済みで変わらない。
  - Styling は utility-first、トークンは `tokens.css` SSOT → `index.css` `@theme inline` で Tailwind utility へ bridge 済み（`font-heading` / `leading-*` は bridge 済みなので `font-heading` / `leading-[1.12]` がそのまま使える）。状態は `data-*` 属性 + `data-[name]:` variant。繰り返す utility 文字列は module-scoped 定数へ集約。
  - `editorReducer` は純粋関数で vitest から全状態遷移を検証する設計。タグの state 表現を変える場合はここを起点に設計する。
- 既存実装の状態:
  - タグ行・ディレクトリ行は #669 ADR-001/ADR-002 で「差分許容」「ドロップダウン内装は非再現」と判断され、モックと構造が乖離している。本Issueでこの判断を **再検討して確定** する（タグ: #669 ADR-001 を supersede / ディレクトリ: ユーザー判断により #669 ADR-002 を supersede し**完全移行**＝本Issue ADR-003）。
  - タイトル・本文枠線は単純な utility の過不足。
  - 再利用可能なチップ実装の調査結果: PR #691 の `app/components/public/styles.ts` `CHIP` / `CHIP_REMOVE` および `app/components/note/list/styles.ts` `filterChip` 系は **URL フィルタの toggle chip**（選択状態を URL に反映）であり、編集用の「入力バッファ + 追加/削除可能なチップ列」コンポーネントではない。`app/components/common/styles.ts` の `chip`（base）はスタイル定数のみ。つまり **編集可能なタグ入力チップ UI の再利用可能コンポーネントは存在しない**。スタイルはモック `.tag-chip` / `.tag-input` の値を直接 utility 化して新規に作る。
- 依存関係:
  - タグ state を `tagInput: string` から配列ベースへ変えると `editorState.ts`（reducer / `parseTagInput` / `snapshotForSubmit` / `createInitialEditorState` / `EditorSnapshotInput`）、`useAutosave.ts`、`NoteEditor.tsx` の submit、および `editorState` 周りの既存テストに波及する。後方互換を保つため **`parseTagInput` の責務を入力バッファのトークナイズに限定** し、確定済みタグは配列で持つ二層構造にする（設計参照）。
  - **`parseTagInput` の外部利用（arch S-002）:** `app/components/ingestion/IngestionPreviewForm.tsx`（`import { parseTagInput } from "../note/editor/editorState"`、`:162` 独自 `tagInput` useState・`:195` `parseTagInput(tagInput)`・`:310` `value={tagInput}`）が `parseTagInput` を使う。本計画は `parseTagInput` のシグネチャ（カンマ区切り→trim→重複排除）を変えず残すため Ingestion は無影響（責務「縮小」は実体としてほぼ no-op）。ただし `editorState.ts` の `tagInput` 由来 API を消す際に Ingestion を壊さないことを、ステップ8 の grep（`parseTagInput` / `state.tagInput` 参照箇所＝`app/components/ingestion/` 含む全箇所）で確認する。
  - **autosave スナップショット依存（arch P-002 / S-001）:** `useAutosave.ts:182-193` は `snapshotForSubmit({ title, contentHtml, frontMatter, tagInput, directoryId })` を `useMemo`（deps に `tagInput`）で組む。二層化後は snapshot ソースを **確定タグ `tagNames` に一本化**し、未確定 `tagDraft` の確定は submit / autosave の双方が同一の純粋ヘルパー `resolveTagNames(state)`（= `tagNames` に非空 `tagDraft` を `parseTagInput` で確定マージ）を通す形で lockstep を担保する。`useMemo` deps を `tagInput` から `tagNames` + `tagDraft` の両方に更新する（`addTag`/`removeTag` は新配列を返すので参照同一性で dirty 判定可能、`tagDraft` も deps に含めることで「draft 入力中のまま離脱→次の autosave で救済」を成立させる）。
  - ディレクトリ完全移行は `DirectoryPicker.tsx` の `row` ブランチ差し替え + 新コンポーネント `DirectoryTreeSelect`（仮）新設に閉じる。`DirectoryPicker` の props 契約（`onSelectExisting` / `onSetPendingName` / `pendingDirectoryName` / `directoryId` / `tree` / `allowExistingActions`）を変えないため `NoteEditor.tsx` の呼び出し・reducer・submit・autosave への波及は無い（選択契約は不変）。`fieldset` ブランチには一切触れないため Ingestion 無影響。Rename/Delete ダイアログ連携（`allowExistingActions`）は新UIの選択行アクションへ移植する。

## 設計

### ドメインモデルへの影響

なし。タグの永続表現・サーバー契約（`tagNames: readonly string[]`）は不変。本Issueはプレゼンテーション層のフォーム state とスタイルのみ。

### ユースケース / アプリケーションロジック

なし。`createNoteFn` / `saveNoteFn` / `saveNoteDraftFn` の入力 `tagNames` は配列のまま。

### アダプター / 永続化 / 外部連携

なし。

### UI / プレゼンテーション

4つの対象を以下の方針で実装する（判断詳細は ADR）。

1. **タグ行（チップ化する — ADR-001）**: editor の form state を「確定タグ配列 `tagNames: string[]`」+「入力中バッファ `tagDraft: string`」の二層に再設計する。
   - `editorState.ts`:
     - `EditorState.tagInput: string` を `tagNames: readonly string[]` + `tagDraft: string` に置き換える。
     - アクション: `setTagInput` を廃止し、`addTag`（draft 確定 / カンマ・Enter）、`removeTag`（index または name 指定）、`setTagDraft`（バッファ更新）を追加。`addTag` は trim・空スキップ・重複排除（既存 `tagNames` と照合）を内包。dirty key は引き続き `"tags"`。
     - `createInitialEditorState`: `tagNames: [...init.tagNames]`, `tagDraft: ""`。
     - `parseTagInput`: バッファ確定時のトークナイズ（カンマ区切り・trim・重複排除）に責務を縮小し、`addTag` reducer から利用（ペースト時の複数タグ一括追加も同経路で扱える）。
     - **`resolveTagNames(state)` 純粋ヘルパーを新設**（arch P-002 / S-001）: `state.tagNames` に非空 `state.tagDraft` を `parseTagInput` で確定マージした `readonly string[]` を返す。submit（`NoteEditor.onSubmit`）と autosave スナップショット（`useAutosave` → `snapshotForSubmit`）の**両方がこの単一関数を通る**ことで未確定 draft の確定ロジックを lockstep にする。`snapshotForSubmit` / `EditorSnapshotInput` は `tagInput` 依存を除去し `tagNames`（+ draft 確定）を参照する形に変更。これにより「Enter 未押下のタグが保存されない」事故を防ぎつつ、submit と autosave で同一結果を保証する。
   - 新規プレゼンコンポーネント `TagsInput`（`app/components/note/editor/TagsInput.tsx`、`"use client"` 不要なら省略可だが入力ハンドラ持つため client 子として `NoteEditor` 内利用）: モック `.tags-row` 準拠。`role="list"`、各チップ `role="listitem"`（`#name` 表示 + `×` ボタン `aria-label="{name} を削除"`）、末尾に borderless `.tag-input`（`aria-label="新規タグ"`, `placeholder="タグを追加…"`）。キーボード: Enter / `,` で確定、空 draft で Backspace → 末尾チップ削除。
   - styles: `styles.ts` に `tagsRow` / `tagChip` / `tagChipRemove` / `tagInput` をモック値で追加（`.tags-row` flex wrap gap-1.5 mb-5 / `.tag-chip` h-[26px] px-2.5 rounded-pill bg-surface text-[12.5px] text-accent-ink / `.tag-input` borderless transparent min-w-[140px]）。`accent-ink` は token bridge 済みを確認して使用。
2. **タイトル（ステップ5）**: `titleInput` の `font-regular` 維持しつつ `font-heading` を追加、`leading-tight` を `leading-[1.12]` に置換。
3. **ディレクトリ行（ステップ6 / 6b / 6c — ADR-003）**: `variant="row"` を単一 pill トリガー + ツリードロップダウンへ**完全移行**する（ユーザー判断）。新コンポーネント `DirectoryTreeSelect`（仮、`app/components/note/editor/`）を新設し、`DirectoryPicker` の `row` ブランチを差し替える。
   - **a11y モデル（arch P-001・本計画で確定）:** WAI-ARIA「**combobox（`aria-activedescendant` 仮想フォーカス）+ popup listbox**」パターンを採用する。検索 input に `role="combobox"` / `aria-expanded` / `aria-controls`（listbox の id）/ `aria-activedescendant`（現在ハイライト中の option id）を付与し、**実フォーカスは常に検索 input に留める**。ArrowUp/Down は `aria-activedescendant` を「可視 option フラット列」に沿って移動させる（DOM フォーカスは動かさない）。Enter で activedescendant の option を選択、Escape で（候補があれば）閉じる。**`useRovingMenu`（実フォーカス roving = tabindex 移動）はこのドロップダウンには使わない** — 仮想フォーカスと実フォーカス roving の2モデル衝突、および `role="listbox"` 直下に `combobox` 子を置く WAI-ARIA 不正を避けるため。`DirectorySelectField` / `NotePickerDialog` の自前 `activeIndex` + `aria-activedescendant` 駆動を実装リファレンスにする（`ViewSwitcher` の roving 方式は採らない）。
   - 構成: `Popover`（`clampToViewport`・外側クリック/Escape/Tab-out 閉じ・フォーカス復帰の土台としてのみ利用）を基盤に、トリガーはモック `.dir-pill`（フォルダーアイコン + 現在の選択ラベル + キャレット、`aria-expanded`/`aria-controls`）。パネル（モック `.dir-dropdown` 準拠の `rounded-lg border-hairline shadow-md`・w-280px、`max-sm` でフル幅）は、先頭に検索 input（`.dir-dropdown-search`・`role="combobox"`）、続けて `role="listbox"` コンテナ（折りたたみツリー = `role="option"` 群）、区切り線、末尾に「新規ディレクトリを作成…」option。combobox（検索 input）と listbox（option 群）は **兄弟**として並べ、combobox を listbox の子にはしない。
   - データ/ロジック: props の `FlatDirectory[]` を `parentId` で折りたたみツリーに再構成し、`expanded` map（`DirectoryTree` の折りたたみアルゴリズムを参考）で可視ノードを決める。検索 query は `name`/`path` 部分一致でフィルタし、ヒット時は祖先を自動展開。可視 option を**フラット列**に並べ、その index を自前の `activeIndex`（`aria-activedescendant` が指す対象）として管理する。折りたたみ/検索で可視数が変わるたびに `activeIndex` をクランプする。
   - 選択ハイライト: 選択中 option に `data-selected`（モック `.selected` = `accent-surface`/`accent-ink` + チェックアイコン）。現在 active な option（`aria-activedescendant`）は別の `data-active` で視覚表現。トリガーラベルは「選択中の `path`」/「新規: {name}」/「ディレクトリを選択」を出し分け（ラベル文言は SSOT「ディレクトリ」）。
   - 新規作成: 「新規ディレクトリを作成…」option（accent 色 + プラスアイコン）を選ぶとパネル内にインライン名入力を出し、確定で `onSetPendingName(name)` を呼んでパネルを閉じる。既存選択時は `onSelectExisting(id)`（呼び出し側が `pendingDirectoryName` を null にする既存挙動を維持）。Rename/Delete（`allowExistingActions`）は選択中ディレクトリ行のアクションとして移植する。**`Popover` は非モーダル（フォーカストラップ無し）なため、Rename/Delete ダイアログを開く際は `close()`（フォーカスをトリガーに戻す）→ ダイアログ open の順序にする**（消える option を `RenameDirectoryDialog` の `previousActiveRef` が掴まないように）。
   - 既存選択契約（`directoryId` XOR `pendingDirectoryName`）と submit/autosave は不変。IME-safe Enter（`isComposing`）を検索 input・新規名入力ともに `DirectorySelectField` / `InlineRenameInput` を参考に実装。
   - `variant="fieldset"`（Ingestion）は無変更。`DirectorySelectField` は本Issue では削除しない（`fieldset`・他サーフェスが使用）。
4. **本文枠線（ステップ7）**: `EditorContent` className から `rounded-md border border-hairline` を除去。`p-4` は本文の読みやすさ確保のため残すか撤去するかを判断（モックは padding なしだが実装はキャレット位置・クリック領域の都合で `p-4` 維持が無難 → ADR-004 で確定）。`focus-within:*` は温存。

## 実装ステップ

### 1. タグ state の二層化（reducer）

- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:** `EditorState` の `tagInput: string` を `tagNames: readonly string[]` + `tagDraft: string` に置換。`setTagInput` アクションを `addTag` / `removeTag` / `setTagDraft` に置換。`createInitialEditorState`（`tagNames: [...init.tagNames]`, `tagDraft: ""`）、`snapshotForSubmit` / `EditorSnapshotInput`（`tagNames` 直接参照、`tagInput` 依存除去）を更新。`parseTagInput` はバッファ確定トークナイザとして残し `addTag` から利用。**純粋ヘルパー `resolveTagNames(state)`（`tagNames` に非空 `tagDraft` を `parseTagInput` で確定マージ）を新設**し、submit と autosave の両経路がこれを通る lockstep を成立させる（arch P-002 / S-001）。
- **理由:** チップUIは「個別削除できる確定タグ列」と「入力中バッファ」を別個に持つ必要があり、単一テキスト値では表現できない（#669 ADR-001 が指摘した state 再設計）。

### 2. 既存 reducer テストの更新

- **対象ファイル:** `app/components/note/editor/__tests__/`（editorState 系テスト）
- **変更内容:** `setTagInput` を前提にしたテストを `addTag` / `removeTag` / `setTagDraft` へ移行。重複排除・trim・順序保持・空入力スキップ・Backspace 削除セマンティクスのケースを追加。
- **理由:** reducer は純粋関数として全遷移を vitest で検証する設計（editorState.ts JSDoc）。AC-2 の回帰防止。

### 3. TagsInput コンポーネント新設

- **対象ファイル:** `app/components/note/editor/TagsInput.tsx`（新規）、`app/components/note/editor/styles.ts`
- **変更内容:** モック `.tags-row` 準拠のチップ列 + borderless 入力。props: `tagNames`, `draft`, `onAddTag`, `onRemoveTag`, `onSetDraft`, `disabled`。a11y（`role="list"` / `listitem`、削除ボタン `aria-label`、入力 `aria-label`）。styles.ts に `tagsRow` / `tagChip` / `tagChipRemove` / `tagInputControl` をモック値で追加。
- **理由:** 再利用可能なチップ入力コンポーネントが存在しないため新規作成。utility-first / data-* 規約準拠。

### 4. NoteEditor のタグ行差し替えと submit 配線

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** 373-388 の縦積みラベル付き input を `<TagsInput>` に置換。`onAddTag` / `onRemoveTag` / `onSetDraft` を新アクションへ dispatch。submit（240 行付近）の `parseTagInput(state.tagInput)` を `resolveTagNames(state)`（確定タグ + 未確定 draft の確定マージ）へ変更。`fieldLabel` import が不要になれば整理。`useAutosave` も同一 `resolveTagNames` を経由するよう、`useAutosave.ts` の `snapshotForSubmit` 入力を `tagInput` から `tagNames` + `tagDraft` に切り替え `useMemo` deps を更新する（ステップ1 の依存変更とセット）。
- **理由:** AC-1 / AC-2。送信ペイロードの `tagNames` 配列契約は維持。

### 5. タイトル input のフォント・行高

- **対象ファイル:** `app/components/note/editor/styles.ts`
- **変更内容:** `titleInput` に `font-heading` を追加し `leading-tight` を `leading-[1.12]` に置換。JSDoc を更新。
- **理由:** AC-3。モック `.title-input`（`font-family: var(--font-heading)`, `line-height: 1.12`）準拠。

### 6. ディレクトリツリーモデル + 折りたたみ/検索ロジック（純粋関数）

- **対象ファイル:** `app/components/note/editor/directoryTreeSelect.ts`（新規、純粋ヘルパー）。テストは `app/components/note/editor/__tests__/`。
- **変更内容:** `FlatDirectory[]` → 折りたたみツリー描画モデルへの変換と、可視 option の**フラット列**算出を純粋関数で実装する。要素: (1) `parentId` から子リストを再構成、(2) `expanded` map を受けて可視ノード（祖先がすべて展開済みのノード）の順序付きフラット列を返す、(3) 検索 query（`name`/`path` 部分一致）でフィルタし、ヒットノードの祖先 id 集合を返す（自動展開用）。`flattenDirectoryTree`（`note/directoryTree.ts`）の depth/path は再利用。
- **理由:** `aria-activedescendant` が指す `activeIndex` は可視 option 数に一致させる必要があり（ADR-003 の combobox+listbox モデル）、折りたたみ × 検索で可視集合が変わるロジックを UI から切り出して vitest で検証可能にする。CLAUDE.md「ロジックは純粋関数で」。

### 6b. DirectoryTreeSelect コンポーネント新設（pill + listbox ドロップダウン）

- **対象ファイル:** `app/components/note/editor/DirectoryTreeSelect.tsx`（新規）、`app/components/note/editor/styles.ts`（pill / dropdown / tree-item の utility 追加）。
- **変更内容:** `Popover`（`clampToViewport`、`panelClassName`、外側クリック/Escape/Tab-out 閉じ・フォーカス復帰の土台）を基盤に、**WAI-ARIA combobox（`aria-activedescendant` 仮想フォーカス）+ popup listbox** モデル（本計画で確定・ADR-003）で、モック `.dir-row` / `.dir-pill` / `.dir-dropdown` / `.dir-tree-item` 準拠の単一 pill トリガー + ツリードロップダウンを実装。**`useRovingMenu`（実フォーカス roving）は使わない**。combobox 駆動は `DirectorySelectField` / `NotePickerDialog` の自前 `activeIndex` + `aria-activedescendant` 実装をリファレンスにする（`ViewSwitcher` の roving 方式は採らない）。要素:
  - トリガー: `.dir-pill`（フォルダーアイコン + 現在ラベル + キャレット、`aria-expanded`/`aria-controls`、`Popover` の `trigger` render-prop に配線）。ラベルは選択中 `path` / `新規: {name}` / 未選択プレースホルダ「ディレクトリを選択」の出し分け（文言 SSOT は「ディレクトリ」）。
  - パネル: 検索 input（`.dir-dropdown-search`、`role="combobox"`・`aria-expanded`・`aria-controls`・`aria-activedescendant`、IME-safe・**実フォーカスは常にここ**）と、その**兄弟**として `role="listbox"` コンテナ（可視 option = 折りたたみツリー、選択中に `data-selected` で `accent-surface`/`accent-ink` + チェックアイコン、active な option に `data-active`、子は `padding-left`）、区切り線、`新規ディレクトリを作成…` option（accent + プラスアイコン）、選択時インライン名入力。combobox を listbox の子にはしない（WAI-ARIA 準拠）。
  - props: `tree`, `directoryId`, `pendingDirectoryName`, `onSelectExisting`, `onSetPendingName`, `disabled`, `allowExistingActions`（選択中ディレクトリの Rename/Delete アクション）, `label`（既定「ディレクトリ」）。
  - キーボード: ArrowUp/Down は `activeIndex` を可視 option フラット列（ステップ6 の純粋関数）に沿って移動させ `aria-activedescendant` を更新（実フォーカスは検索 input 固定）。Enter で active option を選択、Escape で閉じる。閉じる/フォーカス復帰/外側クリックは `Popover` に委譲。
  - **候補ゼロ時の listbox ゲート（arch S-001）:** 検索フィルタで可視 option が 0 件になった場合は `role="listbox"` コンテナと `aria-activedescendant` を**非描画**にする（`DirectorySelectField` の `hasListbox` ゲート相当）。combobox の `aria-activedescendant` が実在しない id を指す状態を防ぐ。
  - **「新規ディレクトリを作成…」導線の扱い（arch S-002・確定）:** この導線は ArrowUp/Down の可視 option フラット列（= `aria-activedescendant` の移動対象）に**含める**。`role="option"` として id を振り、ステップ6 のフラット列の末尾（区切り線の後）に並べて activedescendant 対象とする。これによりキーボードのみで新規作成導線へ到達・Enter 確定でき、可視数と `activeIndex` の整合（フラット列 = 既存可視 option 群 + 新規作成 option）も一貫する。
  - **Rename/Delete アクション（`allowExistingActions`）:** 選択行のアクション押下時は `close()`（フォーカスをトリガーに戻す）→ ダイアログ open の順序にする（`Popover` 非モーダルのため、消える option を `RenameDirectoryDialog` の `previousActiveRef` が掴まないようにする / arch S-004）。
  - styles.ts に `dirPillTrigger` / `dirDropdownPanel` / `dirDropdownSearch` / `dirTreeItem` / `dirTreeItemNew` をモック値で追加（`accent-surface`/`accent-ink`/`shadow-md`/`rounded-lg` 等の token bridge 済みを確認）。
- **理由:** AC-4。再利用可能なツリードロップダウン部品が無いため新規作成。`Popover` 再利用で閉じ・フォーカス・クランプの作り込みを最小化し、combobox+listbox の a11y は `DirectorySelectField` パターンを踏襲（ADR-003）。

### 6c. DirectoryPicker の row ブランチ差し替え

- **対象ファイル:** `app/components/note/editor/DirectoryPicker.tsx`
- **変更内容:** `variant === "row"` ブランチ（173-190）を `<DirectoryTreeSelect>` の描画に差し替え、`onSelectExisting` / `onSetPendingName` / `pendingDirectoryName` / `directoryId` / `tree` / `allowExistingActions` をそのまま渡す。Rename/Delete ダイアログ（`renameOpen`/`deleteOpen` state + `RenameDirectoryDialog`/`DeleteDirectoryDialog`）は `row` でも引き続き機能させる（新UIの選択行アクションから、ドロップダウンを `close()` してから開く順序で / arch S-004）。`variant === "fieldset"` ブランチ（193-219、`DirectorySelectField` + 新規名 input）は**一切変更しない**。JSDoc を完全移行（row）/ 据え置き（fieldset）に更新し ADR-003 を参照。`NoteEditor.tsx` の呼び出しは props 不変のため変更不要。
- **理由:** AC-4。props 契約を保ったまま `row` の内部実装だけを差し替え、Ingestion（`fieldset`）と選択契約・submit/autosave を壊さない（ADR-003）。

### 7. 本文 editor body のボーダーレス化

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:** 576 行 `EditorContent` の className から `rounded-md border border-hairline` を除去（`p-4` の扱いは ADR-004 で確定）。`focus-within:border-accent focus-within:shadow-focus` 等のフォーカス表現は **温存**（#692 範囲）。
- **理由:** AC-5。モック `.editor` はボーダー・角丸なしの原稿キャンバス。

### 8. 品質ゲート

- **対象ファイル:** —
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し通す。`parseTagInput` / `state.tagInput`（旧 API）を参照する**全箇所を grep で洗い出し**（`app/components/ingestion/IngestionPreviewForm.tsx` の `parseTagInput` 利用を含む）、二層化で壊れないことを確認する（arch S-002）。`parseTagInput` のシグネチャは不変なので Ingestion は無影響である点を確認。
- **理由:** AC-7。

## 設計判断

- **ADR-001**: タグ行をチップ化する（#669 ADR-001 の差分許容を supersede）。state を `tagNames[]` + `tagDraft` の二層に再設計。
- **ADR-002**: チップ入力は既存 toggle chip（PR #691 等）を再利用せず、編集用 `TagsInput` を新設する。
- **ADR-003**: ディレクトリ行（`variant="row"`）を単一 pill トリガー + ツリードロップダウンへ**完全移行**する（ユーザー判断・モック完全準拠、#669 ADR-002 を supersede）。a11y は **WAI-ARIA combobox（`aria-activedescendant` 仮想フォーカス）+ popup listbox** を採用し（`useRovingMenu` の実フォーカス roving は使わない）、`Popover` を閉じ/フォーカス/クランプの土台として再利用して新 `DirectoryTreeSelect` を新設。ラベル文言は SSOT「ディレクトリ」を維持。`variant="fieldset"`（Ingestion）は無変更。
- **ADR-004**: 本文 editor body は border/rounded を撤去するが `p-4` と `focus-within` フォーカス表現は温存する。

詳細は `.issue/689/adr.md` 参照。

## リスクと注意点

- タグ state 再設計が autosave スナップショット（`useAutosave` → `snapshotForSubmit`）と submit の両経路に波及する。両者が**純粋ヘルパー `resolveTagNames(state)` を通って `tagNames` を同一ソースから読む**ことを必ず保証する（lockstep）。具体的には `useAutosave.ts:182-193` の `snapshotForSubmit` 入力を `tagInput` から `tagNames` + `tagDraft` に切り替え、`useMemo` deps（現 `tagInput`）を `tagNames` + `tagDraft` の両方へ更新する（arch P-002）。
- 未確定 draft（入力途中で submit/autosave）の扱いを曖昧にすると「入力したのに保存されないタグ」が生じる。ADR-001 で確定したルール（submit/autosave 時に `resolveTagNames` で非空 draft を確定してから送る）を実装で厳守する。submit だけ確定して autosave は確定しない、という非対称を入れると lockstep が崩れるため、両経路を同一ヘルパーに通す（arch P-002 / S-001）。
- IME 変換確定中の Enter で誤確定しないよう、`isComposing` / `compositionend` を考慮する。
- ⑦ の className 変更は #692 が触る `focus-within:*` と同一文字列。border 撤去のみに限定し、フォーカス系トークンを誤って削らないこと。
- `accent-ink` / `font-heading` / `leading-[任意値]` が `@theme inline` で bridge 済みであることを使用前に確認（`accent-ink`・`font-heading` は bridge 確認済み）。`accent-surface` / `shadow-md` 等ドロップダウンで使うトークンも bridge を確認。
- **（ディレクトリ完全移行）本Issue最大の工数・退行リスク。** 新 `DirectoryTreeSelect` は `row` 専用に書き起こすため、既存選択の保存・新規ディレクトリ作成・autosave 連携の退行に注意。`DirectoryPicker` の props 契約と `fieldset` ブランチを変えないことで影響範囲を `row` に閉じ込める。
- **（ディレクトリ）a11y モデルは combobox + listbox に確定済み（arch P-001）。** `role="listbox"` 直下に検索 `combobox` 子を置く WAI-ARIA 不正、および `useRovingMenu` の実フォーカス roving と `aria-activedescendant` 仮想フォーカスの2モデル衝突を避けるため、検索 input を listbox の**兄弟**に置き、option 群は `aria-activedescendant` で駆動する（`useRovingMenu` は不使用）。
- **（ディレクトリ）折りたたみ × `activeIndex` の整合。** 折りたたみ/検索で可視 option 数が変わるたびに「可視 option フラット列」（ステップ6 純粋関数）と `activeIndex`（`aria-activedescendant` が指す対象）を一致・クランプさせないと矢印移動が破綻する。
- **（ディレクトリ）IME。** 検索 input・新規ディレクトリ名入力ともに変換確定中の Enter で誤確定しないよう `isComposing` を考慮（`DirectorySelectField` / `InlineRenameInput` を参考）。
- **（ディレクトリ）Ingestion 非回帰。** `variant="fieldset"` を絶対に変更しない。両 variant の動作をテストで担保する。`parseTagInput` のシグネチャ不変により Ingestion の `parseTagInput` 利用も無影響（ステップ8 grep で確認）。
- **（ディレクトリ）`Popover` は非モーダル（フォーカストラップ無し / arch S-004）。** Rename/Delete ダイアログを開く際は `close()`（フォーカスをトリガーに戻す）→ ダイアログ open の順序にし、消える option を `RenameDirectoryDialog` の `previousActiveRef` が掴まないようにする。
- **（ディレクトリ）インポート元の統一（arch S-003）。** `FlatDirectory` は既存に合わせ `../loaders`（`directoryTree.ts` からの re-export）からインポートする。

## テスト方針

- `editorState` reducer の単体テスト: `addTag`（trim / 空スキップ / 重複排除 / カンマ複数）、`removeTag`、`setTagDraft`、dirty key 付与、`snapshotForSubmit` が `tagNames` を正しく返すこと。
- **`resolveTagNames(state)` ヘルパーの単体テスト**（arch P-002 / S-001）: 非空 `tagDraft` が確定マージされること（`tagNames` + draft、重複排除・trim・順序保持）、空 draft 時は `tagNames` をそのまま返すこと、カンマ複数 draft の確定。submit / autosave が同一結果になる lockstep の根拠。
- `TagsInput` のインタラクションテスト（任意・余力があれば）: Enter / カンマ確定、`×` 削除、空 draft Backspace 削除、IME 確定中 Enter の非確定。
- **（ディレクトリ）`directoryTreeSelect.ts` 純粋関数の単体テスト**（ステップ6）: `FlatDirectory[]` → 子再構成、`expanded` map に対する可視 option フラット列（順序・祖先閉じ時の非可視）、検索フィルタ（`name`/`path` 部分一致 + ヒット祖先集合）。`activeIndex`（`aria-activedescendant` が指す対象）が可視数と一致することの根拠。
- **（ディレクトリ）`DirectoryTreeSelect` のインタラクションテスト**: pill クリックで開く、外側クリック/Escape で閉じる、検索で絞り込み、ArrowUp/Down で `aria-activedescendant` が可視 option を移動（実フォーカスは検索 input に固定されること）、Enter で active option を選択 → `onSelectExisting` 呼び出し + 閉じる、「新規ディレクトリを作成…」→ インライン名入力 → `onSetPendingName`、選択ハイライト（`data-selected`）、`disabled` 時の不活性。Rename アクション押下で `close()`→ダイアログ open の順序になること（arch S-004）。
- **（ディレクトリ）非回帰確認**: `IngestionPreviewForm`（`variant="fieldset"` + `allowNestedPath` + `legendSlot`）が無変更で動作すること（既存 DirectoryPicker / DirectorySelectField のテストが緑のまま）。
- 手動/ブラウザ検証（`docs/test.md` 準拠・ローカルサーバー）: 新規/編集両 surface でタグ追加・削除→保存→詳細でタグが反映、autosave がタグ変更を拾う、タイトルが見出しフォント・狭い行高で表示、本文に枠線がない。**ディレクトリ: pill から既存選択→保存で反映、新規作成→保存で実体化、検索・折りたたみ・キーボードナビ・選択ハイライトがモック準拠、autosave がディレクトリ変更を拾う、Ingestion プレビュー（fieldset）が従来どおり動く。**
- `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目

**修正した点**:
- **[coverage P-001] ラベル文言の SSOT 統一**: 「場所」と「ディレクトリ」の混在を解消。**既存実装の表記「ディレクトリ」を SSOT として統一**（ユーザー向け文言の不用意な変更を避ける。モックの英字 `DIRECTORY` は uppercase 体裁の参照であり日本語表記を変える根拠にしない）。AC-4・調査結果・設計（UI）・ステップ6b・ADR-003 の表記を「ディレクトリ」に統一し、未選択プレースホルダも「ディレクトリを選択」とした。
- **[arch P-001] ディレクトリ行 a11y モデルを計画段階で確定**（「6bで確定」の先送りを廃止）: **WAI-ARIA「combobox（`aria-activedescendant` 仮想フォーカス）+ popup listbox」**を採用。検索 input に `role="combobox"`/`aria-expanded`/`aria-controls`/`aria-activedescendant` を付け実フォーカスは検索 input 固定、ArrowUp/Down は `aria-activedescendant` を可視 option 列に沿って移動。**`useRovingMenu`（実フォーカス roving）はこのドロップダウンには使わない**（2モデル衝突・listbox 直下 combobox 子の WAI-ARIA 不正を回避）。combobox を listbox の兄弟に配置。AC-4・設計（UI）・ステップ6b・ADR-003・リスク欄に明記し、「6bで確定」の記述を削除。
- **[arch P-002 / S-001] 未確定 draft 確定ロジックの lockstep を型・テストで担保**: submit と autosave snapshot の両方が同一の純粋ヘルパー `resolveTagNames(state)`（`tagNames` に非空 `tagDraft` を `parseTagInput` で確定マージ）を通す設計を明記。`useAutosave.ts:182-193` の `snapshotForSubmit` 入力を `tagInput` → `tagNames` + `tagDraft` に切り替え `useMemo` deps を更新する点をステップ1/4・依存関係・リスク欄に具体化。reducer テスト方針に `resolveTagNames` 単体テストを追加。AC-2 の検証文にも昇格（下記 S-003）。

**取り込んだ改善提案**:
- **[arch S-002]** `parseTagInput` の外部利用（`IngestionPreviewForm.tsx:33/162/195/310`）を調査結果・依存関係に明記し、ステップ8 grep 対象に `app/components/ingestion/` を含めた。シグネチャ不変につき Ingestion 無影響である点も補足。
- **[arch S-003]** `FlatDirectory` のインポート元を実コードで確認し、既存に合わせ `../loaders`（`directoryTree.ts` からの re-export, `loaders.ts:307`）からインポートする旨を調査結果・リスク欄に統一明記。
- **[arch S-004]** Rename/Delete ダイアログ連携で `Popover` 非モーダル前提のもと「`close()`（フォーカスをトリガーに戻す）→ ダイアログ open」順序を設計（UI）・ステップ6b/6c・リスク・テスト方針に明記。
- **[coverage S-001]** AC-6 を ADR-001〜004 と紐づけ、4件の内容（タグ化 / `TagsInput` 新設 / ディレクトリ完全移行・a11y モデル / 本文枠線）を列挙して検証可能化。
- **[coverage S-002]** AC-4 に「インライン新規ディレクトリ作成導線が機能する（`pendingDirectoryName` 契約維持・新規作成→保存で実体化）」を独立検証項目として追加。
- **[coverage S-003]** AC-2 に「submit/autosave 時に未確定 `tagDraft` が確定されて `tagNames` に含まれる」を検証文として昇格（`resolveTagNames` 経由の lockstep を明記）。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 2周目

両視点とも問題点ゼロで終了（軽微な改善提案3件を反映）。

**取り込んだ改善提案**:
- **[coverage S-001]** AC-6 の「対応ステップ」列が `—` のままだったため、AC-6 が「方針判断が ADR-001〜004 として記録されている」基準であることに合わせ「ADR（全ステップの設計判断を集約）」と記入し、他 AC と体裁を揃えた。
- **[arch S-001]** ステップ6b に、検索フィルタで可視 option が 0 件になった場合は `role="listbox"` コンテナと `aria-activedescendant` を非描画にする（`DirectorySelectField` の `hasListbox` ゲート相当）旨を追記し、`aria-activedescendant` が実在しない id を指さないようにした。
- **[arch S-002]** ステップ6b に、「新規ディレクトリを作成…」導線を ArrowUp/Down の可視フラット列（`aria-activedescendant` の移動対象）に**含める**方針を確定記載。`role="option"` として id を振りフラット列末尾に並べて activedescendant 対象とすることで、キーボードのみでの到達と可視数 = `activeIndex` 整合を担保した。

**見送った提案とその理由**:
- なし（軽微提案3件をすべて反映）。
