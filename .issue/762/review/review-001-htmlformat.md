# レビュー review-001: HTML 整形/minify ユーティリティの正しさ（ラウンドトリップ等価性）

**対象:** PR #767 / `app/components/note/editor/htmlFormat.ts`
**観点:** ラウンドトリップ等価性、サーバ minify 表現（`htmlSanitizer.renderSync`）との一致、ホワイトスペース有意要素、インライン語間スペース、`[[...]]`、不正 HTML フォールバック
**検証方法:** `ultrahtml@1.6.0` の実ソース（`node_modules/ultrahtml/dist/index.js`）の `parse`/`renderSync`/`v()`/`L()`/`N()` を精読し、`formatHtml`/`minifyHtml`/`htmlSanitizer.sanitize` を実際に多数の入力で実行して突き合わせた。

## 結論

ラウンドトリップ等価性の核心部分は**設計どおり正しく実装されている**。受け入れ基準 AC-4,5,6,8,10 と ADR-001 のホワイトスペース正規化規則は実装と一致する。Blocker は無し。`minifyHtml` の出力は `ultrahtml.renderSync` の出力と**バイト一致**し、かつ実運用上の唯一の入力源（既にサニタイズ済みの `contentHtml`）に対して「保存→整形→minify→再サニタイズ」が安定（不動点）であることを実測で確認した。指摘は Warning 1 件（実害の小さい正規化挙動）と Notes のみ。

---

### HTML整形ユーティリティ

#### Blockers

なし。

ラウンドトリップ等価性 `minifyHtml(formatHtml(m)) === m` は、仕様が対象とする「minified 入力 `m`（= サニタイザ `renderSync` が出す実表現）」の全フィクスチャおよび当方の追加 25 ケース超で成立した。穴を狙って以下を試したが、いずれも壊れない:

- 属性値内の `"`・`&`（`&quot;`/`&amp;` のエンティティ形 / 生の `"`）→ 保持
- text の `&lt;`/`&gt;`/`&amp;`/`&nbsp;`/絵文字 → 保持
- inline/block 混在（`<div>text<p>a</p></div>`）→ verbatim 化されて保持（後述 N-001）
- ネストした `<pre>`/`<code>`/`<textarea>`、`<pre>` 内の block 要素（`<pre><p>a</p><p>b</p></pre>`）→ verbatim
- inline で使う `<code>`（`<p>text <code>x</code> more</p>` / `<div><code>x</code></div>`）→ block 扱いされず verbatim、壊れない
- `[[target|display]]` → text ノードとして無改変
- void 要素 `<img>`/`<br>`/`<hr>`、自己終了記法 `<img .../>` → `<img ...>` への正規化（後述 N-003）
- comment / DOCTYPE / 複数ルートノード / 空文字 / 空白のみ → 保持
- 不正 HTML（閉じタグ欠落・mismatch・stray close）→ フォールバック機能（後述 N-004, N-005）

#### Warnings

- **[W-001]** トップレベルの block 兄弟間にある空白のみ TEXT が `minifyHtml` で除去される
  場所: `minifyChildren` / `isBlockFormattable`（htmlFormat.ts:113, 278-289）
  事象: `minifyHtml("<p>a</p> <p>b</p>")` → `"<p>a</p><p>b</p>"`（兄弟間の `" "` が落ちる）。`isBlockFormattable` が「子が全て block or whitespace-only TEXT」を満たすと、whitespace-only TEXT を整形空白とみなして除去する規則（ADR rule 1）がトップレベルにも適用されるため。
  理由: 規則どおりの意図的挙動であり、かつ**実運用では発生しない**。実際の入力源は常にサニタイザ `renderSync` 出力で、そこでは block 兄弟間に空白 TEXT が出ない（`renderVerbatim`/`renderSync` は子を空文字 join するのみ）ことを実測で確認済み。また block レベルの `<p>` と `<p>` の間の空白は HTML 上意味を持たないため除去しても表示は変わらない。`minifyHtml(formatHtml(m))` の `m` が minified である限り該当 TEXT は存在しないので不変条件は破れない。
  提案: Blocker ではない。「block コンテナの子に block 要素が 1 つ以上あるとき、block 兄弟間の空白のみ TEXT は意味を持たないため整形空白として除去する」旨を `isBlockFormattable` か `minifyChildren` の JSDoc に一文足すと、`<a>x</a> <a>y</a>` の保存（rule 2 で別扱い）との非対称が読み手に明確になる。動作変更は不要。

#### Notes

- **[N-001]** `minifyHtml` 出力が `ultrahtml.renderSync` とバイト一致することを確認（最重要・サーバ往復の核心）
  `renderSync`（`v()`→`L()`）の属性直列化 `N(i)` は ` ${name}="${value}"` で、`htmlFormat.ts` の `renderAttributes`（127-133）と**完全一致**。両者とも属性値・text を**エスケープせず verbatim 出力**する。`htmlFormat` がエスケープを持たないこと自体は一見サニタイザ（`escapeAttrValue`/`escapeTextValue`）との非対称だが、**`htmlFormat` の入力は常にサニタイズ済み `contentHtml`**（既に `&quot;`/`&lt;`/`&gt;` 化済み）であり、エンティティはそのまま通過するため実害が無い。実測で「raw HTML → サニタイズ → 永続化 minified → `formatHtml` → `minifyHtml` → 再サニタイズ」が**不動点**（`persisted === minified === resanitized`）になることを、特殊文字・amp 入り URL・alt 内 `"`・code block・`[[...]]`・block ネストの全ケースで確認した。AC-2/AC-9 のサーバ往復安定性は満たされている。

- **[N-002]** 属性順序は ultrahtml の `parse`（`I()`）が構築する object のキー挿入順を `Object.entries` がそのまま辿るため、`renderAttributes` と `renderSync` で一致。順序ズレによる往復破壊は起きない（`<a rel="x" href="y" target="_blank">` で実測一致）。

- **[N-003]** void 要素表記 `<img ...>`（スラッシュ無し）が正しい。`VOID_ELEMENTS`（136-152）は ultrahtml の内部 void set `D` と要素一致。media 挿入が付ける `<img .../>`（スラッシュ付き）は `parse` で `isSelfClosingTag` になるが、`minifyHtml`/`renderVerbatim` は void set 判定で `<img ...>` に正規化する。これは `renderSync` の出力（`<img ...>`）およびサニタイザ永続形と一致する方向で正しい。テスト（htmlFormat.test.ts:109-118）がこのケースを押さえている。
  なお ultrahtml `renderSync` には SVG 配下の空要素を `<name ... />` にする分岐（`C()`）があるが、`svg` はサニタイザ allowlist 外で `contentHtml` に到達しないため、`htmlFormat` がこれを再現しないことは実害なし。

- **[N-004]** 不正 HTML フォールバックは「機能する」。ただし try/catch が効くケースと、parse が例外を投げず「修復」するケースの 2 種がある点を記録する:
  - `parse("hello</div>world")`（stray close tag）は ultrahtml が**実際に throw**（`Cannot read properties of undefined`）する。`formatHtml`/`minifyHtml` の try/catch がこれを捕捉し**入力素通し**になる（AC-8 を満たす）。try/catch は無意味ではない。
  - `parse("<p>hello")`（閉じタグ欠落）/`parse("<p><b>hi</p>")`（mismatch）は throw**しない**。ultrahtml が `<p>hello</p>` / `<p><b>hi</b></p>` に**自動補完**するため、`formatHtml` はその補完済み構造を返す（入力そのままではない）。テスト（htmlFormat.test.ts:98-107）は「throw しない」「`broken`/`x` の可視テキストが残る」という緩い保証で正しく検証している。編集中断片が消えることはなく AC-8 は満たされるが、「不正断片が verbatim 素通しされる」わけではなく「補完されて返る」点は仕様の理解として記録に値する。

- **[N-005]** 上記 N-004 の補完挙動の含意: HTML タブで `<p>hello`（閉じ忘れ）まで打った瞬間に `formatHtml` が走ると `<p>hello</p>` と表示が変わる可能性がある。ただし本 PR の `formatHtml` は `setMode("html")` 遷移時にしか走らず（editorState.ts:489-498、plan AC-1 検証メモと整合）、編集中のキー入力ごとには走らない（`setHtmlDraft` は素通し）。よって編集体験への影響は限定的。Blocker でも Warning でもなく情報共有。

- **[N-006]** ホワイトスペース有意要素の subtree verbatim が正しい。`WHITESPACE_SIGNIFICANT_TAGS`（`pre`/`code`/`textarea`）は `formatNode`/`minifyNode` の両方で `renderVerbatim` に分岐し（183-186, 261-264）、内部の改行・インデント・block 要素を一切触らない。`<pre><code>a\n  b</code></pre>`、`<textarea>  spaced\n  lines\n</textarea>`、`<pre><div>x</div>\n  y</pre>` で実測 verbatim を確認。AC-4 を満たす。
  補足: `<div><pre>a\n  b</pre></div>` のように block コンテナの唯一の子が `pre` の場合、`pre` が `BLOCK_TAGS` に無いため div は `isBlockFormattable=false` となり div ごと verbatim 化される（pretty-print されない）。pre 内容保持の観点では正しく、cosmetic（整形が一段弱まる）に留まる。

- **[N-007]** インライン語間スペース保持（AC-5）が正しい。inline 子を 1 つでも含むコンテナは `isBlockFormattable=false` で verbatim 化され、`<p><a>foo</a> <a>bar</a></p>` の `" "` が往復で保持される（rule 2）。実測一致。

- **[N-008]** `minifyHtml` は冪等（`minifyHtml(minifyHtml(x)) === minifyHtml(x)`）であることを確認。整形空白を含む非 minified 入力（`<div> <p>a</p> </div>`, `<ul>\n  <li>a</li>\n</ul>`）も正しく圧縮し、再適用で安定する。これにより「保存される実体は常に minify 済み」（AC-2/AC-3）が、`htmlDraft` 経由でない経路（既に minified な `contentHtml` を素通しする他モード保存）でも崩れない。

- **[N-009]** テストカバレッジ（AC-10）は要点を押さえている: 空入力・block 兄弟/ネスト整形・inline 同一行・ラウンドトリップ 10 フィクスチャ・`pre`/`code`/`textarea` verbatim・語間スペース・`[[...]]`・不正 HTML 非 throw・media 挿入正規化。**追加を推奨**したいエッジ（任意・現状で機能はする）: (a) 属性値に `&quot;`/`&amp;` を含むフィクスチャをラウンドトリップ集合に 1 件（サーバ往復のエスケープ非対称が将来 regress しても検出できる）、(b) `<pre>` 内に block 要素を含むケース（`<pre><p>a</p></pre>`）の verbatim、(c) comment を block 兄弟に挟むケース（`isBlockFormattable` の COMMENT スキップ分岐 116 を固定）。
