# Issue #655 マニュアルテスト結果サマリー

実施日: 2026-06-12 / 対象: http://localhost:8787（起動済みローカルサーバー）/ ツール: agent-browser

| TC | 内容 | 結果 |
|----|------|------|
| TC-1 | XHR バイト進捗の determinate ProgressBar + アップロード中表示 + 完了時挿入（AC-1, AC-2） | 部分 PASS（環境ブロック） |
| TC-2 | PUT 失敗時の RetryableError + 再試行で同一ファイル再送（AC-3, AC-4） | PASS |
| TC-3 | エッジケース: 進捗未取得時の indeterminate 劣化表示 | PASS |
| 既存機能影響 | presign → PUT → finalize → HTML 挿入 / アップロード中 input disabled | disabled 維持は確認。フロー完走は環境ブロック |

## 確認できたこと

- presigned PUT が fetch ではなく **XHR** で発行される（network ログの resource type で確認）。
- uploading 状態で `アップロード中…` テキスト + decorative（`aria-hidden`、role なし）の ProgressBar が表示される。progress 未取得時は indeterminate（`w-2/5 animate-pulse`）。
- determinate 経路（`アップロード中…（n%）` + `style.width=n%` + `transition-[width]`）はコード構造で確認（`MediaUploader.tsx` / `ProgressBar.tsx`）。
- PUT 失敗時に alert ロールの RetryableError（「エラーが発生しました」+ 再試行ボタン）が表示され、再試行で**新しい presign + 同一ファイル（同一 byteSize）の XHR PUT** が再送される。
- アップロード中は file input が disabled、終了（エラー）後に再 enabled。
- ページ JS エラーなし。

## 環境ブロック（実装不具合ではない）

1. **R2 バケット CORS 未設定**: presigned PUT 先 `hollow-local-objects`（リモート R2）に CORS ルールがなく、preflight OPTIONS が 403 → ブラウザからの PUT は必ず失敗。fetch 時代も同条件のため #655 の退行ではない。同 URL への curl PUT は 200（URL 自体は有効）。dev クレデンシャルには PutBucketCors 権限なし、CLOUDFLARE_API_TOKEN も未設定で修正不可。
2. **presign（リモート R2）と finalize（ローカル miniflare binding）のストア不一致**: リモートに PUT 成功させても finalize の head がローカル binding を見るため 500。ローカルで presigned フローを E2E 完走させるには remote binding か CORS + 同一ストア構成が必要。

→ 推奨: ローカル動作確認用に R2 バケットの CORS 設定（origin: APP_URL, method: PUT）と remote binding（または presign のローカル fallback）を整備する Issue を検討。

## テスト時の環境変更（復元済み）

- ローカル D1 `instance_settings.limits_json.maxNoteBytes` を 1 MiB → 100 MiB に一時変更（27MB テスト画像の presign を通すため）。テスト後 1 MiB に復元。
- リモート R2 に curl 検証で 1 オブジェクト（pending mediaId 019eba1b-...）が残存。refCount=0 の pending のためオーファンパージ対象。
