# ADR — Issue #285: inline モードで `<pre>` コードブロックの編集をサポートする

## ADR-001: `<pre>` の編集可能化は「許可リスト追加 + `applyEditable` の `hasDirectTextChild` ゲート迂回」

### Status
Proposed

### Context
Issue #233 ADR-002 で `inline` モードは「テキスト保持ブロック要素の許可リスト方式」を採用し、`<pre>` を明示的に許可リストから除外した。本 Issue で `<pre>` を編集可能にするには許可リストへの追加が必要だが、`applyEditable` は decorate 対象を「許可リストタグ **かつ** 直接テキスト子を持つ要素（`hasDirectTextChild`）」に限定している。

Markdown レンダリングの標準的なコードブロックは `<pre><code>code text</code></pre>` であり、`<pre>` は直接テキスト子を持たず `<code>` 要素のみを子に持つ。このため `EDITABLE_TAGS` に `"pre"` を追加するだけでは `hasDirectTextChild` ゲートで弾かれ、`<pre><code>` が編集不可のままになる。

選択肢:
1. `<pre>` と `<code>` の両方を許可リストに追加する — `<code>` はインライン装飾要素としても使われる（`<p>foo <code>bar</code></p>`）ため、`<code>` を独立 editable にすると装飾要素の扱いと衝突し、許可リスト方式の「インライン装飾は親から継承」という原則を崩す。
2. `<pre>` のみ許可リストに追加し、`applyEditable` で `<pre>` のときだけ `hasDirectTextChild` ゲートを迂回して常に decorate する — `<pre>` を `contentEditable=true` にすれば子孫 `<code>` のテキストは HTML5 の contentEditable 継承で編集可能になる。`<code>` 自身は decorate しない。

### Decision
選択肢 2 を採用。

- `EDITABLE_TAGS` に `"pre"` を追加する。
- `applyEditable` で decorate 判定する際、対象が `<pre>` なら `hasDirectTextChild` ゲートをスキップして常に `contentEditable=true` を付与する。`<pre>code</pre>`（直接テキスト）も `<pre><code>code</code></pre>`（`<code>` ラップ）も `<pre>` 自身を editable にすることで両方カバーする。
- `<code>` は許可リストに追加しない。`<pre>` 配下の `<code>` は継承で editable、インライン装飾としての `<code>` は従来どおり親ブロックから継承。

### Consequences
- 良い点:
  - `<pre><code>` / `<pre>` 直下テキストの両構造を 1 つの分岐でカバーできる
  - 許可リスト方式の「インライン要素は親から継承」原則を維持（`<code>` を独立 editable にしない）
  - `classifyRecords` は `isContentEditable`（継承を含む）で判定するため、`<code>` 内テキスト編集も既存ロジックで許可される
- トレードオフ:
  - `applyEditable` に `<pre>` 専用分岐が 1 つ増える。ただし `<pre>` は「直接テキスト子を持たなくても decorate したい唯一の許可リストタグ」であり、特例として妥当
  - `<pre>` 配下に許可リスト外のブロック要素（通常はあり得ないが）があってもテキストは継承で editable になる。`<pre>` の中身は通常テキスト/`<code>` のみなので実害なし

---

## ADR-002: `<pre>` 内の `Enter` は preventDefault + リテラル `\n` テキストノード手動挿入

### Status
Proposed

### Context
`onKeyDown` は現状すべてのブロックで `Enter` を `preventDefault` し、新規ブロック生成を防いでいる。`<pre>` 内では改行が本質的に必要なため、`Enter` で改行を入力できるようにする必要がある。

選択肢:
1. `<pre>` 内では `Enter` を `preventDefault` せずネイティブの contentEditable に任せる — ブラウザにより `<br>`、`<div>`、`<p>` などが挿入される。これらは Element の `addedNodes` を生むため `classifyRecords` がバッチ全体をロールバック対象とし、改行どころか編集が巻き戻る。
2. `Enter` を `preventDefault` した上で、キャレット位置にリテラル `\n` テキストノードを手動挿入する — 変化が text-only に収まり classifier に許可される。`structureSignature`（ELEMENT_NODE のみ走査）も不変なので `compositionend` ロールバックも誤発火しない。

Issue の検討事項にある「Shift+Enter / Enter 単独の使い分け」については、`<pre>` は本質的に複数行テキストであり、両者を区別して片方だけ改行にする意味が薄い。

### Decision
選択肢 2 を採用。

- キャレットが `<pre>` 配下にあるかを `isWithinPre(node, host)` で判定する（`node` の祖先を `host` まで辿る）。
- `<pre>` 内の `Enter`: `preventDefault` + `insertTextAtCaret(host, "\n")`。
- `<pre>` 外の `Enter`: 従来どおり `preventDefault`（新規ブロック生成防止）。
- Shift+Enter / Enter 単独の区別はしない（`<pre>` 内は両方 `\n`）。
- キャレット挿入処理は `onPaste` のインライン実装を `insertTextAtCaret(host, text)` ヘルパーに切り出して共有する。

### Consequences
- 良い点:
  - `<br>`/`<div>` 挿入によるロールバックを根本的に回避し、決定的な改行挙動を得る
  - `onPaste` とテキスト挿入ロジックを共有でき、重複が減る
  - 構造署名が不変なので IME 確定後の構造比較ロールバックも誤発火しない
- トレードオフ:
  - contentEditable な `<pre>` の最終行に `\n` を挿入すると、後続テキストが無い場合ブラウザによっては視覚的な新規行が出ないクォークがある。保存 HTML には `\n` が正しく入るため意味的には正しい。既知の制限として受容（深追いしない）
  - Shift+Enter を区別しない選択は、将来「Shift+Enter で改行 / Enter でブロック抜け」のような高度な UX が欲しくなった場合に別 Issue で再検討の余地を残す

---

## ADR-003: `Tab` は `<pre>` 内外を問わず `preventDefault` を維持（インデント挿入は見送り）

### Status
Proposed

### Context
Issue の検討事項に「インデント保持（Tab キーの扱い）」がある。`<pre>` 内で `Tab` キーにインデント（タブ文字 or スペース）挿入を割り当てる案が考えられる。

ただし `onKeyDown` は現状 `Tab` を `preventDefault` してフォーカスが次ブロックへ逃げるのを防いでいる。`<pre>` 内で `Tab` にインデント挿入を割り当てると、キーボードユーザーが `Tab` でエディタからフォーカスを外せなくなる（フォーカス・トラップ）アクセシビリティ上の懸念が生じる。

「インデント保持」の主目的＝既存コードのインデントが編集中も維持されることは、インデントがテキストノードの内容として保持されるため自動的に達成される（`<pre>` の `white-space: pre` で描画も維持）。新たに `Tab` キーでインデントを **挿入** する機能は付加価値であり、本 Issue のゴール（C2-2 の `<pre>` テキスト編集カバレッジ）には必須ではない。

### Decision
`Tab` は `<pre>` 内外を問わず従来どおり `preventDefault` を維持する。タブ・キーによるインデント挿入は本 Issue では実装しない。

### Consequences
- 良い点:
  - フォーカス・トラップを生まず、キーボードアクセシビリティを維持
  - スコープを C2-2 のテキスト編集カバレッジに集中できる
  - 既存コードのインデントはテキストとして保持され、編集・保存で失われない
- トレードオフ:
  - `<pre>` 内で `Tab` キーによる新規インデント入力ができない。ユーザーはスペース入力やペーストで対応する。将来必要なら別 Issue で「フォーカス・トラップを避けるエスケープ手段付きの Tab インデント」を検討する

---
