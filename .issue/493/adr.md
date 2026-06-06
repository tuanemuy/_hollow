# ADR — Issue #493: note-content パイプラインの adapter 命名是正 + markdown-it / ultrahtml への置き換え

## ADR-001: `toPlainText` は現行の正規表現実装を流用する

### Status
Proposed

### Context
sanitizer を ultrahtml ベースに置換するにあたり、`toPlainText(html): string` も ultrahtml の AST walk（text ノード連結）で書き直す選択肢がある。一方で `toPlainText` の出力は `NoteSnapshot.plainBody` に流れ、FTS（全文検索）と embeddings 生成のソースになる。

### Decision
`toPlainText` は現行の正規表現ベース実装（タグ除去 → entity decode → whitespace collapse + trim）をそのまま維持する。AST walk への書き換えはしない。

### Consequences
- 良い点: `plainBody` の出力が 1 文字も変わらず、FTS/embeddings の互換が保証される。新ライブラリ導入面積を最小化できる。タグ除去 + entity decode + collapse は HTML パーサ不要で現行が十分テスト可能。
- トレードオフ: sanitizer 内に parse 系（ultrahtml）と正規表現系（toPlainText）が同居する。ただし両者は独立した port メソッドであり責務が混ざらない。

---

## ADR-002: `removed` の `reason` はカテゴリ一致で設計し、malformed 系は完全一致を求めない

### Status
Proposed

### Context
現行サニタイザは `removed: SanitizeRemoval[]` に多様な `reason` 文字列を記録する（`disallowed tag` / `disallowed attribute: x` / `unsafe URL scheme: x` / `event handler stripped: x` / `unterminated comment` / `invalid tag` / `unmatched close`）。後者 3 つは自作トークナイザの「malformed 入力修復」固有の文言。ultrahtml はパース修復方針が異なるため、これらの完全一致再現は困難。

### Decision
- wysiwyg 統合テストが正確一致を要求する `reason === "disallowed tag"` は厳守する。
- `disallowed attribute` / `unsafe URL scheme` / `event handler stripped` も自前 walk で同等に再現する。
- malformed 入力固有の reason（`unterminated comment` 等）は「除去された事実 + 近いカテゴリ reason」で再現し、ユニットテストもカテゴリ（除去された/されないと大分類 reason）で検証する。

### Consequences
- 良い点: 既存テスト契約（`disallowed tag` 空配列）を壊さず、防御の本質（非許可タグ・属性・危険 URL・イベントハンドラの除去）を完全維持できる。
- トレードオフ: malformed HTML 監査ログの文言が現行と厳密一致しない。ただし監査ログは観測用であり、`reason` 文言に依存する本番ロジックは存在しない。

---

## ADR-003: markdown-it-attrs は `id` のみ許可・markdown-it-anchor は不採用・id 値を正規表現で厳格検証

### Status
Accepted（PoC で確定）

### PoC 結果（2026-06-06）
- `markdown-it({html:false}).use(attrs,{allowedAttributes:["id"]})` 単独で `## X {#commerce}` → `<h2 id="commerce">X</h2>` が出ることを実測。**`markdown-it-anchor` は不要**と判明し、依存から削除（`pnpm remove markdown-it-anchor`）。
- id 無し見出しには id が付かない（自動 slug なし）→ terms/privacy への回帰なし。
- ただし attrs は **id 値を検証しない**（`{#1bad}` → `id="1bad"`、`{#a b}` → `id="a"` が通る）。→ `md.core.ruler` の後段ルールで `^[A-Za-z][A-Za-z0-9_-]*$` に合致しない id 属性を token から除去する自前バリデーションを追加する。

### Context
`{#id}` 見出しアンカー（Issue #276）を `markdown-it-attrs` + `markdown-it-anchor` で実現する。`markdown-it-attrs` は `{#id .class key=val}` で任意の属性・クラスを付与できてしまい、XSS 面が広がる。

### Decision
- `markdown-it-attrs` は `allowedAttributes: ["id"]` で `id` のみ許可（class・任意属性は不可）。
- **`markdown-it-anchor` の採否は PoC（plan ステップ1.5）で決める** — `markdown-it-attrs` 単独で `## X {#commerce}` → `<h2 id="commerce">` が出るなら anchor は**不採用**（permalink も自動 slug も不要なため依存を増やさない）。Issue 本文は attrs+anchor の組み合わせを推奨するが、最終ゴールは `{#id}` 解決であり、attrs 単独で満たせるなら最小依存を優先する。anchor を採用する場合は「attrs の明示 id を尊重し、id 無し見出しには自動付与しない」確定設定を本 ADR に追記する。
- id 値は `^[A-Za-z][A-Za-z0-9_-]*$` で検証し、不正なら id を捨てて見出しテキストは残す（fail-safe）。
- sanitizer 段でも `id` 許可 + 値はそのまま通すが、`on*`/URL 防御で多層化する。

### Consequences
- 良い点: `{#id}` 要件を満たしつつ XSS 面・依存数を最小化。converter と sanitizer の二重防御。`LegalDocument` を共有する terms/privacy への自動 slug 注入回帰を避けられる。
- トレードオフ: `{.class}` 等の attrs 拡張は使えないが、本 Issue スコープ外なので問題なし。

---

## ADR-004: sanitizer の `id` 許可範囲は現行（全タグ許可）を維持する

### Status
Proposed

### Context
Issue 要件は「`id` 属性を見出し（h1–h6）に許可」。現行サニタイザは `GLOBAL_ATTRS` に `id` を含み全 element で許可している。h1–h6 限定に厳格化する選択肢もある。

### Decision
現行どおり `GLOBAL_ATTRS` に `id` を残し全タグ許可を維持する。h1–h6 限定化はしない。

### Consequences
- 良い点: 要件（h1–h6 で id 許可）は包含的に満たされる。最小変更で後方互換（TipTap 等が他タグに id を持つ場合の回帰）を確実に避けられる。
- トレードオフ: 見出し以外にも id が残せるが、id は単なるアンカー識別子で XSS ベクタにならず、危険属性（`on*`・javascript: URL）は別途除去されるため実害なし。厳格化はスコープ外の改善として見送り。

---

## ADR-005: markdown-it は `html: false` で生 HTML 注入を禁止する

### Status
Proposed

### Context
markdown-it はデフォルトで markdown 中の生 HTML をパススルーできる（`html: true`）。ingestion 経路のユーザー markdown を変換する際、生 HTML を許すと XSS 面が広がる。

### Decision
`markdown-it({ html: false })` とし、生 HTML をテキストとしてエスケープする。後段に sanitizer もあるため多層防御。

### Consequences
- 良い点: ユーザー markdown からの生 HTML 注入を converter 段で遮断。legal doc には生 HTML が無いため影響なし。
- トレードオフ: markdown 内に意図的な生 HTML を書く用途は使えないが、本プロダクトのコンテンツ方針上不要。

---

## ADR-006: `[[wikilink]]` は素の markdown-it 挙動で verbatim 保持（カスタムルール不要）

### Status
Accepted（PoC で確定）

### PoC 結果（2026-06-06）
`md.render("see [[target]] and [[id|display]] here")` → `<p>see [[target]] and [[id|display]] here</p>` を実測。`[` `]` `|` はエスケープされず literal verbatim で残る。**カスタムルールは不要**。`service.ts` の `INTERNAL_LINK_PATTERN` が直接マッチできる。ユニットテストで pin する。

### Context
`service.ts` の内部リンク抽出はサニタイズ後 HTML 文字列に対し `INTERNAL_LINK_PATTERN` を直接 `matchAll` する。よって `[[target]]` / `[[id|display]]` がパイプライン全体で literal verbatim に残る必要がある。

### Decision
markdown-it は対応する `](url)` を持たない `[` をテキスト出力する（`[` `]` を HTML エスケープしない）ため、デフォルトで verbatim 保持される見込み。PoC（plan ステップ1.5）で素の挙動を検証し、**少しでもエスケープ（`&#91;` 等）や変形が観測されたら即カスタムルール（`md.inline.ruler.before` で `[[...]]` を text トークン化）を入れる**。内部リンク抽出の喪失は silent data loss で影響が致命的なため、疑わしい場合はカスタムルール採用に倒す（楽観依存しない）。

### Consequences
- 良い点: 標準挙動を活かしつつ、致命的な回帰を PoC + テストで早期に潰す。
- トレードオフ: カスタムルールを入れる場合は小さな保守対象が増えるが、`INTERNAL_LINK_PATTERN` 抽出の確実性とのトレードオフで正当。ユニットテストで pin する。

---

## ADR-007: sanitizer は自前再帰 transform + `renderSync`、disallowed 要素はサブツリーごと DROP

### Status
Accepted（PoC で確定）

### PoC 結果（2026-06-06）
- ultrahtml は `parse`（同期）/ **`renderSync`（同期）** / `ELEMENT_NODE=1` / `TEXT_NODE=2` / `COMMENT_NODE=3` / `DOCUMENT_NODE=0` を export。port の同期 `sanitize` は `renderSync` で実装可能（`render` は async なので使わない）。
- ノードは `{type, name, attributes:{}, children:[]}`。`attributes` はオブジェクト。
- `renderSync` 出力: 属性ダブルクォート・属性順保持・**void `<img>` は self-closing slash なし**（`<img src="..." alt="">`）。`service.ts` の `mediaPattern` が実マッチすることを確認（`/media/<id>` 抽出 OK）。wysiwyg テストの `<img[\s/>]` 正規表現も `<img ` にマッチ。
- **重要なセキュリティ判断**: `renderSync` はテキストノードを再エスケープしない（生 `&`/`<` をそのまま出力）。かつ `<script>...</script>` の中身は raw text child としてパースされる。よって disallowed 要素を **unwrap（中身を残す）すると raw text が renderSync で生出力され mXSS の穴**になりうる。→ **disallowed 要素はサブツリーごと完全に DROP する**（現行サニタイザの「中身テキストを残す」挙動より安全）。パイプライン入力（markdown-it html:false / TipTap）は disallowed タグを生成しないため実害なし。
- comment ノード（type 3）も DROP。

### Decision
- `parse()` のツリーの `children` を自前再帰 transform で組み替え、`renderSync` で再シリアライズ。`walk`/`render`（async）は使わない。
- 許可タグ: そのノードを残し、属性をフィルタ（非許可 / `on*` / unsafe URL を除去し reason を push）して children を再帰。
- 非許可タグ: サブツリーごと DROP し `{tag, reason:"disallowed tag"}` を push。
- comment / doctype ノード: DROP。
- text ノード: そのまま残す（入力が整形済みエスケープ HTML である前提。XSS 防御は element/attribute レベルの allowlist で担保）。
- `render()` 後の媒体 `<img>` 出力が `mediaPattern` にマッチすることをユニットテストで pin（PoC で確認済み）。

### Consequences
- 良い点: ライブラリの実 API に即した堅い設計。media/wikilink 抽出の正規表現契約を守れる。disallowed 要素の DROP は script/style 中身の mXSS を防ぎ現行より安全。
- トレードオフ: malformed/悪意ある入力で disallowed タグ内のテキストが現行と異なり失われる（現行は escaped text で残す）。ただしパイプライン入力では disallowed タグが出ないため実害なし。malformed comment 周辺のテキストが ultrahtml パース時に落ちる既知の癖（`<p>a<!--c-->b</p>` で "a" が消える）があるが、同じく入力経路では comment が出ないため影響なし。progress.md に既知の制限として記録。

### Context
当初は ultrahtml の `walk()` でノードを巡回し非許可ノードを除去する想定だったが、`walk()` は読み取り専用走査で、コールバックからツリーを安定的に変異（子の差し替え・削除）させる公式 API を持たない可能性が高い。また `service.ts` の `mediaPattern` / `INTERNAL_LINK_PATTERN` は**サニタイズ後 HTML 文字列**に正規表現を当てるため、`render()` の出力フォーマット（引用符・属性順・void 要素の閉じ方）が現行と乖離すると媒体抽出が壊れうる。domain 層の正規表現は port 互換最優先のため変更できない。

### Decision
- `parse()` の返すツリーの `children` を**再帰的に手で組み替える自前 transform**で実装する（許可ノードだけ新ツリーに積む / 属性をフィルタする）。`walk` 前提にしない。
- `render()` 後の媒体 `<img>` 出力が `mediaPattern` にマッチすることをユニットテストで pin する。もし出力フォーマットが正規表現と相性が悪ければ、**サニタイザ側で媒体タグ出力を期待形（`src="..."` ダブルクォート等）に寄せる後処理**を入れる。domain 側の正規表現は変えない。
- PoC（plan ステップ1.5）で ultrahtml の実 API（ノード形状・`attributes` 表現・`render` の入力契約と出力フォーマット）を確定してから本実装に入る。

### Consequences
- 良い点: ライブラリの実 API に即した堅い設計。media/wikilink 抽出の正規表現契約を守れる。port 互換最優先の制約を破らない。
- トレードオフ: 「walk で push するだけ」より実装量が増える。PoC を 1 ステップ挟むぶん着手が一段遅れるが、手戻りリスクを大幅に下げる。

---

## ADR-008: バンドルサイズは before/after を記録し、`pnpm build` 通過を実装ゲートにする

### Status
Proposed

### Context
markdown-it 一式（+ `entities`/`uc.micro`/`linkify-it`/`mdurl`/`punycode.js`）と ultrahtml を追加する。Workers バンドルには上限があり、`linkify:false` でも一部依存が tree-shake されずバンドルに残る可能性がある。リスク欄は「サイズ増を確認」止まりで定量基準が無かった。

### Decision
- ステップ1.5 の PoC で markdown-it 単独 import の `pnpm build` 通過を markdown adapter 実装のゲート条件にする（`nodejs_compat` は全 Worker で有効）。
- worker bundle サイズの before/after を記録し、増分を plan/PR に残す。
- ビルドが詰まった場合の代替（依存を引かないプラグイン構成・サブセット import）を PoC 結果に応じて検討する。

### Consequences
- 良い点: バンドル破綻を実装着手前に検出。レビュー時にサイズ増を数値で判断できる。
- トレードオフ: PoC の手間。ただし Workers 制約下では必須の確認。

---

## ADR-009: `renderSync` の非エスケープに対し属性値・テキストを自前エスケープする（XSS 防御）

### Status
Accepted（PR #523 レビュー B-001 対応）

### Context
ultrahtml の `renderSync` は属性値・テキストを verbatim 出力し再エスケープしない。サニタイザは `parse` 済みツリーの属性マップ／テキストに対して allowlist 検査を行うため、属性値に埋め込まれた生 `"` が serialize 時に属性を閉じて `onerror=...` 等のライブハンドラを注入できてしまう（属性ブレイクアウト型ストアド XSS）。HTML アップロード取り込み経路（`runIngestionJob.ts` の `kind === "html"`）で attacker 制御の生 HTML が markdown-it を経由せず直接 `sanitize()` に入るため到達可能。旧（自作）サニタイザは属性値・テキストを escape しており、本置換が導入した回帰だった。

### Decision
- 属性値: 生 `"` → `&quot;`（`escapeAttrValue`）。これだけでブレイクアウトを塞げる（`"` が唯一の閉じ文字）。
- テキスト: 生 `<` / `>` → `&lt;` / `&gt;`（`escapeTextValue`）。パーサ差分による mXSS 余地を塞ぐ。
- **`&` は escape しない**: ultrahtml は `parse` でエンティティを decode せず literal 保持する（`&amp;` は `&amp;` のまま）。`&` を escape すると markdown-it 出力の既存エンティティを二重エンコードし、ユーザーに `&amp;` が可視化される。生 `&` は属性／テキストいずれでもブレイクアウトしないため escape 不要。
- 回帰テスト: 出力を ultrahtml で再パースし、live な `on*` 属性が存在しないことを検証（エスケープ済み値の中に文字列 `onerror=` が残っても属性ではないことを正確に判定）。

### Consequences
- 良い点: 属性ブレイクアウト XSS を閉塞しつつ、既存エンティティの二重エンコードを回避（旧実装の `&` 二重エンコード癖よりむしろ正確）。port 契約・media/wikilink 抽出は不変。
- トレードオフ: `renderSync` に escape を委ねられず自前 escape 層を持つが、これは「URL/on* 防御は自前維持」という本 Issue の方針と一貫している。
