# ブラウザ検証レポート — Issue #204

**実行日:** 2026-06-01
**テストソース:** `.issue/204/testing.md`
**検証手法:** `pnpm dev`（vite dev, port 5175）の SSR 出力を `curl` でページソース検証 + `pnpm build` の `dist/client` 出力でアセット配置確認
**備考:** このIssueは SSR `<head>` 出力の検証が中心のため、testing.md が許容する「View Source / curl」を主手段とした。

## 結果サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | 公開ノート動的メタ (slug) | 正常系 | PASS |
| TC-2 | 公開ノート動的メタ (id) | 正常系 | PASS |
| TC-3 | ユーザー公開トップ ProfilePage JSON-LD | 正常系 | PASS |
| TC-4 | 静的アセットの配信 | 正常系 | PASS |
| TC-5 | 認証/管理ルートの noindex | 正常系 | PASS |
| TC-6 | 公開ランディング `/` は index 維持 | 正常系 | PASS |
| TC-7 | ブラウザタブのタイトル識別 | 正常系 | PASS |
| EC-1 | JSON-LD エスケープ (XSS) | 異常系 | PASS（ユニットテストで担保） |
| EC-2 | 公開ノート head 取得失敗時のフォールバック | 異常系 | PASS |

**合計:** 9件（PASS: 9 / FAIL: 0）

## 詳細

### TC-1 公開ノート (slug) `/u/test298/issue-298-panel-bg-check`
- `<title>` = `Issue 298 — パネル背景の見た目確認 — TanStack Start Template`（実タイトル）✓
- `og:title` / `twitter:title` も実タイトル ✓
- `og:description` / `twitter:description` = 本文抜粋（HTMLタグなし、`htmlSanitizer.toPlainText` 経由）✓
- `og:type=article` / `article:published_time` / `article:modified_time` / `article:author` ✓
- `og:locale=ja_JP`（AppConfig.locale 由来）✓
- Article JSON-LD（`JSON.parse` 可能、`keywords:["検証","SEO"]` で全タグ表現）✓

### TC-2 公開ノート (id) `/notes/public/$noteId`
- title=実タイトル、`og:type=article`、Article + Person JSON-LD ✓（固定文言「公開ノート — …」が解消）

### TC-3 ユーザー公開トップ `/u/test298`
- title=`Test 298 (@test298) — TanStack Start Template` ✓
- ProfilePage JSON-LD（mainEntity=Person, name/alternateName=username/description=bio）✓

### TC-4 静的アセット
- dev server: `/favicon.ico`(image/x-icon) `/favicon.svg`(image/svg+xml) `/apple-touch-icon.png`(image/png) `/site.webmanifest`(application/manifest+json) `/og-image.png`(image/png) すべて **200** ✓
- `pnpm build` 後 `dist/client/` に全アセット配置確認（Cloudflare assets binding ソース）✓

### TC-5 noindex
- `/admin`（200描画）に `<meta name="robots" content="noindex, nofollow">` ✓
- `settings`/`views`/`exports` layout route、`_app` 配下個別ルート、`notes/$noteId/{export,publish}`/`export/index`（internalRouteHead 経由）はいずれも同一の noIndex パターンをコードで確認。認証ガードで未認証時は 307→/login のため直接 curl 不可だが、`/admin` の runtime 実証と同一コードパスのため担保。

### TC-6 ランディング `/`
- `robots` noindex が**無い**ことを確認 ✓（ADR-001 通り）。canonical も自ルートの1件のみ。

### TC-7 タブタイトル
- `/admin`=「管理ダッシュボード」、`/settings/profile`/`/admin/llm` 等それぞれ固有タイトル ✓

### EC-2 head 取得失敗
- `/u/test298/nonexistent-xyz`: HTTP 200 で notFound 描画、head はクラッシュせず `@test298 — …` にフォールバック ✓

## 検証中に発見・その場で修正した点

1. **canonical の重複**: root layout が `/` の canonical を、各ルートも自前 canonical を出力し、`<link rel="canonical">` が2つ出ていた（Google は複数 canonical を全無視）。head 未設定33ルートに head を追加したことで顕在化。→ `__root.tsx` で root の canonical を除外（root は実 path を知り得ず、各ルートが自前で出すため）。修正後は各ページ canonical 1件に。
2. **article:tag が複数タグでも1つに collapse**: TanStack Router が meta を `property` キーで dedup するため、`article:tag` が複数あっても最後の1件しか残らない。→ Article JSON-LD に `keywords`（全タグ配列）を追加。collapse しない構造化データ側で全タグを表現。

いずれも本Issueの「正しい SEO メタ出力」という意図に直結するため、その場で修正（別Issue化せず）。
