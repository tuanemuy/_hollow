# PR #767 レビュー — テスト網羅性・テスト設計

対象 Issue: #762（HTML 編集モードで本文を整形表示し保存時に minify する）
レビュー観点: テスト網羅性・テスト設計
主対象:
- `app/components/note/editor/__tests__/htmlFormat.test.ts`（新規）
- `app/components/note/editor/__tests__/editorState.test.ts`（拡張）
- `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`（変更）

前提確認: 新規/拡張テストは実行して全パス（`htmlFormat.test.ts` + `editorState.test.ts` で 122 passed）。以下の指摘は「網羅できているか／弱すぎないか／回帰リスク」の観点で、実装挙動を実際に probe して裏取りした結果。

---

## テスト

### Blockers

なし。

AC-4,5,6,7,8,10 はいずれも「最低 1 本の機械的検証」が存在し、致命的な未担保（テストの不在による AC 不成立）は無い。ラウンドトリップ等価（AC-10）も後述のとおり代表 10 ケースで固められており、1 パターンお茶濁しではない。

### Warnings

- **[W-001]** AC-4 のインライン `<code>` ケースが未テスト / `htmlFormat.test.ts:64-80` / プロンプトが明示的に挙げた `<p>x <code>y</code></p>`（block コンテナ内の **inline かつ whitespace-significant** な子）のケースが無い。現状の `<code>` テストはすべて `<pre><code>…</code></pre>`（pre 配下）であり、これは `<pre>` が whitespace-significant 親として subtree を verbatim 出力する経路に乗るため、`<code>` 単体が「inline 要素として block コンテナ内に居るときの語間スペース保持」を検証していない。実装上はこの経路が別物（`isBlockFormattable` が false を返してコンテナごと inline verbatim に倒れる）で、probe では `<p>x <code>y</code> z</p>` は正しく保持されることを確認したが、`WHITESPACE_SIGNIFICANT_TAGS` の扱いと `isBlockFormattable` の判定が将来分岐したときにこの経路の回帰を捕まえる網が無い。提案: `expect(minifyHtml(formatHtml("<p>x <code>y</code> z</p>"))).toBe("<p>x <code>y</code> z</p>")` を AC-4 もしくは AC-5 ブロックに 1 本追加（語間スペース＋inline code の同時固定になり一石二鳥）。

- **[W-002]** `formatHtml` の整形出力（pretty-print そのもの）の固定が薄い / `htmlFormat.test.ts:41-62` のラウンドトリップ群 / ラウンドトリップ等価 `minifyHtml(formatHtml(m)) === m` は「`minify∘format` が恒等」を担保するが、`format` が **実際に読みやすく整形しているか**（AC-1 の目的）はほぼ担保していない。format が恒等関数（何もしない）でもラウンドトリップは全件通る。`describe("formatHtml")` 側で実際にインデント・改行が入ることを固定しているのは `<p>a</p><p>b</p>`・`<ul><li>…`・inline 1 行維持の 3 本のみで、roundtrip fixtures の `<table>…`・`<blockquote>`・`<div><p>`・見出し混在のような「実際に整形が走る代表形」に対する **整形後文字列の直接固定** が無い。提案: roundtrip fixtures のうち block 構造を持つ 2-3 件について `expect(formatHtml(m)).toBe("…改行/インデント入りの期待文字列…")` を追加し、「format が確かに整形している」側を固定する。これが無いと format ロジックが退化（no-op 化）してもテストが緑のままになる。

- **[W-003]** whitespace-significant 要素が **block 兄弟と共存** したときの整形抑止が未テスト・かつ AC-1 劣化として要注意 / `htmlFormat.ts:101-125`（`isBlockFormattable`）/ probe で確認した実挙動: `<p>a</p><pre><code>x</code></pre><p>b</p>` を `formatHtml` すると **一切整形されず 1 行のまま**返る。理由は `<pre>` が `BLOCK_TAGS`/`VOID_BLOCK_TAGS` のどちらにも入っておらず `isBlockElement(<pre>)===false` のため、`isBlockFormattable` がコンテナ全体を「整形不可」と判定して兄弟の `<p>` まで巻き込んで verbatim に倒すから。同様に `<figure><img><figcaption>` も `<img>`(void) が block 判定されず figure が整形されない。ラウンドトリップ等価は保たれる（だから AC-10 は緑）が、**コードブロックを含むノートでは HTML タブの整形表示（AC-1 の主目的）が丸ごと効かない**。これが意図的仕様（pre を含むと整形しない）なら JSDoc/テストで「pre 兄弟があるコンテナは整形対象外」と固定すべきで、意図でないなら実装バグ。いずれにせよ現状はテストの空白地帯。提案: `<p>x</p><pre><code>c</code></pre><p>y</p>` を入力に整形後の期待値をテストで固定し、設計意図を明文化する（pre subtree は verbatim・周囲 block は整形する、が本来あるべき姿のはず）。

- **[W-004]** AC-8 のフォールバックが「parse 失敗による input 素通し」を検証していない / `htmlFormat.test.ts:98-107` / 唯一の AC-8 テストは `<p>broken<span>x`（閉じタグ欠落）だが、これは ultrahtml が auto-close するため **parse 成功経路**を通り、`catch` フォールバック（実装の AC-8 の核）には到達しない。`toContain("broken")` / `toContain("x")` というアサーションも弱く、整形ロジックが内容を保つことの確認止まり。実装の `try/catch` による「parse が throw したら input をそのまま返す」分岐を踏むテストが無い。probe では `<<<>>>` や `<!-- 未終端コメント` が input 素通し（フォールバック相当）になることを確認したが、ここをテストで踏めていない。提案: 整形が壊れても入力が消えないことを `expect(formatHtml(broken)).toBe(broken)` の形（=完全非破壊）で固定できる入力を 1 件足す。また probe で `<p attr=unquoted>x</p>` → `<p attr="">x</p>`（**未クオート属性値が parse 成功のまま消える**）という lossy ケースを確認。AC-8 が「編集を失わない」を謳う以上、parse 成功でも値が落ちうることを Note 級では認識しておくとよい（属性消失は sanitizer 範囲との切り分けが必要なので Blocker にはしない）。

- **[W-005]** `noteEditorModeChange.test.tsx` の `htmlTextareaValue()` ベースのアサーションが被検対象 `minifyHtml` に依存している / `noteEditorModeChange.test.tsx:456, 984` / 変更後のアサーションは `expect(minifyHtml(htmlTextareaValue())).toBe(original)`。textarea が `htmlDraft`（整形済み）にバインドされたことへの追従として **正当**（後述 N-002）だが、検証式の中に被検関数 `minifyHtml` を噛ませているため、`format∘bind` 側と `minify` 側が対称に壊れた場合に緑のまま素通りしうる。緩和として両箇所に独立アンカー `expect(htmlTextareaValue()).toContain("<section>")` が残っているので破綻はしないが、より強くするなら「整形済み生 value が元 minified と異なること（=確かに整形された）」も 1 行アサートしておくと、bind 退化（実は contentHtml をそのまま出していた等）も同時に捕まえられる。提案: `expect(htmlTextareaValue()).not.toBe(original)`（`<section><p>x</p></section>` は整形対象なので改行が入り元と一致しないはず）を 1 行添える。

### Notes

- **[N-001]** AC-10 のラウンドトリップは「1 パターンお茶濁し」ではない。`htmlFormat.test.ts:44-55` の fixtures は p/ul/ol/隣接 a（語間スペース）/br/div ネスト/blockquote/見出し+混在/table フル/figure+img+figcaption の **10 形** を網羅し、`for…of` で個別 `it` に展開して失敗箇所が特定できる構成。代表的な minified `contentHtml` 形をよくカバーしており、観点上の最重要要件（可逆性の機械固定）は満たされている。fixture が「sanitizer の `renderSync` が出す実 minified 表現に揃える」という方針もコメントで明示されていて妥当。

- **[N-002]** `noteEditorModeChange.test.tsx` の差分はテストを甘くして通したものではなく、振る舞い変更（textarea が `contentHtml`→`htmlDraft` バインドへ移行）への **正当な追従**。`=== original` → `minifyHtml(…) === original` への置換は意味的に等価な検証であり、両ケースとも `.toContain("<section>")` の独立アンカーを温存。さらに fixture `<section><p>x</p></section>` は `<section>` が `BLOCK_TAGS` 所属のため **実際に整形が走る**形で、この 2 本は副次的に format/minify のラウンドトリップを統合経路で踏んでもいる（単なる no-op 確認ではない）。weakening ではなく follow-through と判断。

- **[N-003]** `editorState.test.ts` の Issue #762 ブロック（`editorState.test.ts:753-835`）は AC-7 の要点を機械的に押さえている。具体的に: 初期 `htmlDraft===""`（seed しない・P-002）/ `setMode("html")` での `formatHtml(contentHtml)` 畳み込み + `contentHtml` 不変 + 非 dirty / `setHtmlDraft` が `htmlDraft` のみ更新し `content` dirty を立てる / `snapshotForSubmit` が html タブで `minifyHtml(htmlDraft)` を返す・他モードで `contentHtml` verbatim / **編集を挟んだ inline→html→inline 往復で編集が minify 確定される（L806-817、同期漏れを捕まえる本命）** / 無編集往復で spurious dirty が立たない / html⇄wysiwyg⇄inline 三角往復で `contentHtml` 非破壊。プロンプトが AC-7 で要求した 3 点（setMode 整形・setHtmlDraft 後の snapshot minify・編集挟み往復非破壊）はすべて実在する。

- **[N-004]** AC-5（隣接インライン語間スペース）と AC-6（`[[…]]` プレースホルダ）は専用 describe で format 側・往復側の両方を固定済み（`htmlFormat.test.ts:82-96`）。AC-6 は `[[target|display]]` という `|` 区切り付きの実フォーマットを使っていて良い。

- **[N-005]** media-insert 正規化テスト（`htmlFormat.test.ts:109-118`）の fixture `<p>body</p>\n<p><img src="/media/m1" alt="" /></p>` は `mediaInsert.ts` の実出力（`insertMediaIntoHtml` が `\n` 連結で `<p><img … alt="" /></p>` を追記）と一致しており、minify 後の `<img … alt="">`（void 要素の閉じ形）も ultrahtml の実挙動と整合。plan coverage P-001 連動ケースとして妥当。実装と乖離しない現実的な fixture。

- **[N-006]** 純粋性（AST 非変更・例外を投げない）の不変条件は JSDoc で謳われているが、`formatHtml`/`minifyHtml` を同一入力に 2 回かけて結果が同一であること（参照透過 / 冪等）を直接固定するテストは無い。probe で format の冪等（`formatHtml(formatHtml(x))===formatHtml(x)`）は代表ケースで確認できたが、テストには無い。Blocker ではないが、reducer から純粋関数として呼ぶ前提（plan §設計2）を守る安全網として 1 本あると堅い。
