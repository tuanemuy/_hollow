# TC-7（AC-8）フィルタポップオーバーの相互排他

- 結果: **PASS**
- 実行日: 2026-06-13
- セッション: verify-tc-007（dev-admin、http://localhost:3001/）

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | 「期間」チップをクリック | 期間ポップオーバーが開く | `button "期間" [expanded=true]`、タグ・公開状態は `expanded=false` | PASS |
| 2 | 「+ タグ」（aria-label="タグで絞り込み"）をクリック | 期間が閉じ、タグピッカーだけが開く（listbox が1つ） | `button "タグで絞り込み" [expanded=true]`、`listbox "タグで絞り込み"` が1件のみ、期間・公開状態は `expanded=false` | PASS |
| 3 | タグピッカー表示中に「公開状態」チップをクリック | タグピッカーが閉じ、公開状態だけが開く | `button "公開状態" [expanded=true]`、タグ・期間は `expanded=false`、listbox 消失 | PASS |

## 備考

- 各ステップでスナップショット上の `expanded` 属性と listbox 数を確認し、常に開いているポップオーバーは最大1つであった。
