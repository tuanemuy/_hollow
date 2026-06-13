# PR #715 レビュー Round 3 — Test 観点

対象: Issue #696（ノート編集画面に WYSIWYG モード追加 + 装飾消失警告ダイアログ）
レビュー種別: フルレビュー（Round 3）
対象テスト: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`, `editorModeSwitch.test.tsx`
（補助確認: `editorState.test.ts`, `noteEditorSeedOnce.test.tsx`）

実行結果: 該当 2 ファイル 21 tests green。`editorState.test.ts` / `noteEditorSeedOnce.test.tsx` 既存テストも green（破壊なし）。

---

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** AC-1〜AC-8 がすべて回帰可能な形で固定されている。AC-1/AC-6（タブ構成）は `editorModeSwitch.test.tsx` の純コンポーネントレベル + `noteEditorModeChange.test.tsx` のオーケストレータレベルの二段で pin。AC-2/AC-3/AC-4/AC-5/AC-7/AC-8 は happy-dom 結合テストで実観測。各テストの `it` 名に AC 番号が明記され、トレーサビリティが高い。

- **[N-002]** Round2 で追加された「新規画面で非対応タグありでもダイアログが出ない」テスト（`does NOT open the decoration dialog when HTML carries unsupported tags (AC-6)`）が AC-6 厳守を的確に pin している。HTML タブに生 `<section>` を実入力 → WYSIWYG 切替 → `alertDialog()` が `null` かつ WYSIWYG マウント、を実観測。これは「ゲートが `surface === "edit"` 限定」という実装の核心（`NoteEditor.tsx` L246）を正しく検証しており、tab-inventory からの間接推論ではなく振る舞いを直接固定している点が良い。コメントで「unsaved confirm は別の pre-#696 関心事であり AC-6 アサーションの一部ではない」と切り分けを明示しているのも適切。

- **[N-003]** AC-8 の実観測化（review-002 W-001 対応）が tautology を解消できている。`aborts in-flight saveDraft and preserves contentHtml on the WYSIWYG decoration-gate path (AC-8)` は、(1) unsaved confirm 通過時に in-flight `saveDraft` が `signal.aborted === true` になること、(2) 切替確定後に **HTML タブへ戻して live `state.contentHtml` を `htmlTextareaValue()` で実読** し原文 `<section>` markup が不変であること、を両方観測。キャプチャした const の再アサートではなく post-switch の実状態を読むため、confirm ハンドラが誤って `setContent` を発行する回帰を実際に捕捉できる。fake timer 下で TipTap onCreate（rAF）が完走しない制約を回避するため HTML タブ経由で content を読む設計判断もコメントで明示されている。

- **[N-004]** AC-5 の脆さが review-001 W-004 対応で解消済み。`lists every unsupported tag in sorted order and excludes supported tags` は単一 `toContain("<section>")` ではなく、複数非対応タグ + 対応タグ混在 fixture（`<section><table><tr><td>...`）で `dialogListedTags()` を `detectUnsupportedTags()` の出力（sorted/de-dup/supported除外）と完全一致比較。`expect(expected.length).toBeGreaterThan(1)` / `not.toContain("<p>")` の sanity assertion 付きで、ダイアログ↔ディテクタの暗黙結合が silent drift しない。リスト描画パターン（`<code>` 連結）が `WysiwygEditor` 既存バナーと一致する点も実コードで確認。

- **[N-005]** AC-7 の latch 結合（confirm 時に `wysiwygUnsupportedDetected` + `Ack` + `setMode` を 1 ハンドラで発行 → ペイン onCreate 再検出が同一集合 → `setsEqual` 短絡で ack 維持）が、(a) オーケストレータテスト（`switches and acks the in-pane banner`: マウント後 `role="note"` バナーに `<section>` が出るが「了解した」ボタンが無いことを確認）と、(b) reducer 単体テスト（`editorState.test.ts` の「同一集合・順序違いは referential no-op」L618 / 「異なる集合は ack リセット」L630）の二層で守られている。暗黙結合の意図がテストコメントに明記され、依存先の reducer 不変条件が別ファイルで pin されている defense-in-depth は良い設計。

- **[N-006]** 既存テストの非破壊が確認できた。`NoteEditor.onModeChange confirm conditions`（HTML タブ経由の clean/dirty/error 分岐）と Issue #286 の in-flight cancel スイート 5 本が WYSIWYG タブ追加・ダイアログ導入後も green。HTML タブ経路にはダイアログが挟まらないため confirm 経路 pin が壊れていない（計画リスク欄の懸念どおり問題なし）。`searchInternalLinkTargetsFn` モックを追加してWYSIWYG ペインマウント時のモジュールレベル read 破綻を防いでいる点も、テストコメントで理由が説明されている。

- **[N-007]** セレクタは概ね堅牢。`isWysiwygMounted()` は WYSIWYG ペイン固有の `role="toolbar"][aria-label="書式"]` を mounted マーカーに使い、他ペインと衝突しない（実コードで確認）。`alertDialog()` の `role="alertdialog"`、`dialogButtonByLabel` の textContent 一致も妥当。`htmlTextareaValue()` のセレクタ `'textarea[id*=":r"], textarea'` は前段が React `useId` フォーマット依存で脆いが、後段 `textarea` フォールバックがあり HTML モードでは textarea が 1 つだけ（HtmlEditor のみ、FrontMatter textarea は別モード）なので実害なし。改善するなら label 経由取得が望ましいが、機能上の問題ではないため指摘に留める。

- **[N-008]** ダイアログ本文文言の検証は実コードと整合。テストは `toContain("次の要素は WYSIWYG モードでは保持されません")`、実装は同文言 + 末尾コロン（`NoteEditor.tsx` L535）。`toContain` のため一致し、計画「テスト方針: 文言一致」を満たす。キャンセル/確認ボタンラベル（「キャンセル」「切り替える」）も `ConfirmDialog` 実装と一致。

- **[N-009]** カバレッジの抜けは実質なし。検討した境界（unsaved confirm をキャンセルした場合に装飾ゲートへ到達しない = `does not switch to WYSIWYG when the unsaved confirm is cancelled`）も pin 済み。`docs/test.md` の「Frontend: 必要最小限」方針に照らしても、フロントオンリー変更に対し十分以上の網羅。あえて挙げれば「ダイアログ確認ボタンが danger パレット固定（ADR-001 で許容）」のスタイル検証は無いが、これは振る舞いではなく回帰防止対象外で妥当な省略。
