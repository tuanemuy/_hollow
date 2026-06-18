# PR #722 レビュー (Round 2 / フル再レビュー) — Frontend 観点 (Issue #697)

対象: `app/components/note/editor/` 配下（FrontMatter モード廃止＋メタデータ下部常設）
基準: `.issue/697/plan.md` / `.issue/697/adr.md` / CLAUDE.md（Frontend / Styling 規約）
前回: `review-001-frontend.md`（Round 1。W-001「常設メタデータ領域に支援技術向けラベルが無い」を指摘）

## 検証済み事項

- `pnpm typecheck` パス（`tsgo`、エラーなし）。
- editor 配下テスト 318 件すべてパス（18 ファイル、`pnpm vitest run app/components/note/editor`）。
- **重要:** 上記は作業ツリー（uncommitted 含む）での結果。後述の B-001 を参照。
- AC-1〜AC-7 を plan の受け入れ基準どおり個別検証。AC-1（タブから FrontMatter 除去）/ AC-2（下部常設）/ AC-3（structured⇔raw トグル温存）/ AC-4（reducer・snapshotForSubmit 不変）/ AC-5（モード切替で FrontMatter 値保持）/ AC-7（テスト更新）は満たされている。AC-6 は B-001 の状態次第。

---

## Frontend

### Blockers

- **[B-001]** Round 1 の W-001 修正（`<section aria-label="メタデータ">` 化）が PR のコミットに入っていない（作業ツリーの未コミット変更に留まっている）
  - 場所: `app/components/note/editor/FrontMatterEditor.tsx:284`（作業ツリー）vs コミット済み HEAD
  - 事実:
    - 作業ツリーのルート要素は `<section aria-label="メタデータ">`（行 281-287、コメント付き）に修正済みで、これは W-001 を適切に解消している。
    - しかし `git show HEAD:app/components/note/editor/FrontMatterEditor.tsx`（コミット済み = PR #722 の中身）のルート要素は依然として `<div className="mt-4 rounded-lg border ...">` のままで、`<section>`/`aria-label` を持たない。
    - `git diff origin/main...HEAD -- FrontMatterEditor.tsx` には `handleToggleMode` のコメント変更しか含まれず、landmark 化の差分は存在しない。
    - `git status` 上 `FrontMatterEditor.tsx` は ` M`（modified, unstaged）。つまり修正は手元にあるがコミットされていない。
  - 理由: 「Round 2 で W-001 修正済みのはず」という前提に反し、PR が現状マージされても W-001 は未解消のまま残る。さらに、本レビューの typecheck/test パス確認は作業ツリー基準であり、PR の HEAD コミットそのものに対する検証ではない。修正をコミット（push）するまで PR としては Round 1 指摘が反映されていない。
  - 提案: 作業ツリーの `<section aria-label="メタデータ">` 変更を `git add` してコミットし PR にプッシュする。その上で typecheck/lint/test を回し直して AC-6 を確定させる。修正内容自体は妥当（下記 W/Notes 参照）なので、コミット漏れの是正のみで足りる。

### Warnings

- **[W-001]** （Round 1 W-001 の追跡）`<section aria-label="メタデータ">` の修正内容そのものは妥当だが、回帰を pin するテストが無い
  - 場所: `app/components/note/editor/FrontMatterEditor.tsx:284-287`（作業ツリー）/ `__tests__/FrontMatterEditor.test.tsx`・`noteEditorModeChange.test.tsx`
  - 理由: landmark 化は適切（重複 landmark なし・既存スタイル無破壊。下記 N-001/N-002 参照）だが、`getByRole("region", { name: "メタデータ" })` のようなアサートが無いため、将来 `<section>` が `<div>` に戻る・`aria-label` が消える回帰を検知できない。Round 1 で指摘した観点（支援技術向けラベルの有無）はテストで保証されていない。
  - 提案: `FrontMatterEditor.test.tsx` か `noteEditorModeChange.test.tsx` に landmark の存在を pin する軽量アサートを 1 つ追加するとよい。必須ではない（機能 AC ではない）ため Warning。

### Notes

- **[N-001]** `<section aria-label="メタデータ">` 化は landmark 重複を生まない。`NoteEditor` のフォーム内に他の `<section>` は無く（DOM 上）、フォーム root の `<form>` は無名で region にならないため、ラベル付き region が一つだけ増える形になり既存の landmark 構造と衝突しない。ラベル文言「メタデータ」も領域の内容（汎用キー/値メタデータ）と整合。命名は妥当。
- **[N-002]** スタイル破壊なし。`<div>`→`<section>` の置換で className（`mt-4 rounded-lg border border-hairline bg-surface-elevated p-5`）は verbatim 維持。`<section>` はデフォルトでブロック要素であり既存レイアウトに影響しない。utility-first・module-scoped 定数・`@apply` 不使用の Styling 規約も維持。追加コメントは「なぜラベルが必要か（タブ消失で領域名が失われた）」の why コメントで CLAUDE.md のコメント方針に沿う。
- **[N-003]** テスト DOM クエリと新 `<section>` の衝突なし。`noteEditorModeChange.test.tsx` 等は note 本文として文字列 `"<section>..."` を textarea value に入れているが、これは DOM landmark ではなく textarea の文字列値であり、新たな landmark `<section aria-label="メタデータ">` とはセレクタ上も役割上も干渉しない。`htmlTextareaValue()`（first-match textarea）も structured 既定で raw textarea が DOM に出ず HTML 側に解決されるため衝突なし（318 件パスで実証）。
- **[N-004]** （Round 1 から維持・再確認）`EditorMode` からの `frontMatter` 除去は波及漏れなし。型（editorState.ts:51）・`TABS_NEW`/`TABS_EDIT`（EditorModeSwitch.tsx）・テストの `setMode mode:"frontMatter"` をすべて潰しており、本文モードとしての残存参照は無い。`DirtyKey` の `"frontMatter"` と FrontMatter 状態/アクション群（`frontMatterMode`/`frontMatterRawJson`/`frontMatterJsonError`/`setFrontMatterField` 等）は正しく温存。ADR-002 どおり EditorMode と FrontMatterMode が直交。
- **[N-005]** （Round 1 から維持・再確認）`onModeChange`（NoteEditor.tsx:194 付近）の整理が WYSIWYG 装飾消失ゲート（#696）・unsaved-confirm・`abortInFlight` を一切壊していない。blur→dirty 再評価→confirm→abort→WYSIWYG ゲート→`setMode` の順序が保たれ、コメントは ADR-001(B) どおり「アンマウント前提」を削除し「未コミット入力 flush + dirty 鮮度」へ正確に置換。`FrontMatterEditor` の常設マウント配置（本文ペイン後・submitError 手前、条件分岐なし、props 無変更流用、`disabled={isPending}` 維持）も妥当。
- **[N-006]** （情報共有）常設化により FrontMatter JSON エラーゲート（`saveDisabled` の `frontMatterJsonError !== null` / `shouldFlushAutosave`）が本文モード問わず常時効く副作用は、plan リスク欄・manual-test TC-EDGE-1 で意図どおりと確認済み。仕様として妥当。
- **[N-007]** `spec/design/pages/P12-editor.html` のドキュメント乖離（FrontMatter をタブ描画）は plan どおり本 Issue スコープ外（spec-sync 委譲）。
