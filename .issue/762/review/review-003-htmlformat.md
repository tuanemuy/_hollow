# レビュー review-003: HTML 整形/minify ユーティリティの正しさ（3周目フルレビュー・ゼロベース再検証）

**対象:** PR #767 / `app/components/note/editor/htmlFormat.ts`（+ 依存する `editorState.ts` の pristine 判定・テスト）
**観点:** ラウンドトリップ等価、`renderSync` バイト一致、`<pre>`/`<code>`/`<textarea>` verbatim、インライン語間スペース、`[[...]]` 保持、不正 HTML フォールバック、`formatHtml` の決定性・冪等性（pristine 判定が依存）、過去指摘の解消確認
**検証方法:** `htmlFormat.ts` を全行精読し、`ultrahtml@1.6.0` の実 `parse`/`renderSync` と突き合わせ。`formatHtml`/`minifyHtml` を span/figure/br/comment/DOCTYPE/ネスト pre/エンティティ入り属性など 13 形状超で実行し、(a) ラウンドトリップ `minifyHtml(formatHtml(c))===c`、(b) `formatHtml`/`minifyHtml` の冪等性、(c) `minifyHtml` と `ultrahtml.renderSync(parse(m))` のバイト一致を実測。`pnpm vitest run htmlFormat.test.ts editorState.test.ts` = **135 passed**。

## 結論

Blocker・Warning ともに**なし**。3周目はゼロベースで再検証したが、新規の正しさ問題は検出されなかった。

- 2周目の **W-002-001（`<pre>`×inter-block `\n` の pristine 交差テスト欠落）は解消済み**。`editorState.test.ts:876-904`（W-002-001 describe・2 ケース）と `htmlFormat.test.ts:37-54`（inter-block `\n` 入り `<pre>` の整形＋冪等性 1 ケース）が追加され、「W-003 が strict round-trip を破るが pristine 判定だけが守る最高リスク新パス」が機械的に固定された。`s2.contentHtml === persistedPre` バイト不変・`dirtyKeys.has("content") === false` を実コードで確認。
- **figure+img の no-op 整形は意図仕様としてテスト固定済み**（`htmlFormat.test.ts:179-191`）。void 子（`<img>`）はコンテキスト依存で語間スペース保持を優先するため figure を block 昇格させず verbatim にする選択が、`not.toBe` ではなく `toBe(fig)` の明示固定で「サイレントに反転しない」よう pin されている。
- `minifyHtml` の出力は `renderSync` と**バイト一致**（figure+img の自己終了 `/` 除去・属性順序保持を含む）。markdown 由来 inter-block `\n` を持つ `m`（`<p>a</p>\n<pre>code</pre>\n<p>b</p>`）でのみ minify が `\n` を畳んで `renderSync` と非一致になるが、これは設計どおり（ADR-004）で pristine 判定が遮蔽する。
- `formatHtml` は全形状で冪等（`formatHtml(formatHtml(c))===formatHtml(c)`）であり、pristine 判定 `htmlDraft === formatHtml(contentHtml)` の決定性が保たれる。`isHtmlDraftPristine` は `setMode` 離脱（`editorState.ts:527`）と `snapshotContentHtml`（同 743）の両経路で共有され、判定ロジックの二重定義が無い。

---

### HTML整形ユーティリティ

#### Blockers

なし。

ゼロベースで穴を狙い、いずれも壊れないことを実測:

- `<div><span>a</span><span>b</span></div>`（span は htmlFormat の `BLOCK_TAGS` から意図的に除外＝inline 扱い）→ コンテナ verbatim、rt/idem 成立
- `<div><p>a</p><br><p>b</p></div>`（`<br>` は void だが `VOID_BLOCK_TAGS` に無く inline）→ コンテナ verbatim、rt 成立（`<br>` 周辺の有意空白を壊さない安全側）
- `<div><!--c--><p>a</p></div>`（comment を block 兄弟に混在）→ `isBlockFormattable` の COMMENT スキップ分岐が効き、comment ごと整形・rt 成立
- `<!DOCTYPE html><p>a</p>` → DOCTYPE 兄弟で container が非 block-formattable になり verbatim（rt 成立・無害。DOCTYPE は `contentHtml` に到達しない）
- `<div><pre>a\n  b</pre></div>`（pre が唯一の子）→ pre が `BLOCK_WHITESPACE_SIGNIFICANT` で block 昇格し div が整形され、pre subtree は verbatim、rt 成立
- エンティティ入り属性（`href="/x?a=1&amp;b=2" title='he said &quot;hi&quot;'`）→ verbatim 通過、rt 成立（入力は常にサニタイズ済み `contentHtml` でエンティティ化済みのため実害なし）
- `minifyHtml` × `renderSync` バイト一致（figure+img・属性順・自己終了 `/` 除去）を直接照合で確認

W-003（`<pre>` の block 兄弟昇格）の局所性も再確認: `formatNode`/`minifyNode` が `WHITESPACE_SIGNIFICANT_TAGS` 判定を `isBlockFormattable` より前に行うため、`<pre>` 自身の subtree は block 昇格後も常に verbatim 分岐が先取りし、昇格は「`<pre>` を子に持つ親のコンテナ判定」だけに効く。

#### Warnings

なし。

2周目で唯一残っていた W-002-001 は本 PR で解消済み（上記「結論」参照）。3周目で新規 Warning は検出されなかった。

#### Notes

- **[N-001]** lockstep の集合分岐は JSDoc と一致するが、`figure`/`figcaption` はサニタイザでは `MEDIA_TAGS`（`htmlSanitizer.ts:129`）に属し `BLOCK_TAGS` には無い。一方 htmlFormat 側は両者を `BLOCK_TAGS`（整形対象）に入れている。JSDoc は「サニタイザの `BLOCK_TAGS`/`INLINE_TAGS` と lockstep」と記すため、厳密には figure/figcaption の出所（MEDIA_TAGS）が文言から外れる。整形上 figure を block 扱いするのは妥当（figure+img の no-op は別途 void 子起因でテスト固定済み）で動作問題は無いが、将来サニタイザの MEDIA_TAGS を触る人が「BLOCK/INLINE だけ見ればよい」と誤読する余地がある。JSDoc に「figure/figcaption はサニタイザ MEDIA_TAGS 由来だが整形上 block 扱い」と一文足すと lockstep 対象が明確になる（情報共有・任意）。

- **[N-002]** `minifyHtml(formatHtml(m)) === m` の strict 不変条件は markdown 由来 inter-block `\n` 入力では成立しない（minify が `\n` を畳む）。これは ADR-004 で意図的に「strict 等式を捨て pristine 判定へ責務移譲」した結果で、テスト群もこの非対称を正しく区別している（`htmlFormat.test.ts` の roundtrip フィクスチャは inter-block `\n` 無しの minified 表現に限定、inter-block `\n` 入りは pristine サイクル＝editorState 側で固定）。設計と実装とテストの三者が整合。再掲のみ。

- **[N-003]** 不正 HTML フォールバックは 2 系統（try/catch 捕捉＝`</div>` stray close、自動補完＝`<p>broken<span>x`）とも `htmlFormat.test.ts:201-221` で固定済み。`formatHtml` は `setMode("html")` 遷移時のみ走り `setHtmlDraft`（編集中キー入力）は素通しのため、補完による表示変化は編集体験に影響しない。round-1/2 から変化なし。

- **[N-004]** `pristine` 判定の決定性は `formatHtml` の冪等性に依存し、その冪等性を `htmlFormat.test.ts:53`（inter-block `\n` 入り `<pre>` 形状）が直接 pin している。`isHtmlDraftPristine` が単一ヘルパー（`editorState.ts:81-83`）で `setMode` 離脱・`snapshotContentHtml` の両経路から呼ばれる構造により、「離脱では pristine と判定するが保存では minify してしまう」ような分岐の食い違いが型・構造レベルで排除されている。

- **[N-005]** テストカバレッジ（AC-10）は 3 周を経て要点を網羅: 空入力・block 兄弟/ネスト整形・深いネスト（5 段 table の厳密インデント）・inline 同一行・ラウンドトリップ 10 フィクスチャ・`<pre>`/`<code>`/`<textarea>` verbatim・W-003（root level pre）・W-002-001（inter-block `\n` pre の整形＋冪等）・語間スペース・inline `<code>`・`[[...]]`・不正 HTML（throw/補完の両系）・media 挿入の minify 正規化・figure+img no-op。editorState 側に B-001 pristine（通常/`<pre>`）と編集時 minify が揃う。実害のある未固定パスは見当たらない。
