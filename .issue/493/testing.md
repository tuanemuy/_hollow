# 動作確認計画 — Issue #493: note-content パイプラインの adapter 命名是正 + markdown-it / ultrahtml への置き換え

**Issue:** #493
**作成日:** 2026-06-06

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate      # ローカル D1 にマイグレーション適用（必要な場合）
pnpm seed:dev-admin  # 認証経路を確認する場合のみ（dev-admin@example.com / admin）
pnpm dev             # vite dev（workerd 経由）が http://localhost:3000 で起動
```

Workers バンドル（追加ライブラリが Node 専用 built-in を引かない / bundle size）の検証:

```bash
pnpm build           # vite build（Cloudflare ターゲット）。worker bundle が解決エラーなく生成されること
```

### デプロイ方法

なし（ローカル検証環境のみで確認可能）。本番反映は通常の `pnpm deploy:staging` / `pnpm deploy:production` 経路（本 Issue 固有の手順は不要）。

---

## 確認項目

### 1. /about ページの見出しアンカー（#commerce / #contact）

- **目的:** `{#id}` 見出しアンカーが markdown-it 経由で正しく id 化され、サニタイズ後も残ること
- **手順:**
  1. ブラウザで `http://localhost:3000/about` を開く
  2. DevTools で「特定商取引法に基づく表記」見出しの DOM を確認
  3. 「お問い合わせ」見出しの DOM を確認
- **期待結果:**
  - 「特定商取引法に基づく表記」見出しが `<h2 id="commerce">`（h レベルは元 markdown 準拠）
  - 「お問い合わせ」見出しが `<h2 id="contact">`
  - ページが HTTP 200 で正常描画され、AppConfig 差し込み（`{{siteName}}` 等）も従来どおり展開されている
- **確認ポイント:** `{{siteName}}` 等の置換残骸（`{{...}}` リテラル）が出ていないこと、`{#commerce}` リテラルが本文に残っていないこと

### 2. LandingPage フッターからのアンカー遷移

- **目的:** #276 の最終目的（フッターリンクからの深リンク遷移）が復活していること
- **手順:**
  1. `http://localhost:3000/` を開く
  2. フッターの「特定商取引法」リンクをクリック
  3. ブラウザバックして「お問い合わせ」リンクをクリック
- **期待結果:**
  - 「特定商取引法」→ `/about#commerce` に遷移し、当該見出しまでスクロールする
  - 「お問い合わせ」→ `/about#contact` に遷移し、当該見出しまでスクロールする
- **確認ポイント:** URL の hash が `#commerce` / `#contact` になり、対応見出しがビューポート内に来ること

### 3. /terms・/privacy ページの回帰（自動 slug 注入なし）

- **目的:** `LegalDocument` を共有する terms/privacy で、明示 `{#id}` の無い見出しに id が自動付与されていないこと
- **手順:**
  1. `http://localhost:3000/terms` を開き、各 `<h2>` の DOM を確認
  2. `http://localhost:3000/privacy` を開き、各 `<h2>` の DOM を確認
- **期待結果:**
  - HTTP 200 で従来どおり描画される
  - 明示アンカー指定の無い見出しに `id` 属性が付いていない（日本語見出しに encodeURI された id / 空 id が注入されていない）
- **確認ポイント:** 見出し・段落・blockquote 警告など既存レイアウトが崩れていないこと

### 4. ノート本文の Markdown レンダリング（取り込み経路）

- **目的:** markdown-it 化後もノート本文の CommonMark 記法・コードハイライト・内部リンク・メディアが従来どおり描画されること
- **手順:**
  1. `pnpm seed:dev-admin` 実行後 `http://localhost:3000/admin` で管理画面にアクセス
  2. Markdown 形式のノートを取り込む（見出し / 箇条書き / コードフェンス（言語付き）/ `[[wikilink]]` / 画像を含むもの）
  3. 公開されたノート詳細ページを開く
- **期待結果:**
  - 見出し・リスト・引用・水平線などが正しく描画される
  - コードフェンスが `<code class="language-xxx">` を保持し、シンタックスハイライト（CodeHighlight）が機能する
  - `[[wikilink]]` の内部リンクが解決・描画される（リンク抽出が機能している）
  - 画像（`/media/<id>`）が表示される
- **確認ポイント:** `[[...]]` がリテラルのまま壊れて表示されたり、内部リンク抽出が全滅していないこと

## エッジケース・異常系

### 1. 不正な `{#id}` 値

- **目的:** XSS 観点で id 値が厳格制限されること
- **手順:**
  1. ローカルで `## 見出し {#1bad-id}` や `## 見出し {#a b}` のような不正 id を含む markdown を変換する経路（ユニットテスト or 取り込み）で確認
- **期待結果:** 不正な id は捨てられ（id 属性が付かない）、見出しテキストは保持される。`on*` 属性や `javascript:` URL は除去される
- **確認ポイント:** 出力 HTML に許可外属性・危険 URL が混入しないこと

### 2. 危険な HTML / URL スキームのサニタイズ

- **目的:** `SAFE_URL_SCHEMES` 制限と `on*` 除去が ultrahtml 化後も機能すること
- **手順:**
  1. `<a href="javascript:alert(1)">` / `<img src="data:...">` / `<div onclick="...">` を含む入力をサニタイズ経路で確認（ユニットテスト推奨）
- **期待結果:** `javascript:` / `data:` URL・`on*` ハンドラ・非許可タグが除去され、`removed` に記録される
- **確認ポイント:** 許可スキーム（http/https/mailto/相対）は通過すること

## 既存機能への影響確認

- **note 詳細描画**（`dangerouslySetInnerHTML` 経路 `.note-detail-content`）: サニタイズ出力が変わっても XSS にならず、既存スタイルが当たること
- **全文検索 / embeddings**（`NoteSnapshot.plainBody`）: `toPlainText` 出力が現行と一致し、検索・埋め込み生成が崩れないこと
- **wysiwyg エディタ統合**（`wysiwygSanitizerIntegration.test.ts`）: エディタ出力タグが `disallowed tag` で落ちないこと
- **legal 3 ページ**（terms/privacy/about）: 共有パイプライン経由の描画が崩れないこと

## 確認チェックリスト

- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がクリーン
- [ ] `pnpm test:unit` が全パス（新規 markdown / sanitizer テスト含む）
- [ ] `pnpm build` が Workers ターゲットで成功（Node 専用 built-in 解決エラーなし、bundle size 増が許容範囲）
- [ ] /about の見出しが `<h2 id="commerce">` / `<h2 id="contact">`
- [ ] LandingPage フッターから `#commerce` / `#contact` へスクロール遷移
- [ ] /terms・/privacy の見出しに自動 slug id が付与されていない
- [ ] ノート本文の CommonMark・コードハイライト・`[[wikilink]]`・メディアが従来どおり描画
- [ ] 不正 id・危険 URL・`on*` がサニタイズで除去される
