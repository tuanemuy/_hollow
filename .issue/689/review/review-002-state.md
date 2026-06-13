# PR #712 レビュー Round 2（ゼロベース） — 状態管理 / アプリケーションロジック / データ整合性

対象: Issue #689 / `.issue/689/plan.md` AC-2、ADR-001（タグ二層化・lockstep）/ ADR-003（ディレクトリ完全移行）/ ADR-005（実装補足）。
観点: lockstep の保証、reducer の純粋性と不変条件、未確定 draft の取りこぼし、`directoryTreeModel` の純粋ロジックと境界条件、Round 1 修正（query 変更時の `activeIndex` リセット）の二次的整合性、型安全。
検証: `pnpm typecheck` 緑 / `pnpm vitest run app/components/note/editor/__tests__/` = 17 files / 297 tests 全緑。

総評: AC-2（タグの追加・削除・保存・autosave・未確定 draft 確定・重複排除・trim・順序保持）は**満たされている**。submit（`NoteEditor.tsx:235`）と autosave（`useAutosave.ts:191-202` → `snapshotForSubmit` → `resolveTagNames`）は単一の純粋ヘルパー `resolveTagNames` を通り `tagNames` ソースが一本化されている。`useMemo` deps（`useAutosave.ts:201`）も `tagNames`+`tagDraft` 両方を含み漏れなし。reducer は純粋・不変・no-op 参照同一性が保たれる。`directoryTreeModel` の純粋関数は境界条件をテストで網羅。Round 1 の W-002（query 変更時 `activeIndex` 未リセット）は `DirectoryTreeSelect.tsx:252-258` の `setActiveIndex(0)` で修正済み・テスト済み（`:336`）で、`clampActiveIndex`（length-only effect）との二重制御も衝突しない（後述 N-002）。Blocker はなし。

## 状態管理 / ロジック / データ整合性

### Blockers
なし

### Warnings

- **[W-001]** combobox の `aria-activedescendant` が指す option に `aria-selected` が付かず、AT がハイライト位置を取得できない
  場所: `app/components/note/editor/DirectoryTreeSelect.tsx:245-247`（`aria-activedescendant`）/ `:327`（`aria-selected={isSelected}`）/ `:328`（`data-active={isActive}`）
  理由: Round 1 から `aria-selected` の意味づけが「active（矢印ハイライト）」→「committed（`directoryId` 一致）」へ反転した（テスト `DirectoryTreeSelect.test.tsx:303-318` で固定）。これで「保存対象として選ばれているディレクトリ」は AT に伝わるようになったが、トレードオフとして**矢印で移動中の active option（`aria-activedescendant` が指す先）に `aria-selected` が一切付かなくなった**。WAI-ARIA の combobox + 単一選択 listbox パターンでは、`aria-activedescendant` が参照する option は「現在ハイライトされている候補」として `aria-selected="true"` を持つのが標準（APG combobox/listbox 例）。現状は activedescendant 先が `data-active`（AT 非公開の data 属性）でしか表現されず、矢印移動時にスクリーンリーダーが「今どの候補にいるか」の選択状態を読めない。データ整合性（送信される `directoryId`）には影響しない純粋な a11y 完全性の穴で、active と committed の二概念を1つの `aria-selected` に同居させられないことに起因する設計上のジレンマ。
  提案: 単一選択 listbox の標準に倣い、`aria-selected` は active option（`isActive`）に付け、committed の表現はチェックアイコン + 視覚的に隠したテキスト（例 `<span className="sr-only">選択中</span>`）に寄せるのが APG 準拠。あるいは現行（committed=`aria-selected`）を維持するなら、チェックアイコン（`:345-351` の `Check`）に `aria-label="選択中"` を付けて committed を可読化しつつ、active の announce は `aria-activedescendant` + フォーカス移動に委ねる旨を ADR に明記する。いずれも必須ではない（送信値は正しい）が、ADR-003 が掲げた「combobox + listbox a11y モデル」の完全性としては要検討。

### Notes

- **[N-001]** lockstep は正しく成立している（確認結果・AC-2 充足）
  `resolveTagNames`（`editorState.ts:600-613`）が submit（`NoteEditor.tsx:235`）と autosave snapshot（`editorState.ts:651` 経由）双方の唯一の `tagNames` ソース。`snapshotForSubmit` / `EditorSnapshotInput`（`:634-642`）から旧 `tagInput` 依存は完全除去され、`tagNames`+`tagDraft` を取るよう更新済み。`useAutosave` の `useMemo` deps（`:201`）に `tagNames, tagDraft` 両方あり、`mode` も含めて mode 切替時の effect 再マウントも担保。`setTagDraft` は dirty を立てない（`:481-487`、WHY コメントあり）が `resolveTagNames` が非空 draft を救済するため「Enter 未押下のタグが落ちる」事故は塞がれている。テスト（`editorState.test.ts:751-758` snapshot、`:761-772` resolveTagNames）が lockstep を直接検証。

- **[N-002]** Round 1 修正（query 変更時 `activeIndex=0`）が二重制御を生んでいない（確認結果）
  `onChange` の `setActiveIndex(0)`（`:252-258`）と、`options.length` 変化で発火する clamp effect（`:92-94`）は責務が分離している。clamp effect は「件数が減って index が範囲外になった時に有効 index へ寄せる」役割で、query 変更時は次レンダーで両者が走るが結果は冪等（`setActiveIndex(0)` → effect は `clampActiveIndex(0, len)` = 0 を返す、空集合でも `count<=0 → 0`）。状態更新は同値なら React が再レンダーをスキップするため発散しない。`hasListbox` ゲート（`:96-99`）で候補ゼロ時は `aria-activedescendant` 未付与・listbox 非描画となり、`activeIndex` が実在しない id を指す状態は発生しない。

- **[N-003]** reducer の純粋性・不変条件・no-op 同一性は良好
  `addTag`（`:454-474`）は `parseTagInput` でカンマ複数分割・trim・空スキップ・既存との重複排除を行い、新規ゼロ時は draft クリアのみ（空 draft なら参照同一 no-op、`:467-472`）。`removeTag`（`:475-480`）は不在 name で参照同一 no-op（`:476`）。`setTagDraft`（`:481-487`）は同値で no-op。`tagNames: readonly string[]` / `EditorState` 全体 `Readonly<…>` で不変を型で担保。`directoryId` XOR `pendingDirectoryName` の排他は `setDirectory`（`:436-442`）/ `setPendingDirectoryName`（`:443-449`）で維持され本 PR で不変。新規コードに `any` / 不要な型アサーションなし。

- **[N-004]** 未確定 draft の二重確定は冪等で無害（確認結果）
  ADR-005#5 の `onBlur` 確定（`TagsInput.tsx:80-82`）と submit/autosave 時の `resolveTagNames` 救済は、いずれも `parseTagInput` の重複排除を通るため二重確定しても結果不変。`×` クリック時の挙動も整合: input から `×` ボタンへフォーカス移動 → input blur で `onAddTag(draft)`（draft 非空時のみ）→ `onClick` で `removeTag(name)`。両者は別タグ操作なので干渉しない。Backspace 削除（空 draft 時に末尾チップ削除、`:45-49`）は `tagNames[length-1]` を `undefined` ガード付きで取り出して `removeTag`。テスト（`TagsInput.test.tsx:100-180`）が Enter/comma/IME/Backspace/blur/disabled を網羅。

- **[N-005]** `directoryTreeModel` の純粋ロジックは境界条件で破綻しない（確認結果）
  `visibleDirectoryOptions`（`directoryTreeModel.ts:107-143`）は (1) 空 tree → `create` のみ、(2) 全折りたたみ → ルートのみ、(3) 検索ヒットゼロ → `create` のみ、(4) ヒット時は `searchMatchSet` が match の親チェーンを `visible` に積み祖先自動展開（`:82-89`）を正しく扱う。`name === ""` 時は `path` をラベルにフォールバック（`:130`）。`hasChildren` は検索時に「可視な子があるか」で再判定（`:122-124`）。`create` は常に末尾 append でフラット列に含まれる（ADR-003 どおり）。`clampActiveIndex`（`:150-155`、count<=0→0）/ `nextActiveIndex`（`:161-170`、両端ラップ・空で0）も安全。`searchMatchSet` の祖先 walk は `byId.get(cursor)?.parentId ?? null` で不正 parentId を安全に打ち切る。テスト（`directoryTreeModel.test.ts` 175行）が各境界を網羅。

- **[N-006]** Ingestion 非回帰の確認
  `editorState.ts` から `tagInput` / `setTagInput` は完全除去。`IngestionPreviewForm` は独自 local `tagInput` useState と `parseTagInput`（シグネチャ不変 `:577-588`）を使い続けるため無影響。`DirectoryPicker` の `variant="fieldset"` ブランチ（`DirectoryPicker.tsx:112-218`）は無変更、`variant="row"` のみ `DirectoryTreeSelect` へ委譲（`:98-110`）。hooks（`useId`/`useMemo`/`useState`）は row early-return より前に無条件実行されフック順序が安定（`:82-92`、WHY コメントあり）。

- **[N-007]** tree 未供給時のトリガーラベルの退行可能性（軽微・Round 1 N-006 の再掲、未対応だが許容）
  `DirectoryTreeSelect.tsx:124-129` の `triggerLabel` は `selected`（`tree.find(id===directoryId)`）が未解決の場合「ディレクトリを選択」を表示する。`directoryId !== null` でも `tree` ロード前・除外時に「未選択」表示になりうる。送信値（`directoryId`）には影響せず表示のみ。現行 `DirectorySelectField` / `fieldset` も同種挙動のため新規退行ではない。Note 止まり。

- **[N-008]** `creating` 中も listbox/`aria-activedescendant` が生存するが実害なし（確認結果）
  `hasListbox` は `options.length` のみ依存で `creating` を見ないため、新規名入力表示中も listbox と検索 input の `aria-activedescendant` は残る。ただし新規名入力（`:361-376`）は独自 onKeyDown（Enter のみ）を持ち `onSearchKeyDown` を呼ばないため矢印/Enter の二重発火はない。`creating` 解除・`newName` クリアは close effect（`:106-113`）で確実に行われ、状態の取り残しはない。
