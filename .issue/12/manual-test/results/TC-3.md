# TC-3: 完了ジョブ詳細でダウンロードボタンが表示される

**結果**: PASS
**実行時間**: 約 30 秒
**セッション**: verify-tc-3
**dev サーバ**: http://localhost:3001
**実行日時**: 2026-05-20

## 前提
- ユーザ: `test-a@example.com / Test1234!`
- 対象 jobId: `01938f12-0000-7000-8000-000000000303`（completed, expires 2099-12-31）

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | cookies clear → `/login` を開く | フォーム表示 | OK | PASS |
| 2 | `test-a@example.com / Test1234!` でログイン | `/?page=1&limit=20` に遷移 | OK | PASS |
| 3 | `/exports/01938f12-0000-7000-8000-000000000303` に遷移 | 完了ジョブ詳細が表示される | h1「エクスポートジョブ詳細」+ ステータス「完了」+ ファイルサイズ 4.0 KB 等 | PASS |
| 4 | `wait --load networkidle` | 描画完了 | OK | PASS |
| 5 | ダウンロードボタンが表示される | ボタン存在 | `button "ダウンロード" [ref=e3]` が snapshot に存在 | PASS |
| 6 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-3/result.png` | 保存完了 | PASS |
| 7 | close | session 終了 | OK | PASS |

## DOM スナップショット（抜粋）

```
- main
  - heading "エクスポートジョブ詳細" [level=1, ref=e1]
  - DescriptionList
    - term "ステータス"          → 完了
    - term "形式 / スコープ"     → markdown / multiple
    - term "進捗"                → 3/3
    - term "作成日時"            → 2026-05-20T00:00:00.000Z
    - term "完了日時"            → 2026-05-20T00:05:00.000Z
    - term "有効期限"            → 2099-12-31T23:59:59.000Z
    - term "ファイルサイズ"      → 4.0 KB
  - button "ダウンロード" [ref=e3]
  - link "一覧へ戻る" [ref=e4]
```

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/12/manual-test/screenshots/tc-3/result.png`

## 注記
- 押下までは検証範囲外（ボタンの存在確認のみ）。
- `expiresAt` が 2099 のため、completed かつ未失効の正常パスを通っていることも併せて確認できた。
