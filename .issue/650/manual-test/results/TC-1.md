# TC-1（確認項目1 / AC-1）表示モードの選択が localStorage に永続化される

判定: PASS

## 操作ログ

| # | 操作 | 結果 |
| - | --- | --- |
| 1 | ホーム `http://localhost:3000/`（クエリなし）を認証済みで開く | P10 認証済み一覧（22件）、tablist「表示形式」表示 |
| 2 | `localStorage.getItem('hollow3:noteList:display')` | `null`（初期値） |
| 3 | segmented「タイル」(tab e11) をクリック | OK |
| 4 | 再取得 | `"tile"` |
| 5 | segmented「カレンダー」(tab e12) をクリック → 取得 | `"calendar"` |
| 6 | segmented「リスト」(tab e10) をクリック → 取得 | `"list"` |

## 確認ポイント

- 各クリック後の値が `"tile"` / `"calendar"` / `"list"` に更新された。
- JSON 化されていない素の文字列で保存されることを確認。
