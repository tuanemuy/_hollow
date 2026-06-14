# TC-3（AC-2）: `/u/$username/$noteSlug` で存在しない slug は 410 表示

- **結果:** PASS

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `http://localhost:3000/u/dev-admin/this-slug-does-not-exist` を開く | 「410」「このノートは公開されていません」（500 ではない） | heading「このノートは公開されていません」+「Error code: 410 Gone」。500 は出ていない | PASS |

実テキスト根拠: `heading "このノートは公開されていません"` / `StaticText "Error code: 410 Gone"`
