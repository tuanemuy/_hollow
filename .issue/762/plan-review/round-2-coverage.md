# Plan Review — Issue #762 (Round 2)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/762/plan.md` / `.issue/762/adr.md`
**レビュー日:** 2026-06-21
**前提:** 1周目指摘（coverage P-001 / S-001〜S-003）反映後のゼロベース再検証

## サマリー判定

AC-1〜AC-10 は Issue「受け入れ条件」10項目に 1:1 で対応し、由来欄は全件「Issue 本文」で追跡可能。スコープ「含まれないもの」は Issue の影響範囲リスト（`saveNote`/`createNote`/`htmlSanitizer`/`markdownConverter`/他モード）を逆方向から過不足なく封じており、スコープ外作業の紛れ込みは無い。

1周目の coverage P-001（MediaUploader 整合）は、実コード（`NoteEditor.tsx` L470-474 の `contentHtml={state.contentHtml}` 入口・`onMediaInsert` 出口 L205 の `setContent`）を確認した結果、**入口 prop=`htmlDraft`／出口 dispatch=`setHtmlDraft` の両側手当て＋ラウンドトリップテスト 1 件追加として plan ステップ4・テスト方針（ステップ6）に正しく反映済み**。inline/wysiwyg 経路を不変側に固定する記述（S-001 反映）も入っており、共有経路の一括倒し事故も封じている。1周目指摘は適切に解消されている。

要件カバレッジ・スコープ整合性の観点で要修正の問題点はゼロ。

---

#### 問題点（要修正）

問題点ゼロ。

#### 改善提案（検討推奨）

- **[S-001]** AC-7 の対応ステップに `useAutosave`（ステップ4 の autosave 側）が含まれていない
  - 理由: AC-7（モード往復で本文非破壊）の対応ステップは「3, 4, 6」。モード離脱時の `minifyHtml(htmlDraft)→contentHtml` 確定は `onModeChange`（ステップ4 NoteEditor 側）で担保される設計だが、`contentHtml` と `htmlDraft` の二重状態は autosave の `snapshot` `useMemo` 依存（ステップ4 useAutosave 側）に `htmlDraft`/`mode` を加えないと「html タブ編集中の往復」で取りこぼす可能性がある。ステップ4 は NoteEditor と useAutosave を 1 ステップに束ねているので紐づけ上は AC-7 に含まれてはいるが、AC-3（自動保存）と AC-7（往復非破壊）が同じ useAutosave 変更に依存している点を 1 行明示すると、実装時に「autosave 依存追加は AC-3 だけの話」と誤読して AC-7 系の往復取りこぼしを見落とすリスクを下げられる。要件カバレッジは満たしているので提案レベル。

- **[S-002]** AC-9 の検証手段（「変更なしで担保」）に、レビュー時の確認方法を 1 行添えると検証可能性が上がる
  - 理由: AC-9（サニタイズ最終防衛線維持）は「対応ステップ＝変更なしで担保」と正しく置かれており、スコープ「含まれないもの」でも `saveNote`/`createNote`/`htmlSanitizer` 無変更が固定されている。ただし受け入れ基準は「検証可能な形」が要件なので、AC-9 は「`saveNote.ts`/`createNote.ts`/`htmlSanitizer.ts` の diff がゼロであること」をレビュー観点として明記すると、機械的に検証できる。リスク欄に「クライアント整形がサニタイズを代替していないことをレビューで確認」とあるので実質カバーされており、提案レベル。

#### 良い点

- AC-1〜AC-10 が Issue「受け入れ条件」10項目と 1:1 対応し、各 AC の由来が全て「Issue 本文」でトレース可能。1周目で良いとされた AC-9（変更なしで担保）・AC-10（独立 AC）の構成は維持されている。
- 1周目 coverage P-001 が実コード整合で解消されている。`MediaUploader` の入口（`contentHtml` prop, L470-474）・出口（`onMediaInsert` の `setContent`, L205）・追記関数（`insertMediaIntoHtml(contentHtml, …)`, MediaUploader.tsx L100）の三点を踏まえ、html モードのみ入口=`htmlDraft`／出口=`setHtmlDraft` に分岐し inline/wysiwyg を不変側に残す、という入口・出口・スコープ封じが 1 ステップに揃っている。整形済みバッファへの media 追記→minify のラウンドトリップテストもステップ6 に追加済みで、テストまで紐づいている。
- 1周目 S-002（編集を挟んだ inline→html→inline 往復テストへの格上げ）がテスト方針に「無編集往復だけでは通り得ない、同期漏れを機械的に押さえるケース」として明文化され、AC-7 の検証強度が上がっている。
- 1周目 S-003（初期 html マウントが無い前提）が AC-1 の検証メモ「初期 mode は new→wysiwyg/edit→inline で html にならない＝整形は必ず setMode("html") 遷移時に走る。初期 html マウントの整形が無いのは設計どおりで誤検知しない」として AC 表に直接埋め込まれ、実コード（`createInitialEditorState` L206 の `mode: surface === "new" ? "wysiwyg" : "inline"`）とも整合。レビュー時の誤検知防止が AC レベルに昇格している。
- スコープ「含まれないもの」が Issue 影響範囲リストを逆封じしており、サーバ側無変更・markdownConverter 無変更・他モード無変更が明文で固定。`EditorSnapshotInput`（L640-648 の Pick）への `mode`/`htmlDraft` 追加を型変更として明示し、手動保存（`onSubmit` L319-365 が `snapshotForSubmit` を通さず `contentHtml: state.contentHtml` を直送, L327/L342）と自動保存（useAutosave.ts L191-202 の `useMemo`）の両呼び出し側追従を型レベルで顕在化させる設計になっており、AC-2/AC-3 の保存経路カバレッジが構造的に担保されている。
