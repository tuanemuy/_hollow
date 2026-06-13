# PR #712 レビュー Round 3 — テスト網羅性・テスト設計

対象 PR: #712（Issue #689 / ブランチ `issue/689/editor-mock-alignment`）
レビュー種別: フルレビュー（ゼロベース）。Round 2（`review-002-test.md`）の W-001 / W-002 解消も併せて確認。

対象テスト:
- `app/components/note/editor/__tests__/editorState.test.ts`（reducer / `resolveTagNames` / `snapshotForSubmit` / `parseTagInput`）
- `app/components/note/editor/__tests__/directoryTreeModel.test.ts`（純粋ツリーモデル）
- `app/components/note/editor/__tests__/DirectoryTreeSelect.test.tsx`（combobox + listbox 配線）
- `app/components/note/editor/__tests__/TagsInput.test.tsx`（チップ編集の配線）

対応実装: `editorState.ts` / `directoryTreeModel.ts` / `TagsInput.tsx` / `DirectoryTreeSelect.tsx` / `NoteEditor.tsx` / `useAutosave.ts`

実行確認: 上記 4 ファイル **136 件 green**（`pnpm vitest run` で確認。Round 2 の 130 件 → +6 件＝今ラウンドで埋まった rename / delete close→open 順序 ×2、zero-match ゲート ×1、aria/data-selected 役割分担 ×1、tabIndex ×1、IME 非確定 ×1 等）。

## 全体評価

Round 2 で残った 2 件の Warning は **両方とも解消** されている。

- **W-001（Rename/Delete の close→open 順序が無検証）** → `DirectoryTreeSelect.test.tsx:400-465` が `describe("rename / delete actions")` を新設。`RenameDirectoryDialog` / `DeleteDirectoryDialog` を「`open` のときだけ marker を描く」最小モックに差し替え（DOM-only ハーネスが router / server-fn コンテキストを持たないため妥当、過剰モックではない）、(a) `allowExistingActions + directoryId` 揃いで「リネーム」「削除」ボタンが描画、(b) `allowExistingActions` 無しでは非描画、(c) リネーム/削除押下で **listbox 消失 + `aria-expanded=false`（= `close()` が先）→ その後ダイアログ marker が出現** の順序、を実 DOM で固定。これは a11y フォーカス退行（消えた option を `previousActiveRef` が掴む）を防ぐ非自明な配線で、実装（`openRename`/`openDelete` が `close()` → `setRenameOpen(true)`、`DirectoryTreeSelect.tsx:195-202`）と素直に対応している。脆さは無い。
- **W-002（ゼロ件検索時の listbox / `aria-activedescendant` ゲートがコンポーネント側で無検証）** → `DirectoryTreeSelect.test.tsx:467-487` が `typeQuery("zzzzz-nonexistent")` 後に option が create 1 件だけ・listbox 残存・`aria-activedescendant` が **その create option の実在 id を指す**ことを固定。combobox が浮いた id を指さない不変条件（`hasListbox = options.length > 0`、create が常に末尾に残るため true、`DirectoryTreeSelect.tsx:96-99,243-247`）を実 DOM で文書化できており、純粋モデル側 `directoryTreeModel.test.ts:113-118`（create のみ返す）と二重に担保される。

Round 2 Notes も実質回収済み:
- **N-001（折りたたみキャレットのポインタ操作が無検証）** → 直接のキャレットクリック検証は依然無いが、検索による祖先 auto-expand 経路（`DirectoryTreeSelect.test.tsx:216-228`「Hollow 検索で Projects/Hollow が出る」）でツリー展開の可視化は固定済み。キーボード経路では使わないポインタ専用 affordance であり、`expanded` 引数に対する可視列は `directoryTreeModel.test.ts:69-72` で純粋に固定済みのため、残るのは「キャレットの onClick → toggleExpand」の極薄い配線のみ（下記 N-001 に再掲、Note 据え置き）。
- aria-selected（矢印 active）と data-selected（確定 directory）の役割分担 → `DirectoryTreeSelect.test.tsx:325-350` が「確定 directory は `data-selected` 持ちかつ非 active なので `aria-selected=false`、矢印 active の先頭 option は `data-active` + `aria-selected=true` で `aria-activedescendant` の指す先」を明示分離。実装（`isActive` が aria-selected を、`isSelected` が data-selected を駆動、`DirectoryTreeSelect.tsx:330-332`）と一致。
- tabIndex → `:352-358` が全 option ボタンの `tabIndex === -1`（roving は実フォーカスではなく仮想フォーカスである根拠）を固定。

実装側 lockstep（AC-2）も実コードで再確認: submit は `resolveTagNames(state)`（`NoteEditor.tsx:235`）、autosave は `snapshotForSubmit(...)`（`useAutosave.ts:193`、内部で同一 `resolveTagNames`）を通り、`editorState.test.ts:751-771` が両入り口が共有する純粋関数の挙動（非空 draft マージ・空 draft の同一参照 `.toBe(names)` 返却・順序保持・重複排除）を過不足なく固定している。reducer 側（`addTag` の trim/カンマ分割/重複排除、`removeTag` 名指定・absent no-op 同一参照、`setTagDraft` の非 dirty、`saving` 中 setter の状態保持を `it.each` で `addTag`/`setDirectory`/`setPendingDirectoryName` 含め網羅）も漏れなし。

IME 非確定（`nativeEvent.isComposing`）は TagsInput（`TagsInput.test.tsx:124-129`）と DirectoryTreeSelect（`DirectoryTreeSelect.test.tsx:274-280`）の両方で固定、blur-commit（`TagsInput.test.tsx:159-178`）も実装独自挙動として文書化済み。

テストはいずれも実挙動を素直に固定しており、過剰モック・脆いアサーション・実装の言い換えに堕したケースは見当たらない。残るのは記録レベルの軽微な隙間のみで、Blocker / Warning は無い。

## テスト網羅性・テスト設計

### Blockers（なければ「なし」）

なし。

### Warnings

問題なし。Round 2 の W-001（close→open 順序）/ W-002（ゼロ件ゲート）はいずれも実 DOM テストで解消され、新ケースは脆くなく過剰モックでもない。plan.md のテスト方針（plan.md:200-205）に列挙された項目は、明示された必須項目（reducer / `resolveTagNames` / 純粋ツリーモデル / DirectoryTreeSelect インタラクション / 非回帰）をすべて満たしている。

### Notes

- **[N-001]** 折りたたみキャレット（pointer 専用 affordance）の直接クリック操作が無検証 / `app/components/note/editor/DirectoryTreeSelect.tsx:294-319`, `__tests__/DirectoryTreeSelect.test.tsx`
  - キャレットボタン（`aria-label="… を展開/折りたたむ"`、`onClick → toggleExpand`）はキーボード経路では使わずポインタ専用だが、クリックで `expanded` がトグルし畳まれた子 option が現れる経路は `.tsx` テストに無い。純粋側（`visibleDirectoryOptions` の `expanded` 引数）は `directoryTreeModel.test.ts:69-72` で、検索 auto-expand は `:216-228` で固定済みなので、残るのは「キャレット onClick → `toggleExpand` → 子 option 出現」の極薄い配線 1 本のみ。1 ケース（折りたたみ状態の projects のキャレットをクリック → q2/hollow が option に出る）を足せば手動ブラウズ経路まで完全になる。実害は低く Note 据え置き（Round 2 N-001 の再掲・状態変わらず）。

- **[N-002]** DirectoryPicker `row` ブランチ差し替え／Ingestion `fieldset` 非回帰のコンポーネント結合テストが無い / `app/components/note/editor/DirectoryPicker.tsx`
  - plan.md:204 は「`IngestionPreviewForm`（`variant="fieldset"`）が無変更で動作すること（既存 DirectoryPicker / DirectorySelectField テストが緑のまま）」を非回帰確認に挙げる。`fieldset` の土台 `DirectorySelectField` は `app/components/directory/__tests__/DirectorySelectField.test.tsx` で独立担保済み、かつ本 PR で `fieldset` ブランチは無変更（diff 確認）。`row` の差し替えは `DirectoryTreeSelect` 単体 + `NoteEditor` 経由の手動/ブラウザ検証（plan.md:205）に委ねる方針で妥当。記録に留める（Round 2 N-002 再掲）。

- **[N-003]** `removeTag` は name 指定のみで実装と整合 / `editorState.ts`, `editorState.test.ts:356-366`
  - plan.md:86 は「index または name 指定」と書くが実装・テストともに name 指定のみ。チップが name 一意（重複排除済み）で機能的に問題なく、テストは正しく実装側を固定している。計画と実装の軽微な乖離（指摘というより記録、Round 2 N-003 再掲）。

- **[N-004]** クリック選択時の close 連携アサートが片側のみ / `__tests__/DirectoryTreeSelect.test.tsx:261-272`
  - Enter 選択テスト（`:249-259`）は `onSelectExisting` 呼び出し **と** listbox 消失（close）の両方を固定する一方、クリック選択テスト（`:261-272`）は `onSelectExisting("projects")` の呼び出しのみを検証し、クリック経路でも `close()` が走る（実装 `DirectoryTreeSelect.tsx:337-340` で `onSelectExisting` 直後に `close()`）ことを観測していない。Enter 経路で close は固定済みなので回帰リスクは低いが、クリック側にも `listbox === null` を 1 行足せば両確定経路の close が対称に固定される。記録レベル。
