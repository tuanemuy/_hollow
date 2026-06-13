# TC-3: 期間 7d/30d/1y は従来どおり（リグレッション）（AC-5）

結果: **PASS**

## 実行ログ

| ステップ | 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `/search?q=hollow671&period=7d` を直接開く | ページ表示 | URL=`...&period=7d&limit=20` | PASS |
| 2 | チップ・バッジを確認 | チップ「過去7日」／バッジ数字1以上 | チップ `button "過去 7 日 を解除"`、バッジ `button "フィルター 1"`、結果3件 | PASS |
| 3 | フィルターを開き期間ラジオを確認 | 「過去7日」checked | `radio "過去 7 日 3" [checked=true]`、他 false | PASS |
| 4 | `/search?q=hollow671&period=1y` を開く | ページ表示 | URL=`...&period=1y&limit=20` | PASS |
| 5 | チップ・バッジ・ラジオを確認 | チップ「過去1年」／バッジ／ラジオ checked | チップ `button "過去 1 年 を解除"`、バッジ `button "フィルター 1"`、結果8件、`radio "過去 1 年 8" [checked=true]`（他 false） | PASS |

## 確認した値

### period=7d
- URL=`http://localhost:3000/search?q=hollow671&period=7d&limit=20`
- チップ: `過去 7 日 を解除`、バッジ: `フィルター 1`、結果: 3件
- ドロワー: `radio "過去 7 日 3" [checked=true]`

### period=1y
- URL=`http://localhost:3000/search?q=hollow671&period=1y&limit=20`
- チップ: `過去 1 年 を解除`、バッジ: `フィルター 1`、結果: 8件
- ドロワー: `radio "過去 1 年 8" [checked=true]`

件数はシード期待値（7日=3 / 1年=8）と一致。従来挙動を維持。AC-5 を満たす。
