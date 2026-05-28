# Edge Case 2: Dialog 再オープン時の status region 初期化

**結果**: PASS
**セッション**: verify-tc-004

## 実行ログ

| # | 操作 | 期待 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | editing view まで進めた後 ConfirmDialog 経由で破棄して dialog を閉じる | dialog closed, URL から #upload 消える | OK | PASS |
| 2 | 再度 `#upload` で dialog を開く | select view 初期表示、status region は空文字 | statusEmpty=true, statusText="" | PASS |

## DOM 検証

```json
{
  "dialogOpen": true,
  "statusEmpty": true,
  "statusText": ""
}
```

UploadDialog の `useEffect` (open === true 時の reset) で `setView({kind:'select'})` が走り、`viewStatusText({kind:'select'})` が空文字を返すため status region は初期化される。

## スクリーンショット

- 再オープン: `screenshots/tc-edge-2/reopened.png`
