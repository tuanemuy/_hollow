# ADR — Issue #287: inline モード: メディア挿入直後の <img> 単体ラッパを編集可能にする

## ADR-001: `applyEditable` のゲートは「編集可能ブロックの純粋コンテナのみ skip」の一般規則にする

### Status
Proposed

### Context
`inline` モードで `<p><img></p>`（`insertMediaIntoHtml` の出力）が編集不可なのは、`applyEditable` のゲート `!isPre && !hasDirectTextChild(el) → skip` が原因。ADR-002 (#233) におけるこのゲートの本来の意図は「編集可能ブロックの純粋なコンテナ（`<li><p>…</p></li>` の外側 `<li>` など）を decorate しない」ことであり、`hasDirectTextChild` はその近似にすぎない。緩め方に 3 案あった:

1. **メディアタグの追加許可**: `hasDirectTextChild(el) || hasDirectMediaChild(el)`（`img`/`video`/`audio` の直接子を持つブロックも decorate）。最小変更だが、`<p><a href><img></a></p>` のようにインラインラッパを挟むと直接子判定から漏れる。また空 `<p>` 問題は残り、ゲートが「近似 + 例外の列挙」に育っていく。
2. **純粋コンテナ除外の一般規則**: `isPre(el) || hasDirectTextChild(el) || !containsEditableBlock(el)` で decorate。skip されるのは「子孫に許可リストブロックを持ち、かつ自身は直接テキスト子を持たない」ブロックだけになり、ADR-002 の意図を述語として直接表現する。`<p><img></p>`・`<p><a><img></a></p>`・空 `<p>`・`<td><img></td>` を一括で救済し、既存の pin 済み挙動（`<li><p>` skip、mixed blockquote 両 decorate、pre 特例）はすべて不変。
3. **`<img>` 単体トップレベル要素を許可リストに追加**: Issue 検討事項 2。`<img>` は void 要素で `contentEditable` を付けてもその「前後」にテキストを入力できるようにはならず（編集ホストとして機能しない）、「テキスト保持ブロック要素の許可リスト」という方式の意味論も壊す。さらに現行の `insertMediaIntoHtml` は既に `<p>` ラッパ付きで出力するため、素の `<img>` は挿入経路では発生しない。

### Decision
案 2（純粋コンテナ除外の一般規則）を採用する。

- `containsEditableBlock(el)` は `EDITABLE_TAGS` を join した CSS セレクタによる `el.querySelector(...) !== null` で実装する。
- **`<pre>` の明示バイパス（`isPre`）は維持する。** 標準形 `<pre><code>…</code></pre>` は新規則でも decorate される（`code` は許可リスト外なので editable 子孫なし）が、`<pre>` は不透明領域（ハイライト・serialize 時のテキスト平坦化）という独立した不変条件を持つため、「`<pre>` は常に decorate」を一般規則の偶然の帰結にせず明示しておく。
- `MutationObserver` の分類器・`serializeHostContent`・keydown ハンドラは変更しない。decorate さえされれば、画像前後のテキスト入力は「contentEditable 継承下の TEXT_NODE のみの childList」として既存の許可規則を通る。

### Consequences
- 良い点:
  - ゲートが ADR-002 の意図の直接表現になり、メディア以外の同型ケース（空 `<p>`、インラインラッパ越しの `<img>`、空 `<td>`）も例外列挙なしで正しく扱える。
  - 変更が述語 1 箇所に閉じ、rebuild / resync / rollback / disabled トグルの全経路へ一様に効く。
- トレードオフ:
  - `applyEditable` が要素ごとに `querySelector` を呼ぶため最悪 O(n²)。rebuild/rollback 時のみの実行でノート規模では実害なし。
  - 空 `<p></p>` が decorate されるがブラウザによっては高さ 0 でクリックしにくい（従来は完全に編集不可だったため悪化ではない。スタイル手当てはスコープ外）。
  - `<img>` 要素そのものの削除・置換（クリック選択して文字入力等）は従来どおり rollback される。ADR-003 (#233) の構造保持制約と同種の既知 UX 制約で、必要なら `html` モードへ切替する。

---

## ADR-002: メディア挿入直後のキャレット自動配置は行わない

### Status
Proposed

### Context
挿入直後に「画像の後ろ」へキャレットを自動で置けばクリック 1 回を省ける。しかし `inline` モードの挿入は文字列追記 → `useEffect([value])` resync → `host.replaceChildren()` の全再構築（ADR-005 #233）であり、フォーカスは設計上失われる。自動配置するには rebuild 後に「今回の rebuild がメディア挿入由来か」を識別して selection を復元する仕組み（挿入 id の伝搬 or ヒューリスティック）が必要になる。

### Decision
キャレットの自動配置は実装しない。挿入後はユーザーが編集したい位置（画像の前後の `<p>`）をクリックして編集を開始する。

### Consequences
- 良い点: `InlineEditor` の I/O 契約（`value`/`onChange`/`disabled`/`onInitFailed`）と rebuild の単純さを維持。挿入経路と編集経路の結合を増やさない。
- トレードオフ: 挿入直後にそのまま打鍵はできず、クリックが 1 回必要。Issue のゴール（前後で編集「可能」になる）は満たす。UX 強化が必要なら別 Issue。
