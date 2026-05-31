# 動作確認計画 — Issue #296: DEVモードで __root.tsx の loadAppContext が画面遷移ごとに発火する

**Issue:** #296
**作成日:** 2026-05-31

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

DEV モード（`import.meta.env.DEV === true`）でのみ挙動が変わるため、`pnpm dev`（vite dev）で確認する。`pnpm start`（wrangler dev）はビルド済み dist を配信し DEV フラグの挙動が異なるため、本 Issue の確認には使わない。

### デプロイ方法

なし（検証環境のみで確認できる。本番挙動は変更なし）。

## 確認項目

### 1. 画面遷移で loadAppContext が再発火しない

- **目的:** DEV モードで画面遷移・URL 更新のたびに `loadAppContext`（`_serverFn`）が発火しなくなったことを確認する。
- **手順:**
  1. `pnpm dev` でサーバーを起動し、ブラウザでアプリを開く。
  2. DevTools の Network タブを開き、`_serverFn` リクエストでフィルタする。
  3. ノート一覧でビュー切替（リスト/タイル/カレンダー）やフィルタ操作を行い、URL を更新する。
  4. 別ページへ SPA 遷移する。
- **期待結果:** ビュー切替・フィルタ操作・SPA 遷移のいずれでも `loadAppContext` 由来の `_serverFn` リクエストが新たに発火しない。
- **確認ポイント:** 初回ロード時の 1 回のみ発火し、以降のナビゲーションでは 0 件であること。

## 既存機能への影響確認

- **SSR head/meta:** ページのタイトル・favicon・OGP 等（`buildHead(config)` 由来）が従来どおり正しく表示されること。
- **サイト設定の表示:** `config` 由来の表示内容が初回ロードで正しく反映されること。

## 確認チェックリスト

- [ ] 画面遷移・URL 更新で `loadAppContext` が再発火しない（初回のみ）
- [ ] SSR head/meta が正しく表示される
- [ ] サイト設定由来の表示が正しい
