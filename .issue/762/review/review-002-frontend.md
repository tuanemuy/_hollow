# PR #767 レビュー（2周目・フル再検証） — Frontend統合（reducer / orchestrator / autosave）

対象 PR: #767 / Issue #762
観点: pristine 判定の正しさ・二重状態同期・自動保存・モード往復順序・reducer 純粋性・1周目見落とし
レビュー日: 2026-06-21
前提: 1周目 Blocker B-001（無編集 HTML タブ往復が `contentHtml` を書き換え autosave を誤発火）は pristine 判定導入で修正済み。ゼロベースで再検証した。

## サマリー

1周目 B-001 の修正は適切。`isHtmlDraftPristine(contentHtml, htmlDraft) = htmlDraft === formatHtml(contentHtml)` を `setMode` 離脱（`editorState.ts:522-534`）と `snapshotContentHtml`（`editorState.ts:737-749`）の両経路で共有し、未編集なら元の `contentHtml` をバイト等価で温存、編集時のみ `minifyHtml(htmlDraft)` を採用する設計に一本化されている。ADR-004 として設計判断も記録済み。

pristine 判定の核心仮定「html モード中は `contentHtml` が変わらない」を全 UI 経路で検証した結果、`setContent` は inline / wysiwyg / inline-media 経路のみで dispatch され、html モードでは `setHtmlDraft` だけが走る（`NoteEditor.tsx:206-216, 497, 512, 528`）。html モード中に `contentHtml` を書き換える経路は存在せず、仮定は常に成立する。したがって「未編集なら `htmlDraft === formatHtml(contentHtml)` が恒等的に真」が構造的に保証される（`htmlDraft` を `formatHtml(contentHtml)` で seed し、pristine 判定が同じ純粋関数を再評価するため）。実測でも markdown-it 由来の inter-block `\n` を含む実フィクスチャ・属性正規化・コメント・エンティティ・`<pre>`・table・double-newline すべてで no-op 往復が pristine=true となり、`contentHtml` がバイト等価で温存されることを確認した。

1周目 B-001 / W-001（実 `renderSync` フィクスチャ）/ W-002（属性順）/ W-003（`<pre>` block 扱い・span lockstep）はいずれも解消されている。残るのは軽微な edit-then-revert の dirty 残留（W-001 として記載）のみで、Blocker は無い。

---

## Blockers

なし。

1周目 B-001 は解消を確認。pristine 判定が false negative / false positive を起こすケースを網羅探査したが、データ破壊・本文消失・無編集 autosave 誤発火のいずれも再現しなかった（下記 Notes に検証内訳）。

---

## Warnings

- **[W-001]** HTML タブで「編集 → 元に戻す（pristine 値へ復帰）」しても `content` dirty が残り、無害だが冗長な autosave が 1 回走る
  - **場所:** `editorState.ts:354-362`（`setHtmlDraft`）, 影響 `snapshotContentHtml` `editorState.ts:737-749`, `setMode` 離脱 `editorState.ts:522-534`
  - **理由:** `setHtmlDraft` は値が変われば無条件に `content` dirty を立てる。ユーザーが 1 文字打って消し `htmlDraft` を pristine 値（`formatHtml(contentHtml)`）へ戻すと、dirty は立ったまま残る。このとき `snapshotContentHtml` は pristine 判定で元の `contentHtml` を verbatim 返すため、autosave は「元と同一の本文」を 1 回 flush する（`shouldFlushAutosave` は `content` dirty で true）。実測で再現確認（`setMode("html")` → `setHtmlDraft(draft+"x")` → `setHtmlDraft(draft)` で `dirtyKeys=['content']` 継続・`snapshot.contentHtml===元の contentHtml`）。他モードの `setContent` は同値復帰で短絡（`editorState.ts:351`）し dirty を立てないため、HTML タブだけが「pristine 復帰でも dirty 残留」という非対称を持つ。
  - **実害:** 本文破壊・消失は無い（送る内容は元と同一）。サーバ往復が 1 回増えるだけで、autosaveSuccess 後は dirty がクリアされ収束する。回帰ではなく軽微な効率劣化。
  - **提案（任意）:** `setHtmlDraft` で「`isHtmlDraftPristine(state.contentHtml, action.value)` が真なら dirty を立てず（あるいは既存 dirty を据え置き）」に倒すと、pristine 復帰で content dirty が立たず冗長 flush を防げる。ただし「最初に値が変わった瞬間に dirty を立てる」即時性とのトレードオフ（pristine 判定は `formatHtml` を毎キーストローク呼ぶコスト増）がある。現状は無害なので必須ではない — ADR に「pristine 復帰の dirty 残留は許容（無害な再保存）」と一行残せば設計意図が明確になる。

---

## Notes

- **[N-001]** pristine 判定の正しさを網羅検証した。`isHtmlDraftPristine` は `htmlDraft === formatHtml(contentHtml)` の単純等式で、`setMode` 離脱（`editorState.ts:527`）と `snapshotContentHtml`（`editorState.ts:743`）が同一ヘルパーを共有する（lockstep）。
  - **false negative（未編集なのに非 pristine 判定）:** html 入場で `htmlDraft = formatHtml(state.contentHtml)`（`editorState.ts:514`）、pristine 判定は同じ `formatHtml(state.contentHtml)` を再評価。`formatHtml` は純粋・決定的なので未編集なら恒等的に一致する。html モード中 `contentHtml` は不変（N-002）なので、入場時と離脱時で `formatHtml(contentHtml)` が変わることもない。実測 12 ケース（markdown 由来 `\n`、minified、nested div、`<pre>`、inline 語間スペース、table、blockquote、double-newline、前後空白、bool 属性、コメント、エンティティ）すべて no-op 往復で pristine=true・`contentHtml` バイト等価。`formatHtml` の冪等性（`formatHtml(formatHtml(x)) === formatHtml(x)`）も全ケースで成立。
  - **false positive（編集したのに pristine 判定で edit が捨てられる）:** ユーザーが編集後に偶然 `htmlDraft` を `formatHtml(contentHtml)` と完全一致させた場合のみ pristine=true になるが、その値は元の `contentHtml` と意味的に同値（`minify(format(content))` の整形違いに過ぎない）。元を verbatim 温存するのが正しく、本文消失は起きない。
  - 結論: pristine 判定が誤判定でデータを失う経路は無い。

- **[N-002]** html モード中に `contentHtml` を書き換える経路が他に無いことを確認（pristine 判定の前提）。`setContent` の dispatch は (a) `InlineEditor.onChange`（`NoteEditor.tsx:512`, `mode==="inline"` ガード下）、(b) `WysiwygEditor.onChange`（`:528`, wysiwyg ガード下）、(c) `onMediaInsert` の inline 経路（`:215`）のみ。html 分岐は `setHtmlDraft` のみ（`:497`）、html の MediaUploader も `setHtmlDraft`（`:207`）。`onInitFailed`（`:514`）は inline→html への `setMode` で逆方向。よって `mode==="html"` の間 `contentHtml` は不変で、「入場時 `formatHtml(contentHtml)` == 離脱時 `formatHtml(contentHtml)`」が保証される。

- **[N-003]** 二重状態同期（contentHtml / htmlDraft）の全経路に漏れ無し。入場=`formatHtml` を `htmlDraft` へ畳み `contentHtml` 不変（`:510-516`）／編集=`setHtmlDraft` が `htmlDraft` のみ更新し `content` dirty（`:354-362`）／離脱=pristine なら verbatim 温存・編集ありなら `minifyHtml(htmlDraft)` 確定（`:522-534`）／保存=`snapshotContentHtml` が同 pristine ルール（`:737-749`）。MediaUploader は入口 prop=`state.htmlDraft`（`:501`）・出口 dispatch=`setHtmlDraft`（`:207`）で html 経路を整合、inline/wysiwyg は `contentHtml` 側に固定（`:215, 517, 539`）。

- **[N-004]** 自動保存の依存配線は正しい。`useAutosave.ts:182-218` の `snapshot` `useMemo` は入力・依存配列の双方に `mode` / `htmlDraft` を含む。HTML タブ編集（`htmlDraft` のみ変化）が `snapshot` を変え flush を駆動し、`flush` は `snapshot.contentHtml`（pristine なら元・編集なら minify 済み）を送る（`:249-260`）。pristine 時に dirty が立たなければ（N-001 の no-op 往復）`shouldFlushAutosave` が false で発火しない。編集時は `content` dirty が立ち発火する。論理的に追えて取りこぼし無し。`canFlush` / `mode` を effect dep に持つため discard→mode 切替の再マウントも担保（既存 Issue #286 配線を踏襲）。

- **[N-005]** モード往復順序は設計どおり。html→wysiwyg 離脱は (1) `setMode` reducer が pristine なら `contentHtml` 温存・編集なら `minifyHtml(htmlDraft)` 確定 → (2) orchestrator が `detectSource = minifyHtml(latest.htmlDraft)` で decoration-loss 検出（`NoteEditor.tsx:279-289`）の順。pristine 時に reducer は `contentHtml` を温存し orchestrator は `minifyHtml(htmlDraft)` で検出するが、`detectUnsupportedTags` はタグ存在のみを見て whitespace 非依存なので、`minifyHtml(formatHtml(content))` と元 `content` で検出タグ集合が一致することを実測確認（`<section>` / `<kbd>` / table すべて MATCH）。検出源と WYSIWYG マウント本文の意味的整合は保たれる。`confirmWysiwygSwitch`（`:295-322`）の最終 `setMode("wysiwyg")` も `mode==="html"` を見て pristine/edit 分岐を通すため、deferred switch で html 編集が捨てられない。

- **[N-006]** reducer 純粋性・例外安全は維持。`editorState.ts` は `ultrahtml` を直接 import せず `htmlFormat.ts:66` 越しに `formatHtml`/`minifyHtml`/`isHtmlDraftPristine` を呼ぶ（ADR-003 / S-003）。両関数は `try/catch` でパース失敗を入力素通しに倒し例外を投げない（`htmlFormat.ts:243-248, 260-265`）。`formatNode`/`minifyNode`/`renderVerbatim` は AST を read-only で辿り破壊変形が無い。`setMode` の pristine 分岐は `formatHtml` を 1 回追加で呼ぶが純粋なので reducer の決定性は保たれる。

- **[N-007]** 1周目 W-002（属性順）は実質解消。`minifyHtml` の属性直列化（`Object.entries` 順・`"..."` 固定, `htmlFormat.ts:141-147`）が `ultrahtml.renderSync` と byte 一致することを multi-attr 4 ケース（`<a>` 3属性・`<td colspan rowspan>`・`<img>` 3属性・`<p class id>`）で実測確認。編集時の `minifyHtml(htmlDraft)` がサーバ `renderSync` と揃うため save→refetch が安定し、属性順差による spurious dirty は発生しない。pristine 経路は元を verbatim 温存するので属性順の影響を受けない。

- **[N-008]** 1周目 W-001（実 `renderSync` フィクスチャ）は解消。`htmlFormat.test.ts:111-123` が markdown 由来 inter-block `\n` を含む実 persisted 形（`"<h2>a</h2>\n<p>b</p>\n<ul>\n<li>x</li>\n</ul>\n"`）で format が no-op に劣化しないことを固定。`editorState.test.ts:836-874` が同じ persisted で no-op 往復のバイト温存・dirty 非立て・編集時 minify を機械的に押さえる。B-001 回帰がテスト層で顕在化する状態になった。

- **[N-009]** 1周目 W-003（`<pre>` block 扱い・span lockstep）は解消。`BLOCK_WHITESPACE_SIGNIFICANT = new Set(["pre"])`（`htmlFormat.ts:105`）で `<pre>` をコンテナ整形判定上 block 兄弟扱いにし、周囲 `<p>` の整形抑止を解消（ADR-005）。`htmlFormat.test.ts:24-35` が W-003 ケースを固定。JSDoc（`htmlFormat.ts:57-59, 99-105`）にサニタイザ `BLOCK_TAGS` から `span`（inline 扱い）/ `pre`/`code`（個別扱い）を除く lockstep 注記あり。サニタイザ側 `BLOCK_TAGS` に `span` が混ざる（`htmlSanitizer.ts:104`）点との不一致が明文化された。

- **[N-010]** AC-9（サーバサニタイズ最終防衛線維持）を確認。PR 差分に `saveNote.ts` / `createNote.ts` / `htmlSanitizer.ts` の変更なし（diff ゼロ）。

- **[N-011]** テスト・typecheck グリーン。`htmlFormat` / `editorState` / `noteEditorModeChange` / `autosaveLogic` の 4 ファイル 171 tests pass、`pnpm typecheck` clean。

---

## 結論

1周目 B-001 の pristine 判定修正はゼロベース再検証でも妥当。pristine 判定の前提（html モード中 `contentHtml` 不変）が全 UI 経路で成立し、false negative / false positive のいずれも再現しない。二重状態同期・自動保存・モード往復順序・reducer 純粋性すべて設計どおり。残るのは W-001（pristine 復帰時の無害な dirty 残留）のみで、これは任意修正。マージ可能。
