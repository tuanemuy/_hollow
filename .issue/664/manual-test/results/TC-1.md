# TC-1: タグ 3 連クリックで全件累積
**結果**: PASS
**セッション**: verify-tc-001
## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|---|---|---|---|
| 1 | cookie 注入後 `/` を open し snapshot | FilterBar にタグチップ表示、ref 取得 | `#test-tag-01`=@e13, `#test-tag-02`=@e14, `#test-tag-03`=@e15 を取得 | PASS |
| 2 | `batch "click @e13" "click @e14" "click @e15"`（待機なし連続クリック） | 3 クリックすべて成功 | 3 件とも `✓ Done` | PASS |
| 3 | `wait --load networkidle` 後 `get url` | tagNames に 3 タグすべて含まれる | `http://localhost:3001/?tagNames=%5B%22test-tag-01%22%2C%22test-tag-02%22%2C%22test-tag-03%22%5D`（=`["test-tag-01","test-tag-02","test-tag-03"]`） | PASS |
| 4 | aria-pressed と一覧の絞り込み確認 | 3 チップとも aria-pressed=true、一覧が 3 タグ AND で絞り込み | 3 チップとも `aria-pressed=true`。一覧は 3 タグすべてを持つ "Test Note 01" のみ表示 | PASS |
## 失敗詳細（FAILの場合のみ）
