# TC-3 — エッジケース1: 進捗が取得できない場合の劣化表示

結果: **PASS（完了挿入のみ環境ブロックで未確認）**

## 実行ログ

| # | 手順 | 結果 |
|---|------|------|
| 1 | セッション `verify-tc-003` を open、cookie 注入、`/notes/new` へ | OK |
| 2 | small.png（341B）をアップロードし、batch eval で uploading 直後の DOM を捕捉 | OK |
| 3 | 進捗未取得（progress=null）の間の表示: `アップロード中…`（% なし）+ indeterminate バー `<div aria-hidden="true" ...><div class="... w-2/5 motion-safe:animate-pulse"></div></div>` | OK（劣化表示が期待どおり） |
| 4 | uploading 中 `input[type=file].disabled === true` | OK |
| 5 | ページ JS エラー（`agent-browser errors`）なし | OK |
| 6 | PUT 失敗（環境の CORS ブロック）後、input が再度 enabled（disabled === false）に戻り、エラー UI に劣化なく遷移 | OK |

## 備考

- `lengthComputable` でない／progress イベントが来ない間は indeterminate バー（パルス）が表示され、クラッシュ等は発生しないことを確認。
- 「エラーにならずアップロードが完了する」の完走部分は R2 CORS の環境ブロック（TC-1 参照）により未確認。実装側の問題は検出されず。
