# TC-PROD: Issue #636 本番ビルド streaming スモークテスト

- 日時: 2026-06-11
- 対象: wrangler dev（本番ビルド） http://localhost:8787
- セッション: agent-browser `verify-prod` / 認証: `__Host-session=dev-admin-session-token`

## 結果サマリ: PASS（4/4）

| # | 項目 | 結果 |
|---|------|------|
| 1 | ホーム完全描画 | PASS |
| 2 | ハイドレーション（タグ絞り込み・選択モード） | PASS |
| 3 | クライアントナビ /tags | PASS |
| 4 | SSR HTML streaming 痕跡 | PASS |

## 詳細

### 1. ホーム描画

cookie 設定後にリロード。サイドバー（ライブラリ/ディレクトリツリー（Research > 書籍要約 ほか）/管理: 保存ビュー・タグ・ゴミ箱・エクスポートジョブ・アップロード）、ツールバー（リスト/タイル/カレンダー、選択モード、ビューとして保存）、タグチップ（#design 等）、ノート一覧（11件）すべて描画。

スクショ: `screenshots/prod/01-home.png`

### 2. インタラクション（ハイドレーション確認）

- タグチップ `#design` クリック → URL が `/?tagNames=%5B%22design%22%5D` に変化、`aria-pressed=true` のチップ 1 件（#design）。一覧が該当ノートに絞り込み。
- 選択モードボタン → BulkActionBar（`region "一括操作"`、"0 件選択中"）が表示され、各ノートにチェックボックスが出現。

→ ハイドレーション正常。

### 3. クライアントナビゲーション /tags

サイドバーの「タグ」リンクをクリック → `/tags` に遷移。「タグ管理」見出し、4 件のタグ、新規タグフォーム、検索・並び替え UI、タグ一覧が描画。

スクショ: `screenshots/prod/02-tags.png`

### 4. SSR HTML（curl）所見

`curl -s -H "Cookie: __Host-session=dev-admin-session-token" http://localhost:8787/`（90,301 bytes、ログイン状態のホーム HTML — 「すべてのノート」「サイドバー」を含む。ランディングではない）:

- Suspense ストリーミング境界マーカー: `<!--$-->` ×10 / `<!--/$-->` ×10（解決済み境界として完結）
- `$_TSR` チャンク: 28 箇所（TanStack Start のストリーミングシリアライズ）
- `aria-busy="false"` ×1（解決後の状態がストリーム末尾で確定）
- 未解決フォールバック（`<template id="B:` / `$RC=`）: 0 — curl はストリーム完了まで受信するため、全境界が解決済みで出力される。streaming SSR は機能している。

## クリーンアップ

セッション `verify-prod` を close 済み。
