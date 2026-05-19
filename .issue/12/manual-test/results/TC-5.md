# TC-5: 一覧の各行 → 詳細リンクで詳細遷移

**結果**: PASS
**実行時間**: 約 20 秒
**セッション**: verify-tc-5

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` で test-a ログイン | `/?page=1&limit=20` | OK | PASS |
| 2 | `/exports` を開く | `/exports?offset=0`、ジョブ 6 件のリスト | URL `/exports?offset=0`、6 件のリストアイテム表示 | PASS |
| 3 | 各行に「詳細」リンクが存在することを確認 | 各 listitem に link "詳細" | 6 行全てに link "詳細" (refs e4, e5, e7, e8, e10, e12, e14 — 各行に必ず 1 つ存在) | PASS |
| 4 | 1 つの行の「詳細」リンクをクリック (e4 = 1 行目 completed expires 2099) | `/exports/{jobId}` に遷移 | `http://localhost:3000/exports/01938f12-0000-7000-8000-000000000303` | PASS |
| 5 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-5/result.png` | 保存完了 | PASS |

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/12/manual-test/screenshots/tc-5/result.png`
