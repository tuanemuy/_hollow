# PR #767 レビュー — Frontend統合（reducer / orchestrator / autosave）

対象 PR: #767 / Issue #762
観点: reducer 純粋性・二重状態同期・手動保存の minify 一本化・自動保存・モード往復・MediaUploader・既存テスト回帰
レビュー日: 2026-06-21

## サマリー

実装の骨格（`htmlDraft` 派生フィールド分離、`snapshotForSubmit` 一本化、autosave 依存追加、MediaUploader 入口/出口整合、モード離脱時の minify 確定 → decoration-loss 検出順序、`confirmWysiwygSwitch` 経路の同期）は plan / ADR の設計どおりに実装されており、配線レベルの取りこぼしは見当たらない。reducer の純粋性方針（`ultrahtml` 直 import 回避、`htmlFormat.ts` 越し、例外を投げない）も守られている。

ただし **核心の不変条件 `minifyHtml(formatHtml(m)) === m` が実世界の `contentHtml`（markdown 由来）で破れている**。テストのフィクスチャがブロック要素間ホワイトスペースを一切含まないため、この破れが全テスト層で検出できずに通過している。結果として「HTML タブを開いて編集せず離脱しただけで `contentHtml` が書き換わり content dirty が立つ → 自動保存が走る」という回帰が、既存ノートの大多数（markdown 経由で作成されたもの）で発生する。これを Blocker とする。

---

## Blockers

- **[B-001]** ラウンドトリップ不変条件 `minifyHtml(formatHtml(m)) === m` が実世界の `contentHtml` で破れ、無編集の HTML タブ往復が `contentHtml` を書き換えて自動保存を誘発する
  - **場所:** `app/components/note/editor/htmlFormat.ts`（`minifyHtml` / `minifyChildren` のホワイトスペース除去規則）, 影響波及先 `editorState.ts:503-512`（`setMode` html 離脱の no-op 判定）, `snapshotForSubmit`/autosave 経路全体, テスト `__tests__/htmlFormat.test.ts` / `editorState.test.ts`（フィクスチャ）
  - **理由（実測で確認）:**
    - サーバ側サニタイザ（`htmlSanitizer.ts` の `parse`→`renderSync`）は **ブロック要素間のホワイトスペースのみの TEXT ノード（`\n` や空白）を verbatim 保持する**。`renderSync("<p>a</p> <p>b</p>")` → `"<p>a</p> <p>b</p>"`（空白保持）を実測確認。
    - 本文供給元の `markdownConverter.ts`（markdown-it, `html:false`）は **ブロック間に `\n` を出力する**。`md.render("para one\n\npara two\n\n- a\n- b\n")` → `"<p>para one</p>\n<p>para two</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n"` を実測確認。
    - したがって実際に永続化される `contentHtml` は markdown 由来ノートで `"<p>para one</p>\n<p>para two</p>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n"` のように **ブロック間 `\n` を含む**。パイプライン（markdownConverter → sanitizer）を実走させて永続形を確認済み。
    - これに対し `minifyHtml(formatHtml(persisted))` は `isBlockFormattable` 配下で whitespace-only TEXT を除去するため `"<p>para one</p><p>para two</p><ul><li>a</li><li>b</li></ul>"` を返し、**`\n` が落ちて入力と一致しない**（ADR-001 / plan §テスト方針が固定すると謳う不変条件の破れ）。
    - 実害: `editorState.ts:504-505` の html 離脱処理は `const minified = minifyHtml(state.htmlDraft); if (minified === state.contentHtml) { ...no-op... }` で同期要否を判定するが、`minifyHtml(formatHtml(persisted)) !== persisted` のため **無編集で HTML タブに入って離れただけでこの分岐が常に false** になり、`withDirty(state, "content", { contentHtml: minified })` が走って `contentHtml` を別表現に書き換え content dirty を立てる。`shouldFlushAutosave` は content dirty で true になるので、**ユーザーが何も編集していないノートを自動保存する**。これは plan §リスク「古い `contentHtml` が飛ぶ／取りこぼし」とは別種の、設計が見落としている新規回帰。
    - reducer 単体でも再現確認: 永続形 `contentHtml` を seed して `setMode("html")` → `setMode("inline")` すると `dirtyKeys.has("content") === true` かつ `contentHtml` が `\n` 落ちした別表現に変化する。
    - テスト盲点: `htmlFormat.test.ts` のロードトリップ・フィクスチャ（L44-55）も `editorState.test.ts` の `blockInit`（`"<ul><li>a</li><li>b</li></ul>"`）も `noteEditorModeChange.test.tsx` の `original`（`"<section><p>x</p></section>"`）も **ブロック間ホワイトスペースを含まない**。実世界の `renderSync` 出力（= 実際の `contentHtml`）はこれらと異なるため、不変条件の破れがどのテストにも引っかからない。plan §テスト方針は「フィクスチャの基準は `htmlSanitizer` が出す実際の minified 表現（`renderSync` 出力）に揃え、サーバ往復との整合も同時に押さえる」と明記しているが、実装フィクスチャはこれを満たしていない。
  - **提案（いずれか）:**
    1. **`minifyHtml` をブロック間ホワイトスペースについて非破壊にする（推奨・最小実装変更で不変条件を真に成立させる）。** `minifyChildren` で whitespace-only TEXT を一律 drop するのをやめ、「`formatHtml` がインデント目的で挿入した空白」と「元から存在する有意空白」を取り違えない規則にする。実装上は format 側が挿入する空白を「行頭インデント + 改行」という固定パターンに限定しているので、minify 側は「ブロック間の whitespace-only TEXT を **元の minified 表現に戻す**（= 完全除去ではなく、parse が見る whitespace-only TEXT をそのまま保持）」に倒すのが筋。ただしこの場合 `formatHtml` が挿入する改行/インデントは「元から無かった空白を追加」しているため、`minify(format(m))` で format 由来の空白だけを除去し元の空白は残す、という識別が必要になる。識別不能なら下の (2)。
    2. **`formatHtml` の挿入空白を minify で確実に取り切れる形にしつつ、元の有意空白を保存できないことを設計上許容するなら、少なくとも `setMode` 離脱と `snapshotForSubmit` の同期判定を「意味的同値」で行い、spurious dirty を止める。** 具体的には html 離脱時に `minifyHtml(state.htmlDraft) === minifyHtml(state.contentHtml)` を比較する（両辺を同じ正規化に通す）ことで、`\n` 差だけの場合に no-op に倒し、無編集往復で dirty を立てない／autosave を誘発しないようにする。`snapshotForSubmit` も「html タブに入っただけ（htmlDraft 未編集）なら `contentHtml` を verbatim 採用」する分岐を足すと、無編集保存で `\n` を潰さずに済む。ただしこれは「保存は常に minify」というルールに穴を開けるので採用時は ADR に明記が必要。
    3. **最低限、テストフィクスチャを実 `renderSync` 出力（ブロック間 `\n` 含む）に揃え、不変条件の破れをテストで顕在化させてから直す。** plan §テスト方針の「`renderSync` 出力に揃える」を実装に反映する。`<p>a</p>\n<p>b</p>` / `<ul>\n<li>a</li>\n<li>b</li>\n</ul>` を fixtures に追加すれば現状の実装で即 fail する。

---

## Warnings

- **[W-001]** ロードトリップ・テストが「サーバ往復との整合」を主張する一方で `renderSync` 実出力をフィクスチャに使っていない
  - **場所:** `app/components/note/editor/__tests__/htmlFormat.test.ts:42-62`
  - **理由:** コメント（L42-44）は「Fixtures are the *minified* representation the server sanitiser (`renderSync`) emits — i.e. the actual `contentHtml` users edit.」と明記しているが、実際の `renderSync` はブロック間ホワイトスペースを保持する（B-001 参照）ため、フィクスチャは実出力と乖離している。コメントの主張と実体が食い違っており、B-001 の盲点を生んでいる。B-001 の修正に付随して、`markdownConverter → htmlSanitizer.sanitize` を実走させた出力を 1 件以上フィクスチャに含める（または同等の `\n` 入りケースを足す）ことで「サーバ往復との整合」を実テストで担保すべき。

- **[W-002]** `renderAttributes` の属性直列化順序・引用符が `ultrahtml.renderSync` と完全一致である保証がテストにない
  - **場所:** `app/components/note/editor/htmlFormat.ts:127-133`
  - **理由:** `formatHtml`/`minifyHtml` は自作シリアライザで属性を `Object.entries` 順・`"..."` 固定で出力する。サニタイザの `renderSync` 出力（永続 `contentHtml`）と属性順や引用符が食い違うと、無編集 HTML タブ往復で `contentHtml` が「属性順だけ違う別文字列」になり、B-001 と同じ spurious dirty を別経路で引き起こす。現状の fixtures は単一属性 or 属性なしが大半（`<a href>`, `<img src alt>`）で複数属性のロードトリップ（例 `<a href="/x" rel="noopener" target="_blank">…</a>` や `<td colspan="2" rowspan="3">`）が無い。`ultrahtml` が属性挿入順を保つかをテストで固定すべき。実害が B-001 と同じ性質なので、B-001 の検証フィクスチャ拡充時に同時に押さえると良い。

- **[W-003]** `BLOCK_TAGS` のサニタイザ lockstep に `div`/`section`/`article` 以外の差分（`span` の扱い）が暗黙
  - **場所:** `app/components/note/editor/htmlFormat.ts:56-93` vs `htmlSanitizer.ts:81-127`
  - **理由:** サニタイザは `span` を `BLOCK_TAGS` に入れている（L96 付近）が、`htmlFormat.ts` は `span` を block に入れていない（inline 扱い・正しい）。これは意図的な差で実害は無いが、JSDoc（L36-37）は「`BLOCK_TAGS` / `INLINE_TAGS` と lockstep」と書いており、サニタイザの `BLOCK_TAGS` に紛れている inline 相当タグ（`span`）との不一致が将来のメンテナで混乱を生む。「サニタイザの BLOCK_TAGS のうち真にブロックなものだけを採り、`span` は inline として扱う」旨を JSDoc に一行残すと lockstep 更新時の事故を防げる。

---

## Notes

- **[N-001]** reducer 純粋性は方針どおり保たれている。`editorState.ts` は `ultrahtml` を直接 import せず `htmlFormat.ts:62` 越しに `formatHtml`/`minifyHtml` を呼び（ADR-003 / S-003）、両関数は `try/catch` でパース失敗を入力素通しに倒して例外を投げない（`htmlFormat.ts:229-235, 246-252`）。`formatNode`/`minifyNode` は AST を read-only で辿り破壊変形が無く、純粋関数の入力不変前提を守っている（ADR-001 の自作再帰シリアライザ方針どおり）。

- **[N-002]** 二重状態同期の配線は網羅的。`setHtmlDraft` は `htmlDraft` のみ更新し content dirty を立てる（`editorState.ts:335-343`）、html 入場は `formatHtml(contentHtml)` を畳み `contentHtml` を不変に保つ（L491-497）、html 離脱は `minifyHtml(htmlDraft)` を確定（L498-512）、`snapshotForSubmit` は `mode==="html"` で `minifyHtml(htmlDraft)`・他モードで `contentHtml` verbatim の単一ルール（L715-732）。`setContent` は html モードでは一切 dispatch されない（NoteEditor の html 分岐は `setHtmlDraft` のみ）ので古い `contentHtml` 直書きの経路は無い。B-001 はこの同期そのものの欠陥ではなく、同期判定が依拠する `minifyHtml` の不変条件破れに起因する。

- **[N-003]** 手動保存の minify 一本化は完了している。`onSubmit`（`NoteEditor.tsx:343-345, 357, 371`）は `snapshotForSubmit(state)` を組み立て、`createNote`/`saveNote` 両分岐の `contentHtml` を `snap.contentHtml` 由来に、`frontMatterJson`/`tagNames` も `snap` 由来に揃えており、plan P-003（手動・自動が同一スナップショットルールを通る）を満たす。旧来の `contentHtml: state.contentHtml` 直送の残骸は無い。

- **[N-004]** 自動保存の依存追加は正しい。`useAutosave.ts:182-218` の `snapshot` `useMemo` は入力・依存配列の双方に `mode` / `htmlDraft` を含み（L196-218）、HTML タブ編集（`htmlDraft` のみ変化）が `snapshot` を変えて flush を駆動する。`flush` は `snapshot.contentHtml`（= minify 済み）を送る（L249-260）。stale 保存の依存漏れは無い。

- **[N-005]** モード往復の順序と confirm 経路は設計どおり。`onModeChange` は html 離脱時に `detectSource = minifyHtml(latest.htmlDraft)` を decoration-loss 検出に使い（`NoteEditor.tsx:279-289`）、`setMode` reducer が同じ `minifyHtml(htmlDraft)` を `contentHtml` に確定するため検出源と WYSIWYG マウント本文が lockstep。`confirmWysiwygSwitch`（L295-322）も最終 `setMode("wysiwyg")` が `mode==="html"` を見て `minifyHtml(htmlDraft)` を確定するため、deferred switch で html タブ編集が捨てられない。unsaved-confirm（window.confirm）→ decoration-warning（ConfirmDialog）の順序ゲートとも干渉していない。

- **[N-006]** MediaUploader の html 経路は入口 prop / 出口 dispatch の両側で `htmlDraft` に整合（`NoteEditor.tsx:500-504` の `contentHtml={state.htmlDraft}`、`onMediaInsert` html 分岐 L206-210 の `setHtmlDraft`）。inline（`setContent` / `contentHtml` prop, L508-521）・wysiwyg（TipTap `setImage` / `contentHtml` prop, L193-200, 538-542）経路は不変に保たれており、共有経路を一括で `htmlDraft` に倒していない（plan coverage P-001 / S-001 coverage どおり）。`insertMediaIntoHtml` の `\n` 連結追記は保存時 `minifyHtml` で正規化される前提で、テストにケースあり（`htmlFormat.test.ts:109-118`）。ただしこのテストも `\n`-join された appended block の minify を検証するだけで、B-001 の「元から `\n` を含む `contentHtml` の保存」は別物。

- **[N-007]** AC-9（サーバサニタイズ最終防衛線維持）は満たされている。PR の変更ファイル一覧に `saveNote.ts` / `createNote.ts` / `htmlSanitizer.ts` は含まれず、diff ゼロを確認。

- **[N-008]** AC-1, AC-7, AC-8 はテスト・配線レベルで満たされている（初期 `htmlDraft===""`、html 遷移時のみ整形、不正 HTML フォールバック、モード往復で `contentHtml` 非破壊 ※ただし AC-7 の「非破壊」は B-001 の `\n` 落ちにより「意味的には非破壊だが byte 等価ではない」点に注意）。AC-2 / AC-3 は「最終的に minify 済みが永続化される」点は満たすが、B-001 により「無編集でも保存対象になる」副作用を伴う。
