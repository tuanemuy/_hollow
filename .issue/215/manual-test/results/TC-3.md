# TC-3: 既存の `?page=1&limit=20` 付き URL を直接開いて壊れない確認

**結果**: PASS

## 観察
- アクセス URL: `http://localhost:3001/?page=1&limit=20`
- 遷移後 URL: `http://localhost:3001/?page=1&limit=20`
- ページタイトル: "TanStack Start Template"
- エラー表示なし。クエリはそのまま保持されている（schema が optional として吸収）。

## スクリーンショット
`screenshots/tc3-home-with-query.png`
