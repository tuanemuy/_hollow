# TC-2（確認項目2 / AC-2）永続値があれば初期表示に適用される（URL/SavedView 無指定時）

判定: PASS

## 操作ログ

| # | 操作 | 結果 |
| - | --- | --- |
| 1 | `localStorage.setItem('hollow3:noteList:display','calendar')` | 設定 |
| 2 | `http://localhost:3000/`（クエリなし）を再読込 | URL = `http://localhost:3000/`（クエリ付与なし） |
| 3 | tablist の active を確認 | 「カレンダー」が `[selected]` |
| 4 | 一覧描画を確認 | 日付見出し（例「2026年6月13日(土)」「2026年6月7日(日)」…）でグルーピングされたカレンダー表示 |

## 確認ポイント

- segmented の active（カレンダー）と実際の一覧描画（日付グルーピング）が一致。
- リスト/タイルには日付見出し（main h2）が無く、カレンダーのみ日付グルーピング表示になる差を確認。
