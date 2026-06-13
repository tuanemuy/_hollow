# PR #712 レビュー Round 2 — テスト網羅性・テスト設計

対象 PR: #712（Issue #689 / ブランチ `issue/689/editor-mock-alignment`）
レビュー種別: フルレビュー（ゼロベース）。Round 1（`review-001-test.md`）の指摘解消も併せて確認。

対象テスト:
- `app/components/note/editor/__tests__/editorState.test.ts`（reducer / `resolveTagNames` / `snapshotForSubmit` / `parseTagInput`）
- `app/components/note/editor/__tests__/directoryTreeModel.test.ts`（純粋ツリーモデル）
- `app/components/note/editor/__tests__/DirectoryTreeSelect.test.tsx`（新規・Round 1 追加）
- `app/components/note/editor/__tests__/TagsInput.test.tsx`（新規・Round 1 追加）

対応実装: `editorState.ts` / `directoryTreeModel.ts` / `TagsInput.tsx` / `DirectoryTreeSelect.tsx` / `NoteEditor.tsx`

実行確認: 上記 4 ファイル **130 件 green**（`pnpm vitest run` で確認）。

## 全体評価

Round 1 で指摘した 6 件（W-001〜W-004 / N-001 / N-002）は **すべて解消** されている。

- **W-001（DirectoryTreeSelect インタラクション無検証）** → `DirectoryTreeSelect.test.tsx`（360 行・新規）が、トリガーラベルの3分岐（未選択 / 選択中 path / 新規 pending）、pill クリックで開く・検索 input/listbox/create option の存在、検索フィルタ＋祖先自動展開、ArrowDown/Up で `aria-activedescendant` が可視 option を移動・実フォーカスは検索 input 固定、Enter / クリックで `onSelectExisting`・閉じる、IME 中 Enter 非確定、create 導線→インライン input→Enter で `onSetPendingName`、`aria-selected`（選択）と `data-active`（矢印ハイライト）の分離、Escape クローズ、query 変更で activeIndex 先頭再アンカー、`disabled` 不活性 を網羅。happy-dom + `createRoot` + fake timers で `setTimeout(0)` フォーカスや Popover 開閉を素直に駆動しており、過剰モック・脆いアサーションは無い。実装の配線（`aria-activedescendant = optionIdBase-activeIndex`、`role="combobox"`/`listbox`/`option`、`onMouseEnter` での active 更新）を実 DOM で固定できている。
- **W-002（TagsInput キーボード/IME/blur）** → `TagsInput.test.tsx`（188 行・新規）が、Enter / `,` 確定、空・空白のみ非確定、IME 中 Enter 非確定、空 draft Backspace で末尾チップ削除・非空 draft では非削除、`×` クリックでの個別削除、**blur 時の非空 draft commit**（Round 1 で実装独自挙動として懸念した経路）と空 draft 時の非 commit、`disabled` 不活性 を網羅。Round 1 で「文書化される唯一の場所」と指摘した IME 非確定と blur-commit がともに固定された。
- **W-003（検索モード時 `expanded`/`hasChildren`）** → `directoryTreeModel.test.ts:79-94` が、検索ヒット時に親 `projects.expanded === true`/`hasChildren === true`、末端マッチ `hollow.hasChildren === false`/`expanded === false` を明示アサート。`dirIds` ヘルパーが捨てるフラグを直接検査するケースになっている。
- **W-004（空名フォールバック）** → `directoryTreeModel.test.ts:96-106` が `name: ""` ノードで `option.name === path` フォールバックを固定。
- **N-001（複数マッチ）** → `:134-147` が `query="Projects"` で親＋両子が `matches` に入り `research` が `visible` に漏れないことを検証。
- **N-002（`clampActiveIndex(-1, 0)` ガード順序）** → `:157-162` が同時境界 → 0 を固定。

テストはいずれも実挙動を素直に固定しており、`editorState` の reducer テスト（addTag の trim/カンマ分割/重複排除、removeTag の name 指定・absent no-op 参照同一性、setTagDraft の非 dirty、`snapshotForSubmit`/`resolveTagNames` の draft 折り込み・空 draft 同一参照返却）も AC-2 の lockstep 根拠を過不足なく押さえている。`setTagInput` → 新3アクションへの移行漏れも無い。

残課題は **計画テスト方針（plan.md:203）で明示列挙されながら新 `.tsx` テストが拾っていない 1 点（Rename close→open 順序）** と、軽微な網羅の隙間のみ。Round 1 の質は高く、Blocker は無い。

## テスト網羅性・テスト設計

### Blockers（なければ「なし」）

なし。

### Warnings

- **[W-001]** Rename/Delete の「`close()`→ダイアログ open」順序が無検証 / `app/components/note/editor/DirectoryTreeSelect.tsx:195-202,380-423`、`__tests__/DirectoryTreeSelect.test.tsx`
  - 理由: plan.md の AC-4 / arch S-004 は「`Popover` 非モーダルゆえ Rename/Delete はドロップダウンを `close()`（フォーカスをトリガーへ戻す）してからダイアログを open する順序にし、消える option を `RenameDirectoryDialog` の `previousActiveRef` が掴まないようにする」と明記し、テスト方針（plan.md:203）にも「Rename アクション押下で `close()`→ダイアログ open の順序になること（arch S-004）」を独立項目として列挙している。しかし `DirectoryTreeSelect.test.tsx` は `allowExistingActions` 系を一切 render しておらず（`renderSelect` は当該 prop を渡さない）、`canShowActions` ゲート（`allowExistingActions && directoryId !== null`）・リネーム/削除ボタンの表示・`openRename`/`openDelete` の close-then-open 順序・削除後 `onSelectExisting(null)` 連携が 1 件も検証されていない。この順序は a11y フォーカス退行（消えた option を掴む）を防ぐ非自明な配線で、純粋モデルでは届かず、まさに Round 1 の W-001 と同種の「配線部分」。
  - 提案: `renderSelect({ directoryId: "hollow", allowExistingActions: true })` で開き、(a) `canShowActions` 時にリネーム/削除ボタンが描画される、(b) リネーム押下で listbox（`role="listbox"`）が消える（= `close()` が先に走る）こと、(c) `RenameDirectoryDialog` が open になることの順序、を最低限固定する。`RenameDirectoryDialog` を mock せずとも、Popover の listbox 消失と `aria-expanded=false` の観測で順序は固定できる。

- **[W-002]** 候補ゼロ時の listbox/`aria-activedescendant` 非描画ゲートがコンポーネント側で無検証 / `app/components/note/editor/DirectoryTreeSelect.tsx:96-99,243-247,261`
  - 理由: arch S-001（plan.md:149）の「検索フィルタで可視 option が 0 件になったら `role="listbox"` と `aria-activedescendant` を非描画にし、combobox が実在しない id を指す状態を防ぐ」ゲートは、純粋モデル側では `directoryTreeModel.test.ts:113-118`（`"zzz"` で directory 0 件・create のみ）で部分的に担保されるが、**コンポーネントの `hasListbox`/`activeOptionId`/`aria-expanded` への配線は無検証**。実装上 `options.length > 0`（= create option が常に末尾にあるため常に true）で `hasListbox` が決まり、「directory ゼロでも create が残るので listbox は出続ける」という実挙動になっている。これは plan の「可視 option 0 件で非描画」記述と微妙に食い違う（create を可視フラット列に含める ADR 確定の帰結なので実害は無いが、意図と実装の整合を固定するテストが無い）。
  - 提案: `typeQuery("zzz")` 後に `aria-expanded` と listbox の有無・`aria-activedescendant` が create option を指すこと（実在 id）を 1 ケース固定し、「ゼロ検索でも create だけは到達可能・activedescendant は常に実在」という確定挙動を文書化する。combobox が浮いた id を指さない不変条件の回帰防止になる。

### Notes

- **[N-001]** 折りたたみキャレット（pointer 展開/折りたたみ）の操作が無検証 / `app/components/note/editor/DirectoryTreeSelect.tsx:294-319`
  - キャレットボタン（`aria-label="… を展開/折りたたむ"`、`toggleExpand`）はキーボード経路では使わずポインタ専用の affordance だが、クリックで `expanded` が切り替わり子 option が現れる挙動は `.tsx` テストに無い。純粋モデル（`visibleDirectoryOptions` の `expanded` 引数）は `directoryTreeModel.test.ts:69-72` で固定済みなので配線の薄い隙間に留まる。検索非依存の手動ブラウズ経路を 1 ケース（projects のキャレットクリックで q2/hollow が出る）足すと完全。

- **[N-002]** DirectoryPicker `row` ブランチ差し替え／Ingestion `fieldset` 非回帰のコンポーネント結合テストが無い / `app/components/note/editor/DirectoryPicker.tsx`
  - plan.md:204 は「`IngestionPreviewForm`（`variant="fieldset"`）が無変更で動作すること（既存 DirectoryPicker/DirectorySelectField テストが緑のまま）」を非回帰確認に挙げる。`fieldset` の土台 `DirectorySelectField` は `app/components/directory/__tests__/DirectorySelectField.test.tsx` で独立に担保されており、`fieldset` ブランチが本 PR で無変更（diff 確認）なため実害は低い。`row` の差し替え自体は `DirectoryTreeSelect` 単体テスト＋`NoteEditor` 経由の手動/ブラウザ検証（plan.md:205）に委ねる方針として妥当。記録に留める。

- **[N-003]** `removeTag` の name 指定のみ仕様は実装と整合（Round 1 N-003 の再掲）/ `editorState.ts`, `editorState.test.ts:356-366`
  - plan.md:86 は「index または name 指定」と書くが実装・テストともに name 指定のみ。チップ表示が name 一意（重複排除済み）で機能的に問題なく、テストは正しく実装側を固定している。計画と実装の軽微な乖離（指摘というより記録）。

- **[N-004]** AC-2 lockstep の根拠は十分 / `editorState.test.ts:738-772`, `NoteEditor.tsx:235`
  - submit が `resolveTagNames(state)`（`NoteEditor.tsx:235`）、autosave snapshot が `snapshotForSubmit`（内部で同一純粋関数）を通る配線を実装で確認。`snapshotForSubmit` の draft 折り込み（test:751）と `resolveTagNames` 単体（空 draft 同一参照 `.toBe(names)` / 非空 draft マージ・順序保持・重複排除、test:761-771）で、両経路が同一純粋関数を共有する根拠が固定されている。`.toBe(names)` の参照安定アサートは `useMemo` 参照安定性に効く良いケース。回帰防止として妥当。
