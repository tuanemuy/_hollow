# 動作確認計画 — Issue #198: エラー UI の設計成果物化 (spec/design)

**Issue:** #198
**作成日:** 2026-05-30

---

## 確認環境

本 Issue の成果物は `spec/design/pages/*.html` の**静的 HTML モック**（インライン CSS・JS なしで自己完結）。アプリケーション本体（`pnpm dev` が起動する TanStack Start サーバー）とは独立しており、検証にサーバー起動・DB・シードは不要。ブラウザで HTML ファイルを直接開いて目視確認する。

### 検証環境の起動

開発サーバーは不要。対象 HTML ファイルをブラウザで直接開く（`file://` で開ける）。
ファイル URL 直開きが制限される環境では、リポジトリルートで任意の静的ファイルサーバー越しに開いてもよい（例: `npx serve` 等。プロジェクトの package.json には静的配信用 script は無いため任意のツールで可）。

確認対象ファイル:
- `spec/design/pages/P01-signup.html`
- `spec/design/pages/P01b-admin-setup.html`
- `spec/design/pages/P03-login.html`

### デプロイ方法

なし（設計成果物のため検証環境のみで確認できる。ステージング・本番への反映は不要）。

### トークンを追記した場合のみ

`app/styles/tokens.css` を変更した場合に限り、リポジトリルートで以下を実行して整形・型チェックが通ることを確認する（HTML のみの変更なら不要）:

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```

---

## 確認項目

### 1. P01-signup.html のエラーバリアント

- **目的:** validation / conflict（なし版・あり版）/ system・unknown / 入力保持の各バリアントが意図通り描画される
- **手順:**
  1. `spec/design/pages/P01-signup.html` をブラウザで開く
  2. 成功状態フォームの下に並ぶ各エラーバリアントを上から確認する
  3. validation: 誤入力 field の input が `--color-error-surface` 背景 + 赤リングになり、hint が赤文言になっているか
  4. validation: 誤入力 field に前回値（`value`）が残っているか（入力保持）
  5. conflict なし版: フォームレベルの `.form-error` callout に「登録に失敗しました。」+「すでに登録されています」が出ているか
  6. conflict あり版: email field 直下に赤エラー表示が出ており、ファイル内コメントで「採否は #201 に委ねる／なし版が現実装の既定」と明記されているか
  7. system / unknown: 汎用 callout が「システムエラーが発生しました」「エラーが発生しました」を抽象文言のまま表示しているか
- **期待結果:** 各バリアントが既存の成功状態と同じトークン・スペーシング・トーンで一貫して描画される
- **確認ポイント:** 文言が `errorDisplay.ts` / form コンポーネントの現行文言と一字一句一致しているか（プレフィックス=form 由来、本文=errorDisplay 由来）

### 2. P01b-admin-setup.html のエラーバリアント

- **目的:** validation / unauthorized 特殊 callout（Setup Token 2分岐）/ conflict / system・unknown が意図通り描画される
- **手順:**
  1. `spec/design/pages/P01b-admin-setup.html` をブラウザで開く
  2. validation: username / email / password / setupToken の field 直下エラー + 入力保持を確認
  3. unauthorized: `.form-error`（`role="alert"`）に「Setup Token が正しくありません。」と「Setup Token が設定されていません。」の両分岐が示され、setupToken field に `has-error` が付いているか
  4. conflict（なし版／あり版）と system / unknown を確認
- **期待結果:** Setup Token エラーが特権操作ページの中核 callout として明確に提示される
- **確認ポイント:** unauthorized の2分岐文言が実装の `isSetupTokenError` 分岐と一致しているか

### 3. P03-login.html のエラーバリアント

- **目的:** validation / unauthorized 認証失敗（汎用）/ unauthorized 未認証+再送 / system・unknown が意図通り描画される
- **手順:**
  1. `spec/design/pages/P03-login.html` をブラウザで開く
  2. validation: email / password の field 直下エラー、email の入力保持を確認
  3. 認証失敗（汎用）: `.form-error`（`role="alert"`）に「ログインできませんでした。」+「認証が必要です」。ユーザー存在/パスワード違いを判別させない抽象化が保たれているか
  4. 未認証+再送: `.callout`（再送ボタン付き）が **neutral surface + accent アイコン**配色（warning ではない、ADR-004）で、`role="status"`、再送が `<button type="button">` になっているか
  5. system / unknown を確認
- **期待結果:** 未認証案内が「次の行動案内」トーン（neutral+accent）で描画され、認証失敗は抽象化を維持
- **確認ポイント:** 配色が実装（neutral+accent）に合わせられているか、warning 配色になっていないか

## エッジケース・異常系

### 1. 長文 / オーバーフロー（harden 観点）

- **目的:** 長い field エラー文言や長いメールアドレスでもレイアウトが崩れない
- **手順:**
  1. 各モックの validation バリアントの input value / エラー文言が十分長いケースを目視（または一時的に長文を入れて確認）
- **期待結果:** callout・field エラー・input がオーバーフローせず折り返す

### 2. レスポンシブ（モバイル幅）

- **目的:** <640px でエラー UI が崩れず、タップ領域が保たれる
- **手順:**
  1. ブラウザ幅を 375px 程度に狭める（DevTools のデバイスエミュレーション等）
  2. 各エラーバリアント、特に再送ボタン（P03）を確認
- **期待結果:** callout・field エラーが折り返し、再送ボタン等のタップ領域が 44px 以上を維持

### 3. アクセシビリティ目視

- **目的:** a11y 属性が適切に付与されている
- **手順:**
  1. 各モックの HTML を確認し、誤入力 input に `aria-invalid="true"`、エラー callout に適切な `role`（ブロッキングエラー=`alert` / 案内=`status`）が付いているか確認
  2. エラー状態の input にフォーカスし、フォーカスリング（`--shadow-focus`）が見えるか確認
- **期待結果:** role / aria-invalid / フォーカスリングが §フィードバック原則どおり

## 既存機能への影響確認

- 成功状態の既存モック（各ファイル上部）が変更前と同じ見た目を保っているか（エラーバリアント追記が既存ブロックを壊していないか）
- `tokens.md` / `tokens.css` を変更した場合、他ページモック（P02, P04〜P46 等）の `:root` トークン参照が壊れていないか（トークン名の変更・削除をしていないこと）

## 確認チェックリスト

- [ ] P01-signup の全エラーバリアントが意図通り描画される
- [ ] P01b-admin-setup の全エラーバリアント（特に Setup Token 2分岐）が意図通り描画される
- [ ] P03-login の全エラーバリアント（未認証 callout の neutral+accent 配色）が意図通り描画される
- [ ] 文言が `errorDisplay.ts` / form コンポーネントの現行文言と一致
- [ ] 入力保持が過剰演出なし（value を残すのみ）で表現されている
- [ ] 長文・モバイル幅でレイアウトが崩れない
- [ ] aria-invalid / role / フォーカスリングが適切
- [ ] 成功状態の既存モックが壊れていない
- [ ] （トークン変更時のみ）`pnpm typecheck && pnpm lint:fix && pnpm format` が通る
