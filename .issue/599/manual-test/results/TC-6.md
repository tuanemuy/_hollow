# TC-6（AC-5 回帰・ユーザー公開トップ正常系）

- **結果:** PASS

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `http://localhost:3000/u/dev-admin` を開く | dev-admin のプロフィールとノート一覧が正常表示（404/500 ではない） | heading「Dev Admin」「@dev-admin」「公開ノート 5」、region「公開ノート一覧」に 5 件のノートリンクを表示。404/500/ErrorPage なし | PASS |

実テキスト根拠: `heading "Dev Admin"` / `StaticText "@dev-admin"` / `region "公開ノート一覧"` に 5 件のノート（「1週間以内のノート hollow671」等）。
