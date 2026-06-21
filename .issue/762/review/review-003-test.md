# PR #767 レビュー（3周目）— テスト網羅性・テスト設計

対象 Issue: #762（HTML 編集モードで本文を整形表示し保存時に minify する）
レビュー観点: テスト網羅性・テスト設計（ゼロベース再検証）
主対象:
- `app/components/note/editor/__tests__/htmlFormat.test.ts`（新規）
- `app/components/note/editor/__tests__/editorState.test.ts`（拡張・Issue #762 ブロック L753-905）
- `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`（変更）

前提確認: `htmlFormat.test.ts` + `editorState.test.ts` を実行して全パス（135 passed）。指摘はすべて `formatHtml`/`minifyHtml` の実走 probe で裏取りした結果。2周目（review-002）が新規追加と判定した test W-001（figure no-op 固定）・W-002（深いネスト整形固定）・pre×`\n` 交差回帰テストの妥当性を、被検関数を実走させて個別に検証した。

---

## 2周目指摘（W-001 figure / W-002 深ネスト）への対応検証

両指摘とも今周で固定テストが**実在し、teeth がある**ことを実走で確認した。

- **W-002（深ネスト整形固定）→ 妥当に追加・強い。** `htmlFormat.test.ts:96-129` の `describe("deep nesting is actually indented, not no-op'd")` が (a) 5 段ネスト table を 12 行のリテラル期待値で `toBe` 固定、(b) nested blockquote を 4 行リテラルで `toBe` 固定。いずれも `minifyHtml(formatHtml(m)) === m` を併記。probe で `formatHtml(formatHtml(table)) === formatHtml(table)`（冪等）も確認。format が no-op に退化すればこの 2 本は確実に落ちる。2周目 W-002 の懸念（table/blockquote の depth 計算が往復恒等のみで未固定）は実際に塞がれている。

- **W-001（figure no-op 固定）→ 妥当に追加・意図を明示。** `htmlFormat.test.ts:179-191` の `describe("figure with a void <img> child stays verbatim (intended, W-001)")` が `formatHtml(fig) === fig`（no-op を明示固定）+ 往復恒等で固定。probe で `formatHtml('<figure><img alt=""><figcaption>cap</figcaption></figure>') === input`（no-op）を確認。コメントで「void 子は文脈依存（`<p>` 内では inline で語間スペース保持が必要）ゆえ figure を block 昇格せず verbatim 出力、round-trip 安全と inline 空白保持を最大整形より優先（AC-5）」と設計意図を明文化。2周目 W-001 が要求した「(a) 意図仕様なら明示固定」を正しく選択しており、no-op が無言で緑のまま通る空白地帯は解消された。

- **pre × inter-block `\n` 交差回帰テスト → 妥当に追加・最高リスク経路を踏む。** `editorState.test.ts:876-904` の `describe("pristine round-trip on a <pre> note with inter-block \\n (W-002-001)")` が、`<pre>` を block 兄弟に昇格させた W-003 と pristine 判定 B-001 が交差する経路（`minifyHtml(formatHtml(persisted)) !== persisted` になる形）を no-op 往復 byte 等価 + pristine snapshot で固定。probe で当該 fixture の `minifyHtml(formatHtml(prePersisted)) === false`（往復で `\n` が潰れる）を確認済み＝pristine 分岐を消すと確実に落ちる。`htmlFormat.test.ts:37-54` 側にも同形の `<pre>` 持ち persisted を整形 `toBe` 固定 + 冪等固定が対になっている。交差経路の網羅は十分。

---

## B-001 回帰防止テストの強度・循環依存の再検証（重点）

- **回帰捕捉の teeth を実走で再確認。** B-001 fixture `"<h2>a</h2>\n<p>b</p>\n<ul>\n<li>x</li>\n</ul>\n"` について probe で `minifyHtml(formatHtml(persisted)) === false`（`...\n<li>x</li>...` が `...<li>x</li>...` に潰れる）を確認。つまり実装の pristine 分岐（`isHtmlDraftPristine(contentHtml, htmlDraft) = htmlDraft === formatHtml(contentHtml)`、`editorState.ts:81-83`）を消すと、`editorState.test.ts:844-857`（no-op 往復で `toBe(persisted)` byte 等価 / pristine snapshot が元 contentHtml）は確実に落ちる。アサーションは `toBe(persisted)`（byte 等価）で弱くない。fixture も markdown-it→sanitiser 由来の inter-block `\n` を持つ実 contentHtml 形で、renderSync 出力との整合も取れている。

- **pristine 分岐は実装の両経路に存在。** `editorState.ts:527`（`setMode` html 離脱時）・`editorState.ts:743`（`snapshotForSubmit`）の双方で `isHtmlDraftPristine` を経由。テストも setMode 離脱（L844）・snapshot（L852）の両経路を踏んでおり、片肺固定ではない。

- **非 pristine（編集時 minify）分岐も固定。** `editorState.test.ts:859-873` が B-001 fixture に編集を加えた後 `snapshotForSubmit` / `setMode` 離脱で `<h2>a</h2><p>edited</p><ul><li>x</li></ul>`（minify 済み）になり `content` dirty が立つことを固定。pristine / 非 pristine 両分岐を踏む。

- **循環依存（被検対象への依存）は許容範囲。** `editorState.test.ts` 側の B-001 アサーションは**リテラル期待値**（`toBe("<h2>a</h2><p>edited</p>...")` 等）で固定しており、被検関数 `minifyHtml` を検証式に噛ませていない。pristine 往復の `toBe(persisted)` も生リテラルなので、`format`/`minify` が対称に壊れても落ちる。一方 `noteEditorModeChange.test.tsx:457, 989` の `expect(minifyHtml(htmlTextareaValue())).toBe(original)` は被検 `minifyHtml` を噛ませるが、**独立アンカー** `expect(htmlTextareaValue()).not.toBe(original)`（W-005 対応）が両箇所に併設され、かつ fixture `<section><p>x</p></section>` は `<section>∈BLOCK_TAGS` で実際に整形が走る（probe で `formatHtml` が `<section>\n  <p>x</p>\n</section>` を返すことを確認＝`not.toBe(original)` は空振りしない）。bind 退化（textarea が contentHtml に silently bind）を捕まえられる。循環依存は独立アンカーで緩和済みで Blocker/Warning には当たらない。

---

## テスト

### Blockers

なし。

AC-4,5,6,7,8,10 は各々最低 1 本の機械的検証があり、被検対象に循環依存した「写経テスト」は無い（リテラル固定 + 独立アンカーで担保）。2周目で要追加とされた figure no-op 固定・深ネスト整形固定・pre×`\n` 交差回帰はいずれも実走で teeth を確認した。B-001 回帰防止も pristine 分岐を消すと確実に落ちることを probe で裏取り済み。Blocker 級の抜けは無い。

### Warnings

なし。

2周目 W-001（figure no-op 固定）・W-002（深ネスト整形固定）は今周で妥当に追加され解消。残る論点は下記 Notes の通り Blocker/Warning に格上げするほどの回帰リスク・AC 不成立ではない。

### Notes

- **[N-001]** AC-10 ラウンドトリップは 10 形（p/ul/ol/隣接 a 語間スペース/br/div ネスト/blockquote/見出し混在/table フル/figure）を `for…of` で個別 `it` 展開し、可逆性の機械固定として十分。「format が確かに整形している側」も `pre+block`（L24-35）・markdown 由来 ul（L165-177）・5 段 table（L96-120）・blockquote（L122-128）で `toBe` 固定済み。no-op 退化を緑のまま通す穴は実用上塞がれている。

- **[N-002]** `editorState.test.ts` Issue #762 ブロック（L753-905）は AC-1/2/3/7 の要点を網羅: 初期 `htmlDraft===""`（seed しない）・`setMode("html")` 整形畳み込み + contentHtml 不変 + 非 dirty・`setHtmlDraft` が htmlDraft のみ更新し content dirty・snapshot の html=minify/他モード=verbatim・編集挟み往復で minify 確定・無編集往復で非 dirty・三角往復で非破壊・B-001 pristine 群（markdown 由来 / pre 持ち）。プロンプト指定の AC-7 3 点（setMode 整形・setHtmlDraft 後 snapshot minify・編集挟み往復非破壊）すべて実在。

- **[N-003]** AC-5（隣接 a 語間スペース）・AC-4（inline `<code>` 語間スペース verbatim）・AC-6（`[[target|display]]`）は専用 describe で format 側・往復側の両方を固定済み（`htmlFormat.test.ts:149-199`）。1周目 W-001（inline code 経路）も `htmlFormat.test.ts:156-162` で `<p>x <code>y</code> z</p>` を固定済みで、`<pre><code>` 経路（whitespace-significant 親）とは別の `isBlockFormattable===false` 経路を踏む。

- **[N-004]** AC-8 フォールバックは parse 失敗本命（`</div>` → probe で `ultrahtml.parse` が throw を確認）を `htmlFormat.test.ts:211-220` で `toBe(broken)`（byte 完全非破壊）固定。parse 成功経路（auto-close）も `:202-209` で内容保持を確認。AC-8 の核（catch 分岐）に到達している。

- **[N-005]** 純粋性の不変条件（AST 非変更・例外を投げない・冪等）は JSDoc で謳われ、`formatHtml` の冪等は `htmlFormat.test.ts:53`（pre 持ち）と `editorState.ts:81` の pristine 判定が暗黙に依存する形で部分固定されているが、`formatHtml(formatHtml(x))===formatHtml(x)` を汎用代表ケースで直接固定する独立テストは無い。probe で table/pre 等の冪等は確認できたが、reducer から純粋関数として呼ぶ前提（plan §設計2）の安全網として 1 本あると堅い（Blocker でない・1周目 N-006 / 2周目 N-005 から不変）。

- **[N-006]** probe で `<p data-x=foo>x</p>` → `<p data-x="">x</p>`（未クオート属性値が parse 成功のまま欠落）の lossy を再確認。AC-8 は「parse 失敗時のフォールバック」を担保するが、parse 成功でも属性値が落ちうる点は依然テスト外。属性消失は sanitizer 範囲との切り分けが要るため Blocker/Warning にはしない（1周目 W-004 後段 / 2周目 N-006 の据え置き事項）。

- **[N-007]** block コンテナ内の HTML コメント（`<div><!--c--><p>a</p></div>`）は probe で format がコメントをインデント出力、minify で周囲の整形空白のみ除去しコメント本体は保持することを確認（`isBlockFormattable` がコメントを skip するため block 整形が走る）。コメントは sanitizer allowlist 外で保存経路では落ちるため実害は無く、テスト不在も AC 上問題なし。観点として記録のみ。
