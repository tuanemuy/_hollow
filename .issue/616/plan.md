# 実装計画 — Issue #616: ランディングページの「公開検索」「エクスポート」リンクが /search へ繋がらずトップに戻るだけになっている

**Issue:** #616
**作成日:** 2026-06-10
**複雑度:** 小規模

---

## 目的

ランディングページ（`app/components/landing/LandingPage.tsx`）の「公開検索」系リンクが、検索文言を掲げているのに `to="/" search={HOME_SEARCH}`（実質ホームへ戻る）になっている不具合を修正し、公開検索ルート `/search` へ正しく繋ぐ。あわせて未認証 LP に不適切な「エクスポート」リンクを整理する。

## スコープ

### 含まれるもの

- Teaser「公開検索を試す」（`LandingPage.tsx:344-347`）を `to="/search"` に変更
- Footer「公開検索」（`LandingPage.tsx:375-381`）を `to="/search"` に変更
- Footer「エクスポート」（`LandingPage.tsx:383-391`）をリンク・テキストごと削除（ユーザー判断）
- デザインモック（`spec/design/pages/P07-landing.html` / `mobile/P07-landing.html`）の対応箇所も同期
  - teaser・footer の公開検索 `href="#"` → `href="/search"`
  - footer エクスポート `<li>` を削除

### 含まれないもの

- ヘッダーのブランドロックアップ（`LandingPage.tsx:122`）の `to="/" search={HOME_SEARCH}` — ホームへ戻る挙動が正しいので変更しない
- `HOME_SEARCH` 定数（`app/components/auth/links.ts`）— 他 30+ 箇所で使用中、かつ本コンポーネントのヘッダーでも引き続き使うため削除しない
- `/about` `/terms` `/privacy` 等の他リンク — Issue で正常と確認済み
- エクスポート機能（認証必須）の紹介テキスト（feature カード「いつでもエクスポート」）— 機能説明として残す

## 実装ステップ

### 1. Teaser リンクを /search に変更

- **対象ファイル:** `app/components/landing/LandingPage.tsx`
- **変更内容:** `<Link to="/" search={HOME_SEARCH} className={TEASER_LINK}>` を `<Link to="/search" search={{ q: "", limit: 20 }} className={TEASER_LINK}>` に。
- **理由:** teaser コピーが公開検索を明記しているのに `/` へ戻るのは不整合。`/search` は認証不要で実装済み。

### 2. Footer「公開検索」リンクを /search に変更

- **対象ファイル:** `app/components/landing/LandingPage.tsx`
- **変更内容:** Footer プロダクト列の「公開検索」`<Link to="/" search={HOME_SEARCH}>` を `<Link to="/search" search={{ q: "", limit: 20 }}>` に。
- **理由:** 同上。

### 3. Footer「エクスポート」リンクを削除

- **対象ファイル:** `app/components/landing/LandingPage.tsx`
- **変更内容:** Footer プロダクト列の「エクスポート」`<li>...</li>` ブロックを丸ごと削除。
- **理由:** エクスポートは認証必須機能で、未認証 LP からの直リンク先として不適切。ユーザー判断によりリンク・テキストごと削除。

### 4. デザインモックの同期

- **対象ファイル:** `spec/design/pages/P07-landing.html`, `spec/design/pages/mobile/P07-landing.html`
- **変更内容:** teaser・footer の公開検索 `href="#"` を `href="/search"` に。footer の `<li><a href="#">エクスポート</a></li>` を削除。
- **理由:** モックを実装の正と一致させ、将来の参照時の混乱を防ぐ（ユーザーが「モックを含め」削除を指示）。

## 設計判断

- `/search` への遷移は既存の確立パターン（`app/components/public/ErrorPage.tsx:32` の `search={{ q: "", limit: 20 }}`）に合わせる。`searchSchema` は全フィールド optional/catch だが、TanStack Router の型付き search に明示的に初期値を渡す既存流儀を踏襲する。
- エクスポートリンクの扱いは Issue が「要判断」とした論点。ユーザー選択により「リンク・テキストごと削除」。

## リスクと注意点

- `HOME_SEARCH` import はヘッダーで引き続き使用するため残す（未使用 import にしない）。
- footer の `<li>` 削除でプロダクト列は「機能 / 公開検索」の 2 項目になる。レイアウト崩れはないか目視確認する。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- LP を開き、teaser「公開検索を試す」と footer「公開検索」が `/search` へ遷移すること、footer に「エクスポート」が無いことをブラウザで確認（testing.md 参照）。
