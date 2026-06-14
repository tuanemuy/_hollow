# TC-4（AC-3）: 存在しないユーザーで 404 表示

- **結果:** PASS

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `http://localhost:3000/u/nonexistent-user-xyz` を開く | 「404」「ページが見つかりません」（500/「予期しないエラー」ではない） | heading「ページが見つかりません」+「Error code: 404 Not Found」。500/「予期しないエラー」は出ていない | PASS |

実テキスト根拠: `heading "ページが見つかりません"` / `StaticText "Error code: 404 Not Found"`
