# 実装計画 — Issue #198: エラー UI の設計成果物化 (spec/design)

**Issue:** #198
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

`spec/design/pages/` の認証系ページ（P01-signup / P01b-admin-setup / P03-login）にエラー状態バリアントを HTML モックとして追加し、実装側 `errorDisplay.ts` が実際に扱うエラー種別をビジュアル化する。`spec/design/tokens.md` / `app/styles/tokens.css` に不足するエラー関連トークンがあれば補う。設計成果物としてデザインレビューを通した状態で完成させる。

後続実装 Issue #201 がこのモックを参照して `app/components/auth/` を整える前提。本 Issue は**設計成果物（HTMLモック + デザイントークンドキュメント）の作成に限定**し、`app/` の React 実装には一切触れない。

## スコープ

### 含まれるもの
- `spec/design/pages/P01-signup.html` / `P01b-admin-setup.html` / `P03-login.html` のエラー状態バリアント追加
- 必要に応じて `spec/design/tokens.md` / `app/styles/tokens.css` のエラー関連トークン追記（色・アイコン・スペーシング）
- デザインレビューゲート（critique → clarify → harden → audit → polish）の適用と記録

### 含まれないもの
- 実装変更（別 Issue #201 で対応）
- 上記 3 ページ以外のフォーム設計（後続 Issue で横展開）
- `errorDisplay.ts` の文言変更（文言変更提案が出た場合は #201 への申し送りに留める）
- validation field hint の日本語化（現行 Zod は英語デフォルトを出力。モックは「あるべき」日本語 hint を設計提案として置くに留め、実装は #201 申し送り）

## カバーするエラーケース

- **validation エラー**: `fieldErrors` が付いた状態（field 直下のエラー＋必要なら summary）
- **conflict（なし版 / fallback）**: フィールド非紐付けの汎用 summary callout（「フォーム全体で衝突」、現実装の既定）
- **conflict（あり版）**: field 直下表示の設計提案（列挙攻撃リスクを踏まえた採否は #201 に委ねる旨をファイル内コメントで明記）
- **unauthorized 特殊 callout**: P01b の Setup Token 不一致、P03 の「未認証」＋確認メール再送ボタン
- **system / unknown**: 汎用エラー callout（メッセージは抽象化されたまま）
- **入力保持**: フィールドに前回値が残っている状態（視覚的シグナルは過剰演出を避ける）

## 調査結果

- **関連ファイル**
  - `spec/design/pages/P01-signup.html` / `P01b-admin-setup.html` / `P03-login.html` — 編集対象。現状はいずれも成功状態の単一フォームのみ。ただし CSS には既にエラー用クラスが定義済み:
    - 3ファイル共通: `.field.has-error .input`（`--color-error-surface` 背景 + `inset 0 0 0 1px --color-error` リング）、`.field.has-error .field-hint`（赤文字）
    - P01b のみ: `.form-error`（フォームレベルエラー callout、`role="alert"` の実例が既に1つ存在）、`.callout`（info 系）
    - P03 のみ: `.callout`（warning-surface ベースの「未確認」callout + `.callout-action` 再送ボタンの実例が既に存在、現状 `role="status"`）
  - `app/core/presentation/errorDisplay.ts` — エラー本文文言のソース。`renderErrorMessage(error)` が `kind` で分岐（validation / conflict / unauthorized / system / unknown）。conflict は `renderConflictMessage`（`UNIQUE_VIOLATION`→「すでに登録されています」等、フィールド非紐付けの汎用文言）。unauthorized の本文は「認証が必要です」。
  - **文言の真実の所在は2系統**（レビュー反映）: callout の `<strong>` プレフィックス（SignUp/Admin=「登録に失敗しました。」/ Login=「ログインできませんでした。」/ setup token=「Setup Token が正しくありません。」+「値を確認してもう一度入力してください。」）は **各 `*Form/index.tsx` のJSXにハードコード**されており `errorDisplay.ts` には存在しない。後段の本文（UNIQUE_VIOLATION→「すでに登録されています」、system→「システムエラーが発生しました」、unauthorized→「認証が必要です」）が `errorDisplay.ts` 由来。モック作成時は **プレフィックス=form 由来 / 本文=errorDisplay 由来** として両方を現実装どおり一字一句転記する。
  - `app/components/auth/{SignUpForm,AdminSignUpForm,LoginForm}/index.tsx` — 実装の実エラー UI パターン。field エラーは `aria-invalid` + `data-error=""` を input に付け hint を赤文言化。conflict は実装上 summary 経路（`FORM_ERROR` callout, `role="alert"`）でフォーム全体に出る。P01b は unauthorized の `invalid_setup_token` / `setup_token_disabled` を `.form-error` で出し setupToken field にも `has-error` 付与。P03 は unauthorized の `unverified` を warning callout（再送ボタン付き）で出し、email は `defaultValue` で入力保持。
  - `app/components/auth/styles.ts` — 実装の Tailwind 文字列 SSOT（`FORM_ERROR`, `FIELD_HINT_ERROR` 等）。HTML モックの CSS クラスと一対一対応。

- **あるべきデザイン規約**（`index.md` / `tokens.md`）
  - HTML 試作は単一ファイルでブラウザ表示可能、CSS はインライン、`:root` トークンは `tokens.md` の正準定義をコピー、ローカル短縮名は使わずトークン正式名を使う。
  - アイコンは Lucide 風 1.5px ストローク `currentColor`、装飾は `aria-hidden="true"`、意味を持つ場合は `aria-label`。
  - フォーカスは `:focus-visible` で `--shadow-focus`。コントラスト AA 以上。エラー文言は「何が起きたか + 何をすればいいか」の2部構成。`aria-live` は通常 `polite`、エラー即時通知のみ `assertive`。文言は `errorDisplay.ts` を真実とする。トーンは Apple Calm（淡色セマンティック、強い赤・黄を多用しない）。

- **既存実装の状態**
  - エラー状態のビジュアル設計は3ページとも未整備（成功状態のみ）。ただし P01b と P03 の CSS には既にエラー要素クラスと実例が部分的に存在し、正規パターンの雛形になる。P01-signup には field-error CSS はあるが実例（バリアント）が無い。
  - **トークンは充足**: `--color-error`（#c43e3e）/ `--color-error-surface`（#fbebeb）/ `--color-warning` 系が定義済み。エラー callout のスペーシングも既存 `--space-*` で表現可能。新規トークン追加は原則不要。

- **依存関係**: 本変更は HTML モック + （必要なら）`tokens.md` / `tokens.css` のみ。後続実装 Issue #201 がこのモックを参照する前提。レビュー記録の出力先は `spec/design/review/`（次番号は要確認）。

## 実装ステップ

### 1. モック配置方針を確定し、ベースを用意

- **対象ファイル:** `spec/design/pages/P01-signup.html` / `P01b-admin-setup.html` / `P03-login.html`
- **変更内容:** 各ファイルの成功状態 `<main class="auth-shell">` ブロックの後（`<body>` 末尾内）に、エラーバリアントを `<main>` ブロックとして追記する。各バリアントの先頭に `--color-ink-tertiary` の小さなキャプション見出しで「どのエラーケースか」を識別できるラベルを置く。既存の成功状態ブロックはそのまま残し、その下に並べる。
- **理由:** §9「単一ファイルでブラウザ表示可能」「同じマークアップを各ページに貼る」規約と「成功状態と並べて視覚的一貫性を確認」確認方法に最も素直に沿う。

### 2. P01-signup.html にエラーバリアントを追加

- **対象ファイル:** `spec/design/pages/P01-signup.html`
- **変更内容:**
  - (a) **validation エラー**: username / password に `.field.has-error`、hint を赤文言に差し替え、input に `aria-invalid="true"`。フィールドには前回値（`value="..."`）を残す（入力保持）。
  - (b) **conflict — なし版（fallback）**: フォーム末尾に `.form-error`（`role="alert"`）。文言は `errorDisplay.ts` の `UNIQUE_VIOLATION`「すでに登録されています」+ summary プレフィックス（実装の `SignUpForm` と一致）。field は無印。
  - (c) **conflict — あり版**: email field に `.field.has-error` + 赤 hint（設計提案。列挙攻撃の判断は #201 に委ねる旨ファイル内コメント）。
  - (d) **system / unknown 汎用エラー**: `.form-error`（`role="alert"`）で「システムエラーが発生しました」/「エラーが発生しました」（抽象化維持、リトライ訴求の一文を添える）。
- **理由:** P01 は field-error CSS はあるが実例が無い。P01 に未定義の `.form-error` クラスは P01b の定義を `<style>` にコピーして使う。

### 3. P01b-admin-setup.html にエラーバリアントを追加

- **対象ファイル:** `spec/design/pages/P01b-admin-setup.html`
- **変更内容:**
  - (a) **validation エラー**（username / email / password / setupToken の field 直下エラー + 入力保持）
  - (b) **unauthorized 特殊 callout — Setup Token 不一致**: `.form-error`（`role="alert"`）+ setupToken field の `has-error` を独立バリアントとして整理。文言は実装の2分岐（`invalid_setup_token`→「Setup Token が正しくありません。」/ `setup_token_disabled`→「Setup Token が設定されていません。」）両方を示す。
  - (c) **conflict（なし版 / あり版）** と **system / unknown** を P01 と同じ要領で追加。
- **理由:** P01b は特権操作ページで unauthorized callout が中核。実装の `AdminSignUpForm` の `isSetupTokenError` 分岐に対応するビジュアルを正規化する。

### 4. P03-login.html にエラーバリアントを追加

- **対象ファイル:** `spec/design/pages/P03-login.html`
- **変更内容:**
  - (a) **validation エラー**（email / password の field 直下エラー、email は入力保持 `value`）
  - (b) **unauthorized — 認証失敗（汎用）**: `.form-error`（`role="alert"`）。プレフィックス「ログインできませんでした。」（form 由来）+ 本文「認証が必要です」（errorDisplay 由来、現実装どおり転記）。「ユーザー存在 vs パスワード違い」を判別させない抽象化を維持（Issue 制約）。email 入力保持。clarify ゲートで合成文の違和感を検出した場合も文言変更は #201 申し送りに留める。
  - (c) **unauthorized — 未認証 + 確認メール再送**: 既存の `.callout`（再送ボタン付き）を正規バリアントとして整理。**配色は実装（neutral surface + accent アイコン）に合わせる**（ADR-004 参照）。`role` はエラー（assertive）か案内（polite）かで使い分け、未認証案内は `role="status"`（polite）を維持。再送ボタンは実装に合わせ `<button type="button">` で表現する。
  - (d) **system / unknown 汎用エラー**。
- **理由:** P03 は unverified callout が中核。実装の `LoginForm` の `isUnverified` 分岐 + summary 経路の両方をビジュアル化する。

### 5. トークン確認・必要なら最小追記

- **対象ファイル:** `spec/design/tokens.md` / `app/styles/tokens.css`
- **変更内容:** 3ページのエラー UI が既存 `--color-error` / `--color-error-surface` / `--color-warning` 系と `--space-*` で完結することを確認。充足していれば追記しない（現状の調査では充足）。不足が出た場合のみ `tokens.css` に追加 → `tokens.md` §1.3 表に同名で追記 → HTML の `:root` にもコピー（§9 規約）の3箇所同時更新を必須とする。
- **理由:** Issue は「不足があれば補う」が条件。盲目的追加はトークンの SSOT を汚すため避ける。

### 6. デザインレビューゲートを順に適用し、指摘を反映

- `critique`（階層・情報設計・感情トーン）→ `clarify`（マイクロコピー・field 名ローカライズ・行動指示の有無）→ `harden`（長文・i18n・テキストオーバーフロー・エッジケース）→ `audit`（`role="alert"` / `aria-invalid` / フォーカス管理 / レスポンシブ）→ `polish`（アラインメント・スペーシング・一貫性）の順。
- 各ゲートの主要指摘と反映内容を `spec/design/review/005.md`（既存 001〜004 を確認済み、次番号は 005）に記録する。

### 7. 検証

- 3つの HTML をブラウザで開き、全バリアントが意図通り表示・成功状態と視覚的に一貫しているかを目視。
- レスポンシブ（<640px で折り返し・44px タップ領域維持）、a11y（aria-invalid / role / フォーカスリング）、長文・i18n を確認。
- トークンを追記した場合のみ `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。

## 設計判断

詳細は adr.md を参照。

- **モック配置方針** → 同一ファイル末尾に variant として並べる（`error-states/` 分離はしない）。
- **トークン追加は原則不要**。既存 error/warning 系 + space/radius で全ケース表現可能。エラーアイコンは Lucide 風線画 SVG を `currentColor` でインライン描画でき専用トークン不要。
- **conflict あり版の field 開示**はビジュアルのみ提示し、採否は #201 に委ねる旨をファイル内コメントで明記。
- **抽象化の維持**: system / unknown / login 認証失敗は抽象文言のまま。`errorDisplay.ts` の文言を一字一句のソースにする。

## リスクと注意点

- **実装との文言ドリフト**: モックの文言は `errorDisplay.ts` および各 form コンポーネントの現行文言と完全一致させる。`clarify` ゲートで文言を変えたくなった場合は #201 への申し送りに留める。
- **`role` の選択**: 未認証 callout は「次の行動案内」なので `status`（polite）が妥当な場合がある。audit ゲートで一律 alert 化せず、エラー（assertive 通知が要る）か案内（polite）かで使い分ける。
- **入力保持の過剰演出回避**: 前回値は `value` を残すだけで、ハイライト等の追加視覚シグナルは付けない。
- **CSS クラスの重複定義**: P01-signup には `.form-error` が未定義。P01 / P03 に callout を足す際は P01b の定義を該当ファイルの `<style>` にコピーする。
- **トークン変更時のみ** `pnpm` 系コマンドが意味を持つ。

## テスト方針

- 目視確認が中心（HTML モック）。3ファイルをブラウザで開き各バリアントの描画と成功状態との一貫性を確認。
- レスポンシブ確認（<640px）。
- a11y 目視（aria-invalid / role / aria-live / フォーカスリング）。
- 長文 / i18n（harden ゲート）でオーバーフロー無し。
- トークン追記時のみ `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**要件カバレッジ視点 / アーキ・リスク視点ともに「問題点（要修正）ゼロ」** を報告。修正必須の誤りなし。両視点が指摘した改善提案を以下のとおり計画に反映した。

**取り込んだ改善提案**:
- S（文言の所在）: callout プレフィックスは form コンポーネントのハードコード、本文は `errorDisplay.ts` 由来という2系統であることを調査結果に追記。モックは両方を現実装どおり転記する方針を明記（ステップ2(b)/4(b)）。
- S（login 認証失敗の実体）: unauthorized 本文の実体が「認証が必要です」であることを明記し、合成文に違和感があっても文言変更は #201 申し送りとする方針をステップ4(b)に追記。
- S（P03 callout 配色乖離）: 既存モック=warning 配色 / 実装=neutral+accent の乖離を ADR-004 として記録し、実装側（neutral+accent）を正準とする決定をステップ4(c)に反映。
- S（再送ボタン要素）: 実装が `<button type="button">` のため、モックも button で表現する方針をステップ4(c)に反映。
- S（レビュー番号）: `spec/design/review/` の次番号を 005 に確定（ステップ6）。

**見送った提案とその理由**: なし（提案はいずれもスコープ内かつ計画の忠実度を高めるもので全て取り込んだ）。
