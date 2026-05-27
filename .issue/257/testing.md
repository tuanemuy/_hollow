# 動作確認計画 — Issue #257: アップロードモーダルのレスポンシブ改善

**Issue:** #257
**作成日:** 2026-05-28

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

`pnpm dev` は `vite dev --config vite.config.cloudflare.ts` を実行し、Cloudflare Workers の dev サーバーを立ち上げる（package.json `scripts.dev` で確認）。

### 静的検証

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
```

### デプロイ方法

なし（検証環境のローカル起動で確認できる）。

---

## 確認項目

### 1. モバイル幅でアップロードモーダルのボタンが 44px 以上

- **目的:** Resp-H2 / Critique H-4 を解消。モバイルで pill ボタンのタッチターゲットが 44px 以上であることを確認
- **手順:**
  1. DevTools のレスポンシブモードで幅を 375px（iPhone SE）に設定
  2. ヘッダーの「アップロード」ボタンを押してモーダルを開く（SelectView）
  3. 「取り込みキューを見る」ボタンの高さを computed style で計測
  4. 何かファイルをアップロードして editing view まで進める
  5. action bar の「キャンセル」「破棄」「登録」ボタンの高さを計測
- **期待結果:** いずれのボタンも `height >= 44px`（モバイル幅では `min-h-[44px]` が効いている）
- **確認ポイント:** デスクトップ幅（>= 640px）では `h-9 = 36px` のまま（`max-sm:` で sm 未満限定）

### 2. 二重スクロールの解消（Resp-H1）

- **目的:** モーダル内のスクロールコンテナが 1 つに統一されていることを確認
- **手順:**
  1. 長い本文を持つファイル（数千文字の HTML / Markdown / PDF など）をアップロードし、editing view まで進める
  2. 本文プレビュー領域が外側スクロール（form 内の単一スクロール）にのみ反応することを確認
  3. 本文プレビュー領域内をマウスホイール / タッチでスクロール → 全体スクロールが動き、本文プレビュー自身は独自のスクロールバーを持たない
- **期待結果:** スクロールバーが 1 本だけ表示される（panel 全体ではなく form 内のコンテンツ領域）。本文プレビュー領域に内側スクロールバーが現れない

### 3. action bar が panel 最下端に固定

- **目的:** Resp-H1。action bar がコンテンツの中ほどに浮かず、常に panel の最下端で固定されること
- **手順:**
  1. 長い本文を持つジョブの editing view を表示
  2. content 領域を上下にスクロール
  3. 「キャンセル / 破棄 / 登録」の action bar が常に panel の最下端に張り付いている
- **期待結果:** スクロール中に action bar の位置が動かない。border-top のラインも常に bottom 固定
- **確認ポイント:** モバイル縦（375×667）/ 横（667×375）/ タブレット幅（768px）でも崩れないこと

### 4. iOS safe-area-inset 対応

- **目的:** iOS Safari の home indicator と action bar が重畳しないことを確認
- **手順:**
  1. iOS Simulator（iPhone 14 Pro 等、home indicator あり）で `pnpm dev` のページにアクセス
  2. editing view を表示
  3. action bar と画面下端（home indicator）の関係を目視
- **期待結果:** action bar の最下部が home indicator に被らず、適切な safe-area の余白が取られている
- **確認ポイント:** `viewport-fit=cover` を入れたことで横向き時 notch 領域に背景色（`--color-bg`）が見える。これは想定どおりだが視覚的 regression に見えないかも合わせて確認

### 5. 他 Dialog consumer の見た目 regression が無い

- **目的:** `dialog` クラスに `flex flex-col` を追加した影響で他の Dialog が崩れていないことを確認
- **手順:** 以下の Dialog を順に開いて目視
  1. `ConfirmDialog` — 破棄確認（IngestionPreviewForm で「破棄」ボタンクリック）
  2. `NotePickerDialog` — note list の filter で開く
  3. `MoveNoteDialog` — note 移動ダイアログ
  4. `SaveViewDialog` — note list のフィルタ保存
  5. `BulkVisibilityDialog` — 一括公開設定
  6. `BulkExportDialog` — 一括エクスポート
  7. `MergeTagDialog` — タグマージ
- **期待結果:** いずれも従来どおりの縦並びレイアウト・余白で表示される

## エッジケース・異常系

### 1. 本文プレビューが空 / 極端に短い場合

- **目的:** flex-1 min-h-0 のスクロール領域がコンテンツ最小高さで崩れないこと
- **手順:** 短い本文（1〜2 行）のジョブを editing view で開く
- **期待結果:** form がコンパクトに表示され、action bar が最下端に固定。余分な空白が出ない

### 2. キーボード操作（Tab focus trap）

- **目的:** flex column 化で focus trap が壊れていないこと
- **手順:** editing view を Tab で巡回 → 全フィールドと action bar の 3 ボタンを順に巡る
- **期待結果:** focus trap が機能し、Dialog 内をループする

## 既存機能への影響確認

- ConfirmDialog の破棄確認フロー（IngestionPreviewForm 破棄ボタン → 確認 → discard 実行）
- UploadDialog の各 view 遷移（select → uploading → waiting → editing → commit/discard）
- IngestionPreviewForm の AI suggestion badge、DirectoryPicker、FrontMatter details 折りたたみ

## 確認チェックリスト

- [ ] モバイル幅でボタンが 44px 以上
- [ ] デスクトップ幅でボタンが 36px のまま
- [ ] 二重スクロールが解消（panel と本文プレビューの両方にスクロールバーが現れない）
- [ ] action bar が常に panel 最下端に固定
- [ ] モバイル縦/横、タブレット幅で崩れない
- [ ] iOS Simulator で safe-area-inset-bottom が効く
- [ ] 他 7 つの Dialog consumer に regression が無い
- [ ] focus trap / Tab cycle が機能
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test:unit` 全て green
