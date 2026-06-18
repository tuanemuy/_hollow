# PR #722 レビュー（Test 観点） — review-001

対象: PR #722 / Issue #697「FrontMatter モードを廃止し、メタデータを下部に常設」
計画: `.issue/697/plan.md`
実行結果: `pnpm vitest run`（editorModeSwitch / noteEditorModeChange / editorState / autosaveLogic / FrontMatterEditor）= 5 files / 154 tests すべて pass。

## Test

### Blockers

なし。

受け入れ基準ごとの pin 状況は十分で、ブロッカーに値する欠落・false positive は検出されなかった。

- **AC-1**: `editorModeSwitch.test.tsx:61-73` が両 surface のタブ列を完全一致（`toEqual`）で pin。edit = `["ビジュアル","WYSIWYG","HTML"]` / new = `["WYSIWYG","HTML"]`。FrontMatter が消え WYSIWYG（#715 由来）が温存されていることを的確にロック。`toEqual` なので「FrontMatter が残る」「順序が崩れる」いずれの回帰も捕捉する。
- **AC-2**: `noteEditorModeChange.test.tsx:294-309`。`frontMatterKeyInput()` マーカー（`input[aria-label="追加するキー名"]`）は構造編集 FrontMatter エディタ固有で、デフォルト inline・HTML 切替後・ビジュアル切替後のいずれでも非 null を assert。常設マウントを正しく検証。
- **AC-4**: `snapshotForSubmit` の JSON シリアライズ回帰は既存 `editorState.test.ts:731-741, 798-812` で pin 済み。本 PR がこれらに手を入れていないのは AC-4（挙動不変）の趣旨に合致。FrontMatter reducer アクション群（setField/rename/add/setRawJson/toggle）の既存カバレッジ（`editorState.test.ts:776+`）も無傷。
- **AC-5**: `noteEditorModeChange.test.tsx:322-359` は「キー追加 → dirty で confirm を通す → モード切替 → キー残存」を順に assert。`confirmMock.toHaveBeenCalledTimes(1)`（dirty 経由 confirm パスの因果）+ `hasFrontMatterKeyRow("author")`（input value 一致）で、state がリセットされれば落ちる意味のあるアサート。false positive ではない。
- **WYSIWYG 装飾消失ゲート**: `noteEditorModeChange.test.tsx:372-538` の #696 ゲート系（dialog 表示 / sorted tag 列挙 / cancel 時の content 不変 / confirm 時の ack latch / unsaved confirm との順序 / in-flight abort+content 保持）はすべて温存され pass。常設化による回帰なし。
- **`setMode mode:"frontMatter"` 参照テスト**: `editorState.test.ts` の該当ケース削除、`autosaveLogic.test.ts` の該当ケースを inline へ置換。型から `frontMatter` を外したことと過不足なく整合。

### Warnings

なし。

### Notes

- **[N-001]** `autosaveLogic.test.ts:164` の置換後ケースが既存ケースと実質重複
  - 場所: `app/components/note/editor/__tests__/autosaveLogic.test.ts:149-173`
  - 旧テスト（FrontMatter モードで未 ack でも flush）を inline へ置換した結果、直上の `"returns true in inline mode even when unsupported tags are detected"`（149 行）とほぼ同一の経路（inline + `wysiwygUnsupportedDetected(["mark"])` → `shouldFlushAutosave` true）を検証している。差分は init の `surface` 指定（149 行は `surface:"edit"` 既定 inline、164 行は `baseInit` + 明示 `setMode inline`）と「detected」vs「unacked」というコメント上の意図のみで、実体の網羅範囲は重なる。旧テストが持っていた固有価値（「wysiwyg 以外の本文モードは ack ゲートを通さず flush する」）は、置換後は inline 既存ケースに吸収されており失われていない。重複を残しても害はないが、コメントを「inline でも未 ack で flush（旧 FrontMatter ケースの一般化）」と明示するか、149 行へ統合するとより簡潔。挙動カバレッジ自体に欠落はないため Note 止まり。

- **[N-002]** `htmlTextareaValue()` の fallback `textarea` セレクタと常設 FrontMatter raw textarea の潜在衝突（現状は顕在化せず）
  - 場所: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx:203-212`
  - `htmlTextareaValue()` は `container.querySelector('textarea[id*=":r"], textarea')`（first-match）。FrontMatter は同一 `container` 内に常設されるが、raw `<textarea>` は `frontMatterMode === "raw"` のときのみ描画され（`FrontMatterEditor.tsx:367-388`）、本テストファイルの全ケースは FrontMatter を既定の structured のまま使うため raw textarea は存在しない。よって計画 arch-risk S-001 の衝突は現状の DOM では発生せず、`htmlTextareaValue()` は HTML ペインの textarea のみにマッチする（実テストも pass）。ただし将来「HTML タブ + FrontMatter raw」を同時に扱うケースを追加すると、`id*=":r"` の優先句が `useId()` 由来の id 形（`:rN:`）次第で FrontMatter raw textarea（`id={rawId}`）にも当たり得る first-match の脆さが残る。今回スコープではブロッカーでもワーニングでもないが、将来の拡張時は HTML ペイン側に局所セレクタ（例: data 属性 / 既知 id）を付けて曖昧さを排すのが安全。

- **[N-003]** テストの命名・構造・コメントは既存規約に準拠
  - 場所: `editorModeSwitch.test.tsx:9-25` / `noteEditorModeChange.test.tsx:277-283`
  - 追加 describe は Issue 番号 + AC 参照 + 「なぜ orchestrator 結合で pin するか」の WHY コメントを備え、本リポジトリの既存テストの記述様式（Issue 由来・ADR 参照・marker のヘルパー化）に沿っている。`frontMatterKeyInput` / `hasFrontMatterKeyRow` のヘルパーはマーカー選定理由をコメントで明示しており可読性が高い。
