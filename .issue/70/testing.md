# 動作確認計画 — Issue #70: 全体スタイリングを Tailwind CSS v4 に移行

**Issue:** #70
**作成日:** 2026-05-19

---

## 確認環境

### 検証環境の起動

```bash
pnpm dev
```

`vite dev --config vite.config.cloudflare.ts` で workerd 上のローカルサーバーが http://localhost:3000 に起動する（package.json の `scripts.dev`）。

### デプロイ方法

```bash
pnpm deploy:staging
```

ステージング環境への反映。Tailwind CSS のビルド差分確認のため、ステージングでの確認を推奨（package.json の `scripts.deploy:staging`）。

## 自動チェック（必須）

- [ ] `pnpm typecheck` がグリーン
- [ ] `pnpm lint` がグリーン
- [ ] `pnpm format:check` がグリーン
- [ ] `pnpm build` がグリーン

## 確認項目

> 注: manual-test スキル実行はユーザー指示によりスキップ。下記は将来的な手動確認の指針として残す。

### 1. 主要画面の見た目回帰

- **目的:** Tailwind utility 移行で既存画面の見た目が大きく崩れていないことを確認
- **手順:** `pnpm dev` 起動後、以下の主要画面を順に開く
  1. ログイン画面（`/login`）
  2. 管理画面トップ（`/admin`）
  3. ノート編集画面（`/admin/notes/new`、`/admin/notes/{id}/edit`）
  4. ノート一覧画面（`/admin/notes`）
  5. タグ管理（`/admin/tags`）
  6. ゴミ箱（`/admin/trash`）
  7. アカウント設定（`/admin/account`）
  8. パブリックランディング（`/`）
  9. パブリックノート詳細（`/u/{handle}/{slug}`）
- **期待結果:** spec/design/drafts/ のモックや移行前のスクリーンショットと比較し、レイアウト・配色・余白が同等であること
- **確認ポイント:** `:focus-visible` のフォーカスリング、ホバー状態、`pill-btn` / `field` 系のフォーム要素

### 2. WYSIWYG エディタ・本文プレビュー

- **目的:** `.note-detail-content` の prose スタイル（`@layer components` に残置）が正常に効くこと
- **手順:**
  1. ノート編集画面で本文（H1/H2/H3/p/a/code/pre/blockquote/ul/ol/img）を含むコンテンツを編集
  2. プレビュー画面（`HtmlEditor` の表示）と、保存後のパブリック詳細画面（`NoteDetail`）の両方で表示確認
- **期待結果:** 見出し・段落・コード・リスト・引用・画像のスタイルが移行前と同等
- **確認ポイント:** `dangerouslySetInnerHTML` で挿入される HTML 内の要素にスタイルが当たっていること

### 3. 状態 class の `data-*` 化動作

- **目的:** `pill-btn primary` / `field has-error` / `note-tile is-selected` / `dropzone dragover` 等の状態スタイルが `data-*` バリアントで正しく動くこと
- **手順:**
  1. プライマリボタンとセカンダリボタンの見た目差
  2. フォームのバリデーションエラー状態
  3. ノート一覧での選択状態
  4. ファイルアップロードのドラッグオーバー状態
  5. パスワード強度メーター（`.strength[data-level]`）の段階表示
- **期待結果:** 各状態の見た目が移行前と同等

### 4. レスポンシブ動作

- **目的:** `--bp-*` を `--breakpoint-*` にブリッジしたメディアクエリが正しく効く
- **手順:** ブラウザの幅を `sm` (640px) / `md` (768px) / `lg` (1024px) / `xl` (1280px) でリサイズ
- **期待結果:** 既存と同じブレークポイントで切り替わる

## エッジケース・異常系

### 1. `:focus-visible` フォーカスリング

- **目的:** `@layer base` に置いた `:focus-visible { box-shadow: ... }` が Tailwind utility と衝突しない
- **手順:** Tab キーで要素間を移動
- **期待結果:** 全要素にフォーカスリングが表示される。utility で `focus-visible:ring-*` を当てた要素はそちらが優先される

### 2. `backdrop-filter` のフォールバック

- **目的:** `public-header` 等の `backdrop-filter` が効かないブラウザでフォールバックが効くこと
- **手順:** `supports-[backdrop-filter]:` の効くブラウザと効かないブラウザで比較
- **期待結果:** どちらでもヘッダー背景の視認性が確保される

## 既存機能への影響確認

- 純粋な CSS リファクタリングのため、サーバーロジック・データ取得・状態管理への影響は想定なし
- 既存 unit/integration テスト（`pnpm test`）がグリーンであれば挙動側の回帰はない想定

## 完了基準の自己チェック

- [ ] `app/components/` / `app/routes/` 配下の `className` がすべて Tailwind utility（または `.note-detail-content` の prose 例外）で構成されている
- [ ] `app/styles/{app,theme,admin}.css` と `app/components/public/public.css` が削除されている
- [ ] `tokens.css` の CSS 変数が `@theme inline` でブリッジされている
- [ ] 既存画面の見た目が大きく崩れない
- [ ] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build` がグリーン
- [ ] Issue #68 で指摘されたクラス未定義問題（`wysiwyg-editor` 等）が解消されている
- [ ] `app/routes/admin/route.tsx` の `admin.css?url` import が削除されている
