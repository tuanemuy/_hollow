# PR #712 レビュー — テスト網羅性・テスト設計

対象 PR: #712（Issue #689 / ブランチ `issue/689/editor-mock-alignment`）
変更テスト: `app/components/note/editor/__tests__/editorState.test.ts`, `app/components/note/editor/__tests__/directoryTreeModel.test.ts`
実装: `editorState.ts`, `directoryTreeModel.ts`, `TagsInput.tsx`, `DirectoryTreeSelect.tsx`, `useAutosave.ts`, `NoteEditor.tsx`

全体評価: reducer / 純粋ヘルパー（`editorState` / `directoryTreeModel`）の単体テストは
要点（trim・空スキップ・重複排除・カンマ複数・順序保持・dirty key・未確定 draft の救済・
クランプ・ラップアラウンド・祖先自動展開・create option 位置・検索ヒットゼロ）を概ね押さえており、
`setTagInput` → `addTag`/`removeTag`/`setTagDraft` への移行も漏れなく行われている。
AC-2 の保存契約（submit/autosave が同一 `resolveTagNames` を通る lockstep）も
`snapshotForSubmit` の draft 折り込みテストで根拠が固定されている。テストはいずれも
実装の振る舞いを素直に固定しており、過剰モック・脆いアサーションは見当たらない（2 ファイル 101 件 green を確認）。

ただし純粋関数の一部分岐（`directoryTreeModel` の検索モード時 `expanded`/`hasChildren`・
空名フォールバック）が無検証で、UI 側（`TagsInput` / `DirectoryTreeSelect`）の
インタラクションテストが 1 件も無い。後者は計画上「任意」だが、既存編集系コンポーネントには
`.tsx` テストが多数あり（`noteEditorModeChange.test.tsx` 等）、本 PR が新規追加した
キーボード/IME/フォーカスの複雑なロジックが完全に無検証である点は設計上の弱さとして指摘する。

## テスト網羅性・テスト設計

### Blockers

なし。

### Warnings

- **[W-001]** `DirectoryTreeSelect` のインタラクションが完全に無検証 / `app/components/note/editor/DirectoryTreeSelect.tsx`（421 行・新規）にテストファイルなし
  - 理由: 純粋ロジック（`directoryTreeModel`）は切り出してテストされているが、計画テスト方針（plan.md:203）が列挙する **DirectoryTreeSelect のインタラクション**（pill クリックで開く / 外側クリック・Escape で閉じる / 検索で絞り込み / ArrowUp/Down で `aria-activedescendant` が可視 option を移動し実フォーカスは検索 input に固定 / Enter で active option 選択 → `onSelectExisting` 呼び出し + 閉じる / 新規作成導線 → `onSetPendingName` / `data-selected` ハイライト / `disabled` 不活性 / Rename 時に `close()`→ダイアログ open 順序）が 1 件も検証されていない。AC-4 は本 Issue 最大の退行リスク（plan.md:189）と明記され、`aria-activedescendant` と可視 option フラット列の整合は純粋関数テストだけでは「配線されていること」を保証できない（`directoryTreeModel` が正しくても `DirectoryTreeSelect` が `activeIndex` を listbox に流していなければ壊れる）。既存コードベースには同種の Popover+listbox 駆動コンポーネントの `.tsx` テスト（例: `internalLinkSuggestPopup.test.tsx`）が存在し、書ける土台はある。
  - 提案: 最低限 (a) 開閉と検索フィルタ、(b) ArrowDown/Up → `aria-activedescendant` 遷移 + Enter で `onSelectExisting` 呼び出し、(c) 候補ゼロ時に listbox/`aria-activedescendant` が非描画になる（plan.md:149 の `hasListbox` ゲート）、(d) 新規作成導線で `onSetPendingName` の 4 点を `@testing-library/react` でカバーする。`docs/test.md` の Frontend 方針は「必要最小限」だが、AC-4 の退行リスクの大きさと純粋関数では届かない配線部分を考えると最小限の一本は妥当。

- **[W-002]** `TagsInput` のキーボード/IME/blur ロジックが無検証 / `app/components/note/editor/TagsInput.tsx:36-50,80-82`
  - 理由: plan.md:201 が「任意・余力があれば」とした項目だが、実装には reducer だけでは担保できない非自明な分岐が複数ある: (1) IME 変換確定中の Enter/`,` を `nativeEvent.isComposing` で無視（誤確定回帰の温床）、(2) 空 draft + Backspace で末尾チップ削除（plan AC-1 要件、`tagNames.length > 0` ガード）、(3) **`onBlur` で非空 draft を `onAddTag` する**（実装独自の挙動で、計画のテスト方針にも列挙されておらず、commit メッセージ・コメントにのみ存在）。特に (3) はタグ救済を二重化する（`resolveTagNames` でも救済される）挙動で、確定経路が増えるため回帰検証が無いのは危うい。
  - 提案: `TagsInput.test.tsx` を新設し、Enter 確定 / `,` 確定 / IME 中の Enter 非確定 / 空 draft Backspace 削除 / `×` クリック削除 / blur 時 commit を最低限固定する。少なくとも IME 非確定と blur-commit の 2 つは「実装の意図を文書化する唯一の場所」になるため価値が高い。

- **[W-003]** `directoryTreeModel` の検索モード時 `expanded`/`hasChildren` 算出が無検証 / `app/components/note/editor/directoryTreeModel.ts:122-134`
  - 理由: 検索時は `hasChildren` を「可視な子があるか」で再計算し（122-124）、`expanded` を `search.visible.has(dir.id)`（126）で決め、出力 `expanded` を `isExpanded && hasChildren`（134）で確定する分岐がある。これはキャレット回転（折りたたみ三角）の表示根拠だが、テストは検索ヒット時の **可視 id の集合**（`dirIds`）しか見ておらず、検索でヒットした親ノードの `expanded`/`hasChildren` フラグが正しいかを一切アサートしていない。`visibleDirectoryOptions(tree, new Set(), "hollow")` のケース（test:74）で `projects.expanded` が `true`・`hasChildren` が `true`（`hollow` のみ可視）になることを確認していない。
  - 提案: 既存の「auto-expands ancestors」テストに、ヒット親の `expanded === true` / `hasChildren === true`、および末端マッチ（`hollow`）の `hasChildren === false` のアサートを追加する。`dirIds` ヘルパーが kind 以外のフラグを捨てているため意図的に見落としやすい箇所。

- **[W-004]** 空名ディレクトリの表示ラベルフォールバックが無検証 / `app/components/note/editor/directoryTreeModel.ts:130`
  - 理由: `name: dir.name === "" ? dir.path : dir.name` というフォールバックが実装にあるが、テスト fixture は全ノードに非空 `name` を与えており、このルートカテゴリ相当（空名）分岐が一度も通っていない。表示ラベルの SSOT に関わる分岐で、回帰すると空名ディレクトリのラベルが空文字になる。
  - 提案: `name: ""`・`path: "/"` のノードを 1 件加え、`visibleDirectoryOptions` の該当 option の `name` が `path` にフォールバックすることを 1 アサートで固定する。

### Notes

- **[N-001]** `searchMatchSet` テストが単一マッチのみ / `directoryTreeModel.test.ts:92-104`
  - 複数ノードが同時マッチするケース（例 query=`"Projects"` で `projects` と子の path も含む）や、マッチが複数の祖先チェーンを持つケースの `matches`/`visible` 集合は未検証。現状でも分岐網羅としては足りているが、`includes`（部分一致）が path 経由で祖先以外も拾わないことを示す 1 ケースがあると意図がより明確になる。

- **[N-002]** `clampActiveIndex(-1, 0)` の同時境界が未検証 / `directoryTreeModel.test.ts:106-112`
  - `clampActiveIndex` は `count<=0` を最優先で 0 に返す（impl:151）。負値かつ空（`-1, 0`）は `count<=0` 経路で 0 になるが、ガード順序の回帰（`index<0` を先に評価する実装ミス）を捕まえるには `clampActiveIndex(-1, 0) === 0` の 1 ケースがあると堅い。現状 `(1,0)` と `(-1,3)` は別々に通るが両者の交差は未カバー。

- **[N-003]** `removeTag` の仕様（name 指定のみ）と計画の差異 / `editorState.ts:475-480`, `editorState.test.ts:356-366`
  - plan.md:86 は `removeTag`（index または name 指定）と書くが、実装・テストともに name 指定のみ。チップ表示が name 一意（重複排除済み）なので機能的に問題なく、テストは実装に整合している。計画と実装の軽微な乖離であり、テストとしては正しく実装側を固定している（指摘というより記録）。

- **[N-004]** AC-2 lockstep の根拠は十分 / `editorState.test.ts:738-772`, `useAutosave.ts`, `NoteEditor.tsx:235`
  - submit が `resolveTagNames(state)`、autosave が `snapshotForSubmit`（内部で `resolveTagNames`）を通ることを実装で確認。`snapshotForSubmit` の「非空 draft 折り込み」テスト（test:751）と `resolveTagNames` 単体（test:761）で、両経路が同一純粋関数を共有する根拠が固定されている。`resolveTagNames` の空 draft 時 **同一参照返却**（`.toBe(names)`, test:764）も `useMemo` の参照安定性に効く良いアサート。回帰防止として妥当。`useAutosave` の `useMemo` deps が `tagInput` → `tagNames + tagDraft` に更新された配線自体は単体テストの守備範囲外（hook テストは不在）だが、deps 漏れは draft 救済テストの存在で間接的に検出されにくい点だけ留意（実害は低い）。
