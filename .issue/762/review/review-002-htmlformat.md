# レビュー review-002: HTML 整形/minify ユーティリティの正しさ（2周目フルレビュー）

**対象:** PR #767 / `app/components/note/editor/htmlFormat.ts`（+ 依存する `editorState.ts` の pristine 判定）
**観点:** W-003（`<pre>` のブロック扱い）修正の副作用、pristine 判定の決定性/冪等性、ラウンドトリップ等価、サーバ minify 表現（`htmlSanitizer.renderSync`）との一致、ホワイトスペース有意要素 verbatim、インライン語間スペース、`[[...]]`、不正 HTML フォールバック
**検証方法:** `ultrahtml@1.6.0` の実 export（`ELEMENT_NODE=1`/`TEXT_NODE=2`/`COMMENT_NODE=3`/`DOCUMENT_NODE=0`/`DOCTYPE_NODE=4`）を用いて `formatHtml`/`minifyHtml`/`isHtmlDraftPristine`/`snapshotContentHtml`/`setMode` 離脱パスを忠実に再実装し、`<pre>` を含む 40 ケース超で実行。`renderSync` とのバイト一致、`formatHtml` 冪等性、no-edit pristine サイクルでの `contentHtml` 不変性を実測。`pnpm vitest run htmlFormat.test.ts editorState.test.ts` = 129 passed。

## 結論

W-003 の `<pre>` ブロック扱い修正（`BLOCK_WHITESPACE_SIGNIFICANT = {pre}` を `isBlockElement` に追加）は**正しく、新たな往復破壊・本文破壊を生んでいない**。`<pre>` は依然 subtree verbatim（`WHITESPACE_SIGNIFICANT_TAGS` のまま）で、コンテナ整形判定上だけ block 兄弟に昇格しており、設計（ADR-005）と実装が一致する。`minifyHtml` は `<pre>` を含む全ケースで `renderSync` とバイト一致。`formatHtml` は `<pre>` を含む全ケースで冪等（`formatHtml(formatHtml(c)) === formatHtml(c)`）であり、これに依存する pristine 判定（ADR-004 / B-001）の決定性は保たれる。

W-003 が**新たに** strict round-trip `minifyHtml(formatHtml(m)) === m` を破る入力クラス（markdown 由来で `<pre>` の前後に inter-block `\n` を持つ `m`、例 `<p>a</p>\n<pre>b</pre>`）を増やしたことを確認したが、これは B-001 の pristine 判定が完全に遮蔽する（no-edit サイクルで `contentHtml` がバイト不変・content dirty が立たない）。Blocker なし。Warning 1 件（W-003×B-001 の交差に editorState レベルの回帰テストが無い穴）、Notes のみ。

---

### HTML整形ユーティリティ

#### Blockers

なし。

W-003 修正の核心（`<pre>` を block 兄弟扱いにしつつ subtree は verbatim 維持）を狙い撃ちで検証し、いずれも壊れない:

- `<p>x</p><pre><code>c</code></pre><p>y</p>` → 周囲 `<p>` が整形され `<pre>` は専用行で verbatim、`minifyHtml(formatHtml(m)) === m` 成立
- `<div><pre>a\n  b</pre></div>`、`<section><pre>x</pre><p>a</p></section>`、`<figure><pre>x</pre><figcaption>c</figcaption></figure>`、`<li><pre>code</pre></li>`、`<td><pre>cell</pre></td>` → `pre` 内 verbatim・周囲整形、往復一致
- `<pre><p>a</p><p>b</p></pre>`（pre 内 block）/ `<pre>\n\nblank\n\n</pre>` / `<pre>  leading\ntrail  </pre>` / `<pre>tabs\there</pre>` → subtree 完全 verbatim
- 2 連続 `<pre>a</pre><pre>b</pre>`、`<pre>a</pre><p>b</p>`、`<div><pre>a</pre><p>b</p></div>` → block 兄弟として各行に展開、往復一致
- standalone `<code>` / `<textarea>` を block 兄弟に混ぜたコンテナ（`<p>x</p><code>c</code><p>y</p>`）→ W-003 の対象外で従来どおりコンテナ verbatim（語間スペース保持）。`<code>`/`<textarea>` を `BLOCK_WHITESPACE_SIGNIFICANT` に入れていないのは正しい（standalone inline code の語間スペース保存 rule 2 を守るため、ADR-005 の判断と一致）
- `minifyHtml` の `<pre>` 含むケース全てが `ultrahtml.renderSync(parse(m))` と**バイト一致**（verbatim パリティ）。W-003 は format 側の `isBlockElement` のみを触り minify 側の出力には影響しないという主張を実測で裏取り

**pristine 判定（ADR-004 / B-001）の決定性・冪等性は W-003 後も保たれる:**

pristine 判定は `htmlDraft === formatHtml(contentHtml)`。これが機能する前提は (a) `formatHtml` の冪等性（entry で `htmlDraft = formatHtml(c)` を入れ、exit で再度 `formatHtml(c)` と比較するため `formatHtml(formatHtml(c)) === formatHtml(c)` が必要）。`<pre>` を含む 13 形状（pre 単独 / pre+p / div>pre / pre 内 block / blockquote>pre / figure>pre / li>pre / td>pre / 空行 pre / tab pre 等）で `formatHtml` の冪等性を全て確認。no-edit pristine サイクル（`setMode("html")` → `formatHtml` seed → `setMode("inline")` → pristine 判定 → `contentHtml` 確定）を `<pre>` 含む markdown 形状で回し、`contentHtml` がバイト不変・content dirty が立たないことを実測。`snapshotContentHtml` の pristine 分岐も同様に元 `contentHtml` を返す。編集を挟んだ場合のみ `minifyHtml(htmlDraft)` が採用され、これも `<pre>` 編集ケースで期待どおり minify されることを確認。

→ W-003 が strict round-trip を破る入力（`<p>a</p>\n<pre>b</pre>` 等）を新たに増やしたのは事実だが、それは「未編集で開閉しただけ」では pristine 判定で `contentHtml` 不変に倒れるため**実害ゼロ**。round-1 の W-001（block 兄弟間 whitespace-only TEXT の除去）が `<pre>` を含むコンテナにも適用範囲が広がっただけで、B-001 の責務移譲（strict 等式を捨て pristine 判定に倒す）がこの広がりも正しくカバーしている。

#### Warnings

- **[W-002-001]** W-003×B-001 の交差を固定する editorState レベルの回帰テストが無い
  場所: `editorState.test.ts` `describe("pristine round-trip on markdown-derived contentHtml (B-001)")`（836-874）、`htmlFormat.test.ts` W-003 ケース（24-35）
  事象: B-001 の pristine テスト 3 件のフィクスチャは `<h2>a</h2>\n<p>b</p>\n<ul>\n<li>x</li>\n</ul>\n` のみで `<pre>` を含まない。`htmlFormat.test.ts` の W-003 テスト（28 行）は minified `m`（`<p>x</p><pre><code>c</code></pre><p>y</p>`、inter-block `\n` 無し）に対する strict round-trip のみを固定している。**W-003 が新たに strict round-trip を破り、pristine 判定だけが守る入力クラス**（= `<pre>` の前後に inter-block `\n` を持つ markdown 由来 `contentHtml`、例 `<p>a</p>\n<pre>b</pre>` や `<p>before</p>\n<pre><code>x = 1\n</code></pre>\n<p>after</p>`）の **no-edit pristine サイクルが `contentHtml` を破壊しない**ことを機械的に固定するテストが、どちらのファイルにも無い。
  理由: 当方の実測ではこの経路は正しく動く（pristine が遮蔽し `contentHtml` バイト不変・dirty 無し）が、これは「W-003 が最も触れた format 判定」と「B-001 の autosave 誤発火回避」が交差する最高リスクの新パスであり、回帰の番人が居ない。将来 `formatHtml` のインデント規則や `isBlockFormattable` を触ったとき、コードブロック入りノートで「HTML タブを開いて閉じただけで autosave が誤発火する」回帰（まさに B-001 が解消したもの）が `<pre>` 限定で再発しても、現行テストは緑のまま通る。
  提案: `editorState.test.ts` の B-001 describe に、`<pre>` を含む markdown 由来フィクスチャ（例 `const persistedPre = "<p>before</p>\n<pre><code>x = 1\n</code></pre>\n<p>after</p>"`）で「no-op html 往復が `contentHtml` をバイト不変に保ち content dirty を立てない」「pristine 時 `snapshotForSubmit` が元 `contentHtml` を返す」の 2 ケースを追加する。併せて `htmlFormat.test.ts` の W-003 describe に「inter-block `\n` を持つ `<pre>` 形状で `formatHtml` が冪等（`formatHtml(formatHtml(x)) === formatHtml(x)`）」を 1 件足すと、pristine 判定が依存する不変条件が直接固定される。動作変更は不要・テスト追加のみ。

#### Notes

- **[N-001]** W-003 のドキュメンテーションは正確。`htmlFormat.ts` のモジュール JSDoc rule 3（33-38 行）と `BLOCK_WHITESPACE_SIGNIFICANT` の inline コメント（99-105 行）が「`<pre>` は subtree verbatim のまま、コンテナ整形判定上だけ block 兄弟」「`<code>`/`<textarea>` は inline 維持で standalone inline code の語間スペースを守る」という ADR-005 の判断を正しく記述している。実装（`isBlockElement` 113-120、`WHITESPACE_SIGNIFICANT_TAGS` 93-97、`formatNode`/`minifyNode` の verbatim 分岐 197/275）と一致。

- **[N-002]** `<pre>` の verbatim 性は format/minify 両系で二重に保証されている。`formatNode`（197）と `minifyNode`（275）の双方が `WHITESPACE_SIGNIFICANT_TAGS.has(node.name)` を `isBlockFormattable` 判定より**前**にチェックし `renderVerbatim` へ分岐する。`<pre>` が `BLOCK_WHITESPACE_SIGNIFICANT` に入って `isBlockElement=true` になっても、自身の内部は常に verbatim 分岐が先取りするため subtree 整形は起きない。block 昇格が効くのは「`<pre>` を**子に持つ親**の `isBlockFormattable` 判定」だけ、という設計どおりの局所性を実装が守っている。

- **[N-003]** `BLOCK_WHITESPACE_SIGNIFICANT` を独立 Set にした構造は lockstep 負債を 1 段増やす（ADR-005 Consequences のトレードオフどおり）。block 判定が `BLOCK_TAGS` / `VOID_BLOCK_TAGS` / `BLOCK_WHITESPACE_SIGNIFICANT` の 3 集合に分かれたため、サニタイザの allowlist 更新時にどの集合へ足すかの判断が増える。現状の 3 要素（`pre` のみ block-ws-sig）は妥当だが、`htmlFormat.ts` の `BLOCK_TAGS`（39-83）が `htmlSanitizer.ts` の `BLOCK_TAGS`（81-107）から `span` / `br`（`VOID_BLOCK_TAGS` 側）/ `pre` / `code`（ws-sig 側）を意図的に外している分岐が JSDoc で説明済み。lockstep コメント（57-59, 89-92, 99-105）は維持されているので可読性上の問題はない。情報共有のみ。

- **[N-004]** round-1 の Blocker（B-001）・Warning（W-003）はいずれも解消済みで再発なし。B-001 は `isHtmlDraftPristine`（editorState.ts:81-83）＋ `setMode` 離脱の pristine 分岐（527-529）＋ `snapshotContentHtml` の pristine 分岐（743-745）で正しく実装され、`editorState.test.ts` の B-001 describe（836-874）でカバー。W-003 は本レビューで再検証済み（上記 Blockers セクション）。round-1 の W-001（block 兄弟間 whitespace-only TEXT 除去）は B-001 の pristine 判定移行で「未編集なら元保持」に責務が移り、実害が消えている。

- **[N-005]** 不正 HTML フォールバックは round-1 N-004/N-005 から変化なし。`parse` が throw するケース（stray close `</div>`）は try/catch で入力素通し（`htmlFormat.test.ts:143-152` が固定）、`parse` が補完するケース（`<p>broken<span>x`）は補完済み構造を返すが可視テキストは保持（134-141 が固定）。`formatHtml` が `setMode("html")` 遷移時のみ走り編集中キー入力ごとには走らない（`setHtmlDraft` は素通し）ため、編集体験への影響は限定的。W-003 はこの経路に影響しない。

- **[N-006]** テストカバレッジ（AC-10）は W-003 を一定程度押さえている: `htmlFormat.test.ts:24-35` が「root-level の `<p>`/`<pre>`/`<p>` で周囲 `<p>` が整形され `<pre>` subtree が verbatim、no-op 退化しない（`not.toBe(html)` ガード）、`minifyHtml(formatted) === html`」を固定。ただし上記 W-002-001 のとおり inter-block `\n` を持つ `<pre>` 形状の pristine サイクルは未固定。追加推奨は W-002-001 の提案に集約。
