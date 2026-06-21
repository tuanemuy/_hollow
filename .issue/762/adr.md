# ADR — Issue #762: HTML 編集モードで本文を整形表示し保存時に minify する

## ADR-001: 整形/minify を新規ライブラリではなく既存 ultrahtml で自作する

### Status
Proposed

### Context
HTML の pretty-print / minify をどう実現するかに複数の選択肢がある:
- (a) `js-beautify` / `prettier` / `html-minifier-terser` 等の専用ライブラリを追加する。
- (b) 既存依存の `ultrahtml@1.6.0`（サニタイザが使用、`parse` / `walkSync` / `renderSync` を export）の AST を使って整形/minify を自作する。
- (c) 正規表現ベースで素朴に整形する。

考慮事項:
- ラウンドトリップ等価性（`<pre>`/`<code>`/`<textarea>` 内不改変、インライン語間スペース保持、`[[...]]` 保持）を厳密に担保する必要がある。
- サーバ側サニタイザは既に `ultrahtml` で `parse`→`renderSync` しており、minified 表現の出どころと同じパーサ/直列化器を使えば「クライアント整形→minify→サーバサニタイズ」のラウンドトリップで表現が揃いやすい。
- ターゲットは Cloudflare Workers（pure ESM 制約）。`ultrahtml` は Node/DOM 非依存で Worker 対応済みであることが `htmlSanitizer.ts` に明記されている。`prettier` 等は重く、ブラウザ/Worker バンドルへの影響が大きい。
- `prettier` の HTML パーサや `html-minifier` は独自のホワイトスペース正規化ポリシーを持ち、サーバ側 `ultrahtml` 直列化と微妙にズレるとラウンドトリップ等価が崩れるリスクがある。

### Decision
(b) を採用。`ultrahtml` の `parse` で AST 化し、整形/minify を純粋関数として自作する。サーバ側サニタイザと同じパーサ/直列化器を使うことで minified 表現を揃え、ラウンドトリップ等価を取りやすくする。新規ライブラリは追加しない。

**実装方式は「自作再帰シリアライザ」に確定する（Round 1 arch S-001 を反映）。** `walkSync` による破壊的ノード変形（テキスト書き換え・`children.push`）→ `renderSync` の方式は採らない。理由:
- 整形/minify は「同じ木を別フォーマットで直列化する」問題であって木構造の変形ではない。`walkSync` は (a) `parse` が返す `parent` 参照付き mutable ノードを破壊的に触ることになり純粋関数の「入力不変」前提と緊張する、(b) pre-order DFS 中の `children` 変形が順序依存で読みにくい。
- `renderSync` のソース（`v()`）をなぞる形で「ノード型でディスパッチしつつ block 文脈で改行・depth インデントを差し込む」純粋再帰関数を書くのが、ラウンドトリップ等価性のテスト可能性も含めて素直。`parse` の返すノードは読み取りのみで触らない。

**ホワイトスペース正規化規則を設計レベルで固定する（Round 1 arch P-001 を反映）。** 整形時に挿入する空白（インデント・改行）と保存すべき有意な空白（インライン語間スペース）は AST 上で区別不能な同一 TEXT ノードになるため、整形/minify の双方が次の規則を SSOT として lockstep で守る:
1. block コンテナで「子が全て block ノード or whitespace-only TEXT」のときのみ、子間にインデント・改行を挿入（format）/除去（minify）してよい。
2. inline 要素を 1 つでも子に含むコンテナの内部テキストは一切触らない（語間スペース保存）。
3. `<pre>` / `<code>` / `<textarea>` は要素内部を whitespace-significant として無改変出力（`<textarea>` は保存経路では allowlist 外で落ちるが AC-4 が明示するので整形側では有意扱い）。
4. block / inline / whitespace-significant のタグ集合はサニタイザの `BLOCK_TAGS` / `INLINE_TAGS` を SSOT 共有するか、`htmlFormat.ts` 側で同等集合＋「サニタイザと lockstep 更新」JSDoc を持つ（`wysiwygUnsupportedTags.ts` 前例に倣う）。

不変条件 `minifyHtml(formatHtml(m)) === m`（`m` は minified 入力）を機械的な等式としてテストで固定する。

### Consequences
- 良い点: バンドル増加なし。サーバ側 minified 表現とパーサ/直列化器が一致しラウンドトリップ等価を担保しやすい。Worker/SSR/Node のどこでも動く（既存前例 `wysiwygUnsupportedTags.ts` と同方針）。自作再帰シリアライザは入力 AST を破壊せず純粋性を保つ。
- トレードオフ: 整形ロジック（インデント規則・ホワイトスペース正規化規則・インライン語間スペース保持）を自前で実装・テストする必要がある。専用ライブラリの成熟したエッジケース対応を享受できないため、上記正規化規則と `minifyHtml(formatHtml(m)) === m` 等式をテストで厚く固定する。`htmlFormat.ts` のタグ集合はサニタイザと lockstep 更新が必要（手動キュレーションの負債）。

---

## ADR-002: 整形/minify ユーティリティをフロントエンド純粋モジュールに置く（adapter 層に置かない）

### Status
Proposed

### Context
整形/minify をどの層に置くかに選択肢がある:
- (a) `app/core/adapters/sanitizer/` 付近の adapter 層に置く。
- (b) `app/components/note/editor/` 配下のフロントエンド純粋ユーティリティとして新設する。

考慮事項:
- adapter 層は「単一の外部リソースをカプセル化し、サーバ I/O 境界でドライバ固有エラーを共有エラー契約に翻訳する」概念。整形/minify はクライアントの表示整形であり、外部リソースもエラー翻訳も伴わない。
- Issue の不変条件「クライアント整形はサーバ側サニタイズの代替にしない／サニタイズは保存経路の最終防衛線として独立に残す」。両者を別レイヤー・別責務に保つことが明確さに直結する。
- reducer/orchestrator から純粋関数として使えること（Issue 備考）。

### Decision
(b) を採用。整形/minify は `app/components/note/editor/htmlFormat.ts` というフロントエンド純粋モジュールに新設する。サーバ側 `htmlSanitizer.ts`（adapter）はサニタイズ責務のまま不変で残し、整形/minify とは独立させる。

### Consequences
- 良い点: クライアント表示整形とサーバサニタイズの責務が層レベルで分離し、サニタイズが最終防衛線として独立に残る（AC-9）。reducer/orchestrator から純粋関数として共有できる。`wysiwygUnsupportedTags.ts` と同じ前例に沿う。
- トレードオフ: `ultrahtml` への依存がフロントエンドバンドルにも入る（ただし pure ESM・Worker 対応で許容範囲）。

---

## ADR-003: contentHtml を全モード共通の minify 表現に保ち、整形表示は派生フィールドに分離する

### Status
Proposed

### Context
HTML タブの整形表示をどう状態管理するかに選択肢がある:
- (a) `setMode("html")` で `contentHtml` 自体を整形済み文字列に書き換え、保存経路（`snapshotForSubmit`）で minify する。
- (b) `contentHtml` は従来どおり全モード共通の minify 表現を保ち、HTML タブの整形表示を**派生フィールド** `htmlDraft` に持たせる。HTML タブ編集は `htmlDraft` を更新し、保存・モード離脱時に minify して `contentHtml` へ確定する。

考慮事項:
- `contentHtml` は WYSIWYG（TipTap）/ inline（contentEditable）/ HTML タブの三モードが共有する単一の真実。WYSIWYG/inline は `contentHtml` を直接 DOM/エディタへ流す。
- (a) だと html タブに入った瞬間 `contentHtml` が整形済みになり、その状態で（minify 確定前に）WYSIWYG/inline に切り替わると整形済み HTML が他モードに漏れ、TipTap 再パースや MutationObserver スナップショットに想定外の改行/インデントが混入し得る。
- Issue の不変条件「保存される実体は常に minify 済み・整形は表示限定」「モード往復で本文が破壊されない」。
- reducer の純粋性（React 非依存・副作用なし）。整形/minify は純粋関数なので reducer 内呼び出しで純粋性は保てる。

### Decision
(b) を採用。`EditorState.contentHtml` は全モード共通の minify 表現を保つ。HTML タブの整形表示・編集は派生フィールド `htmlDraft` が担い、保存スナップショット（`snapshotForSubmit`）とモード離脱時に `minifyHtml(htmlDraft)` で `contentHtml` を確定する。不変条件「保存される実体は `contentHtml` 由来で常に minify 済み／`htmlDraft` は HTML タブ表示・編集中のみ有効」を JSDoc とテストで固定する。

**reducer に初めて入る `ultrahtml` 依存について（Round 1 arch S-003 を反映）。** `editorState.ts` はこれまで外部依存ゼロの純粋 reducer だった。本 Issue で `formatHtml` / `minifyHtml`（内部で `ultrahtml` を使う）を reducer 内から呼ぶが、これらは**純粋関数（React 非依存・副作用なし・例外なし、node 環境で動作確認済み）**であり reducer の純粋性は壊さない。ただし reducer は `ultrahtml` を**直接 import せず `htmlFormat.ts` 越しに呼ぶ**間接化を方針として固定し、reducer の「React 非依存・テスト容易」原則を将来も守る。

**初期 `htmlDraft` の不変条件。** 初期モードは `new→wysiwyg`/`edit→inline` で html 始まりは存在しないため、`htmlDraft` の初期値は `""`（未整形）とし、`setMode("html")` 遷移時にのみ `formatHtml(contentHtml)` で埋める。`htmlDraft` は `mode==="html"` のとき**のみ**有効で、それ以外では stale でよく、保存・他モードは常に `contentHtml` を真実とする。この不変条件を JSDoc とテストで固定する。

### Consequences
- 良い点: 整形済み HTML が他モードに漏れず、モード往復で本文が破壊されない（AC-7）。「保存は minify・表示は整形」の非対称が状態の形で表現される。reducer は純粋関数利用で純粋性を維持。
- トレードオフ: `contentHtml` と `htmlDraft` の二重状態を同期させる責務が増える（モード遷移・保存スナップショット・自動保存依存）。同期漏れは本文破壊や自動保存の取りこぼしに直結するため、不変条件をテストで厚く固定する必要がある。手動保存 `onSubmit` も `snapshotForSubmit` 経由に統一し、手動・自動が同一スナップショットルールを通ることを保証する（plan ステップ4 参照）。
