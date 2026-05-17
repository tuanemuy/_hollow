# テスト実行サマリー

**実行日時**: 2026-05-18
**テストソース**: .issue/6/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | /todo ルートが 404 になること | 正常系 | PASS | - |
| TC-002 | トップページが正常に表示されること | 正常系 | PASS | - |

**合計**: 2 件（PASS: 2 / FAIL: 0）

## TC-001 詳細

- `/todo` へアクセスすると「ページが見つかりません」と表示され、Error code: 404 Not Found が確認された
- スクリーンショット: screenshots/tc-001/

## TC-002 詳細

- トップページが正常にレンダリングされ、Hollow の機能紹介が表示された
- todo 関連のリンクや要素は一切表示されていない
- スクリーンショット: screenshots/tc-002/

## 自動テスト結果

- `pnpm typecheck`: PASS（エラー 0 件）
- `pnpm lint:fix`: PASS（既存スコープ外の警告 2 件のみ）
- `pnpm test:unit`: PASS（84 ファイル / 1324 テスト）
- `pnpm test:integration`: PASS（13 ファイル / 175 テスト）
