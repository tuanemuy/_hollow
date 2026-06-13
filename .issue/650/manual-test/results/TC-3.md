# TC-3（確認項目3 / AC-3）URL `?display=` 明示指定は永続値より優先される

判定: PASS

## 操作ログ

| # | 操作 | 結果 |
| - | --- | --- |
| 1 | localStorage を `"calendar"` にしておく | `"calendar"` |
| 2 | `http://localhost:3000/?display=tile` を開く | OK |
| 3 | `location.href` を確認 | `http://localhost:3000/?display=tile`（クエリ維持・書換なし） |
| 4 | tablist の active を確認 | 「タイル」が `[selected]` |
| 5 | 一覧描画を確認（main h2 の数） | `0`（日付見出しなし＝カレンダーではない＝タイル表示） |
| 6 | `localStorage.getItem(...)` を再取得 | `"calendar"`（不変） |

## 確認ポイント

- 永続値 calendar に対し URL `?display=tile` が優先され、タイル表示・タイル active。
- URL の `?display=tile` が消えない／書き換わらない。
- localStorage は `"calendar"` のまま変化しない（URL 由来は永続化しない）。
