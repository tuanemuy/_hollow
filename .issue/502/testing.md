# 動作確認計画 — Issue #502: _app の外に残るその他の認証必須ルートに AppShell が付かない

**Issue:** #502
**作成日:** 2026-06-06

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 マイグレーション（未適用時のみ）
pnpm seed:dev-admin   # 動作確認用 admin ユーザー＋セッション
pnpm dev              # 開発サーバー起動（port 3000）
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. `/export`（一括エクスポート）に AppShell が付く

- **目的:** 一括エクスポートフォームが他の認証済みページと同じ Header/Sidebar 付きレイアウトで表示される。
- **手順:**
  1. admin でログインした状態で `/export` を開く。
  2. ページ上部の Header とサイドの Sidebar が表示されているか確認する。
  3. 一括エクスポートフォーム（`noteId=null` の `ExportForm`）が表示されているか確認する。
  4. エクスポート開始（start/enqueue）→ キャンセル（cancel）→ 完了後のダウンロード（download）を一通り操作する。
- **期待結果:** Header/Sidebar が付き、URL は `/export` のまま。start/enqueue/cancel/download の各 server-fn が動作する。
- **確認ポイント:** AppShell の有無（#475 前後の不整合が解消されているか）。action が RSC マニフェスト未登録で 500 等にならないか。

### 2. `/notes/$noteId/export`（単一ノートエクスポート）に AppShell が付く

- **目的:** 単一ノートのエクスポートページが AppShell 付きで表示される。
- **手順:**
  1. admin でログインし、任意のノート詳細 `/notes/$noteId` を開く。
  2. `NoteActions` の「エクスポート」リンクから `/notes/$noteId/export` へ遷移する。
  3. Header/Sidebar が表示されているか確認する。
  4. 単一ノートエクスポートフォームが表示され、エクスポート操作が動作するか確認する。
- **期待結果:** Header/Sidebar が付き、URL は `/notes/$noteId/export` のまま。リンク遷移・エクスポート操作が動作する。
- **確認ポイント:** `NoteActions` のリンク（`to="/notes/$noteId/export"`）が書き換えなしで正しく解決されること。

### 3. `_app` 内 SPA 遷移で AppShell が保持される

- **目的:** 認証済みページ間の SPA 遷移で AppShell が再マウントされず維持される。
- **手順:**
  1. `/`（ホーム）など `_app` 配下のページから `/export` や `/notes/$noteId/export` へクライアント遷移する。
  2. Header/Sidebar がちらつき・再読み込みなく保持されるか確認する。
- **期待結果:** AppShell が保持され、追加の RPC が発生しない（`_app` loader の `staleTime: Infinity` により再実行されない）。

## エッジケース・異常系

### 1. 未認証直アクセス時の redirect 先

- **目的:** `beforeLoad: requireAuthenticatedRoute` 削除に伴う redirect 先の変更（`/login` → `/`+`HOME_SEARCH`）を確認する。
- **手順:**
  1. ログアウト状態（セッション無し）で `/export` に直アクセスする。
  2. 同様に `/notes/$noteId/export` に直アクセスする。
- **期待結果:** いずれも `/`（+`HOME_SEARCH`）へ redirect される（旧 `/login` ではない）。#293 ADR-006 に沿った意図的変更。

## 既存機能への影響確認

- **公開ノートビュー `/notes/public/$noteId`:** export を移動しても公開ビューは据え置き。AppShell 無し・公開挙動（独自 `notFoundComponent`/`errorComponent`/JSON-LD）が従来通り動くこと。
- **`/exports`（複数形・一覧）:** #475 で既に `_app` 取り込み済み。本変更の影響を受けず従来通り表示されること。

## 確認チェックリスト

- [ ] `/export` に Header/Sidebar が付き URL 不変
- [ ] `/export` の start/enqueue/cancel/download が動作
- [ ] `/notes/$noteId/export` に Header/Sidebar が付き URL 不変
- [ ] `NoteActions` のエクスポートリンクから遷移できる
- [ ] `_app` 内 SPA 遷移で AppShell が保持される
- [ ] 未認証直アクセスで両 URL が `/` へ redirect（`/login` ではない）
- [ ] 公開ビュー `/notes/public/$noteId` が従来通り動く（リグレッション）
