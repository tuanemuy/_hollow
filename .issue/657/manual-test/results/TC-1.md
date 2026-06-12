# TC-1: presigned アップロードフロー E2E（AC-1/AC-2/AC-3）

**結果**: PASS
**実行時間**: 約60秒
**セッション**: verify-tc-1

## 環境
- サーバー: http://localhost:8787（wrangler dev、ポート8787固定）

## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | テスト画像生成（/tmp/test-upload.png, 787,127 bytes < 1MiB） | 制限内の PNG が用意できる | 512x512 PNG 約769KB 生成 | PASS |
| 2 | `__Host-session` cookie 注入 → http://localhost:8787 を開く | ログイン状態（Dev Admin） | サイドバーに "Dev Admin / dev-admin@example.com" 表示 | PASS |
| 3 | 「新規作成」→ ノート編集画面、タイトル入力 | エディタ表示 | 「新規ノート」フォーム表示 | PASS |
| 4 | 「メディアを追加」input に画像を upload | アップロード開始 | XHR PUT 発火 | PASS |
| 5 | AC-1: PUT 先 URL 確認（performance resource entries） | same-origin `http://localhost:8787/dev/r2/...` で成功、`r2.cloudflarestorage.com` へのリクエストなし | PUT 先: `http://localhost:8787/dev/r2/hollow-local-objects/.../image/019ebc98-...?X-Amz-Algorithm=AWS4-HMAC-SHA256&...`（dur=29ms）。`r2.cloudflarestorage.com` へのリクエスト 0 件 | PASS |
| 6 | AC-2: finalize 成功 → 本文に `/media/<id>` 画像挿入 | `<img src="/media/<id>">` が挿入される | `img src=http://localhost:8787/media/019ebc98-2c02-7437-af7e-1b49a9cdc86a` が本文に挿入 | PASS |
| 7 | AC-3: 挿入画像の表示確認 | `/media/<id>` 経由で画像がロードされる（complete && naturalWidth>0） | `complete: true, naturalWidth: 512`、resource entries に `img /media/<id>` ロード記録あり | PASS |
| 8 | console エラー確認 | エラーなし | console 出力なし | PASS |
