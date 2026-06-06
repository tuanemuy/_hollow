# 実装計画 — Issue #493: note-content パイプラインの adapter 命名是正 + markdown-it / ultrahtml への置き換え（#276 内包）

**Issue:** #493
**作成日:** 2026-06-06
**複雑度:** 中〜大規模

---

## 目的

note-content パイプライン（Markdown → HTML → Sanitize）の 2 adapter を、自作実装から実ライブラリ（`markdown-it` + `markdown-it-attrs` + `markdown-it-anchor` / `ultrahtml`）へ置換し、クラス名を命名規約 `<Provider><PortName(省略なし)>` に是正する。port のシグネチャ・戻り値・`removed` 監査・`toPlainText`・`SAFE_URL_SCHEMES`・`on*` 除去・`[[wikilink]]` verbatim 保持を完全維持したうえで、`{#id}` 見出しアンカー（Issue #276）を標準プラグインで実現し、`about.md` / `LandingPage` のアンカー深リンクを復活させる。

## スコープ

### 含まれるもの

- `markdown-it` / `markdown-it-attrs` / `markdown-it-anchor` 依存追加、`markdownConverter.ts` を本物の markdown-it 実装に置換、クラス名 `MarkdownItConverter` → `MarkdownItMarkdownConverter`
  - port `MarkdownConverter.toHtml(markdown): Promise<string>` のシグネチャ維持
  - `{#id}` 見出しアンカー対応（Issue #276 要件）
  - `[[wikilink]]` verbatim 保持
- `ultrahtml` 依存追加、`htmlSanitizer.ts` を ultrahtml ベースに置換、クラス名 `SanitizeHtmlSanitizer` → `UltrahtmlHtmlSanitizer`
  - port `HtmlSanitizer.sanitize` / `toPlainText` のシグネチャ・戻り値（`{ html, removed }`）維持
  - `SanitizePolicy`（`allowMedia` / `allowInternalLinks`）挙動維持
  - `id` 属性を見出し（h1–h6）に許可
  - `SAFE_URL_SCHEMES` による URL スキーム制限・`on*` 除去を自前維持
  - `removed: SanitizeRemoval[]` 監査ログを AST walk で再現
- DI 配線・テスト helper のリネーム反映（**全 5 か所** — Issue 本文列挙の 2 か所に加え `d1/__tests__/helpers.ts` / `wysiwygSanitizerIntegration.test.ts`）
- ユニットテスト追加（`{#id}` あり/なし/不正、CommonMark 主要記法、サニタイズ allow-list、`toPlainText` ラウンドトリップ、`removed` 監査）
- `app/content/legal/about.md` の見出しに `{#commerce}` `{#contact}` を再導入、`LandingPage.tsx` フッターを `hash` 付きリンクに復活（Issue #276 最終目的）

### 含まれないもの

- フォルダ名の変更（`markdown/` `sanitizer/` は現状維持）
- Markdown のリッチ拡張（footnote、definition list 等、`{#id}` 以外）
- `SanitizePolicy` のポリシー項目自体の追加・変更
- サーバ側（非 edge）adapter グループの新設（DOMPurify 採用はその時に検討）
- sanitizer の `id` 許可範囲の厳格化（現行 `GLOBAL_ATTRS` 全タグ許可を維持。h1–h6 限定化は回帰リスクのためスコープ外）

## 実装ステップ

### 1. 依存追加

- **対象ファイル:** `package.json`（+ `pnpm-lock.yaml`）
- **変更内容:** `dependencies` に `markdown-it` / `markdown-it-attrs` / `markdown-it-anchor` / `ultrahtml` をバージョン pin。`devDependencies` に `@types/markdown-it`。pnpm でインストール。
- **理由:** 実ライブラリ導入が本筋。ultrahtml はセキュリティ実績が薄めなので pin（Issue 注意点）。

### 1.5. ライブラリ実 API / Workers バンドルの PoC ゲート（ステップ2/3 着手前に必須）

- **対象:** 使い捨ての PoC スクリプト or 最小テスト
- **変更内容:** 実装本体に入る前に、以下を実測して設計を確定する。結果を adr.md に反映する。
  - **[markdown]** `markdown-it` + `markdown-it-attrs` 単独で `## X {#commerce}` → `<h2 id="commerce">` が出るか確認。出るなら `markdown-it-anchor` は**依存から落とす**（permalink も自動 slug も不要なため、attrs 単独で要件を満たすなら anchor は不採用）。出ない／明示 id を anchor が上書きする場合のみ anchor を採用し、「attrs の明示 id を尊重し id 無し見出しには付与しない」設定を確定して記録。
  - **[markdown]** `markdown-it` だけを import して `pnpm build` が Workers ターゲットで通るか（`node:*` built-in 解決エラー・workerd 非許可挙動が出ないか）。この repo は全 Worker で `nodejs_compat` 有効。build 通過を markdown adapter 実装のゲート条件にする。
  - **[markdown]** `[[target]]` / `[[id|display]]` を素の markdown-it に通し、literal verbatim（`[` `]` がエスケープされない）で残るか確認。少しでもエスケープ（`&#91;` 等）が挟まれば `md.inline.ruler.before` でカスタムルールを入れる方針に倒す（ADR-006）。
  - **[sanitizer]** ultrahtml の実 API を確認: `parse()` が返すノード形状・`attributes` 表現、`walk` の可変性（除去可否）、`render()` の入力契約と**出力フォーマット**（属性の引用符・順序・void 要素 `<img>` の閉じ方）。`walk` がツリー変異を安定サポートしないなら、`removed` 収集は「`children` を再帰的に組み替える自前 transform（許可ノードだけ新ツリーに積む）」として設計する。
  - **[sanitizer]** render 後の媒体 `<img>` 出力に `service.ts` の `mediaPattern`（`/<(?:img|video|source)[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi`）が実マッチするか確認。崩れる場合はサニタイザ側で媒体タグ出力を期待形に寄せる後処理を入れる（domain 層の正規表現は port 互換最優先のため変更しない）。
- **理由:** ライブラリの実 API・出力・バンドル挙動を実測しないと 2/3 の設計が確定せず手戻りが出る（レビュー [P-001]〜[P-004]）。
- **成果物の扱い:** PoC の検証内容（media 正規表現マッチ・wikilink verbatim・attrs 単独可否・`{#id}`）は捨てずにステップ5のユニットテスト assert へ昇格させ、リグレッションガードとして残す。

### 2. markdown adapter の置換 + リネーム

- **対象ファイル:** `app/core/adapters/markdown/markdownConverter.ts`
- **変更内容:**
  - 自作パーサ全体を削除し `markdown-it` インスタンスを構築。`{ html: false, linkify: false, typographer: false }` の保守的設定（`html:false` で生 HTML 注入防止、後段 sanitizer と多層防御）。
  - `.use(markdownItAttrs, { allowedAttributes: ["id"] })` で **`id` のみ**許可（class・任意属性は不可）。
  - **`markdown-it-anchor` は PoC（ステップ1.5）結果に従う** — attrs 単独で `{#id}` 要件を満たすなら不採用、採用する場合は明示 id 尊重・自動 slug 抑制の確定設定で `.use()`。`permalink` なし。
  - id 値は `^[A-Za-z][A-Za-z0-9_-]*$` で検証し不正なら id を捨てる（XSS 観点）。`markdown-it-attrs` の `allowedAttributes` で id のみに絞ったうえ、値検証は render 後の id 文字列を見るか attrs ルールをラップして担保。
  - クラスを `MarkdownItMarkdownConverter implements MarkdownConverter` にリネーム。`toHtml` の `try/catch` → `SystemError(DataIntegrityError)` 包みは維持。`async` のまま。
- **理由:** 命名是正 + 実ライブラリ化 + `{#id}` 対応。
- **検証必須:** `[[wikilink]]` verbatim、`class="language-xxx"` 出力（CodeHighlight 互換）、`{#id}` あり/なし/不正、CommonMark 主要記法。**legal docs は terms.md / privacy.md も同じ `LegalDocument` パイプラインを共有するため、明示 `{#id}` の無い既存見出しに id が付かない（自動 slug 注入回帰がない）ことをテストで pin する。**

### 3. sanitizer adapter の置換 + リネーム

- **対象ファイル:** `app/core/adapters/sanitizer/htmlSanitizer.ts`
- **変更内容:**
  - 自作トークナイザを削除。`ultrahtml` の `parse` でツリーを取得し、**`children` を再帰的に組み替える自前 transform（許可ノードだけ新ツリーに積む / 属性をフィルタする）**で走査して `render` で再シリアライズ。`walk` はツリー変異を安定サポートしない前提で設計する（PoC で確定）。
  - 既存 allowlist 定数（`BLOCK_TAGS` / `INLINE_TAGS` / `MEDIA_TAGS` / `GLOBAL_ATTRS` / `ATTR_ALLOW` / `VOID_TAGS` / `SAFE_URL_SCHEMES`）と判定関数（`isAllowedTag` / `isAllowedAttr` / `isSafeUrl`）はそのまま流用。
  - 自前 transform で `removed` を再現。`reason === "disallowed tag"` の正確な文字列は wysiwyg テストが依存するため維持。
  - **render 後の媒体 `<img>` 出力が `service.ts` の `mediaPattern` にマッチすることをユニットテストで pin**。崩れる場合は媒体タグ出力を期待形に寄せる（ADR-007）。
  - `on*` 除去・`isSafeUrl` 検査を walk 内で実施（XSS 防御の中核、ライブラリに委ねない）。
  - `toPlainText`: 現行の正規表現ベース実装をそのまま維持（`NoteSnapshot.plainBody` の FTS/embeddings 出力互換のため）。
  - クラスを `UltrahtmlHtmlSanitizer implements HtmlSanitizer` にリネーム。`SystemError` 包み維持。`ContentHtml.create(...)` で lift。
- **理由:** 命名是正 + 実ライブラリ化。防御層（URL/on*）は自前維持（Issue 明記）。

### 4. DI 配線・テスト helper のリネーム反映（5 か所）

- **対象ファイル:**
  - `app/core/application/di/serverCloudflare.ts`（import / `new` 586-587）
  - `app/core/application/__tests__/helpers.ts`（128-129）
  - `app/core/adapters/d1/__tests__/helpers.ts`（110-111）
  - `app/components/note/editor/__tests__/wysiwygSanitizerIntegration.test.ts`（import / `new SanitizeHtmlSanitizer()` 複数箇所）
- **変更内容:** import と `new` を新クラス名に置換。**adapter 側のクラス宣言だけでなく `export { MarkdownItConverter }`（`markdownConverter.ts:266`）/ `export { SanitizeHtmlSanitizer }`（`htmlSanitizer.ts:437`）の named export 文も同時にリネームする**（漏れると import 側が解決できない）。
- **理由:** リネームの全参照追従。**Issue が列挙していない後 2 つも対象**（漏らすと typecheck 失敗）。

### 5. ユニットテスト追加

- **対象ファイル（新規）:** `app/core/adapters/markdown/__tests__/markdownConverter.test.ts` / `app/core/adapters/sanitizer/__tests__/htmlSanitizer.test.ts`
- **変更内容:**
  - markdown: `{#id}` あり（`<h2 id="...">`）/ なし / 不正 id（id 捨て）、CommonMark 主要記法（heading/list/ol/quote/fence with `language-`/hr/inline bold/italic/code/link）、`[[wikilink]]` / `[[id|display]]` verbatim 保持。
  - sanitizer: allow-list（許可タグ通過・非許可タグ `disallowed tag` 除去）、`on*` 除去、`SAFE_URL_SCHEMES`（javascript:/data: 除去、http/https/mailto/相対許可）、見出し `id` 許可、`toPlainText` ラウンドトリップ、`removed` 監査。
- **理由:** 既存にユニットテストが無く、置換の回帰防止が必須。Issue 要件。

### 6. about アンカー復活（Issue #276 最終目的）

- **対象ファイル:**
  - `app/content/legal/about.md`: `## 特定商取引法に基づく表記` → `{#commerce}` 付与、`## お問い合わせ` → `{#contact}` 付与。
  - `app/components/landing/LandingPage.tsx`: フッターの該当 `<Link to="/about">` に `hash` を付与。**repo の既存慣習に合わせ関数形式 `hash={() => "commerce"}` / `hash={() => "contact"}` を使う**（文字列形式 `hash="..."` は repo 内に実例ゼロ。`UploadDialog.tsx` 等は `hash={() => ...}`）。
- **理由:** ADR-011 で暫定的に外したアンカーを `{#id}` 対応完了に伴い復活。
- **検証:** about ページ描画後 HTML に `<h2 id="commerce">` / `<h2 id="contact">` が出ること。

### 7. 品質ゲート + バンドル検証

- **対象:** 全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`、`pnpm build`（Workers ターゲットで Node 専用 built-in を引かない・bundle size 確認）。
- **理由:** Issue 必須条件。

## 設計判断

詳細は `.issue/493/adr.md` を参照。要点:

- `toPlainText` は現行正規表現実装を流用（FTS/embeddings 出力互換のため）
- `removed` の reason はカテゴリ一致で設計（`"disallowed tag"` のみ正確一致厳守、malformed 系はカテゴリ検証）
- markdown-it-attrs は `id` のみ・anchor は permalink なし・id 値は正規表現で厳格検証
- sanitizer の `id` 許可範囲は現行（全タグ許可）維持
- `[[wikilink]]` はまず素の markdown-it 挙動を検証、変形時のみカスタムルール

## 現行挙動の精読結果（新ライブラリでの再現方針）

### 1. `removed: SanitizeRemoval[]` 監査ログ

現行が記録する `reason`: `"unterminated comment"` / `"invalid tag"` / `"unmatched close"` / `"disallowed tag"` / `` `disallowed attribute: ${attr}` `` / `` `event handler stripped: ${attr}` `` / `` `unsafe URL scheme: ${attr}` ``。

→ ultrahtml `parse()` のツリーを**自前再帰 transform**で組み替える（`walk` は除去非対応の前提）。(a) タグ allowlist 判定で非許可なら element をツリーから外し（子は方針に応じて昇格 or 破棄）`{tag, reason:"disallowed tag"}` を push、(b) 許可タグなら属性検査で非許可 / `on*` / unsafe URL を落とし対応 reason を push。許可ノードだけ新 `children` に積み `render()` で再シリアライズ。wysiwyg テストが `reason === "disallowed tag"` の正確一致を要求するので厳守。malformed 系 reason は ultrahtml の修復方針差で完全一致が難しく、カテゴリで検証。`render()` の出力フォーマット（引用符・void 要素の閉じ方）は媒体抽出契約に効くため PoC で確定。

### 2. `toPlainText`

現行: `html.replace(/<[^>]*>/g, " ")` → entity decode → whitespace collapse + trim。
→ **現行ロジックをそのまま流用**（挙動完全一致を保証、`NoteSnapshot.plainBody` 互換維持）。

### 3. `SAFE_URL_SCHEMES` + `on*` 除去

`SAFE_URL_SCHEMES = {http, https, mailto}`。`isSafeUrl` は相対 URL（`/` `#` `?` `.` 始まり・colon なし）を許可し scheme allowlist 照合。`on*` は無条件除去。
→ ほぼそのまま移植（ultrahtml は URL 検証しないため自前防御必須）。

### 4. `[[wikilink]]` verbatim 保持

`service.ts:58` の `INTERNAL_LINK_PATTERN = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g` が**サニタイズ後 HTML 文字列**に直接 `matchAll`。`/media/<id>` 抽出も同様。
→ markdown-it は `[[...]]` を対応 `](url)` 無しでテキスト出力（`[` `]` を HTML エスケープしない）。デフォルトで verbatim 保持される見込み。素の挙動をテストで確認し、変形時のみ `md.inline.ruler` カスタムルールで対処。

## リスクと注意点

- **Workers バンドル**: markdown-it は entities / linkify-it / mdurl / punycode.js / uc.micro 等を引く。`pnpm build` で Node 専用 built-in 解決エラーが出ないか確認。出たら vite resolve / `nodejs_compat`（wrangler.toml）で対処検討。
- **ultrahtml のパース修復差**: malformed HTML への振る舞いが現行と異なる。wysiwyg 統合テストの `disallowed tag` 空配列契約と `/media/<id>` 抽出（サニタイズ後）が崩れないことを最優先で検証。
- **`[[wikilink]]` 回帰**: 崩れると `service.extractMetadataFromHtml` の内部リンク抽出が全滅。ユニット + 統合の両方で literal 残存を確認。
- **about.md の `{{siteName}}` × markdown-it-attrs**: `{{...}}` が `{ }` デリミタと衝突しないか確認。`applyAboutSubstitutions` は変換**前**に置換するので変換時点で attrs 対象は `{#commerce}` のみ。テストで確認。
- **`language-xxx` クラス保持**: markdown-it フェンスコードは `class="language-xxx"` 出力。sanitizer の `class` global attr で保持され `CodeHighlight` が機能することを確認。
- **id 衝突 / 日本語見出し / 共有パイプライン回帰**: markdown-it-anchor を採用する場合、デフォルト slugify が日本語見出しに空 id や encodeURI を生む可能性。`LegalDocument` は about.md だけでなく **terms.md / privacy.md でも共有**されるため、自動 slug 注入は 3 ページに回帰が及ぶ。明示 `{#id}` のみ id を持つことをテストで pin する（ADR-003 では attrs 単独採用を優先し anchor 不採用なら本リスク自体が消える）。
- **ultrahtml の `render()` 出力フォーマット差**: `service.ts` の `mediaPattern` / `INTERNAL_LINK_PATTERN` はサニタイズ後文字列に正規表現を当てる。引用符・属性順・void 要素の閉じ方が現行と乖離すると媒体抽出が壊れる。PoC で出力を確認し、必要ならサニタイザ側で期待形に寄せる（ADR-007、domain 正規表現は変えない）。

## テスト方針

- `pnpm test:unit`: 新規 markdown / sanitizer ユニットテスト + 既存 `wysiwygSanitizerIntegration.test.ts`（リネーム後も全 assert 通過）。
- `[[wikilink]]` ラウンドトリップ: markdown → toHtml → sanitize 連鎖出力に `[[target]]` / `[[id|display]]` が literal で残り `INTERNAL_LINK_PATTERN` でマッチ。`allowInternalLinks` の true/false 両経路で差が出ないことも確認。
- `{#id}`: `## X {#commerce}` → sanitize 後 `<h2 id="commerce">`、不正 id 無視を検証。terms.md / privacy.md の既存見出しに id が自動付与されない回帰テスト。
- 媒体抽出契約: sanitize 後の `<img>` 出力に `service.ts` の `mediaPattern` がマッチすることを pin。
- `removed` 監査: 新規 sanitizer テストでは malformed 系 reason は「除去された事実 + カテゴリ」で assert し、ultrahtml 修復差で自テストが落ちないようにする（厳密文字列一致は `disallowed tag` のみ）。
- `pnpm typecheck && pnpm lint:fix && pnpm format`: 5 か所のリネーム追従と整形。
- `pnpm build`: Workers ターゲットで Node 専用 built-in を引かず、worker bundle サイズの before/after を記録して増分が許容範囲であることを確認。
- 手動: `pnpm dev` で `/about` を開き、フッターの「特定商取引法」「お問い合わせ」リンクが `#commerce` / `#contact` へスクロール遷移。

## レビュー履歴

### 1周目

**修正した点**:
- [P-001 アーキ] markdown-it-anchor が attrs の明示 id を拾えるかは設定依存。attrs 単独で `{#id}` を満たせるなら anchor 不採用とする方針に変更。ステップ1.5（PoC）で確定するよう plan/ADR-003 を修正。
- [P-002 アーキ] ultrahtml の `walk` はノード除去非対応。`removed` 収集を「自前再帰 transform」に設計変更（ステップ3・精読1・ADR-007 を追加/修正）。
- [P-003 アーキ] Workers バンドル可否を「ビルドで確認」止まりにせず、ステップ1.5 の PoC で `pnpm build` 通過をゲート条件化（ADR-008 追加）。
- [P-004 アーキ] ultrahtml の `render()` 出力フォーマットが `service.ts` の `mediaPattern` 契約を壊すリスク。media `<img>` 出力の正規表現マッチを pin するテストを追加し、崩れる場合はサニタイザ側で期待形に寄せる方針を ADR-007 に明記。

**取り込んだ改善提案**:
- [S-001 要件] terms.md / privacy.md も `LegalDocument` を共有するため、明示 `{#id}` の無い既存見出しに id 自動付与されない回帰テストをステップ2・テスト方針に追加。
- [S-002 要件] `[[wikilink]]` verbatim を `allowInternalLinks` true/false 両経路で確認する旨をテスト方針に追加。
- [S-003 アーキ] 新規 sanitizer テストで malformed 系 reason はカテゴリ assert にする旨をテスト方針に明記。
- [S-004 アーキ] bundle サイズの before/after 記録を ADR-008・テスト方針に追加。
- [S-001 アーキ] `[[wikilink]]` は楽観依存せず、疑わしければカスタムルール採用に倒す方針に ADR-006 を強化。

**見送った提案とその理由**:
- なし（すべてスコープ内の妥当な指摘として取り込み）。

**1周目サマリ**: 要件カバレッジ視点は「問題点ゼロ」。アーキ視点が P-001〜P-004 を提起 → すべて plan/ADR に反映済み。指摘の本質は「ライブラリ実 API/出力/バンドルの未検証前提」であり、ステップ1.5（PoC ゲート）の追加で解消。次周で残課題の有無を確認する。

### 2周目

**両視点とも問題点ゼロで終了。**

**取り込んだ改善提案**:
- [S-001 要件] ステップ4 に「`export { ... }` 文も同時リネーム」（`markdownConverter.ts:266` / `htmlSanitizer.ts:437`）を明示。
- [S-001 アーキ] ステップ6 の `hash` を repo 既存慣習の関数形式 `hash={() => "commerce"}` に変更（文字列形式は repo 内に実例ゼロ）。
- [S-002 アーキ] ステップ1.5 に「PoC をステップ5のユニットテストへ昇格」を追記。

**見送った提案**: なし（すべて取り込み）。

**2周目サマリ**: 要件・アーキ両視点とも問題点ゼロ。1周目の P-001〜P-004 反映が技術的に妥当と確認され、ステップ順序（依存追加→PoC→各 adapter→DI→テスト→about 復活→品質ゲート）も依存関係上正しいと評価。レビューループ終了。
