# 動作確認計画 — Issue #204: メタタグ・SEO 関連の設定不足

**Issue:** #204
**作成日:** 2026-05-31

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

- ルート単位の head（meta / title / robots / JSON-LD）の確認: `pnpm dev`（`vite dev --config vite.config.cloudflare.ts`）。ライブソースを配信するので head 変更はそのまま反映される。
- **静的アセット（favicon / og-image / webmanifest）の 200 確認は `pnpm build` が必須。** `public/` のアセットは `vite build` で `dist/client` に配置され、`pnpm start`（`wrangler dev`）はプリビルド済み `dist/client` を配信する（live source は配信しない）。
  1. `pnpm build`
  2. `pnpm start`

### 静的アセットの生成（このIssueで配置するもの）

`public/` 配下に placeholder を自作で用意する（サードパーティ素材は使わない）:
- `favicon.svg` を手書きで作成し、それを元に `favicon.ico` / `apple-touch-icon.png`(180x180) / `og-image.png`(1200x630) をラスタライズ生成する。
- `site.webmanifest` を最小構成で作成。
- 生成に使ったコマンド / スクリプトは PR に明記する（再現性のため）。

### デプロイ方法

なし（検証環境のみで確認できる）。ステージング反映は `pnpm deploy:staging` だが本Issueの確認には不要。

## 確認項目

### 1. 公開ノートの動的メタ（slug ルート）

- **目的:** `u/$username/$noteSlug` の title / description / og:image / article:* がノート実データから出力される。
- **手順:**
  1. `pnpm dev` で起動。
  2. 公開済みノートを用意し `/u/<username>/<slug>` を開く。
  3. ページソース（View Source / `curl -s <url>`）の `<head>` を確認。
- **期待結果:**
  - `<title>` がノート実タイトル（slug 文字列ではない）。
  - `og:title` / `twitter:title` も実タイトル。
  - `og:description` / `twitter:description` が本文先頭の抜粋（HTML タグなし、約160字）。
  - `og:type = article`、`article:published_time` / `article:modified_time` / `article:author` / `article:tag`（タグ分）が出力。
  - `og:locale` が `ja_JP`（AppConfig.locale 由来）。
  - `<script type="application/ld+json">` に `@type: "Article"` の JSON-LD があり、`JSON.parse` 可能。
- **確認ポイント:** description にスクリプトや生 HTML タグが混入していないこと（`htmlSanitizer.toPlainText` 経由）。

### 2. 公開ノートの動的メタ（id ルート）

- **目的:** `notes/public/$noteId` でも固定文言「公開ノート — …」でなく実タイトルが出る。
- **手順:** `/notes/public/<id>` を開きページソース確認。
- **期待結果:** 項目1と同等（title が実タイトル / Article JSON-LD あり）。

### 3. ユーザー公開トップの JSON-LD

- **目的:** `/u/$username` に ProfilePage 構造化データが出る。
- **手順:** `/u/<username>` を開きページソース確認。
- **期待結果:** `<script type="application/ld+json">` に `@type: "ProfilePage"`（mainEntity = Person, name / alternateName=username / description=bio）。`JSON.parse` 可能。title は `@username — siteName`。

### 4. 静的アセットの 200 応答

- **目的:** `__root.tsx` 参照アセットが配信される。
- **手順:**
  1. `pnpm build && pnpm start`。
  2. `curl -sI http://localhost:8787/favicon.ico` など各アセットに対し実行。
- **期待結果:** `/favicon.ico` / `/favicon.svg` / `/apple-touch-icon.png` / `/site.webmanifest` / `/og-image.png` がいずれも `200`。`site.webmanifest` は妥当な JSON。

### 5. 認証 / 管理ルートの noindex

- **目的:** 認証必須・管理ページに robots noindex が出る。
- **手順:** `admin/*` / `settings/*` / `exports/*` / `views/index` / `_app/notes/new` 等を開きページソース確認（認証セッションが必要なら login 後）。
- **期待結果:** `<meta name="robots" content="noindex, nofollow">` が出力される。

### 6. 公開ランディング `/` は index されたまま

- **目的:** ADR-001 の通り `_app/index`（`/`）に noindex が付かない。
- **手順:** `/` を開きページソース確認。
- **期待結果:** `robots` の noindex meta が**無い**。

### 7. ブラウザタブのタイトル識別

- **目的:** head 追加ルートでタブタイトルが画面ごとに異なる。
- **手順:** `settings/profile` / `admin/llm` / `_app/notes/new` 等を開きタブタイトルを比較。
- **期待結果:** 各ページで `<画面名> — <siteName>` 形式の固有タイトル。全部同じにならない。

## エッジケース・異常系

### 1. JSON-LD のエスケープ（XSS）

- **目的:** ノート本文/タイトルに `</script>` や `<` が含まれても JSON-LD が壊れず XSS にならない。
- **手順:**
  1. タイトルまたは本文に `</script><script>alert(1)</script>` を含むノートを公開。
  2. `/u/<username>/<slug>` のページソースを確認。
- **期待結果:** JSON-LD 内の `<` が `<` 等にエスケープされ、`<script>` が早期終了しない。`alert` が実行されない。
- **確認ポイント:** `head.ts` の `buildJsonLdScript` の `<` 置換が効いていること（ユニットテストでも担保）。

### 2. 公開ノート head のメタ取得失敗時

- **目的:** 非公開/存在しないノートの head 取得で head がエラーを握りデフォルトにフォールバックする。
- **手順:** 存在しない slug `/u/<username>/nonexistent` を開く。
- **期待結果:** ページは notFound 表示。head はクラッシュせず（メタ server fn のエラーを握って `{}` か既定 head を返す）、HTTP/SSR が 500 で落ちない。

## 既存機能への影響確認

- `__root.tsx` のデフォルト head（config 未取得時の baseLinks のみ返す分岐）が従来通り動くこと。
- `og:locale` の AppConfig 駆動化で `serverCloudflare.test.ts` の AppConfig surface 検証が通ること（`pnpm test:unit`）。
- 公開ノート読み取りが loader と head の二重取得になっても表示・パフォーマンスに問題が出ないこと（`cache()` デデュープの効果を確認）。

## 自動テスト

- `pnpm test:unit` — `head.ts` の追加ユニットテスト（locale 駆動 / noIndex / article:* / `buildJsonLdScript` のエスケープ）が通る。
- `pnpm typecheck && pnpm lint:fix && pnpm format`（変更後の必須チェック）。

## 確認チェックリスト

- [ ] 公開ノート(slug) の title が実タイトル / description が抜粋 / article:* 出力
- [ ] 公開ノート(id) の title が実タイトル
- [ ] 公開ノート Article JSON-LD が `JSON.parse` 可能
- [ ] ユーザー公開トップ ProfilePage JSON-LD が出力
- [ ] favicon.ico / favicon.svg / apple-touch-icon.png / site.webmanifest / og-image.png が 200
- [ ] admin / settings / exports / views / 認証ノートページに robots noindex
- [ ] 公開ランディング `/` に noindex が無い
- [ ] 各ページのタブタイトルが固有
- [ ] `</script>` 混入ノートで JSON-LD が壊れず XSS にならない
- [ ] 存在しないノートで head がクラッシュしない
- [ ] `pnpm test:unit` / `pnpm typecheck` / `pnpm lint:fix` / `pnpm format` が通る
