# TC-1: BulkExportDialog 起動 → `/exports/{jobId}` 遷移

**結果**: PASS
**実行時間**: 約 40 秒
**セッション**: verify-tc-1

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` で test-a ログイン | `/?page=1&limit=20` へ遷移 | URL 一致、ヘッダに「test-a のメニュー」 | PASS |
| 2 | ノート一覧で 2 件のノート (Issue12 Note 3, Issue12 Note 2) にチェック | 一括操作ツールバーが出現 (region "一括操作") | 出現 (移動 / 公開設定 / エクスポート / ゴミ箱へ / 選択解除) | PASS |
| 3 | 「エクスポート」ボタンを押下 | BulkExportDialog 起動 | ダイアログ表示「2 件のノートをエクスポート」 | PASS |
| 4 | HTML がデフォルトで選択されていることを確認 | HTML radio = checked | radio "HTML" [checked=true] | PASS |
| 5 | 「実行」ボタン押下 | `/exports/{jobId}` に遷移 | `http://localhost:3000/exports/019e40fd-f5dc-739f-85bb-69d4e7af1b67` へ遷移 (`/exports?offset=0` ではない) | PASS |
| 6 | 詳細ページ見出し「エクスポートジョブ詳細」 | h1 表示 | heading "エクスポートジョブ詳細" [level=1] | PASS |
| 7 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-1/result.png` | 保存完了 | PASS |

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/12/manual-test/screenshots/tc-1/result.png`
