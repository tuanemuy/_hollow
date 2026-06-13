# PR #712 レビュー Round 3（フルレビュー・ゼロベース） — 状態管理 / アプリケーションロジック / データ整合性

対象: Issue #689 / `.issue/689/plan.md` AC-2、`.issue/689/adr.md` ADR-001（タグ二層化・lockstep）/ ADR-003（ディレクトリ完全移行・combobox+listbox）/ ADR-005（実装補足）/ ADR-006（InlineEditor 枠線）。
観点: lockstep の保証、reducer の純粋性と不変条件、未確定 draft の取りこぼし、`directoryTreeModel` の純粋ロジックと境界条件、Round 2 修正（`aria-selected` を active に戻す・`tabIndex=-1`）が状態/ロジック整合に与える影響、型安全。
検証: `pnpm typecheck` 緑 / `pnpm vitest run app/components/note/editor/__tests__/` = 17 files / 303 tests 全緑。新規3ファイル（`directoryTreeModel.ts` / `DirectoryTreeSelect.tsx` / `TagsInput.tsx`）に `any` / 型アサーション / `@ts-*` なし。

総評: AC-2（タグの追加・削除・保存・autosave・未確定 draft 確定・重複排除・trim・順序保持）は**満たされている**。submit（`NoteEditor.tsx:235` `resolveTagNames(state)`）と autosave（`useAutosave.ts:191-202` → `snapshotForSubmit` → `resolveTagNames`）が単一の純粋ヘルパー `resolveTagNames`（`editorState.ts:600-613`）を通り `tagNames` ソースが一本化されている。`useMemo` deps（`useAutosave.ts:201`）に `tagNames, tagDraft` 両方 + `mode` が含まれ、lockstep に漏れなし。reducer は純粋・不変・no-op 参照同一性が保たれる。`directoryTreeModel` の純粋関数は境界条件をテストで網羅。**Round 2 W-001 はこのラウンドで解消されている** — `aria-selected` が「committed（`isSelected`）」から「active（arrow ハイライト = `aria-activedescendant` の指す先）」へ戻され（`DirectoryTreeSelect.tsx:278,330`）、APG combobox+single-select listbox の標準どおりになった。committed は `data-selected` + `Check` アイコンで表現され、データ整合性（送信される `directoryId`）は不変。Blocker・データ整合性の穴はなし。

## 状態管理 / ロジック / データ整合性

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** lockstep は正しく成立している（AC-2 充足の確認）
  `resolveTagNames`（`editorState.ts:600-613`）が submit（`NoteEditor.tsx:235`）と autosave snapshot（`editorState.ts:651` の `snapshotForSubmit` 内）双方の唯一の `tagNames` ソース。`EditorSnapshotInput`（`:634-642`）は `tagNames`+`tagDraft` を取り旧 `tagInput` 依存は皆無。`useAutosave` の `useMemo` deps（`:201`）に `tagNames, tagDraft, mode` が揃い、mode 切替時の effect 再マウント（`:218,312`）も担保。`setTagDraft` は dirty を立てない（`:481-487`、WHY コメントあり）が `resolveTagNames` が非空 draft を救済するため「Enter 未押下のタグが落ちる」事故は塞がれている。テスト（`editorState.test.ts:738-758` snapshot、`:761-779` resolveTagNames：空 draft で参照同一・順序保持 de-dup・trim・空トークン除去）が直接検証。

- **[N-002]** Round 2 修正（`aria-selected`=active へ反転）の二次影響は整合・データ無影響（確認結果）
  Round 1→2 で `aria-selected` が「committed」→「active」へ反転したが、Round 3 時点でこれは APG 準拠の正しい向き（`aria-activedescendant` が指す option = active が `aria-selected="true"`、`DirectoryTreeSelect.tsx:278,330`）。committed（保存対象 `directoryId`）は `data-selected`（`:332`）+ `Check` アイコン（`:348-353`）で表現。送信値・選択ロジック（`onSelectExisting`/`selectOptionAt`）には一切影響しない。テスト `DirectoryTreeSelect.test.tsx:325-347`（committed=`data-selected`/active=`aria-selected="true"` かつ `aria-activedescendant` 一致）が固定。`tabIndex={-1}`（option / caret / 新規作成 / Rename・Delete ボタン）も実フォーカスを検索 input に留める combobox モデルと整合し、Tab 順序が listbox 内 option へ漏れない。

- **[N-003]** reducer の純粋性・不変条件・no-op 同一性は良好
  `addTag`（`editorState.ts:454-474`）は `parseTagInput` でカンマ複数分割・trim・空スキップ・既存との重複排除を行い、新規ゼロ時は draft クリアのみ（空 draft なら参照同一 no-op、`:470-471`）。`removeTag`（`:475-480`）は不在 name で参照同一 no-op（`:476`）、`.filter` で順序保持。`setTagDraft`（`:481-487`）は同値で no-op。`tagNames: readonly string[]` / `EditorState` 全体 `Readonly<…>` で不変を型で担保。`directoryId` XOR `pendingDirectoryName` の排他は `setDirectory`（`:436-442`）/ `setPendingDirectoryName`（`:443-449`）で維持され本 PR で不変。

- **[N-004]** 未確定 draft の二重確定は冪等で無害（確認結果・ADR-005#5）
  `TagsInput` の `onBlur` 確定（`TagsInput.tsx:80-82`）と submit/autosave 時の `resolveTagNames` 救済は、いずれも `parseTagInput` の重複排除を通るため二重確定しても結果不変。`×` クリックは input → ボタンへフォーカス移動 → input blur で `onAddTag(draft)`（draft 非空時のみ）→ `onClick` で `removeTag(name)` の順だが、別タグ操作のため干渉しない。Backspace 削除（空 draft 時に末尾チップ削除、`:45-49`）は `tagNames[length-1]` を `undefined` ガード付きで取り出し `removeTag`。テスト（`TagsInput.test.tsx`）が Enter/comma/IME/Backspace/blur/disabled を網羅。

- **[N-005]** `directoryTreeModel` の純粋ロジックは境界条件で破綻しない（確認結果）
  `visibleDirectoryOptions`（`directoryTreeModel.ts:107-143`）は (1) 空 tree → `create` のみ、(2) 全折りたたみ → ルートのみ、(3) 検索ヒットゼロ → `create` のみ、(4) ヒット時は `searchMatchSet` の `visible`（match の親チェーン）で祖先自動展開（`:82-89`）を正しく扱う。`name === ""` 時は `path` をラベルにフォールバック（`:130`）。`hasChildren` は検索時に「可視な子があるか」で再判定（`:122-124`）。`create` は常に末尾 append でフラット列に含まれる（ADR-003 どおり、キーボード到達と可視数=`activeIndex` 整合を担保）。`clampActiveIndex`（`:150-155`、count<=0→0）/ `nextActiveIndex`（`:161-170`、両端ラップ・空で0）も安全。`searchMatchSet` の祖先 walk は `byId.get(cursor)?.parentId ?? null` で不正/欠落 parentId を安全に打ち切る。テスト（`directoryTreeModel.test.ts`）が各境界を網羅。

- **[N-006]** query 変更時の `activeIndex` 制御は二重制御にならない（確認結果）
  `onChange` の `setActiveIndex(0)`（`DirectoryTreeSelect.tsx:252-258`、WHY コメントあり）と `options.length` 変化で発火する clamp effect（`:92-94`）は責務が分離（前者=フィルタで可視集合が同 length のまま総入れ替えされても先頭へ再アンカー、後者=件数減で範囲外 index を有効値へ寄せる）。query 変更時に両者が走っても結果は冪等（`clampActiveIndex(0, len)`=0、空集合でも `count<=0→0`）。`hasListbox` ゲート（`:96-99,243-244`）で候補ゼロ時は `aria-activedescendant`・`aria-controls` 未付与・listbox 非描画となり、実在しない id を指す状態は発生しない（`DirectoryTreeSelect.test.tsx:468-483` が固定）。

- **[N-007]** Ingestion 非回帰の確認
  `editorState.ts` から `tagInput` / `setTagInput` は完全除去。`IngestionPreviewForm` は独自 local `tagInput` useState と `parseTagInput`（シグネチャ不変 `editorState.ts:577-588`）を使い続けるため無影響。`DirectoryPicker` の `variant="fieldset"` ブランチ（`:112-` 以降）は無変更、`variant="row"` のみ `DirectoryTreeSelect` へ委譲（`:98-110`）。`useId`/`useState`/`useMemo` は row early-return より前に無条件実行されフック順序が安定（`:82-92`、WHY コメントあり）。

- **[N-008]** committed ディレクトリが AT に読み上げられない残存 a11y ギャップ（軽微・Round 2 W-001 の trade-off）
  N-002 のとおり `aria-selected` が active へ移ったことで APG 準拠になった一方、committed（現在保存対象の `directoryId`）は `data-selected`（AT 非公開）+ ラベルなし `Check` アイコン（`DirectoryTreeSelect.tsx:348-353` に `aria-label` 等なし）でしか表現されない。矢印移動中のスクリーンリーダーは「今どの候補にいるか（active）」は読めるが「どれが選択済みか（committed）」を読めない。データ整合性（送信値）には影響しない純粋な a11y 完全性の論点で、ADR-005 の combobox+listbox モデルの範囲内。提案: `Check` アイコンに `aria-label="選択中"`（または `<span className="sr-only">選択中</span>`）を付けると committed が可読化される。必須ではない（送信値は正しい・トリガーラベルにも選択 path が出る `:124-129`）が、ADR-003 が掲げた a11y 完全性の観点では検討余地。

- **[N-009]** ディレクトリ削除時のダイアログ unmount 順序（軽微・既存挙動の踏襲、新規退行ではない）
  `DeleteDirectoryDialog` は `onDeleted?.()` → `onClose()` の順で呼ぶ（`DeleteDirectoryDialog.tsx:42-43`）。`onDeleted={() => onSelectExisting(null)}`（`DirectoryTreeSelect.tsx:425`）で `directoryId` が null になると `canShowActions`（`:131-135`）が false へ反転し、ダイアログ（`:412-428`）が unmount される。その後 `onClose()`（`setDeleteOpen(false)`）はすでに unmount 済みのダイアログに対する no-op となり、ダイアログ自身のフォーカス復帰処理が走り切らない可能性がある。ただしこれは旧 `DirectoryPicker` の `row`/`fieldset` 両ブランチと同一の `canShowActions` ガード + `onDeleted` パターンであり、本 PR が持ち込んだ新規退行ではない。状態の取り残し（`renameOpen`/`deleteOpen` が true のまま条件分岐で隠れる）も次回 `canShowActions=true` 復帰時に再表示されうるが、`setDeleteOpen(false)` 自体は close ハンドラで dispatch されるため実害は観測されていない（手動テスト TC-dir / TC-dir-edge は PASS）。Note 止まり。

- **[N-010]** `Popover` close 時の panel state リセットは確実（確認結果）
  close effect（`DirectoryTreeSelect.tsx:106-113`）で `query`/`creating`/`newName` を確実にクリアし、次回 open は常にクリーン状態から始まる。`creating` 中も `hasListbox` は `options.length` のみ依存で listbox/`aria-activedescendant` が生存するが、新規名入力（`:362-381`）は独自 onKeyDown（Enter のみ・IME-safe）を持ち `onSearchKeyDown` を呼ばないため矢印/Enter の二重発火はない。
