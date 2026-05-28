# Edge Case 1: select 戻り時の SR 重複 announce を防止

**結果**: PASS
**セッション**: verify-tc-005

## 実行ログ

| # | 操作 | 期待 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | 空の `empty.txt` をアップロード（バリデーションエラーで select に戻る） | status 領域は空、alert に「エラーメッセージ」を 1 回だけ表示 | role="status" の textContent="", role="alert" の textContent="エラーが発生しました" | PASS |

## DOM 検証

```json
{
  "alertRole": "alert",
  "alertText": "エラーが発生しました",
  "statusRole": "status",
  "statusAriaLive": "polite",
  "statusText": "",
  "statusIsEmpty": true
}
```

`viewStatusText({kind:'select'})` が空文字を返すため、SR は `role="alert"` のメッセージのみを読み上げ、直前の `role="status"` のメッセージ（例: "アップロード中"）は再 announce されない。

## スクリーンショット

- select with alert: `screenshots/tc-edge-1/select-with-alert.png`
