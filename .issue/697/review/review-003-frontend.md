# PR #722 レビュー (Round 3 / フル再レビュー) — Frontend 観点 (Issue #697)

対象: `app/components/note/editor/` 配下（FrontMatter モード廃止＋メタデータ下部常設）
基準: `.issue/697/plan.md` / `.issue/697/adr.md` / CLAUDE.md（Frontend / Styling 規約）
前回: `review-002-frontend.md`（Round 2。B-001「section化が未コミット」/ W-001「landmark のテスト無し」を指摘）

## 検証済み事項

- HEAD = `05d95954`。`git diff --stat HEAD -- app/components/note/editor/` は空 = 作業ツリーに editor 配下の未コミット変更なし。Round 2 の「作業ツリー基準」問題は解消し、以降の検証はすべて **コミット済み HEAD** に対するもの。
- `pnpm typecheck` パス（`tsgo`、エラーなし）= AC-6 の type 部分。
- editor 配下テスト **319 件すべてパス**（18 ファイル、`pnpm vitest run app/components/note/editor`）。Round 2 の 318 件 +1 は新規 landmark テスト。= AC-7。
- AC-1〜AC-7 を plan の受け入れ基準どおり個別検証。すべて満たされている（下記 N 参照）。

### Round 2 指摘の追跡

- **B-001（未コミット）→ 解消。** `<section aria-label="メタデータ">` 化が commit `05d95954`（"#697 常設メタデータ領域に landmark ラベルを付与"）として PR に入った。`git diff origin/main...HEAD -- FrontMatterEditor.tsx` に landmark 差分（`<div>`→`<section aria-label="メタデータ">`、why コメント付き）が含まれることを確認。`git status` 上 editor 配下に未追跡・未ステージの変更なし。
- **W-001（テスト無し）→ 解消。** `FrontMatterEditor.test.tsx` に `exposes the editor as a region labelled メタデータ (Issue #697)` を追加（`container.querySelector("section")` が非 null かつ `aria-label === "メタデータ"`）。`<section>` が `<div>` に戻る／`aria-label` が消える回帰を pin できる。さらに `noteEditorModeChange.test.tsx` に AC-2（常設マウント）/ AC-5（dirty→confirm 経路でも値保持）の結合テストが追加されており、Round 2 の懸念どおりの観点をカバーしている。

---

## Frontend

### Blockers

- なし

### Warnings

- なし

### Notes

- **[N-001]** B-001 解消を確認。landmark 化は commit `05d95954` として PR の HEAD に含まれ、editor 配下に未コミット変更は残っていない。typecheck/test の検証もコミット済み HEAD に対して行い、319 件パス。Round 2 で唯一残っていた Blocker が正しく潰れている。
- **[N-002]** W-001 解消を確認。新規 landmark テスト（`FrontMatterEditor.test.tsx`）は `<section>` 要素の存在と `aria-label="メタデータ"` を pin しており、回帰検知として妥当かつ軽量。AC でない観点をテストで保証する Round 2 の提案に正確に応えている。
- **[N-003]** 新規 AC-5 結合テスト（`noteEditorModeChange.test.tsx:NoteEditor FrontMatter permanent mount`）の品質が高い。(a) default inline で FrontMatter editor がマウントされる、(b) HTML/ビジュアル切替を跨いでもマウント維持、(c) `addFrontMatterKey` で dirty 化 → 本文モード切替で `confirm` が 1 回呼ばれ accept 後も KeyRow（`input[aria-label="FrontMatter キー"]` の value）が残存、を検証。セレクタは `aria-label`（`追加するキー名` / `FrontMatter キー`）で局所化されており、Round 1 plan が懸念した first-match textarea 衝突（arch-risk S-001）を回避。input value は textContent に含まれないため `value` 一致で判定している点も正確。参照ラベルは実際に `FrontMatterEditor.tsx:181,361` に存在することを確認。
- **[N-004]** `<section aria-label="メタデータ">` 化は landmark 重複・スタイル破壊なし（Round 2 N-001/N-002 から不変・再確認）。className は `mt-4 rounded-lg border border-hairline bg-surface-elevated p-5` を verbatim 維持。`<section>` はブロック要素でレイアウト無影響。utility-first・module-scoped 定数・`@apply` 不使用の Styling 規約を維持。追加コメントは「タブ消失で領域名が失われたためラベルが必要」という why コメントで CLAUDE.md コメント方針に沿う。
- **[N-005]** AC-1 充足。`EditorModeSwitch.tsx` の `TABS_NEW`=`wysiwyg/html`、`TABS_EDIT`=`inline/wysiwyg/html` で `frontMatter` エントリが両 surface から除去。JSDoc も 3 モード記述に更新。`editorModeSwitch.test.tsx` の期待値が `["ビジュアル","WYSIWYG","HTML"]` / `["WYSIWYG","HTML"]` に更新され WYSIWYG タブ（#696 由来）は温存。
- **[N-006]** AC-4 / 型波及の充足（Round 2 N-004 から不変・再確認）。`EditorMode = "html" | "wysiwyg" | "inline"`（editorState.ts:51）。`DirtyKey` の `"frontMatter"`・FrontMatter 状態/アクション群（`frontMatterMode`/`frontMatterRawJson`/`frontMatterJsonError`/`setFrontMatterField` 等）は温存。`editorState.test.ts` の `setMode mode:"frontMatter"` ケースは削除、`autosaveLogic.test.ts` は `inline` に置換しコメントで「FrontMatter は常設・常時 snapshot 送出」趣旨を明記。`snapshotForSubmit`/`onSubmit` の `JSON.stringify` は不変。
- **[N-007]** AC-2/AC-5 充足（Round 2 N-005 から不変・再確認）。`NoteEditor.tsx` の `state.mode === "frontMatter"` 排他分岐を撤去し、`FrontMatterEditor` を本文ペイン後・`submitError` 手前に条件分岐なしで常設マウント。props は無変更流用、`disabled={isPending}` 維持。`onModeChange` のコメントは ADR-001(B) どおり「アンマウント前提」を削除し「未コミット入力 flush + dirty 鮮度」へ正確に置換。WYSIWYG 装飾消失ゲート（#696）・unsaved-confirm・`abortInFlight` は一切壊れていない（#696 ゲート系テスト含む 319 件パスで実証）。
- **[N-008]** （情報共有・Round 2 N-006 から維持）常設化により FrontMatter JSON エラーゲート（`saveDisabled` の `frontMatterJsonError !== null` / `shouldFlushAutosave`）が本文モード問わず常時効く副作用は plan リスク欄・manual-test TC-EDGE-1 で意図どおりと確認済み。新たな回帰ではない。
- **[N-009]** `spec/design/pages/P12-editor.html` のドキュメント乖離（FrontMatter をタブ描画）は plan どおり本 Issue スコープ外（spec-sync 委譲）。
