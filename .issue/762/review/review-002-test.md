# PR #767 レビュー（2周目）— テスト網羅性・テスト設計

対象 Issue: #762（HTML 編集モードで本文を整形表示し保存時に minify する）
レビュー観点: テスト網羅性・テスト設計（ゼロベース再検証）
主対象:
- `app/components/note/editor/__tests__/htmlFormat.test.ts`（新規）
- `app/components/note/editor/__tests__/editorState.test.ts`（拡張・Issue #762 ブロック L753-874）
- `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`（変更）

前提確認: 3 ファイルを実行して全パス（151 passed）。指摘はすべて実装挙動を `ultrahtml`/`htmlFormat` の実走 probe で裏取りした結果。1周目（review-001）の W-001〜W-005 修正は下記「1周目修正の検証」で個別に確認した。

---

## 1周目修正の検証（回帰捕捉の強さを実走で確認）

- **W-001（inline code 未テスト）→ 修正済み・強い。** `htmlFormat.test.ts:102-108` に `<p>x <code>y</code> z</p>` の format 恒等 + 往復恒等を追加。probe で実挙動（`format` が container を verbatim に倒して語間スペース・code テキストを保持）を確認。`<pre><code>` 経路とは別の `isBlockFormattable===false` 経路を踏んでおり、W-001 の懸念（inline code 単体の回帰網）を実際に塞いでいる。

- **W-004（parse 失敗フォールバック未到達）→ 修正済み・本命を踏んでいる。** `htmlFormat.test.ts:143-152` の `</div>` は probe で `ultrahtml.parse("</div>")` が **実際に throw する**ことを確認済み。よって `try/catch` の `catch` 分岐（AC-8 の核）を確実に通り、`toBe(broken)`（byte 完全非破壊）でアサートしている。`<<<>>>`/`<!-- 未終端` も throw することを確認。アサーションも `toContain` から `toBe` に格上げされ強い。

- **W-005（被検 minifyHtml への循環依存）→ 修正済み・両箇所。** `noteEditorModeChange.test.tsx:457-461, 989-993` の両ロケーションに独立アンカー `expect(htmlTextareaValue()).not.toBe(original)` を追加。textarea が `htmlDraft`（整形済み）でなく `contentHtml`（未整形）に silently bind した退化を捕まえられる。fixture `<section><p>x</p></section>` は `<section>∈BLOCK_TAGS` のため実際に整形が走り（probe 済み）、`not.toBe(original)` は確かに成立する＝アンカーが空振りしない。

- **W-003（pre が block 兄弟を巻き込んで整形抑止）→ pre は修正済み・固定テストあり。** 実装は `BLOCK_WHITESPACE_SIGNIFICANT=Set(["pre"])` を追加し、`<pre>` を「verbatim だが block 兄弟としては整形対象」に切り出した（`htmlFormat.ts:99-120`）。probe で `<p>x</p><pre><code>c</code></pre><p>y</p>` → `<p>x</p>\n<pre><code>c</code></pre>\n<p>y</p>` と整形されることを確認。`htmlFormat.test.ts:24-35` がこの期待値を直接固定 + `not.toBe(html)` + `toContain("\n")` + 往復恒等で no-op 退化も同時に防いでいる。強い。

- **B-001（無編集往復で spurious dirty / pristine snapshot）→ 修正済み・テストに teeth がある。** 実装は `isHtmlDraftPristine(contentHtml, htmlDraft) = (htmlDraft === formatHtml(contentHtml))` で pristine 判定し、pristine なら `setMode` 離脱・`snapshotForSubmit` の双方で `contentHtml` を byte 完全保持する（`editorState.ts:81-83, 527-528, 743-744`）。
  - **回帰捕捉の強さを実走確認:** B-001 fixture `"<h2>a</h2>\n<p>b</p>\n<ul>\n<li>x</li>\n</ul>\n"` について probe で `minifyHtml(formatHtml(persisted)) === persisted` が **false**（`...\n<li>x</li>...` が `...<li>x</li>...` に潰れる）であることを確認。つまり pristine 分岐を消すと往復で `contentHtml` が確実に変質する＝`editorState.test.ts:844-857`（no-op 往復で byte-for-byte / pristine snapshot が元 contentHtml）は本当に回帰を捕まえる。fixture が「ブロック間 `\n` を持つ markdown-it 由来の実 contentHtml 形」になっており、1周目 review-001 が指摘した「フィクスチャが renderSync 実出力と乖離」も解消されている。アサーションは `toBe(persisted)`（byte 等価）で弱くない。
  - **編集時 minify も固定済み:** `editorState.test.ts:859-873` は B-001 fixture に編集を加えた後 `snapshotForSubmit` / `setMode` 離脱で `<h2>a</h2><p>edited</p><ul><li>x</li></ul>`（minify 済み）になり、かつ `content` dirty が立つことを固定。pristine 分岐と非 pristine 分岐の両方を踏んでいる。

---

## テスト

### Blockers

なし。

AC-4,5,6,7,8,10 は各々最低 1 本の機械的検証があり、1周目で指摘された弱点（実 parse 失敗未到達・inline code 欠落・整形固定の薄さ・循環依存）はいずれも実走で修正を確認した。B-001 回帰防止テストも実走で teeth を確認済み。

### Warnings

- **[W-001]** `<figure>`（void `<img>` 含む block コンテナ）の整形が **無言の no-op** になっており、その no-op がどのテストにも捕まらない。
  - 場所: `htmlFormat.ts:113-120`（`isBlockElement`）/ fixture `htmlFormat.test.ts:67`。
  - 実走確認: `formatHtml('<figure><img src="/media/1" alt=""><figcaption>cap</figcaption></figure>')` は **1 行のまま**（整形されず）返る。理由は `<img>` が void で `BLOCK_TAGS`/`VOID_BLOCK_TAGS`/`BLOCK_WHITESPACE_SIGNIFICANT` のいずれにも入らず `isBlockElement(<img>)===false`、よって figure の children が `isBlockFormattable===false` と判定され、figure 全体が inline verbatim に倒れるから。W-003 で `pre` は救済したが、`img`（void）兄弟を含む figure は救済されていない。
  - なぜ Warning か: ラウンドトリップ恒等（`htmlFormat.test.ts:70-74` の figure 行）は no-op なので**当然 green** になる。つまりこの fixture は AC-10（可逆性）は踏むが、AC-1（読みやすい整形）について figure を**一切検証していない**——これは 1周目 W-002 が指摘した「format が恒等でも往復は緑」の弱点が figure ケースに残存している状態。`figure+img` は実ノート（メディア挿入の出力 `insertMediaIntoHtml`）で頻出する代表形なので、AC-1 の主目的が figure で効かないことがテストの空白地帯になっている。
  - 提案: (a) これが意図仕様（void 子だけの figure は整形しない）なら `expect(formatHtml(fig)).toBe(fig)` で「figure は整形対象外」を**明示的に固定**し JSDoc に一行残す。(b) 意図でない（本来 figcaption を改行したい）なら `img` 等の void 要素を block コンテナ判定で「block 兄弟」として扱う実装修正＋整形後文字列の固定テストを足す。いずれにせよ現状は「設計意図が不明なまま no-op が緑で通る」状態で、回帰検知力ゼロ。

- **[W-002]** ラウンドトリップ fixtures のうち `table`/`blockquote`/`div` ネストの **整形後文字列を直接固定したテストが無い**（format が確かに整形している側の固定が部分的）。
  - 場所: `htmlFormat.test.ts:54-75`（roundtrip 群）。
  - 1周目 W-002 への対応として `pre+block`（L24-35）・markdown 由来 ul（L111-122）の 2 ケースは整形後文字列を `toBe` で固定し no-op 退化を防いだが、roundtrip fixtures の中で「実際に多段インデントが走る代表形」である `table`（probe で 5 段ネストのインデントが入ることを確認）・`blockquote`・`div>p` は依然として往復恒等のみ。これらの整形ロジックが退化（no-op 化）しても roundtrip は全件緑のまま。
  - 提案: `table` か `blockquote` の 1-2 件について `expect(formatHtml(m)).toBe("…多段インデント入りの期待文字列…")` を追加。table は入れ子が深く整形ロジックの depth 計算を最もよく踏むので 1 本入れる価値が高い。W-001 と合わせると「format が確かに、かつ深いネストでも整形している」が固定できる。

### Notes

- **[N-001]** AC-10 ラウンドトリップは 10 形（p/ul/ol/隣接 a 語間スペース/br/div ネスト/blockquote/見出し混在/table フル/figure）を `for…of` で個別 `it` 展開しており、可逆性の機械固定としては十分。fixture が「renderSync が出す minified 表現」方針に揃っている旨もコメント明示。

- **[N-002]** `editorState.test.ts` Issue #762 ブロック（L753-874）は AC-1/2/3/7 の要点を網羅: 初期 `htmlDraft===""`・`setMode("html")` 整形畳み込み + contentHtml 不変 + 非 dirty・`setHtmlDraft` が htmlDraft のみ更新し content dirty・snapshot の html=minify/他モード=verbatim・編集挟み往復で minify 確定・無編集往復で非 dirty・三角往復で非破壊・B-001 pristine 群。プロンプト指定の AC-7 3 点（setMode 整形・setHtmlDraft 後 snapshot minify・編集挟み往復非破壊）すべて実在。

- **[N-003]** AC-5（隣接 a 語間スペース）・AC-6（`[[target|display]]`）は専用 describe で format 側・往復側の両方を固定済み（`htmlFormat.test.ts:95-130`）。AC-6 は `|` 区切り付き実フォーマット使用で妥当。

- **[N-004]** media-insert 正規化（`htmlFormat.test.ts:155-163`）の fixture `<p>body</p>\n<p><img src="/media/m1" alt="" /></p>` は `insertMediaIntoHtml` 実出力と整合し、minify 後の void `<img …>` 閉じ形も ultrahtml 実挙動と一致（probe 済み）。coverage P-001 連動として妥当。ただしこのテストは「`\n`-join された appended block の minify」を見るのみで、W-001 の「figure が整形されない」とは別経路（ここは `<p><img></p>` であって figure ではない）。

- **[N-005]** 純粋性の不変条件（AST 非変更・例外を投げない）は JSDoc で謳われ、probe で format の冪等（`formatHtml(formatHtml(x))===formatHtml(x)`）も確認できたが、冪等/参照透過を**直接固定するテストは無い**。reducer から純粋関数として呼ぶ前提（plan §設計2）の安全網として 1 本あると堅い（Blocker ではない・1周目 N-006 から不変）。

- **[N-006]** probe で `<p attr=unquoted>x</p>` → `<p attr="">x</p>`（未クオート属性値が parse 成功のまま欠落）の lossy を再確認。AC-8 は「parse 失敗時のフォールバック」を担保するが、parse 成功でも属性値が落ちうる点は依然テスト外。属性消失は sanitizer 範囲との切り分けが要るため Blocker/Warning にはしない（1周目 W-004 後段の認識事項として据え置き）。
