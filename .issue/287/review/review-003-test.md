# PR #839 レビュー Round 3 — Test 観点

対象: PR #839（fix(editor): inline モードでメディア挿入直後の `<img>` 単体ラッパを編集可能にする）
PR head: 9ebee9f3
計画: `.issue/287/plan.md` / ADR: `.issue/287/adr.md`
前提: Round 1（W×2）・Round 2（Frontend W×1）の指摘はすべて反映済み。Round 2 の Test 観点は W ゼロでクリーン収束。本ラウンドはゼロベースのフルレビュー（同一指摘の蒸し返しなし、新規の実欠陥のみを探索）。
レビュー日: 2026-07-11

## 検証プロセス

- **R2 → R3 の差分特定**: `git diff e995ed3f..HEAD` で確認。コード変更は `InlineEditor.tsx` のコメントのみ（ゲートコメントへの残余ギャップ注記 5 行 + JSDoc タグ列挙への `<pre>` 追加）。テストファイルは Round 2 head から無変更。他はレビュー記録ドキュメント（`.issue/287/review/`）のみ。
- **対象テストの実行**: `inlineEditor.test.tsx`（43件）+ `mediaInsert.test.ts`（20件）+ AC-6 対象の `wysiwygEditorImageButton.test.tsx` / `noteEditorImageButtonWiring.test.tsx`（4件）→ 67 件すべて green。
- **フルユニットスイート**: `pnpm test:unit` → 300 ファイル / 4543 件すべて green。module スコープの `EDITABLE_TAGS_SELECTOR` 追加が他テストへ波及していないことを全体で確認。
- **ミューテーション再検証（現 head で独立に実施）**: ゲートを旧規則 `if (!isPre && !hasDirectTextChild(el)) continue;` に戻して実行 → 新規 pin 5 本（AC-1 decorate / AC-2 resync / AC-3 emit / 空 `<p>` / インラインラッパ越しメディア）だけが fail（38 passed / 5 failed）。R1/R2 で実証済みの弁別力が、コメントのみの R3 変更後も維持されていることを再確認。実行後に working tree の復元を `git status` で確認。
- **R3 追加コメントの事実整合性**: (a) 残余ギャップ注記の主張「`<li><img><p>…</p></li>` は skip される」をゲート述語（editable 子孫あり・直接テキスト子なし → skip）と突き合わせ — 正確。既存 pin（`<li><p>` skip）とも矛盾しない。(b) JSDoc の「`<pre>` — see invariant 6」の参照先 invariant 6（`InlineEditor.tsx:74`「`<pre>` is an opaque, highlight-on-blur region」）の実在を確認 — 参照は有効。
- **AC 照合（ゼロベース再確認)**:
  | AC | 検証 | 結果 |
  |---|---|---|
  | AC-1 | `<p><img></p>` decorate / `<img>` 自身は非付与の pin | 充足 |
  | AC-2 | 実物 `insertMediaIntoHtml` import による resync rebuild 経路の pin | 充足 |
  | AC-3 | テキスト追加が rollback されず `img src` + テキスト双方を emit する pin | 充足 |
  | AC-4 | emit 値の `contenteditable` 非含有 pin（AC-3 テストに統合 — 計画どおり） | 充足 |
  | AC-5 | 既存 pin スイート無変更のまま green（`<li><p>` skip / mixed blockquote / `<pre><code>`） | 充足 |
  | AC-6 | コード diff が `InlineEditor.tsx` + `inlineEditor.test.tsx` に閉じ、wysiwyg/html 経路テスト green | 充足 |

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** Round 2 W-001（ゲートコメントの「redundant」一般化の不正確さ）への対応が正確。追記された残余ギャップ注記は述語の実挙動（mixed コンテナも skip）と一致し、スコープ外判断の出典（`.issue/287/plan.md`）へのポインタも付いているため、テストが pin していない領域（mixed コンテナの media 隣接編集不可）がコードコメント上で明示された。「pin がない＝仕様が固定されていない」領域と「意図的スコープ外」の区別がコードから辿れるようになり、将来の回帰判定の誤りを防ぐ。
- **[N-002]** R3 変更はコメントのみだが、念のため現 head でゲート復元ミューテーションを独立に再実行し、新規 pin 5 本のみが fail する（他 38 件は green のまま）ことを確認した。pin の弁別力と粒度（fail が原因箇所を一意に指す構成）は R2 時点から劣化していない。
- **[N-003]** フルユニットスイート（4543 件）で green を確認。R1/R2 は対象 4 ファイルの実行だったため、本ラウンドで初めて全体波及なしが直接検証された（結果は予想どおりだが、`InlineEditor` を import する他テストへの影響ゼロが実測で裏付けられた）。

## サマリー

Blockers: 0 / Warnings: 0 / Notes: 3

問題なし（Blockers/Warnings ゼロ）。Round 2 からの差分はコメント精度の補正のみで挙動・テストに変更はなく、追記されたコメントの事実主張と JSDoc 参照はいずれも実装・pin と整合する。対象テスト 67 件・フルユニットスイート 4543 件 green、ゲート復元ミューテーションでの pin 弁別力も現 head で再実証済み。Test 観点で新規の実欠陥はなく、クリーン収束を維持。
