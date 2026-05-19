# TC-9: failed ジョブ詳細で errorReason と failedNoteIds が表示

**結果**: PASS
**実行時間**: 約 15 秒
**セッション**: verify-tc-9

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` で test-a ログイン | OK | OK | PASS |
| 2 | `/exports/01938f12-0000-7000-8000-000000000305` (failed) を開く | 詳細ページ表示 | heading "エクスポートジョブ詳細" 表示 | PASS |
| 3 | ステータス「失敗」が表示 | 表示 | "ステータス" 項目に "失敗" | PASS |
| 4 | エラー内容 (errorReason) が表示 | "PDF render failed: page rasterizer ran out of memory while processing note 02." | 上記文言、`role="alert"` で表示 | PASS |
| 5 | 失敗したノート一覧 (failedNoteIds) が表示 | 2 件の noteId が表示 | `01938f12-0000-7000-8000-000000000202` と `01938f12-0000-7000-8000-000000000203` 表示 | PASS |
| 6 | スクリーンショット保存 | `.issue/12/manual-test/screenshots/tc-9/result.png` | 保存完了 | PASS |

## 取得した本文テキスト (抜粋)

```
ステータス
失敗
形式 / スコープ
pdf / multiple
進捗
1/3
...
エラー内容
PDF render failed: page rasterizer ran out of memory while processing note 02.
失敗したノート
01938f12-0000-7000-8000-000000000202
01938f12-0000-7000-8000-000000000203
```

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow/.issue/12/manual-test/screenshots/tc-9/result.png`
