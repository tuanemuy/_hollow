# 実装計画 — Issue #762: feat(editor): HTML 編集モードで本文を整形表示し保存時に minify する

**Issue:** #762
**作成日:** 2026-06-21
**複雑度:** 中〜大規模

---

## 目的

HTML 編集タブに入った時点で永続化済みの minified な `contentHtml` を pretty-print（インデント・改行付与）して読みやすく表示し、保存（手動・自動）の前に再び minify してから永続化する。「保存される実体は常にコンパクト・整形は表示限定」という表示と保存の非対称を、可逆性（ラウンドトリップ等価）を担保した純粋関数として導入する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | HTML 編集モードに入ったとき、保存済みの minified な `contentHtml` がインデント・改行付きで `<textarea>` に表示される（検証メモ: 初期 mode は `new→wysiwyg`/`edit→inline` で html にならない＝整形は必ず `setMode("html")` 遷移時に走る。初期 html マウントの整形が無いのは設計どおりで誤検知しない） | Issue 本文 | 1, 3, 4 |
| AC-2 | 保存（手動）時に、整形済みの編集中 HTML が minify されてから永続化される | Issue 本文 | 1, 4 |
| AC-3 | 自動保存経路でも同様に minify 済みの HTML が永続化される | Issue 本文 | 1, 4 |
| AC-4 | `<pre>` / `<code>` / `<textarea>` などホワイトスペース有意な要素の内側が整形/minify で改変されない | Issue 本文 | 1, 6 |
| AC-5 | インライン要素間の意味のある空白（`<a>foo</a> <a>bar</a>` の語間スペース等）が整形/minify のラウンドトリップで失われない | Issue 本文 | 1, 6 |
| AC-6 | 内部リンクプレースホルダ `[[...]]` が整形/minify を通しても保持される | Issue 本文 | 1, 6 |
| AC-7 | HTML ⇄ WYSIWYG ⇄ inline のモード往復で本文が破壊されない | Issue 本文 | 3, 4, 6 |
| AC-8 | 不正/未完成な HTML を編集中でも整形失敗で入力が失われず、編集を継続できる（フォールバック） | Issue 本文 | 1, 3, 6 |
| AC-9 | サーバ側 `HtmlSanitizer.sanitize` は最終防衛線として保存経路に残っている（検証手段: `saveNote.ts` / `createNote.ts` / `htmlSanitizer.ts` の diff がゼロであることをレビューで機械確認） | Issue 本文 | （変更なしで担保） |
| AC-10 | 整形/minify とラウンドトリップ等価性を検証するユニットテストが追加されている | Issue 本文 | 6 |

## スコープ

### 含まれないもの
- サーバ側 `saveNote` / `createNote` / `htmlSanitizer` の振る舞い変更。サニタイズは最終防衛線として現状のまま残す（AC-9 はコードを「変えない」ことで満たす）。
- `markdownConverter.ts` の変更。markdown→HTML 経路は本文供給元ではあるが、本 Issue の整形/minify は「HTML タブの表示と保存」に限定され、変換器の出力形式は触らない。
- WYSIWYG / inline モードのレンダリング・整形（これらは HTML タブ専用の処理で、他モードには適用しない）。
- HTML 整形のためのコードシンタックスハイライト等のエディタ UI 強化。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/editorState.ts` — React 非依存の純粋 reducer。`EditorState` / `EditorAction` / `setMode` / `setContent` を持つ。`contentHtml` は全モード共通の単一の真実。
  - `app/components/note/editor/NoteEditor.tsx` — orchestrator。`useReducer` バインド、モード切替（`onModeChange`）、手動保存（`onSubmit` → `createNote`/`saveNote`）、`useAutosave` の配線。
  - `app/components/note/editor/HtmlEditor.tsx` — `<textarea value={value} onChange>` と「保存時サニタイズ」前提のプレビュー。整形済み文字列の表示先。
  - `app/components/note/editor/useAutosave.ts` — `snapshotForSubmit` 経由で `contentHtml` を `saveDraft` に渡す。`snapshot` の `useMemo` 依存に `contentHtml` がある。
  - `app/components/note/editor/wysiwygUnsupportedTags.ts` — 既存の「クライアント側 HTML 解析の純粋ユーティリティ」の前例。React 非依存・regex ベース・SSR/Worker/Node で動く方針が明文化されている。整形/minify ユーティリティはこの前例に倣う。
  - `app/core/adapters/sanitizer/htmlSanitizer.ts` — `ultrahtml` の `parse` / `renderSync` を使う allowlist サニタイザ。`renderSync` は改行・インデントなしの詰まった出力になる（minified 表現の出どころ）。`[[...]]` はテキストノードとしてそのまま通過することがコメントで明記されている。
  - `app/core/application/note/{saveNote,createNote}.ts` — `NoteService.assembleFromInputs` 経由で `container.htmlSanitizer` を通す既存経路。最終防衛線として維持。
- あるべきアーキテクチャ（CLAUDE.md / 既存実装から読み取り）:
  - reducer は **React 非依存・純粋・副作用なし**を厳守（`editorState.ts` の冒頭 JSDoc「the orchestrator binds this reducer to useReducer but never adds logic outside the exported actions defined here」）。
  - 「型レベルで不正状態を表現不可能にする」「境界で検証し中間では静的型を信頼する」。
  - クライアント整形はサーバ側サニタイズの**代替にしない**（Issue の処理順序の取り決め）。サニタイズは保存経路の最終防衛線として独立に残す。
  - 純粋ロジックは副作用のない純粋関数として切り出し、reducer/orchestrator の双方から利用可能にする（Issue 備考の方針）。
- 既存実装の状態:
  - HTML タブは `state.contentHtml`（= 保存済み minified HTML）をそのまま `<textarea>` に流している。整形・minify の概念は未導入で、**あるべき姿（読みやすい整形表示＋コンパクト保存）と乖離**している。本 Issue で埋める。
  - `contentHtml` が「全モード共通の単一の真実」である構造は維持すべき。整形は HTML タブの**表示専用の派生状態**であって、`contentHtml` の意味を「整形済み」に変えてはならない（変えると WYSIWYG/inline が壊れる）。
- 依存関係:
  - `ultrahtml@1.6.0` は pure ESM（Cloudflare Workers でも動作する旨が `htmlSanitizer.ts` に明記）で、`parse` / `walkSync` / `renderSync` を export 済み。クライアントバンドルにも追加可能。新規ライブラリ導入は不要（ADR-001 参照）。

## 設計

レイヤーの内側（純粋ユーティリティ）から外側（orchestrator 配線）へ設計する。本 Issue はフロントエンドのみで、ドメイン/ユースケース/アダプターには変更を入れない。

### ドメインモデルへの影響
なし。`contentHtml`（`ContentHtml` 値オブジェクト）の意味・不変条件は不変。整形はクライアント表示の派生であり、永続化される実体は従来どおりサニタイズ済み HTML。

### ユースケース / アプリケーションロジック
なし。`saveNote` / `createNote` は変更しない。サーバ側サニタイズは最終防衛線として現状維持（AC-9）。

### アダプター / 永続化 / 外部連携
なし。`htmlSanitizer.ts` / `markdownConverter.ts` は変更しない。クライアント整形/minify は**新規のフロントエンド純粋ユーティリティ**として独立させ、adapter 層には置かない（adapter はサーバ I/O 境界の概念であり、クライアント表示整形はそこに属さない — ADR-002 参照）。

### UI / プレゼンテーション
本 Issue の変更はすべてここに収まる。

1. **新規純粋ユーティリティ `app/components/note/editor/htmlFormat.ts`**
   - **実装方式の確定（ADR-001 / S-001 を反映）:** `ultrahtml` の `parse` で AST 化し、`walkSync` による破壊的ノード変形は使わず、**`renderSync` のソース（`v()`）をなぞる自作の再帰シリアライザ**で整形/minify 文字列を組み立てる。`parse` が返す `parent` 参照付き mutable ノードは読み取りのみで触らず、純粋関数の「入力不変」前提を守る。整形/minify は「同じ木を別フォーマットで直列化する」問題であって木の変形ではないため、再帰シリアライザが素直で順序依存も生まない。
   - `formatHtml(html: string): string` — pretty-print。AST をノード型でディスパッチしつつ block 文脈で改行・depth インデントを差し込む。整形失敗時は入力をそのまま返す（フォールバック、AC-8）。
   - `minifyHtml(html: string): string` — minify。整形で挿入したノード間の余白を取り除き、ホワイトスペース有意要素・インライン語間スペースは保持。`htmlSanitizer.renderSync` 相当のコンパクト表現に戻す。
   - 両関数とも React 非依存・副作用なし・例外を投げない（`wysiwygUnsupportedTags.ts` の前例に倣う）。`[[...]]` はテキストノードとして無改変で通過（サニタイザと同じ性質）。
   - 不変条件 `minifyHtml(formatHtml(m)) === m`（`m` は minified 入力）をテストで担保（S-002）。

   **ホワイトスペース正規化規則（P-001 を反映・整形と minify が lockstep で守る SSOT）:**

   整形時に挿入する空白（インデント・改行）と、保存すべき有意な空白（インライン語間スペース）は AST 上では区別不能な同一の TEXT ノードになる。両者を取り違えると (a) インライン語間スペースを誤除去して AC-5 を破る、(b) 整形空白を取り切れず `contentHtml` が肥大化して AC-2/3 を破る、のどちらかが起きる。これを避けるため、整形/minify の双方が次の規則に従う:

   1. **block コンテナで「子が全て block ノード or whitespace-only TEXT」のときのみ**、子の間にインデント・改行を挿入（formatHtml）/除去（minifyHtml）してよい。whitespace-only TEXT は整形が挿入した空白とみなし、minify で除去する。
   2. **inline 要素を 1 つでも子に含むコンテナの内部テキストは一切触らない**（整形対象外）。語間スペース（`<a>x</a> <a>y</a>` の `" "`）はこの規則で保存される。
   3. **`<pre>` / `<code>` / `<textarea>` はホワイトスペース有意**として、要素内部（祖先含む）を無改変で出力する。`<textarea>` はサニタイザ allowlist に無く保存経路では落ちるが、AC-4 が明示しているので整形側では whitespace-significant として扱う。
   4. block / inline / whitespace-significant のタグ集合はサニタイザの `BLOCK_TAGS` / `INLINE_TAGS` を SSOT として共有するか、`htmlFormat.ts` 側で同等集合を定義し「サニタイザと lockstep で更新する」JSDoc を付ける（`wysiwygUnsupportedTags.ts` の手動キュレーション前例に倣う）。

2. **reducer 拡張 `editorState.ts`**
   - 新アクション `enterHtmlMode`（または `setMode` の html 遷移時に整形を畳む専用アクション）を追加し、`mode = "html"` へ遷移する際に `contentHtml` を `formatHtml` した値を `htmlDraft`（HTML タブ表示専用の派生フィールド）に格納する。
   - **初期 `htmlDraft` の扱い（P-002 を反映・二重定義の解消）:** 初期モードは `new→wysiwyg` / `edit→inline` のいずれかで、**初期表示が html になるケースは存在しない**（`createInitialEditorState` L206）。したがって `createInitialEditorState` で `htmlDraft` を seed する必要はなく、**初期値は `""`**（未整形）とし、`setMode("html")` 遷移時に初めて `formatHtml(contentHtml)` で埋める。「初期 seed して整形」と「html 遷移時に整形」を両方書く二重定義は廃し、後者に一本化する。
   - **不変条件（JSDoc に固定）:** `htmlDraft` は `mode==="html"` のとき**のみ**有効。それ以外のモードでは stale でよく、保存・他モードは常に `contentHtml` を真実とする。
   - 設計判断: **整形済み文字列を `contentHtml` 本体に書き戻さない**。`contentHtml` は全モード共通の真実（minify 側）を保ち、HTML タブの表示は派生 `htmlDraft` が持つ。HTML タブでの編集は `htmlDraft` を更新し、`contentHtml` には反映しない（保存時に minify して `contentHtml` を確定）。`setHtmlDraft` が立てる dirty キーは `"content"`（`DirtyKey` に既存。新キーは足さない）— html タブ編集を既存の `content` dirty 集合・自動保存ゲートに整合させる（S-002）。`htmlDraft` 更新では `contentHtml` 本体は変わらないため、autosave の snapshot `useMemo` 依存に `htmlDraft`/`mode` を加える（ステップ4）ことと併せて取りこぼしを防ぐ。
   - 代替案として「`contentHtml` を整形済みにして、保存経路（`snapshotForSubmit`）で minify する」案もあるが、これだと WYSIWYG/inline が `contentHtml` を直接 DOM に流すため整形済み HTML が他モードに漏れる。派生フィールド分離が安全（ADR-003 参照）。
   - `formatHtml` / `minifyHtml` は純粋関数なので reducer 内から呼んでよい（副作用なし・例外なし）。ただし reducer は `ultrahtml` を直接 import せず `htmlFormat.ts` 越しに呼ぶ間接化を守り、reducer の「React 非依存・テスト容易」原則を維持する（S-003 / ADR-003 参照）。

3. **`snapshotForSubmit` / 保存経路の minify 一本化 `editorState.ts`**
   - 保存に渡す `contentHtml` は「常に minify 済み」を不変条件とする。`contentHtml` 本体を minify 表現で保つ設計（ステップ2）なら、HTML タブ編集中は `htmlDraft` を保存直前に `minifyHtml` して `contentHtml` へ確定する経路を `snapshotForSubmit`（純粋）に集約する。
   - `snapshotForSubmit` は `mode` / `htmlDraft` を見て、HTML タブなら `minifyHtml(htmlDraft)`、他モードなら `contentHtml` をそのまま採用する単一ルールにする。これで手動保存・自動保存が lockstep（既存の設計思想）を維持したまま minify を一箇所で通せる（AC-2, AC-3）。
   - **型変更（P-003 と連動）:** `EditorSnapshotInput`（現状 `Pick<EditorState, "title" | "contentHtml" | "frontMatter" | "tagNames" | "tagDraft" | "directoryId">`）に `mode` / `htmlDraft` を追加する。この型変更により `snapshotForSubmit` の呼び出し側（手動保存 `onSubmit`・自動保存 `useAutosave` の `useMemo`）の両方が `mode` / `htmlDraft` を渡す必要が型レベルで顕在化する。両呼び出し側の追従はステップ4で列挙する。

4. **orchestrator 配線 `NoteEditor.tsx` / `useAutosave.ts`**
   - `HtmlEditor` の `value` を `state.htmlDraft`（整形済み）に、`onChange` を `htmlDraft` 更新アクション（`setHtmlDraft`）に差し替える（AC-1）。
   - `onModeChange` で html へ遷移する際に整形アクションを dispatch。html から他モードへ遷移する際は `htmlDraft` を minify して `contentHtml` を同期し、他モードが破壊されないようにする（AC-7）。
   - **html → wysiwyg/inline 遷移の実行順序を固定（S-001 arch を反映）:** html タブ編集中の真実は `htmlDraft` で `contentHtml` は stale になり得る。離脱時は必ず **(1) `minifyHtml(htmlDraft)` で `contentHtml` を確定 → (2) その確定後の `contentHtml` に対して decoration-loss 検出（`detectUnsupportedTags`）を走らせる** 順序を守る。stale な `contentHtml` で検出が走ると (a) html タブで書いた TipTap 非対応タグの検出漏れ、(b) ConfirmDialog 経由分岐（`confirmWysiwygSwitch`）が `setMode` だけ dispatch して minify 確定をスキップ→html 編集が捨てられる、のいずれかが起きる。`confirmWysiwygSwitch` 側にも `htmlDraft`→`contentHtml` の同期 dispatch を必ず通す。
   - **手動保存 `onSubmit` を `snapshotForSubmit` 経由に作り変える（P-003 を反映・最重要）:** 現状 `onSubmit`（NoteEditor.tsx L319-365）は `snapshotForSubmit` を**通さず** `contentHtml: state.contentHtml` を `createNote`（L327）/`saveNote`（L344）両分岐へ直送している。`snapshotForSubmit` を経由するのは autosave だけなので、このままでは「保存される `contentHtml` は常に minify 済み」を `snapshotForSubmit` 一箇所で保証しても**手動保存はそのルールを通らず**、HTML タブで AC-2 が成立しない。`onSubmit` を `const snap = snapshotForSubmit(state)` を組み立て、`createNote`/`saveNote` 両分岐の `contentHtml` を `snap.contentHtml` 由来に置換する。`frontMatterJson`（現状 L314 で別途 `JSON.stringify`）・`tagNames`（現状 L315 で `resolveTagNames`）も `snap` 由来に揃え、手動保存と自動保存が**同一スナップショットルール（HTML タブなら `minifyHtml(htmlDraft)`）を通る**ことを保証する。
   - **自動保存 `useAutosave` の追従（AC-3）:** `snapshot` の `useMemo`（useAutosave.ts L191-202）の入力に `mode` / `htmlDraft` を追加し、依存配列（L201）にも `mode` / `htmlDraft` を加える。これで HTML タブ編集中の自動保存でも minify 済みが飛ぶ。`mode` は既に effect 側の dep（L312）にあるが、`snapshot` の `useMemo` 依存への追加は別途必要。
   - **`MediaUploader` の HTML モード挿入を入口・出口の両側で `htmlDraft` に整合させる（coverage P-001 を反映）:** 現状 html 分岐は `MediaUploader contentHtml={state.contentHtml}`（NoteEditor.tsx L470-474）で minify 表現を渡し、`MediaUploader` が `insertMediaIntoHtml(contentHtml, …)`（MediaUploader.tsx L100）で末尾追記してから `onInsert(nextHtml, …)` を呼び、`onMediaInsert` が `setContent`（NoteEditor.tsx L205）で `contentHtml` を更新している。HTML タブで編集中の真実は `htmlDraft`（整形済み）なので、(入口) html モードでは `MediaUploader` の `contentHtml` prop に `state.htmlDraft` を渡し、(出口) `onMediaInsert` の html 経路は受け取った `nextHtml` を `setHtmlDraft` で `htmlDraft` に反映する。これで挿入元（編集中テキストエリアの表示）と挿入先が一致し、整形済みバッファに minify 由来文字列が混ざる不整合（AC-1 / AC-7 への波及）を防ぐ。`insertMediaIntoHtml` が整形済みバッファに `<p><img …/></p>` を `\n` 連結した結果は保存時 `minifyHtml` で正規化される前提なので、ラウンドトリップ等価テスト（ステップ6）にこのケースも 1 件加える。
   - **inline / wysiwyg 経路は不変側として固定（S-001 coverage を反映）:** `onMediaInsert` の inline / wysiwyg 経路は従来どおり `contentHtml`（`setContent` / TipTap `setImage`）に残し、html 経路だけを `htmlDraft` に分岐する。共有経路を一括で `htmlDraft` に倒さないことをスコープとして明示（「含まれないもの: WYSIWYG / inline の挙動」と整合）。

5. **`HtmlEditor.tsx`**
   - props 自体の形（`value`/`onChange`/`disabled`）は維持。表示する `value` が整形済みになる以外、コンポーネント内ロジックは原則不変。プレビューの `dangerouslySetInnerHTML` は整形済み HTML をそのまま描画でき、サニタイズは引き続きサーバ側（コメントの主旨は維持）。

6. **テスト追加**
   - `htmlFormat.test.ts`（新規）: pretty-print / minify / ラウンドトリップ等価、`<pre>`/`<code>`/`<textarea>` 内不改変、インライン語間スペース保持、`[[...]]` 保持、不正 HTML フォールバック（AC-4,5,6,8,10）。
   - `editorState.test.ts`（拡張）: html 遷移で `htmlDraft` が整形される / 保存スナップショットが minify 済みになる / モード往復で `contentHtml` が破壊されない（AC-1,2,3,7）。

## 実装ステップ

依存方向の順（内側＝純粋ユーティリティが先）に並べる。

### 1. 整形/minify 純粋ユーティリティの新設
- **対象ファイル:** `app/components/note/editor/htmlFormat.ts`（新規）
- **変更内容:** `ultrahtml` の `parse` / `walkSync`（または再帰トラバース）/ `renderSync` を用いて `formatHtml` / `minifyHtml` を実装。ブロック要素にインデント・改行を付与/除去し、`<pre>`/`<code>`/`<textarea>` などホワイトスペース有意要素の内側テキストは無改変、インライン要素間の有意空白を保持、`[[...]]` をテキストノードとして素通し。両関数とも例外を投げず、整形不能時は入力をそのまま返すフォールバックを持つ。
- **理由:** reducer/orchestrator 双方から使える副作用なしの純粋関数として整形/minify を一箇所に集約する（Issue 備考の方針・AC-4,5,6,8）。

### 2. reducer に HTML タブ表示用の派生状態を追加
- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:** `EditorState` に `htmlDraft: string`（HTML タブ表示専用の整形済みバッファ）を追加。`setMode` を `mode==="html"` 遷移時に `htmlDraft = formatHtml(contentHtml)` を畳むよう拡張（または専用アクション `enterHtmlMode`）。html から離脱する遷移で `contentHtml = minifyHtml(htmlDraft)` を確定。HTML タブ内編集用アクション `setHtmlDraft`（dirty キー `"content"` を立てる）を追加。`htmlDraft` の初期値は `""`。`setMode("html")` 遷移時にのみ `formatHtml(contentHtml)` で畳む（**初期 seed しない** — `createInitialEditorState` は `new→wysiwyg`/`edit→inline` で html 始まりが無いため seed は不要。設計セクション2・ADR-003 と一致）。
- **理由:** `contentHtml` を全モード共通の minify 表現に保ちつつ、HTML タブの整形表示を派生フィールドで分離（ADR-003）。reducer の純粋性は純粋ユーティリティ利用で維持。

### 3. 保存スナップショットの minify 一本化
- **対象ファイル:** `app/components/note/editor/editorState.ts`
- **変更内容:** `snapshotForSubmit` / `EditorSnapshotInput` を `mode` / `htmlDraft` を見るよう拡張し、「保存される `contentHtml` は常に minify 済み」を単一ルールで保証。HTML タブ編集中は `minifyHtml(htmlDraft)` を採用、他モードは `contentHtml` をそのまま採用。
- **理由:** 手動保存・自動保存が同じスナップショットルールを通る既存の lockstep 思想を保ったまま minify を一箇所で適用（AC-2,3）。

### 4. orchestrator / autosave の配線
- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`, `app/components/note/editor/useAutosave.ts`
- **変更内容:** `HtmlEditor` の `value`/`onChange` を `htmlDraft` 系に差し替え。`onModeChange` の html 出入りで整形/minify アクションを dispatch。html→wysiwyg/inline 離脱は **(1) `minifyHtml(htmlDraft)→contentHtml` 確定 → (2) 確定後の `contentHtml` で `detectUnsupportedTags`** の順序を固定し、`confirmWysiwygSwitch` 分岐にも同期 dispatch を通す（S-001）。`onSubmit` は `snapshotForSubmit` のルールに合わせて minify 済み `contentHtml` を送る。`useAutosave` の `snapshot` `useMemo` 依存に `htmlDraft` / `mode` を追加（AC-3 の自動保存と AC-7 の往復非破壊の双方がこの依存追加に依存する — 「AC-3 だけの話」と誤読して html タブ編集中の往復取りこぼしを見落とさないこと）。`onMediaInsert` の html モード経路を `htmlDraft` 更新に整合。
- **理由:** 表示は整形・保存は minify という非対称を全保存経路・モード遷移で一貫させる（AC-1,2,3,7）。

### 5. HtmlEditor の表示確認（最小変更）
- **対象ファイル:** `app/components/note/editor/HtmlEditor.tsx`
- **変更内容:** 原則 props 互換のまま。整形済み `value` を表示するだけで成立するか確認し、必要なら JSDoc を「整形表示・保存時 minify＋サーバサニタイズ」へ更新。
- **理由:** 表示先の責務を明確化（AC-1, AC-9 のコメント整合）。

### 6. ユニットテスト追加
- **対象ファイル:** `app/components/note/editor/__tests__/htmlFormat.test.ts`（新規）, `app/components/note/editor/__tests__/editorState.test.ts`（拡張）
- **変更内容:** 整形/minify/ラウンドトリップ等価、ホワイトスペース有意要素の不改変、インライン語間スペース保持、`[[...]]` 保持、不正 HTML フォールバック、html 遷移での整形と保存スナップショットの minify、モード往復での `contentHtml` 非破壊を検証。
- **理由:** AC-4,5,6,7,8,10 を機械的に担保。

## 設計判断

- **ADR-001:** 整形/minify は新規ライブラリを足さず、既存の `ultrahtml` の AST API で自作する。
- **ADR-002:** 整形/minify ユーティリティは `app/components/note/editor/` 配下のフロントエンド純粋モジュールに置く（adapter 層には置かない）。
- **ADR-003:** `contentHtml` は全モード共通の minify 表現を保ち、HTML タブの整形表示は派生フィールド `htmlDraft` に分離する。
詳細は `adr.md` 参照。

## リスクと注意点

- ラウンドトリップ等価性の担保が核心。特に (a) `<pre>`/`<code>`/`<textarea>` 内のホワイトスペース、(b) インライン要素間の語間スペース、(c) `[[...]]` プレースホルダの 3 点で整形/minify が意味を変えないこと。テストで重点的に固定する。`ultrahtml` のパース/直列化が想定どおりこれらを保つか、実装初期に検証スパイクを入れる。
- `contentHtml` と `htmlDraft` の二重状態化により「どちらが真実か」が曖昧になるリスク。不変条件「保存される実体は常に minify 済み（`contentHtml` 由来）／`htmlDraft` は HTML タブ表示・編集中のみ有効」を JSDoc とテストで固定する。
- モード往復（html ⇄ wysiwyg ⇄ inline）の遷移時に `htmlDraft`→`contentHtml` の minify 確定を取りこぼすと本文が破壊される。`onModeChange` の全分岐（unsaved-confirm / decoration-warning の既存ゲートと干渉しない順序）で同期を保証する。
- 自動保存の `snapshot` `useMemo` 依存に `htmlDraft`/`mode` を追加し忘れると、HTML タブ編集が自動保存に乗らない（または古い `contentHtml` が飛ぶ）。
- 整形失敗フォールバックが入力を消さないこと（壊れた HTML 断片の編集継続）。`formatHtml` は例外を投げず入力素通しに倒す。
- サーバ側サニタイズは独立に維持。クライアント整形がサニタイズを代替していないことをレビューで確認（AC-9）。具体的には `saveNote.ts` / `createNote.ts` / `htmlSanitizer.ts` の diff がゼロであることを機械的に確認する（coverage S-002）。

## テスト方針

- `htmlFormat.test.ts`（新規・純粋関数）:
  - `formatHtml` が minified 入力にインデント・改行を付与する。
  - **ラウンドトリップ不変条件を機械的な等式で固定（S-002）:** `minifyHtml(formatHtml(m)) === m`（`m` は minified 入力＝ユーザーが実際に触る `contentHtml` 表現）。フィクスチャの基準は `htmlSanitizer` が出す実際の minified 表現（`renderSync` 出力）に揃え、サーバ往復との整合も同時に押さえる。
  - `<pre>`/`<code>`/`<textarea>` 内のホワイトスペースが整形/minify 双方で不変。
  - `<a>foo</a> <a>bar</a>` の語間スペースが往復で保持される。
  - `[[target|display]]` などのプレースホルダがテキストとして保持される。
  - 不正/未完成 HTML（閉じタグ欠落等）でも例外を投げず入力を失わない。
  - 整形済みバッファへの media 追記（`insertMediaIntoHtml` の `\n` 連結結果）→ `minifyHtml` で minify 表現に正規化される（coverage P-001 連動）。
- `editorState.test.ts`（拡張）:
  - `setMode("html")` で `htmlDraft` が `formatHtml(contentHtml)` になる。初期状態では `htmlDraft === ""` で、整形は html 遷移時にのみ走る（P-002 / S-003 連動）。
  - HTML タブで `setHtmlDraft` 後の `snapshotForSubmit` が `minifyHtml` 済み `contentHtml` を返す。
  - **編集を挟んだ inline → html → inline 往復（S-002 coverage 格上げ）:** html タブで `setHtmlDraft` した後にモード離脱すると、その編集が `minifyHtml(htmlDraft)` で `contentHtml` に確定される（無編集往復だけでは通り得ない、同期漏れを機械的に押さえるケース）。
  - html ⇄ wysiwyg ⇄ inline 往復後も `contentHtml` が意味的に破壊されない。
- 既存テスト（`autosaveLogic` / `noteEditorModeChange` 等）が回帰しないこと（`pnpm test:unit`）。
- 仕上げ: `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

- **1周目:** arch P-001（空白正規化規則をホワイトスペース正規化規則として設計に明文化）・arch P-002（初期 `htmlDraft` を `""` 初期化し html 遷移時のみ整形に一本化、二重定義を解消）・arch P-003（手動保存 `onSubmit` を `snapshotForSubmit` 経由に作り変え、手動・自動が同一スナップショットルールを通ることを明示）・coverage P-001（`MediaUploader` の html 挿入を入口 prop=`htmlDraft`／出口 dispatch=`setHtmlDraft` の両側で整合）を反映。各 S（S-001 自作再帰シリアライザに確定／S-002 `minifyHtml(formatHtml(m))===m` の等式テスト・編集を挟んだ往復テスト格上げ／S-003 reducer の ultrahtml 間接化を ADR-003 に追記・初期 html マウント無し前提を AC-1 検証メモへ）を反映。
- **2周目:** arch P-001（化石記述削除）・各 S を反映。両視点とも要修正は P-001 のみで、反映により問題点ゼロに収束。
