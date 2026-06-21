# PR #767 レビュー（3周目・フル再検証・ゼロベース） — Frontend統合

対象 PR: #767 / Issue #762
観点: pristine 判定（`isHtmlDraftPristine`）の正しさ・同期漏れ・autosave 発火条件・モード往復順序・reducer 純粋性・Blocker 級新規問題の有無
レビュー日: 2026-06-21
前提: 1周目 B-001（無編集 HTML タブ往復が `contentHtml` を書き換え autosave 誤発火）は pristine 判定で修正済み。2周目で frontend W-001（編集→pristine 復帰で冗長 autosave 1 回・本文破壊なし）は「実害なし・修正コスト過大」として見送り記録済み。今回はその両方を含めゼロベースで再検証した。

## サマリー

実装は plan / ADR どおりで、配線・同期・純粋性・往復順序すべてに新規 Blocker は無い。pristine 判定 `isHtmlDraftPristine(c, d) = (d === formatHtml(c))` を `setMode` html 離脱（`editorState.ts:527`）と `snapshotContentHtml`（`editorState.ts:743`）が同一ヘルパー経由で共有しており、(a) 無編集往復で `contentHtml` をバイト等価温存、(b) 編集時のみ `minifyHtml(htmlDraft)` 採用、という非対称が一箇所に集約されている。

`htmlFormat.ts` を直接 import して実測検証した（下記 Notes）。markdown-it 由来の inter-block `\n` を含む実 persisted 形・minified 形・inline 語間スペース・`<pre>`/`<code>`・table・blockquote・figure・コメント・エンティティ・複数属性・前後空白・block 間タブ/スペースの計 20+ ケースで、**pristine no-op 往復は全件バイト等価**、`formatHtml` は**全件冪等**、編集経路の `minifyHtml(formatHtml(m)) === m`（minified `m`）も**全件成立**。1周目 B-001 / W-001（実 `renderSync` フィクスチャ）/ W-002（属性順）/ W-003（`<pre>` block 扱い）はいずれも解消済みを再確認。

frontend W-001（pristine 復帰の冗長 autosave）は **見送り妥当**を維持する（見送りを覆す新事実なし。詳細は W-001）。残るは新規 Note 1 件（per-keystroke 二重 parse のコスト、無害）のみ。**マージ可能**。

---

## Blockers

なし。

pristine 判定が false negative（未編集なのに非 pristine→ `contentHtml` 書き換え）/ false positive（編集なのに pristine 判定で edit が捨てられる）を起こす経路を網羅探査したが、データ破壊・本文消失・無編集 autosave 誤発火のいずれも再現しなかった。`mode==="html"` の間に `contentHtml` を書き換える dispatch 経路が存在しない（`setContent` は inline/wysiwyg/inline-media のみ、html 分岐は `setHtmlDraft` のみ — `NoteEditor.tsx:206-216, 497, 512, 528`）ため、「入場時 `formatHtml(contentHtml)` == 離脱時 `formatHtml(contentHtml)`」が構造的に保証され、pristine 判定の前提が常に成立する。

---

## Warnings

- **[W-001]** HTML タブで「編集 → pristine 値へ復帰」しても `content` dirty が残り、無害だが冗長な autosave が 1 回走る（**2周目からの継続・見送り妥当を維持**）
  - **場所:** `editorState.ts:354-362`（`setHtmlDraft`）, 影響 `snapshotContentHtml` `:737-749`, `setMode` 離脱 `:522-534`
  - **理由:** `setHtmlDraft` は値変化で無条件に `content` dirty を立てる。1 文字打って消し `htmlDraft` を `formatHtml(contentHtml)` へ戻すと dirty は残り、`snapshotContentHtml` は pristine 判定で元 `contentHtml` を verbatim 返すため、autosave が「元と同一本文」を 1 回 flush する。他モードの `setContent` は同値復帰を `:351` で短絡し dirty を立てないため、HTML タブだけが非対称を持つ。
  - **実害:** 本文破壊・消失なし（送る内容は元と同一）。サーバ往復が 1 回増えるだけで autosaveSuccess 後に dirty クリアされ収束。回帰ではなく軽微な効率劣化。
  - **見送り判断の再確認:** 2周目で「実害なし・修正コスト過大」として見送り済み。今回ゼロベースで再検証したが、**見送りを覆す新事実は無い**。(1) 本文破壊・消失は構造的に起こり得ない（pristine 時 verbatim 温存）、(2) 冗長 flush は 1 回で必ず収束、(3) 修正には `setHtmlDraft` 内で毎キーストローク `formatHtml(state.contentHtml)` を呼ぶ pristine 判定が必要で、後述 N-003 の per-keystroke parse コストを dirty 判定にも持ち込むトレードオフが生じる。結論は **2周目と同じ「見送り妥当」**。ADR に「pristine 復帰時の dirty 残留は許容（無害な再保存）」と一行残せば設計意図が明確になる（任意）。

---

## Notes

- **[N-001]** pristine 判定の正しさを実測で網羅検証（`htmlFormat.ts` 直 import）。`isHtmlDraftPristine` は `htmlDraft === formatHtml(contentHtml)` の単純等式で、`setMode` 離脱（`:527`）と `snapshotContentHtml`（`:743`）が同一純粋ヘルパーを共有（lockstep）。
  - **no-op 往復のバイト等価:** markdown-it 由来 `\n`、minified、`<div>a</div> <div>b</div>` / `<p>a</p> <p>b</p>` / `<ul> <li>a</li> </ul>` / `<p>a</p>\t<p>b</p>`（block 間の有意でない whitespace を含む形）、`<pre>`×`\n` 交差、nested div、table、blockquote、figure、コメント間挟み、エンティティ、前後空白、複数属性、inline 語間スペースの計 20+ ケースで **pristine=true かつ committed===contentHtml がバイト等価**（FAILS=0）。B-001 の核心（persisted の inter-block whitespace を no-op で温存）が全件成立。
  - **`formatHtml` 冪等性:** `formatHtml(formatHtml(x)) === formatHtml(x)` も全ケース成立（FAILS=0）。これが pristine 判定の決定性（入場時に seed した `formatHtml(c)` が離脱時の再評価と恒等的に一致）を保証する。
  - **false positive:** 編集後に偶然 `htmlDraft === formatHtml(contentHtml)` と完全一致した場合のみ pristine=true になるが、その値は元と意味的同値（整形違いに過ぎない）で、元を verbatim 温存するのが正しく本文消失しない。

- **[N-002]** 編集経路の round-trip 等価も実測成立。`minifyHtml(formatHtml(m)) === m`（minified `m`）が ul/li、inline 語間スペース、`<pre>`、table、nested div、inline `<code>`、blockquote の全件で FAILS=0。media 挿入シミュレーション（`htmlDraft` 末尾へ `"\n<p><img/></p>"` 連結 → `minifyHtml`）も `<p>hello</p><p><img …></p>` に正しく正規化。編集後離脱（`hello`→`hello world`）も `minifyHtml` 済みが確定される。

- **[N-003]** reducer 純粋性は維持。`editorState.ts` は `ultrahtml` を直接 import せず `htmlFormat.ts:66` 越しに `formatHtml`/`minifyHtml` を呼ぶ（ADR-003 / S-003）。`isHtmlDraftPristine`（`:81-83`）/ `snapshotContentHtml`（`:737-749`）/ `setMode`（`:505-536`）はいずれも純粋・決定的・例外なし（`formatHtml`/`minifyHtml` は `try/catch` で入力素通しに倒す）。`setMode` の pristine 分岐は `formatHtml` を 1 回追加で呼ぶが純粋なので reducer の決定性は不変。
  - **付記（無害なコスト観察、Note 止まり）:** autosave の `snapshot` `useMemo`（`useAutosave.ts:196-218`）は `htmlDraft` 変化のたびに `snapshotForSubmit` → `snapshotContentHtml` を再計算し、html モードでは pristine 判定で `formatHtml(contentHtml)`、非 pristine で `minifyHtml(htmlDraft)` を呼ぶ。つまり HTML タブの 1 キーストロークごとに `ultrahtml.parse`+serialize が 1〜2 回走る。textarea 編集としては通常許容範囲（debounce は flush 側にあり memo 自体は同期）だが、巨大ノードや高速連打で体感が出る余地はある。実害確認はしていない・回帰でもないため Note 止まり。気になるなら `formatHtml(contentHtml)` を `contentHtml` 依存で memo 化する余地がある（任意）。

- **[N-004]** autosave 発火条件は正しい。`shouldFlushAutosave`（`useAutosave.ts:136-151`）は noteId/dirty/frontMatterError/wysiwyg-ack の 4 ゲートのみで、html モードは非ゲート（ADR-002）。`snapshot` `useMemo` の入力・依存配列の双方に `mode`/`htmlDraft` を含む（`:182-218`）ため、HTML タブ編集（`htmlDraft` のみ変化）が `snapshot` を変え flush を駆動。pristine no-op 往復では dirty が立たず（N-001）`shouldFlushAutosave` が false で発火せず、編集時のみ `content` dirty で発火。`flush` は `snapshot.contentHtml`（pristine→元・編集→minify 済み）を送る（`:249-260`）。`mode` を effect dep（`:328`）に持つため discard→mode 切替の再マウントも担保（Issue #286 配線踏襲）。

- **[N-005]** モード往復順序は設計どおり。html→wysiwyg 離脱は (1) `setMode` reducer が pristine→`contentHtml` 温存・編集→`minifyHtml(htmlDraft)` 確定 → (2) orchestrator が `detectSource = minifyHtml(latest.htmlDraft)` で decoration-loss 検出（`NoteEditor.tsx:279-289`）の順。`detectUnsupportedTags` はタグ存在のみ見て whitespace 非依存なので、pristine 時に reducer が温存する `contentHtml` と orchestrator の `minifyHtml(formatHtml(content))` で検出タグ集合が一致する（タグ集合は minify/format で不変）。`confirmWysiwygSwitch`（`:295-322`）の最終 `setMode("wysiwyg")` も `mode==="html"` を見て pristine/edit 分岐を通すため deferred switch で html 編集が捨てられない。unsaved-confirm（window.confirm）→ decoration-warning（ConfirmDialog）の順序ゲートとも非干渉。

- **[N-006]** 二重状態同期に漏れなし。入場=`formatHtml` を `htmlDraft` へ畳み `contentHtml` 不変（`:510-516`）／編集=`setHtmlDraft` が `htmlDraft` のみ更新し `content` dirty（`:354-362`）／離脱=pristine なら verbatim 温存・編集なら `minifyHtml` 確定（`:522-534`）／保存=`snapshotContentHtml` が同 pristine ルール（`:737-749`）。MediaUploader は html 経路で入口 prop=`state.htmlDraft`（`NoteEditor.tsx:501`）・出口 dispatch=`setHtmlDraft`（`:207`）で整合、inline/wysiwyg は `contentHtml` 側に固定（`:215, 517, 539`）。`HtmlEditor` は plain controlled textarea で `value={state.htmlDraft}`・`onChange→setHtmlDraft`（`:495-499`）、整形非対称を component は感知しない。

- **[N-007]** AC-9（サーバサニタイズ最終防衛線維持）を確認。PR 差分の変更ファイル一覧に `saveNote.ts` / `createNote.ts` / `htmlSanitizer.ts` は含まれず diff ゼロ。

- **[N-008]** テスト・型グリーン。`htmlFormat` / `editorState` / `noteEditorModeChange` の 3 ファイル 157 tests pass。1周目 B-001 回帰がテスト層で顕在化する実フィクスチャ（markdown 由来 inter-block `\n`）も含まれており、将来の劣化を機械的に検出できる状態。

---

## 結論

3周目フル再検証でも新規 Blocker は無い。pristine 判定は前提（html モード中 `contentHtml` 不変）が全 UI 経路で成立し、no-op 往復のバイト等価・`formatHtml` 冪等・編集経路の round-trip 等価をすべて実測で確認した。同期漏れ・autosave 発火条件・モード往復順序・reducer 純粋性すべて設計どおり。W-001 は 2周目の「見送り妥当」を覆す新事実が無く、見送り維持。残るは無害な per-keystroke parse コストの Note のみ。**マージ可能**。
