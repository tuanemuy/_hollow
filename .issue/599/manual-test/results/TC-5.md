# TC-5（AC-5 回帰・公開ノート詳細正常系）

- **結果:** PASS

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `http://localhost:3000/notes/public/01967100-0000-7000-8000-000000000203` を開く | ノートタイトル「1週間以内のノート hollow671」と本文が正常表示（ErrorPage ではない） | heading「1週間以内のノート hollow671」、article 本文「Issue #671 公開検索フィルター検証ノート03。…」、公開/更新日・タグ #p671-design・関連ノートを表示。ErrorPage なし | PASS |
| 2 | `http://localhost:3000/u/dev-admin/p671-note-03`（bySlug 入口）を開く | 同ノートが正常表示（ErrorPage ではない） | heading「1週間以内のノート hollow671」、同一 article 本文・メタ・関連ノートを表示。ErrorPage なし | PASS |

実テキスト根拠: `heading "1週間以内のノート hollow671"` / `article > paragraph "Issue #671 公開検索フィルター検証ノート03。 hollow671 のフィルターUIを確認します。"`。両 URL とも同内容。
