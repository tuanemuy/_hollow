# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク (Issue #762)

レビュー観点: **プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク**

調査で検証した事実（ultrahtml 1.6.0 のソース `node_modules/ultrahtml/dist/index.js` と実機実行で確認）:

- `renderSync`（ソースの `v()` / `L()`）は **整形を一切しない**。`<tag>${children}</tag>` を素朴に連結するだけで、インデント・改行付与のロジックは無い。`formatHtml` の pretty-print は **完全に自作**が必要。ADR-001 / plan はこれを正しく認識している。
- `parse → renderSync` のラウンドトリップは、`<pre>` 内 `"  line1\n    line2  "`、インライン語間スペース `<a>foo</a> <a>bar</a>`、`[[target|display]]`、エンティティ（`&amp;` は literal 保持）について **そのまま等価**であることを実機確認済み。壊れた `<p>open<span>x</span>` は閉じタグ補完されて返る（例外は投げない）。リスクは「素の往復」ではなく **自作で挿入する整形レイヤー**に集中する。
- `walkSync`（`O.visit`）は **ノード変形可能**（テキスト値の書き換え・`children.push` を実機確認）。ただし pre-order DFS で各ステップ `node.children` を再読込するため、走査中の構造変形は順序依存になる。整形/minify は「直列化」の問題であって「木の変形」ではないので、**walkSync より自作の再帰シリアライザ**が現実的。plan は「`walkSync`（または再帰トラバース）」と両論併記しており、ここは後者に倒すべき（下記 S-001）。
- `app/components/note/editor/__tests__` のユニットテストは vitest `environment: "node"`。reducer に `ultrahtml` を import しても純粋性（React 非依存・副作用なし・例外なし）は壊れない（pure ESM, no DOM）。

---

#### 問題点（要修正）

- **[P-001]** 整形時に挿入する空白（インデント・改行）と、保存すべき有意な空白（インライン語間スペース）が、AST 上で**区別不能な同一の TEXT ノード**になる。ラウンドトリップ等価性の核心がこの曖昧性の解消に懸かっているが、plan / ADR はそのアルゴリズムを規定していない。
  - 理由: `parse('<p>x</p>\n  <p>y</p>')` は block 間に TEXT ノード `"\n  "` を生む一方、`parse('<a>x</a> <a>y</a>')` のインライン語間スペースも TEXT ノード `" "` になる（いずれも実機確認）。`formatHtml` が block 境界に `"\n  "` を**挿入**すると、その後 `minifyHtml` は「自分が挿入した整形空白」と「元から有意だった空白」を区別して前者だけ除去しなければならない。要素が block か inline かの文脈、および隣接ノードが inline テキストを含むかどうかで判定する**ホワイトスペース正規化ポリシー**を厳密に定義しないと、(a) インライン語間スペースを誤って除去して AC-5 を破る、(b) 整形空白を minify で取り切れず `contentHtml` が肥大化して「保存実体は常に minify」(AC-2/3) を破る、のどちらかが起きる。これは ADR-001 の Consequences で「成熟したライブラリのエッジケース対応を享受できない」と言及されたトレードオフの**最も危険な具体形**であり、設計段階で正規化規則（block-level の子は trim/再インデント可、inline を含む文脈の空白は保存）を文章で固定すべき。
  - 提案: plan の「設計」セクションに **ホワイトスペース正規化規則**を明文化する。最低限: (1) block 要素（`BLOCK_TAGS` 相当）の子で「子が全て block／whitespace-only TEXT」のときのみインデント・改行を挿入/除去してよい、(2) inline 要素を1つでも子に含むコンテナの内部テキストは**一切触らない**（整形対象外）、(3) `<pre>`/`<code>`/`<textarea>` は祖先を含め in-significant とみなさず無改変。サニタイザの `BLOCK_TAGS` / `INLINE_TAGS` を SSOT として共有するか、`htmlFormat.ts` 側で同等の集合を定義し「サニタイザと lockstep で更新する」JSDoc を付ける（`wysiwygUnsupportedTags.ts` の手動キュレーション前例に倣う）。`<textarea>` はサニタイザの allowlist に無いため保存経路では落ちるが、AC-4 が明示しているので整形側では whitespace-significant として扱う。

- **[P-002]** plan ステップ2 の「`createInitialEditorState` で初期 `htmlDraft` を整形して seed」と、ADR-003 の「`surface=edit` は `inline` 始まり（html 始まりではない）」が整合しておらず、`htmlDraft` の初期値・seed タイミングが曖昧。
  - 理由: 初期モードは `new→wysiwyg` / `edit→inline` で、**初期表示が html になるケースは存在しない**（`createInitialEditorState`）。それなら初期 `htmlDraft` を seed する必要は無く、`""`（または未整形）で初期化し、`setMode("html")` 遷移時に `formatHtml(contentHtml)` で初めて埋めるのが筋。plan は「初期 seed して整形」と「html 遷移時に整形」を両方書いていて二重定義になっており、どちらが真実か（= 二重状態の同期不変条件）が曖昧になる。これはリスク欄で自認している「`contentHtml` と `htmlDraft` のどちらが真実か曖昧」の具体的な発生源。
  - 提案: 「初期 `htmlDraft = ""`、`setMode("html")` 遷移（および将来 html で開く surface が増えたとき）で `formatHtml(contentHtml)` を畳む」に一本化する。`htmlDraft` の不変条件を「`mode==="html"` のとき**のみ**有効。それ以外では stale でよく、保存・他モードは常に `contentHtml` を真実とする」と JSDoc に固定する。

- **[P-003]** `snapshotForSubmit` / `EditorSnapshotInput` に `mode` / `htmlDraft` を追加する設計（ステップ3）が、`onSubmit`（手動保存）の現在の実装経路と噛み合っていない。
  - 理由: 現状 `NoteEditor.onSubmit` は `snapshotForSubmit` を**通さず** `state.contentHtml` を直接 `createNote`/`saveNote` に渡している（`NoteEditor.tsx` の `onSubmit`、`contentHtml: state.contentHtml`）。`snapshotForSubmit` を経由しているのは autosave だけ。したがって「保存される `contentHtml` は常に minify 済み」を `snapshotForSubmit` 一箇所で保証する設計にしても、**手動保存はそのルールを通らない**。plan ステップ4 で「`onSubmit` は `snapshotForSubmit` のルールに合わせて」と一行触れているが、これは手動保存経路を `snapshotForSubmit` 経由に**作り変える**ことを意味し、ステップとして明示・分離すべき（影響は `createNote`/`saveNote` 両分岐 + `frontMatterJson` / `tagNames` の既存組み立てと重なる）。見落とすと AC-2（手動保存で minify）が html タブで成立しない。
  - 提案: ステップ4を分割し、「`onSubmit` の `contentHtml` を `snapshotForSubmit(state).contentHtml` 由来に置換する」を独立タスクとして明記。`snapshotForSubmit` の入力に `mode` / `htmlDraft` を足す型変更（`EditorSnapshotInput`）と、`onSubmit` / `useAutosave` 両呼び出し側の追従を1セットで列挙する。

#### 改善提案（検討推奨）

- **[S-001]** `htmlFormat.ts` の整形実装は `walkSync` ではなく **AST の自作再帰シリアライザ**に倒すことを plan で明示する。
  - 理由: 整形/minify は「同じ木を別フォーマットで直列化する」問題であって木構造の変形ではない。`walkSync` でノードを書き換えてから `renderSync` する方式は、(a) `parse` が返す `parent` 参照付き mutable ノードを破壊的に触ることになり純粋関数の前提（入力不変）と緊張する、(b) pre-order DFS 中の `children` 変形が順序依存で読みにくい。`renderSync` のソース（`v()`）をなぞる形で「ノード型でディスパッチしつつ block 文脈で改行・depth インデントを差し込む」純粋再帰関数を書くのが、ラウンドトリップ等価性のテスト可能性も含めて素直。plan の「`walkSync`（または再帰トラバース）」を後者に確定させる。

- **[S-002]** `formatHtml` / `minifyHtml` のラウンドトリップ不変条件を `minifyHtml(formatHtml(x)) === minifyHtml(x)`（= 整形は minify 後表現を変えない）という**機械的に検証可能な等式**としてテストに据えることを推奨。
  - 理由: plan の AC-10 は「ラウンドトリップ等価」を謳うが、`formatHtml(minifyHtml(x)) === ?` の右辺が「意味的に等価」という曖昧な表現に留まっている。実際にユーザーが触る `contentHtml` は常に「minify 済み」なので、不変条件は「整形して編集せず保存したら元の minify 表現に戻る」= `minifyHtml(formatHtml(m)) === m`（`m` は minified 入力）として固定するのが最も実態に即し、テストも一意に書ける。`htmlSanitizer` が出す実際の minified 表現（`renderSync` 出力）をテストフィクスチャの基準にすると、サーバ往復との整合も同時に押さえられる。

- **[S-003]** `editorState.ts`（これまで外部依存ゼロの純粋 reducer）に `ultrahtml` 依存が入る点を ADR か JSDoc で一言残す。
  - 理由: 純粋性自体は保たれる（node 環境で動作確認済み）が、reducer が初めてパーサ依存を持つのはアーキテクチャ上の質的変化。`formatHtml`/`minifyHtml` は `htmlFormat.ts` 越しに呼ぶので reducer は `ultrahtml` を直接 import しない、という間接化の方針を明記しておくと、reducer の「React 非依存・テスト容易」の原則が将来も守られる。

#### 良い点

- レイヤーの内側（純粋ユーティリティ `htmlFormat.ts`）→ reducer → orchestrator の順で設計しており、CLAUDE.md の「依存は内側へ」「純粋ロジックはポート/純粋関数に切り出す」原則に沿っている。adapter 層に整形を置かない判断（ADR-002）は、adapter が「サーバ I/O 境界 + ドライバエラー翻訳」概念であるという CLAUDE.md の定義に照らして正しい。
- ADR-003 の「`contentHtml` は全モード共通の minify 表現を保ち、整形表示は派生フィールド `htmlDraft` に分離」は妥当。代替案(a)（`contentHtml` 自体を整形済みにする）が WYSIWYG/inline へ整形済み HTML を漏らす危険（TipTap 再パース・MutationObserver スナップショットへの改行混入）を正しく言語化して退けており、モード共有という既存構造を壊さない。
- サーバ側 `htmlSanitizer.sanitize` を最終防衛線として**変更せず**残し、クライアント整形をサニタイズの代替にしない切り分け（AC-9）が、Issue の処理順序の取り決めと CLAUDE.md の二点検証方針（境界 + 値オブジェクト構築）に整合。`[[...]]` がサニタイザ同様 TEXT ノードを素通りすることも実機で確認でき、AC-6 の前提は妥当。
- 新規ライブラリを足さず既存 `ultrahtml` を使う判断（ADR-001）は、Cloudflare Workers の pure ESM 制約・バンドル増回避の観点で適切。`parse→renderSync` がサーバ minified 表現と**同一パーサ/直列化器**である点は、ラウンドトリップ等価を取りやすくする実利があり、実機で往復一致を確認できた。
- フォールバック方針（整形不能時は入力素通し・例外を投げない、AC-8）が `wysiwygUnsupportedTags.ts` の「reducer は never throw」前例と一貫している。`parse` が壊れた HTML でも例外を投げず補完して返すことは実機確認済みで、フォールバックは現実的。
- リスク欄で「二重状態同期」「自動保存 useMemo 依存の追加忘れ」「モード往復での minify 確定取りこぼし」を自認しており、本レビューの P-002/P-003 と問題意識が一致している（plan 自身が弱点を把握できている）。
