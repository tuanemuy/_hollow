# TC-2: 期間未指定時にラジオ「すべて」が checked（AC-2）

結果: **PASS**

## 実行ログ

| ステップ | 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `/search?q=hollow671`（period 無し）を開く | ページ表示 | URL=`...&limit=20`（period 無し） | PASS |
| 2 | 「フィルター」ボタンでドロワーを開き期間ラジオ群を確認 | ラジオ群表示 | 4つのラジオを snapshot で確認 | PASS |
| 3 | ラジオ checked 状態を確認 | 「すべて」checked、他は未選択 | 下記の通り | PASS |

## ラジオ checked 状態（snapshot 属性）

- `radio "過去 7 日 3" [checked=false]`
- `radio "過去 30 日 5" [checked=false]`
- `radio "過去 1 年 8" [checked=false]`
- `radio "すべて 10" [checked=true]`

期間未指定時、「すべて」が checked、他3つは未選択。AC-2 を満たす。
