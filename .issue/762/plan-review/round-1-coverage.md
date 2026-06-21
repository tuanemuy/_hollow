# Plan Review — Issue #762 (Round 1)

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/762/plan.md` / `.issue/762/adr.md`
**レビュー日:** 2026-06-21

## サマリー判定

Issue 受け入れ条件（10件）は plan の AC-1〜AC-10 に 1:1 で過不足なく落ちており、由来欄もすべて「Issue 本文」で追跡可能。スコープ外作業の紛れ込みもない（「含まれないもの」が Issue の影響範囲を逆方向から正しく封じている）。全体として要件カバレッジは高い。ただし、plan が自ら触れている「MediaUploader の HTML モード挿入経路の整合」が **実装ステップ上で片側（dispatch 側）しか手当てされておらず、prop 供給側（`MediaUploader` の `contentHtml`、`insertMediaIntoHtml` への入力）が漏れている**。これは AC-1（整形表示）と AC-7（モード往復で本文非破壊）に直結する実害があるため要修正とする。

---

#### 問題点（要修正）

- **[P-001]** MediaUploader の HTML モード挿入経路の整合が dispatch 側のみで、prop 供給側が漏れている
  - 理由: plan ステップ4は「`onMediaInsert` の html モード経路を `htmlDraft` 更新に整合」とだけ書く。しかし実コードでは `MediaUploader` が `contentHtml={state.contentHtml}`（NoteEditor.tsx L470-474）を受け取り、その値を `insertMediaIntoHtml(contentHtml, …)`（MediaUploader.tsx L100）に渡して **末尾追記後の文字列を生成**してから `onInsert(nextHtml, …)` を呼ぶ。ADR-003 採用後、HTML タブで編集中の真実は `htmlDraft`（整形済み）であり `contentHtml` は minify 表現のまま。`MediaUploader` に `contentHtml`（minify 済み・古い表示）を渡し続けると、(a) ユーザーが HTML タブで編集中の `htmlDraft` ではなく minify 済み `contentHtml` の末尾に追記され、編集中テキストエリアの表示（`htmlDraft`）と挿入対象が食い違う、(b) 生成された `nextHtml` を `htmlDraft` に書き戻すと整形済みバッファに minify 由来の文字列が混ざる、という不整合が起きる。AC-1（整形表示の一貫性）・AC-7（往復非破壊）に波及する。
  - 提案: ステップ4の変更内容に「HTML モード時は `MediaUploader` の `contentHtml` prop に `htmlDraft` を渡す（あるいは挿入元/挿入先を `htmlDraft` に統一する）」を明記する。具体的には NoteEditor.tsx の html 分岐（L470-474）の `MediaUploader contentHtml={state.contentHtml}` を html モードでは `htmlDraft` 由来にし、`onMediaInsert` の html 経路は受け取った `nextHtml` を `setHtmlDraft` 系アクションで `htmlDraft` に反映する、という入口・出口両方の整合を 1 ステップに含める。なお `insertMediaIntoHtml` が整形済み文字列に追記した結果（`<p><img …/></p>` を `\n` 連結）は保存時 `minifyHtml` で正規化される前提なので、ラウンドトリップ等価テスト（ステップ6）にこの「整形済みバッファへの media 追記 → minify」ケースも 1 件加えると安全。

#### 改善提案（検討推奨）

- **[S-001]** `inline` モードの media 挿入（`setContent` 経路）への影響が AC とステップで明示されていない
  - 理由: 現状 `onMediaInsert` の `html`/`inline` は同じ `setContent` 経路を共有している（NoteEditor.tsx L201-206、コメント参照）。ステップ4で html 経路を `htmlDraft` に分岐させると、この共有経路を分割することになる。plan は「html 経路を `htmlDraft` 更新に整合」とは言うが、**inline 経路は従来どおり `contentHtml`（`setContent`）に残す**という不変側の確認が明文化されていない。スコープ外を変えない保証（「含まれないもの: WYSIWYG / inline の挙動」）と矛盾しないことを 1 行で固定しておくと、実装者が共有経路を一括で `htmlDraft` に倒す事故を防げる。

- **[S-002]** AC-7 の検証可能性を「inline → html → inline」の具体パスまで降ろすと強い
  - 理由: AC-7 は「HTML ⇄ WYSIWYG ⇄ inline の往復で本文が破壊されない」と Issue 文言どおりで妥当だが、ADR-003 のリスクの核心は「html タブで編集 → `htmlDraft` 更新 → 他モードへ離脱時の `minifyHtml(htmlDraft)` 確定の取りこぼし」にある。テスト方針（ステップ6 / editorState.test.ts）は「往復後も `contentHtml` が意味的に破壊されない」と書いてはいるが、**「html タブで `setHtmlDraft` した後にモード離脱すると、その編集が `contentHtml` に確定される」**ケース（編集を挟んだ往復）を明示テスト項目に格上げすると、同期漏れ（リスク欄3点目）を機械的に押さえられる。現状の「往復で破壊されない」は無編集往復だけでも通り得るため、検証強度に差が出る。

- **[S-003]** `surface==="edit"` の初期表示が `inline`、`new` が `wysiwyg` で、初期マウント時に html タブで開くケースが無い点をスコープとして 1 行明示すると親切
  - 理由: plan ステップ2に「`createInitialEditorState` で初期 `htmlDraft` を整形して seed（surface=edit が html で開くケースは無いが、html 遷移時の整形で担保）」と既に正しく書かれており、`createInitialEditorState`（editorState.ts L204-224）の `mode` 初期値（new→wysiwyg / edit→inline）とも整合している。これは良い記述。ただ AC-1 が「HTML タブで開いた初期表示」も Issue 期待挙動に含む（Issue「期待する挙動」1点目）ため、「初期 mode は html にならない＝整形は必ず `setMode("html")` 遷移時に走る」という前提を AC-1 の検証メモに添えると、レビュー時に「初期 html マウントの整形が無い」という誤検知を避けられる。

#### 良い点

- AC-1〜AC-10 が Issue「受け入れ条件」10項目と 1:1 対応し、各 AC の由来が全て「Issue 本文」でトレース可能。AC-9（サニタイズ最終防衛線）を「コードを変えないことで満たす」と明示し、AC-10（ユニットテスト）を独立 AC として立てている点が丁寧。
- スコープの「含まれないもの」が Issue の影響範囲リスト（`saveNote`/`createNote`/`htmlSanitizer`/`markdownConverter`）を逆方向から正しく封じており、サーバ側無変更・他モード無変更が明文で固定されている。スコープ外作業の紛れ込みは無い。
- ADR-003（`contentHtml` は全モード共通 minify を保ち、整形表示は派生 `htmlDraft` に分離）が、`contentHtml` を「全モード共通の単一の真実」とする現コード（editorState.ts のコメント・WYSIWYG/inline が `value={state.contentHtml}` を直接流す構造、NoteEditor.tsx L481/L497）と整合しており、代替案 (a) の「整形済み HTML が他モードに漏れる」リスクを正しく退けている。要件「モード往復で本文が破壊されない」を状態の形で表現する設計選択は妥当。
- ADR-001（既存 `ultrahtml` で自作・新規ライブラリ追加なし）が、サーバ側サニタイザ（htmlSanitizer.ts）と同じ `parse`/`renderSync` を使うことで minified 表現を揃えラウンドトリップ等価を取りやすくする、という Issue「処理順序の取り決め」の趣旨に合致。`[[...]]` がテキストノードとして素通しになる性質（htmlSanitizer.ts L74-77 のコメントで明記）を AC-6 の根拠として正しく引いている。
- 自動保存経路（AC-3）について、`snapshotForSubmit` への minify 一本化（ステップ3）と `useAutosave` の `useMemo` 依存（`htmlDraft`/`mode`）追加（ステップ4）の両方を挙げており、現コードの `snapshot` `useMemo`（useAutosave.ts L191-202）の依存配列に `contentHtml` がある構造を踏まえた指摘になっている。リスク欄でも「依存追加し忘れ」を明示しており、手動保存・自動保存の lockstep 思想（既存設計）を保つ意図が一貫している。
