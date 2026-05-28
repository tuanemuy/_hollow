# 動作確認計画 — Issue #205: 公開ページの不足（利用規約・プライバシー・インスタンス情報・robots/sitemap）

**Issue:** #205
**作成日:** 2026-05-28

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate    # ローカル D1 にマイグレーション適用（必要な場合）
pnpm dev           # vite dev（workerd 経由）が http://localhost:3000 で起動
```

ビルド成果物（`dist/client/robots.txt`）の検証が必要な場合:

```bash
pnpm build         # vite build。成果物は dist/client/ 配下
```

### デプロイ方法

なし（ローカル検証環境のみで確認可能）。

---

## 確認項目

### 1. /terms ページの表示

- **目的:** 利用規約ページが Markdown ベースで描画されること
- **手順:**
  1. ブラウザで `http://localhost:3000/terms` を開く
  2. ページコンテンツを確認する
- **期待結果:**
  - HTTP 200 で表示される
  - ページ冒頭に「本文は雛形です。本番運用前に法務確認のうえ差し替えてください。」の警告が blockquote で表示される
  - Markdown の見出し（h1/h2 等）・段落が `.note-detail-content` スタイルで描画される
  - `<head>` の `<title>` に「利用規約」「{siteName}」が含まれる
  - `<link rel="canonical">` の URL が `/terms` を指す
- **確認ポイント:** `dangerouslySetInnerHTML` 経路で HTML がレンダリングされても XSS にならないこと（sanitizer 経由）

### 2. /privacy ページの表示

- **目的:** プライバシーポリシーページが描画されること
- **手順:**
  1. ブラウザで `http://localhost:3000/privacy` を開く
- **期待結果:**
  - HTTP 200、警告 blockquote 表示、Markdown 描画
  - `<title>` / canonical が `/privacy` を指す
- **確認ポイント:** /terms と同等

### 3. /about ページの表示と AppConfig 差し込み

- **目的:** インスタンス情報ページに AppConfig 値が差し込まれること
- **手順:**
  1. ブラウザで `http://localhost:3000/about` を開く
  2. ページ本文を確認する
- **期待結果:**
  - HTTP 200、警告 blockquote 表示
  - `{{siteName}}` `{{appUrl}}` `{{twitterHandle}}` のプレースホルダが実 AppConfig 値で置換されている
  - 置換後の本文に `{{` `}}` が残っていない
  - 「運営者」「連絡先」「特定商取引法（#commerce）」「お問い合わせ（#contact）」の各セクションが表示される
- **確認ポイント:**
  - `app/config.ts` の `siteName` 等の値がそのまま反映されていること
  - HMR が `.md?raw` を反映するか確認（変更が即反映されない場合はビルドが必要）

### 4. PublicLayout フッターのリンク差し替え

- **目的:** フッターの 3 リンクが実 URL を指していること
- **手順:**
  1. 公開ノート閲覧画面など PublicLayout を使うページを開く（例: `/u/<username>` または `/u/<username>/<note-slug>` の公開ノート）
  2. フッターの「利用規約」「プライバシー」「このインスタンスについて」をそれぞれクリック
- **期待結果:**
  - 「利用規約」→ `/terms` に遷移
  - 「プライバシー」→ `/privacy` に遷移
  - 「このインスタンスについて」→ `/about` に遷移
- **確認ポイント:** ホーム（`/`）には遷移しないこと

### 5. LandingPage フッターのリンク差し替え

- **目的:** 未ログイン時の Landing フッターの該当リンクが実 URL を指すこと
- **手順:**
  1. 未ログイン状態で `http://localhost:3000/` を開く（LandingPage が表示される）
  2. フッターの該当リンクを順次クリック
- **期待結果:**
  - 「利用規約」→ `/terms`
  - 「プライバシー(ポリシー)」→ `/privacy`
  - 「このインスタンスについて」「運営者情報」「お問い合わせ」→ `/about`（`#commerce` `#contact` アンカー付きのものは該当セクションへスクロール）
- **確認ポイント:** 旧 `to="/"` 系のリンクが残っていないこと

### 6. SignUpForm 同意チェックボックス内リンク

- **目的:** サインアップ画面の同意導線が実 URL を指すこと
- **手順:**
  1. `http://localhost:3000/signup` を開く
  2. 同意チェックボックス文言内の「利用規約」「プライバシーポリシー」をそれぞれクリック
- **期待結果:** それぞれ `/terms` / `/privacy` に遷移する
- **確認ポイント:** チェックボックスのチェック状態を維持したままリンクが機能すること

### 7. AdminSignUpForm 同意チェックボックス内リンク

- **目的:** 初期管理者セットアップ画面の同意導線が実 URL を指すこと
- **手順:**
  1. `ADMIN_SETUP_TOKEN` を設定した状態で `http://localhost:3000/setup` を開く
  2. 同意チェックボックス文言内の「利用規約」「プライバシーポリシー」をそれぞれクリック
- **期待結果:** それぞれ `/terms` / `/privacy` に遷移する

### 8. robots.txt の配信

- **目的:** `/robots.txt` が 200 で配信され、Disallow / Sitemap 行を含むこと
- **手順:**
  ```bash
  curl -i http://localhost:3000/robots.txt
  ```
  または別途 `pnpm build` 後に `ls dist/client/robots.txt` で出力確認
- **期待結果:**
  - HTTP 200
  - `Content-Type: text/plain` 系
  - 全 Disallow 行（`/settings/` `/admin/` `/notes/` `/trash/` `/tags/` `/exports/` `/views/` `/upload/` `/export/` `/media/` `/share/` `/verify-email` `/email-change/` `/password-reset/` `/setup`）が含まれる
  - `Sitemap: /sitemap.xml` 行を含む
- **確認ポイント:** `dist/client/robots.txt` がビルド成果物として生成されること（vite publicDir 経由）。生成されない場合は ADR-001 のフォールバック（`app/routes/robots[.]txt.tsx` 動的化）に切り替え

### 9. sitemap.xml の配信

- **目的:** `/sitemap.xml` が 200 で配信され、静的＋動的 URL を含むこと
- **手順:**
  1. シードデータ準備（manual-test が対応） — 少なくとも公開ノート 1 件以上、非公開ノート 1 件以上を用意
  2. ```bash
     curl -i http://localhost:3000/sitemap.xml
     ```
- **期待結果:**
  - HTTP 200
  - `Content-Type: application/xml; charset=utf-8`
  - `Cache-Control: public, max-age=300, s-maxage=600`
  - `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` 等の well-formed XML
  - 静的 `<loc>` `/`, `/signup`, `/login`, `/search`, `/terms`, `/privacy`, `/about` が `${appUrl}` プレフィックス付きで含まれる
  - 公開ノートの `<loc>` が `${appUrl}/u/<username>/<note-slug>` 形式で含まれる
  - 公開ノートを持つユーザーの公開トップ `${appUrl}/u/<username>` が含まれる
  - 公開ノートの `<lastmod>` が ISO 8601 形式
- **確認ポイント:**
  - 非公開ノートが含まれない
  - 削除済みユーザーのノートが含まれない（あれば）
  - `xmllint --noout sitemap.xml`（または `python -c "import xml.etree.ElementTree as ET; ET.parse('sitemap.xml')"`）で well-formed

---

## エッジケース・異常系

### 1. 公開ノートゼロ件の sitemap

- **目的:** 公開ノートが 1 件も無い状態でも sitemap が正しく返ること
- **手順:**
  1. 全公開ノートを非公開化（または fresh DB）
  2. `curl -i http://localhost:3000/sitemap.xml`
- **期待結果:** HTTP 200、静的 URL のみが含まれる well-formed XML

### 2. 同意リンクからの離脱と再戻り

- **目的:** サインアップ中に同意リンクをクリックして戻った際にフォーム入力が保持されるか
- **手順:**
  1. `/signup` でユーザー名・メール・パスワードを入力
  2. 同意チェックボックス文言内の「利用規約」をクリックして `/terms` に遷移
  3. ブラウザの「戻る」で `/signup` に戻る
- **期待結果:** 入力値が保持されている（または、保持されない仕様の場合は警告等の挙動が一貫していること）
- **確認ポイント:** リンク挙動の変更が UX 退行を引き起こしていないこと

### 3. /robots.txt と /sitemap.xml の同時アクセス

- **目的:** Cloudflare キャッシュが効くこと
- **手順:** `/sitemap.xml` を連続 3 回 curl で叩く
- **期待結果:** 2 回目以降は CDN キャッシュから返る想定（ローカル `wrangler dev` ではキャッシュが効かない場合あり、本番想定の確認は staging で別途行う）

---

## 既存機能への影響確認

- **サインアップ・ログインフロー**: `/signup` `/login` `/setup` の全動線が回帰なく動くこと
- **公開ノート閲覧**: `/u/<username>` `/u/<username>/<note-slug>` が回帰なく動くこと（`PublicLayout` 変更の影響）
- **LandingPage 表示**: 未ログイン時の `/` が回帰なく描画されること
- **`HOME_SEARCH` 削除の副作用**: import 削除に伴う他箇所のビルドエラー無し（typecheck で検出可能）

---

## 確認チェックリスト

- [ ] `/terms` 表示・警告 blockquote 表示・head 設定
- [ ] `/privacy` 表示・警告 blockquote 表示・head 設定
- [ ] `/about` 表示・AppConfig 差し込み・警告 blockquote
- [ ] PublicLayout フッター 3 リンク差し替え
- [ ] LandingPage フッター該当リンク差し替え
- [ ] SignUpForm 同意リンク 2 箇所差し替え
- [ ] AdminSignUpForm 同意リンク 2 箇所差し替え
- [ ] `/robots.txt` 200 配信、Disallow / Sitemap 行含む
- [ ] `dist/client/robots.txt` ビルド出力確認（または動的化フォールバック）
- [ ] `/sitemap.xml` 200 配信、静的＋動的 URL 含む、ヘッダー正しい
- [ ] sitemap に非公開ノート含まれず
- [ ] 公開ノートゼロ件でも sitemap が静的 URL のみで返る
- [ ] 既存サインアップ・ログイン・公開閲覧フローに回帰なし
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` パス
- [ ] `pnpm test:unit` で `listSitemapEntries` テストパス
