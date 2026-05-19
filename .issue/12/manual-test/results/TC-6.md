# TC-6: 詳細ページ → 「一覧へ戻る」リンクで `/exports` 戻り

**結果**: PASS
**実行時間**: 約 10 秒
**セッション**: verify-tc-5 (TC-5 から継続)

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/exports/01938f12-0000-7000-8000-000000000303` を開いている状態 | 詳細ページ表示 | heading "エクスポートジョブ詳細"、link "一覧へ戻る" | PASS |
| 2 | 「一覧へ戻る」リンクをクリック | `/exports?offset=0` or `/exports` に遷移 | `http://localhost:3000/exports?offset=0` | PASS |
| 3 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-6/result.png` | 保存完了 | PASS |

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/12/manual-test/screenshots/tc-6/result.png`
