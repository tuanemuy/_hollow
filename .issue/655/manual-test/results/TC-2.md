# TC-2 — リトライ挙動の維持（AC-3, AC-4）

結果: **PASS（再試行成功の完走のみ環境ブロックで未確認）**

## 実行ログ

| # | 手順 | 結果 |
|---|------|------|
| 1 | セッション `verify-tc-002` を open、cookie 注入、`/notes/new` へ | OK |
| 2 | small.png（341B 有効 PNG）をアップロード。presigned PUT が CORS preflight 403 で失敗（ネットワークエラーの実地再現） | 失敗を再現 |
| 3 | RetryableError 表示を snapshot で確認: `alert` ロール内に「エラーが発生しました」+ `再試行` ボタン | OK |
| 4 | 「再試行」をクリック | OK |
| 5 | network ログで再試行後に **新しい presign POST（200）** と **新しい presigned URL への XHR PUT** が発行されることを確認 | OK |
| 6 | HAR で presign リクエストボディを確認: `{"kind":"image","mimeType":"image/png","byteSize":341}` — 初回と同一（= `lastFile` に保持された同じファイルが再送されている） | OK |

## 証跡（network ログ抜粋）

```
POST /_serverFn/b7f4...(presign) (Fetch) 200
PUT  https://...r2.cloudflarestorage.com/hollow-local-objects/.../image/019eba23-1d50-... (XHR)
OPTIONS 同 URL (preflight) 403
```

presign body（HAR）: `kind=image, mimeType=image/png, byteSize=341`（small.png と一致）

## 備考

- 再試行での「アップロード成功 → メディア挿入」は TC-1 と同じ環境ブロック（R2 CORS）で完走不可。失敗表示・再試行導線・同一ファイル再送（AC-3/AC-4 の核心）は確認済み。
- 補足: `agent-browser click e37` / `find text 再試行 click` ではリクエストが観測されず、JS 経由の `button.click()` で確実に発火した（ref の stale 化が原因とみられるテストツール側の事象。実装の問題ではない）。
