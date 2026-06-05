# ADR — Issue #498: inline モードのコードブロック編集体験の向上

## ADR-001: ハイライトはクライアントサイドの表示専用派生、保存 HTML は plain のまま

### Status
Accepted

### Context
読み取り専用ビュー・inline 編集ビューの双方で `<pre><code>` にハイライトを当てる必要がある。ハイライトの実行場所として (1) 保存時 HTML 変換に焼き込む、(2) 描画時に HTML を変換、(3) クライアントでマウント後に DOM へ span 注入、の選択肢がある。

調査で判明した制約:
- `app/core/adapters/sanitizer/htmlSanitizer.ts` は `class`/`span` を許可するが `style` を剥がす。span を保存 HTML に焼いても shiki のインライン色（style）は消える。
- `markdownConverter.ts` は note 本文の保存経路に存在しない（ingestion ジョブと `LegalDocument` のみ）。note の `contentHtml` はエディタ出力をサニタイズしたもの。
- ランタイムは Cloudflare Workers。shiki の WASM/grammar/theme をサーバーでロードするのはコールドスタート・バンドルの負担。
- 読み取りビューは RSC（`dangerouslySetInnerHTML`）。

### Decision
選択肢 3 を採用。読み取り・inline 双方ともクライアント側で `<code>` の `textContent`（plain source）を shiki でトークン化し span を注入する。保存 HTML（`contentHtml`）には span を含めない（ハイライトは表示専用の派生）。動的 `import()` を `useEffect` 内に置き、初期バンドル・Workers バンドルから完全分離する。

### Consequences
- 良い点:
  - sanitizer の `style` 除去と無関係（class ベース・表示専用なので保存しない）
  - Workers バンドル・コールドスタートに影響しない
  - SSR は plain `<pre><code>` を返すためプログレッシブ・エンハンスメント（JS 無効・クロール時も読める）
  - DB に無意味な span 構造が溜まらない
- トレードオフ:
  - ハイドレーション後に一瞬 plain → ハイライトのちらつきが出うる（許容）
  - クライアントで WASM/grammar をロードするコスト（動的 import で初回のみ・best-effort）

---

## ADR-002: inline 編集での MutationObserver 衝突は「`<pre>` opaque 化」＋「focus 中プレーン / 非focus 時装飾」で解決

### Status
Accepted

### Context
shiki が注入する span は #285 で確立した rollback 不変条件と衝突する:
- `classifyRecords` は childList で Element ノード追加を rollback 扱いにする。
- `structureSignature`（ELEMENT_NODE のみ走査）は span の有無で署名が変わり `compositionend` の構造比較ロールバックを誤発火させる。
- `serializeHostContent` がそのまま innerHTML を取ると span が保存 HTML に漏れる。

加えて、span が常駐したまま contentEditable で編集するとキャレットが span 境界で飛び、IME が span 内テキストノードで壊れる。

### Decision
2 つの機構を併用する。

1. **`<pre>` サブツリーの opaque 化**
   - `serializeHostContent`: clone 後に各 `<pre>` を正規化してから innerHTML を取る。`<code>` 子があれば `code` を、無ければ（#285 ADR-001 がカバーする `<pre>直接テキスト</pre>` 構造）`pre` 自身を `textContent` でリセットする（`querySelectorAll("pre")` ベース。`pre code` セレクタだと bare `<pre>` を取り逃すため）。保存 HTML は常に clean な `<pre><code>text</code></pre>` / `<pre>text</pre>`。
   - `structureSignature`: `<pre>` に達したら子孫を辿らない。
   - `classifyRecords`: `target` が `<pre>` 配下なら span の add/remove を allowed にする。例外は `<pre>` 内に厳密に閉じ込め、`<pre>` 外の Element 追加保護は維持。
2. **focus 中プレーン / 非focus 時装飾**
   - `<pre>` に focusin したら当該ブロックをプレーン化（textContent に戻す）して編集。
   - 再ハイライトは **focusout（blur）時のみ** 走らせる（focus 中は常にプレーンという原則と整合させ、IME・キャレット・onChange debounce との干渉を避ける）。手順: キャレットの textContent オフセットを退避 → 再ハイライト → 復元。IME 変換中（`isComposingRef`）は再ハイライトを抑止する。
   - 再ハイライト中は `isHighlightingRef` を立てて observer の自己トリガを抑制する。
   - ハイライト適用対象の解決は serialize の正規化と同じ「`<pre>` 配下の `<code>`、無ければ `<pre>` 自身」基準に揃える。

### Consequences
- 良い点:
  - 保存 HTML への span 漏れを serialize 正規化で構造的に防止（確定要件を満たす）
  - 編集中は単一 textNode なのでキャレット・IME が安定し、#285 の compositionend ロジックがそのまま効く
  - structureSignature が `<pre>` を見ないため誤ロールバックしない
- トレードオフ:
  - キャレット復元（オフセット → Range 解決）の実装が必要。失敗時は `<code>` 末尾へフォールバック
  - focus 単位でハイライトが揮発するため、編集対象ブロックだけ一瞬 plain になる（仕様として許容）

---

## ADR-003: shiki は「sentinel カラーのカスタムテーマ」でトークン種別を 5 class に丸めて出力する

### Status
Accepted

### Context
`app/styles/tokens.css` に `--code-keyword/string/comment/function/number` が定義済み。Issue #397 でこのうち `--code-comment` を除く 4 キーは管理画面でインスタンス単位上書き可能（`BUILTIN_DESIGN_TOKENS` が SSOT）。`spec/design/tokens.md` は Apple Calm 準拠の低彩度配色を正準とし、ダークモードはスコープ外（12節）。

#397 のインスタンス上書きを効かせるには、span の色が**実行時に `var(--code-*)` で解決される**必要がある（hex を焼き込むと上書きが効かない）。よって class ベース（CSS ルールで `color: var(--code-*)`）か `style="color: var(--code-*)"` のどちらか。後者は OK だが、shiki に var() 色を吐かせるのは標準テーマでは不自然で、テーマのカラー正規化と相性が悪い。

問題は **shiki からトークンの「種別」をどう得るか**。`codeToTokens` の基本戻り値は各トークンの `content` と `color`（テーマ由来の色）であって、TextMate スコープ名（`keyword`, `string`, `comment` …）は含まれない。スコープを得る `includeExplanation` はエンジン・バージョン依存でコストもある。色ベースで分類しようにも、標準テーマを使わない以上マッピング元の色が定まらない。

### Decision
**自前の最小カスタムテーマ（sentinel テーマ）** を `highlighter.ts` 内にインラインで定義し、TextMate スコープ群を 5 カテゴリに対応づける。各カテゴリには一意の sentinel hex 色（例 `#000001`〜`#000005`）を割り当てる。テーマの `settings`（scope → foreground マップ）が、そのままスコープ → カテゴリの対応表になる。

```
keyword  : keyword*, storage*, storage.type, keyword.control … → #000001
string   : string*, constant.character, punctuation.definition.string … → #000002
comment  : comment* → #000003
function : entity.name.function, support.function, meta.function-call … → #000004
number   : constant.numeric* → #000005
（上記いずれにも該当しないトークン → 装飾なし＝既定文字色）
```

`highlightCodeElement` は `codeToTokens`（または `codeToTokensBase`）の各トークンの `.color`（= sentinel hex）を、`SENTINEL_TO_CLASS`（`#000001` → `"shiki-token-keyword"` …）で CSS class に変換し、`<span class="shiki-token-keyword">…</span>` を生成する。インライン `style` は使わない。色は `app/styles/index.css` の `.note-detail-content` ブロックで `.shiki-token-keyword { color: var(--code-keyword); }` 等を当てる。

実装上の注意（shiki 4.2.0 のソース確認に基づく）:
- **sentinel hex は小文字で定義し、比較も小文字で行う**。shiki の `applyColorReplacements` は `color.toLowerCase()` で照合し、`normalizeTheme` も色は小文字を前提とする。`#000001`〜`#000005`（数字のみ）は実害ないが、`SENTINEL_TO_CLASS` のキーと token の `.color` 比較は `toLowerCase()` で統一する。
- **sentinel レンジと theme の fg/bg を衝突させない**。sentinel テーマに明示 fg/bg を与える場合、`#000001`〜`#000005` と被らない値にする（被ると「装飾なしのはずのトークン」に class が付く誤爆）。fg/bg を省略すれば shiki が `#bbbbbb` 等を補完し sentinel と衝突しない（`normalizeTheme` は bg/fg 欠落でも throw しない）。
- colorReplacements は設定しない（`.color` に sentinel hex のリテラルがそのまま出る前提）。

この方式はエンジン非依存（`includeExplanation` 不要）・決定的で、scope → category 対応がテーマ定義 1 箇所に集約される。

### Consequences
- 良い点:
  - #397 のインスタンス上書きが効く（class → `var(--code-*)`）
  - 将来 `[data-theme="dark"]` でダークモードに自動追従（tokens.md 12節の方針と一致）
  - Apple Calm の「色を増やさない」方針と整合
  - エンジン・shiki バージョンに依存しない決定的なスコープ → class 解決
- トレードオフ:
  - shiki の細かいトークン分類を 5 種に丸める粒度損失（許容）
  - sentinel テーマの scope リストは代表スコープに限るため、言語によっては装飾されないトークンが出る（plain 文字色で表示、実害なし）

---

## ADR-005: shiki は JavaScript 正規表現エンジン + 個別言語 import で構成し、クライアント限定にする

### Status
Accepted

### Context
ADR-001 で「動的 import を `useEffect` 内に置けば Workers バンドルから分離できる」と決めたが、エンジン・言語セット・テーマ引数・バンドル分離の検証条件が未確定だった（レビュー P-002）。本プロジェクトは `@vitejs/plugin-rsc` + Cloudflare 環境で rsc / ssr / client の 3 環境にコードが分配されるため、`"use client"` だけでは shiki が ssr/worker バンドルに混入しない保証にならない。

### Decision
- **エンジン:** `shiki/engine/javascript`（`createJavaScriptRegexEngine`）を採用し、Oniguruma WASM 依存を回避する。WASM アセットのロード／Cloudflare での取り回しを不要にし、バンドルを軽くする。`forgiving: true` を有効化し、パース不能 grammar での例外を内部吸収する（best-effort 方針と整合）。
- **bundle 構成:** `shiki/core` の `createHighlighterCore` を使い、言語 grammar・テーマは個別 import（fine-grained）。
- **対応言語:** 代表セットを固定リストで持つ（js, ts, tsx, jsx, json, html, css, bash/shell, python, go, rust, sql, yaml, markdown 等）。`language-X` の X がリスト外・無指定なら `plaintext`（装飾なし）にフォールバック。
- **テーマ引数:** `createHighlighterCore` はテーマ必須。ADR-003 の sentinel テーマ 1 つを渡す。
- **クライアント限定の不変条件:** `highlighter.ts` はモジュールトップレベルで shiki を import しない。shiki 本体・grammar・テーマの import はすべて関数内 `await import()` に閉じ込め、呼び出しは `useEffect`（クライアント実行）からのみ。
- **検証条件:** step1 完了時に `pnpm build` 後、**`dist/server`（および `dist/server/rsc`）** に shiki/grammar/onig が混入しないことを grep で確認する（0 件を確認）。`dist/client` には shiki が出てよい（むしろ出るべき）。worker 側出力は `dist/server` 配下。

### Consequences
- 良い点:
  - WASM 不要でバンドル・初期化が単純、Cloudflare 環境での不確実性を排除
  - 初期バンドル・Workers バンドルから完全分離（動的 import + トップレベル import 禁止 + ビルド検証の三点で担保）
  - 言語フォールバックでクラッシュしない
- トレードオフ:
  - JS 正規表現エンジンは一部の複雑な grammar で Oniguruma と微差が出うる（note のコードブロック用途では実害なし）
  - 対応言語は固定リストに限られる（リスト追加は容易、未対応は plain）

---

## 補足: 受け入れ基準と spec のトレーサビリティ

`spec/scenario/authoring.md` の C2 セクションには小項目番号 C2-2 / C2-3 が実在しない（Issue 本文・#285 ADR が参照する番号は spec に無い）。本 Issue の受け入れ基準は authoring.md C2 の実在記述に以下のとおり対応づける:

- **シンタックスハイライト** = C2「装飾済みの要素はその意匠を保ったままインラインで文字を編集」の「意匠（見え）の保持・強化」。
- **Tab インデント** = C2「編集中は構造を壊さない」テキスト編集の範疇（text-only 挿入で構造不変）。

spec 側 C2 にコードブロック編集の受け入れ基準を明文化する追補は本 Issue のスコープ外だが、フォローアップ（Phase 4 起票候補）として残す。

## 補足: ハイライト適用前提（言語クラスの有無）

note 本文の主経路（WYSIWYG / inline 編集）が保存する `<pre><code>` に `language-X` クラスが常に付くとは限らない。`markdownConverter`（ingestion / Legal 経路）は付与するが、エディタ経由では無クラスのこともある。**言語クラスが無い／未対応言語のコードブロックは `plaintext` 扱い（装飾なし）が仕様どおりの正しい挙動**であり、バグではない。色が付くのは言語が解決できた場合に限る。

---

## ADR-004: Tab は `<pre>` 内のみスペース2挿入、`Esc` で blur、`<pre>` 外は従来維持

### Status
Accepted

### Context
#285 ADR-003 は `<pre>` 内 Tab インデントをフォーカストラップ懸念で見送った。本 Issue では「フォーカストラップを避けるエスケープ手段付き」で実装する。タブ文字かスペースか、デデントの要否、エスケープ手段の選択が論点。

### Decision
- `<pre>` 内 Tab（Shift なし）: `preventDefault` + `insertTextAtCaret(host, "  ")`（スペース2、text-only）。
- `<pre>` 内 Shift+Tab: 行頭の連続スペース最大2を除去（text-only、初版は単一行のみ）。
- `<pre>` 外 Tab: 従来どおり `preventDefault`（フォーカスを次ブロックへ逃さない）。
- `<pre>` 内 `Esc`: host の contentEditable から `blur()`。フォーカストラップの確定的なエスケープ手段。

### Consequences
- 良い点:
  - `Esc` blur で ADR-003 の懸念（トラップ）を解消
  - `insertTextAtCaret` 再利用で #285 の text-only 不変条件を維持（rollback を誘発しない）
  - スペースは `white-space: pre` でも幅が予測可能で保存・描画が安定
  - `Esc` blur が focusout 経由で再ハイライトも兼ねる
- トレードオフ:
  - タブ文字派のユーザーには非対応（初版はスペースに寄せる）
  - 複数行一括インデント／デデントは初版除外（過剰スコープ）

---

## 補足: 実装中に確定した非自明な判断

実装時に新たに下した判断（plan.md / 上記 ADR の方針を具体化したもの）:

- **`import.meta.env.SSR` ガードでバンドル分離を実現（ADR-005 の具体化）**。`"use client"` 単独では `@vitejs/plugin-rsc` が client component の SSR 版を生成する際に shiki の動的 import チャンクを `dist/server` に吐く（tiptap が `dist/server/assets/NoteEditor-*.js` に出るのと同じ挙動）。動的 import を `if (import.meta.env.SSR) return;` の後段に置くと Vite が SSR/RSC ターゲットでこの分岐を tree-shake し、shiki の core/engine/grammar/highlighter チャンクが `dist/server` から完全に消える。`CodeHighlight.tsx` の `useEffect` と `InlineEditor.tsx` の `highlightPre` の双方に適用。
- **grep 検証の CSS 例外**。`grep -rl "shiki" dist/server` は `dist/server/.../index-*.css` を 2 件ヒットする。中身は `.shiki-token-*` の **クラス名のみ**（`app/styles/index.css` の配色ルール）で、shiki ライブラリ/grammar/onig コードは一切含まない。サーバー描画する HTML の配色 CSS は出力されるべきものなので、これは想定どおり。shiki の JS（core/engine/langs/highlighter）は `dist/client` のみに出る。
- **`@shikijs/langs` を直接依存に追加**。fine-grained な `import("@shikijs/langs/<lang>")` を解決するため。shiki 経由の推移的依存はホイストされず解決できなかった。core/engine は public subpath（`shiki/core` / `shiki/engine/javascript`）でそのまま解決できる。
- **キャレット復元は textContent オフセット方式**。focusout 再ハイライト時、対象ブロック内のキャレットを `Range` の文字数オフセットで退避し、再ハイライト後に `TreeWalker` で同オフセットへ復元（解決不能時は末尾フォールバック）。
- **#285 テストの契約変更**。`<pre>` 内への要素挿入を rollback する #285 テストは ADR-002（`<pre>` opaque 化）により挙動が変わるため、「live DOM では span が残るが serialize で除去され保存 HTML には漏れない」契約を検証するテストへ更新した。`<pre>` 外の要素挿入 rollback 保護は別テストで維持を確認。

---
