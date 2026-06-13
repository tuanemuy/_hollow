# TC-6（エッジ1 / AC-6・AC-7）localStorage 不正値でもクラッシュしない

判定: PASS

## 操作ログ

| # | 操作 | 結果 |
| - | --- | --- |
| 1 | `localStorage.setItem('hollow3:noteList:display','bogus')` | `"bogus"` |
| 2 | `http://localhost:3000/`（クエリなし）を再読込 | main h1 = 「すべてのノート」表示（クラッシュなし） |
| 3 | tablist の active を確認 | 「リスト」が `[selected]`（既定フォールバック） |
| 4 | `localStorage.getItem(...)` を再取得 | `"bogus"`（読み取り専用フォールバックで上書きしない） |
| 5 | コンソールログを確認 | vite 接続ログ / React DevTools 案内 / tanstack-router の code-split 警告のみ。hydration mismatch 警告・致命的エラーは無し |

## 確認ポイント

- 不正値 `"bogus"` は無視され、一覧はリスト表示（既定）にフォールバック。
- 画面はクラッシュせず、致命的エラーなし。
- React の hydration mismatch 警告がコンソールに出ない（AC-6 満たす）。
