# Plan Review (Round 1) — Issue #697 / 観点: アーキテクチャ整合性・実現可能性・リスク

レビュー対象: `.issue/697/plan.md` / `.issue/697/adr.md`
基準: origin/main の実コード（`c4ec3652` = PR #715 マージ済みを確認）

---

## 総評

計画・ADR は main の実コードと高い精度で整合している。行番号、`onModeChange` の責務分解、WYSIWYG ゲート温存、`EditorMode` 型波及、`DirtyKey` の `frontMatter` を残す判断（型値ではない）など、調査が正確で具体的。依存方向（型→reducer→コンポーネント→テスト）も正しい。CLAUDE.md の Frontend/Styling 規約（utility-first・data-* state・module-scoped 定数・reducer 純粋性・コメント方針）にも沿っている。

検証した主な事実（すべて plan の記述と一致）:
- `EditorMode = "html" | "frontMatter" | "wysiwyg" | "inline"`（editorState.ts）。
- `EditorModeSwitch` の `TABS_NEW`（wysiwyg/frontMatter/html）・`TABS_EDIT`（inline/wysiwyg/frontMatter/html）に `frontMatter` がある。
- `NoteEditor` の `state.mode === "frontMatter"` 排他分岐、WYSIWYG ゲート（`surface==="edit" && nextMode==="wysiwyg"`→`detectUnsupportedTags`→`setPendingWysiwygSwitch`→`ConfirmDialog`）、`confirmWysiwygSwitch`、`onModeChange` の blur→stateRef→confirm→abortInFlight 順序。
- `onMediaInsert` / `shouldFlushAutosave` はいずれも `state.mode === "wysiwyg"` のみ参照し frontMatter 非依存。
- `DirtyKey` に `"frontMatter"` が含まれる（EditorMode とは別物）。
- `createInitialEditorState` は frontMatter を初期モードにしない。`frontMatterMode` 既定は `"structured"`。
- `editorModeSwitch.test.tsx` は **origin/main に追跡済みで存在**（`git cat-file -e origin/main:...` 成功）。現作業ブランチ（issue/692）では未追跡だが、実装は main から切るため ADR-003 の「追跡済み・期待値更新のみ」は正しい。

---

## 問題点（要修正）

問題点ゼロ。

実装ブロッカーになる誤りは見当たらない。以下はいずれも改善提案（任意）レベル。

---

## 改善提案（検討推奨）

- **[S-001]** `noteEditorModeChange.test.tsx` の `htmlTextareaValue()` セレクタと常設 FrontMatter textarea の DOM 衝突を、ステップ5の確認項目として明示する
  - 理由: 当該ヘルパは `container.querySelector('textarea[id*=":r"], textarea')`（**最初の一致を取得**）で HTML ペインの textarea を読む。常設化後、FrontMatter が **raw モードのとき** `<textarea id={rawId}>` が DOM に増える。既定は `structured` なので通常テストは無影響だが、(a) DOM 順で FrontMatterEditor がフォーム末尾＝HTML textarea より後ろにある限り「最初の textarea」は HTML 側のままで安全、という前提を明文化しておくと回帰時に気づける。plan は「container.textContent 系アサートに干渉しないか確認」と一般化しているが、`htmlTextareaValue()` のセレクタ特性（first-match）と FrontMatter raw textarea は具体的な衝突候補なので、確認対象として名指ししておくと確実。

- **[S-002]** ステップ4の「見出し（例『メタデータ』ラベル）追加」は受け入れ基準に無いため、追加するか否かを明示的に決めておく
  - 理由: AC には下部常設・追加/編集/削除・構造/生トグルしか無く、見出しラベルは必須ではない。plan は「必要なら」と条件付きだが、`FrontMatterEditor` ルート（`mt-4 rounded-lg border border-hairline bg-surface-elevated p-5`、内部に既に構造/生トグルボタン行あり）は単独でも視覚的に区切られている。スコープを締めるため「ラベル追加は任意・未追加でも AC を満たす」と一言入れておくと、実装者のスコープ膨張を防げる。なお `mt-4` はモードタブ排他時代の上マージンで、本文エディタ直下に置いても違和感は出にくいので、変更不要の可能性が高い旨も添えると良い。

- **[S-003]** `editorState.ts` 冒頭 JSDoc の「All four modes are fully wired (HTML / FrontMatter / WYSIWYG / inline)」記述の更新を、ステップ1の変更対象に明記する
  - 理由: plan ステップ1は「冒頭 JSDoc と `EditorSurface` JSDoc」の更新に触れているが、reducer 冒頭 JSDoc 本文中の「`setMode` accepts any `EditorMode` literal. All four modes are fully wired (HTML / FrontMatter / WYSIWYG / inline)」という具体文も frontMatter を本文モードとして列挙している。ここを 3 モード（+ FrontMatter は下部常設）へ直す対象に含めると、ドキュメントと型の乖離が残らない。`EditorSurface` JSDoc 内のタブ列挙（`wysiwyg / frontMatter / html` 等）も同様。

- **[S-004]** AC-5（モード切替で FrontMatter 編集内容が保持される）の挙動を ADR-001 の論理で裏取りしておく
  - 理由: 常設化により FrontMatter 入力はアンマウントされなくなるため、AC-5 は構造的にほぼ自動達成（state は reducer に保持、再マウントが起きない）。ただし KeyRow / 新規キー buffer は **ローカル state（コンポーネント内 buffer）で未 commit のまま** blur 前に切替が起きると失われ得る。ADR-001 (B) で blur を残すため、フォーカス中の未 commit buffer は `onModeChange` 冒頭の `active.blur()` で commit される＝保持される、という因果を ADR か plan のテスト方針に一行で明示すると、AC-5 のテスト（plan で追加予定の「FrontMatter 編集→本文モード切替で値保持」）が何を pin しているか明確になる。

---

## 良い点

- main の実コードを base とする方針（実装ブランチは main から切る）を plan・ADR・リスク欄で一貫して強調し、現作業ブランチ（issue/692、#715 未取込）との混同を明示的に警告している。これは最大のリスク源を的確に潰している。
- WYSIWYG 装飾消失ゲート（#696）を「一切変更しない」とコード上の具体シンボル（`detectUnsupportedTags` import / `pendingWysiwygSwitch` / `confirmWysiwygSwitch` / `ConfirmDialog` / `surface==="edit"` 分岐）まで列挙して温存範囲を明確化しており、スコープ侵食のリスクが低い。
- `EditorMode` から `frontMatter` を外すと型エラーが顕在化する箇所（TABS・`state.mode==="frontMatter"`・`setMode mode:"frontMatter"` テスト 2 箇所）を網羅し、`DirtyKey` の `frontMatter`（消さない）と区別できている。「make illegal states unrepresentable」の原則適用も適切。
- ADR-002（`frontMatterMode` を reducer に残す）の根拠が、`toggleFrontMatterMode` が `frontMatterRawJson`/`frontMatterJsonError`/autosave gate と密結合する「モデル寄り状態」である点に基づいており、#696 ADR-002（一過性ビュー状態は orchestrator local state）との境界判断も筋が通っている。
- autosave の FrontMatter parse エラーゲート（`saveDisabled` / `shouldFlushAutosave` の `frontMatterJsonError !== null`）が常設化で「常時効く」ようになる UX 副作用を、意図どおりと判断したうえでリスク欄に記録している。見落としやすい挙動変化を正しく捕捉している。
- `spec/design/pages/P12-editor.html` のドキュメント乖離をスコープ外（spec-sync で別途）として明示的に切り分けており、スコープ管理が適切。
