# TC-4: ランディングページからホームへの遷移

**結果**: PASS

## 観察
- 起点: `http://localhost:3001/`（未ログインのためランディングページ）
- 操作: ヘッダーの "Hollow" ロゴリンク（ref=e1, `<Link to="/" search={HOME_SEARCH}>`）をクリック
- 遷移後 URL: `http://localhost:3001/`
- クエリ文字列: なし（`HOME_SEARCH = {}` が反映されている）

`<Link search={HOME_SEARCH}>` が空オブジェクトを渡すため、URL に `?page=1&limit=20` が付与されないことを確認。

## スクリーンショット
`screenshots/tc4-landing-to-home.png`
