# Edge-1: pending ジョブへの retry 拒否（UI 側）

**結果:** PASS

## 操作対象

- jobId: `01938f03-0000-7000-8000-000000000304` (status=pending, member owner)

## 確認内容

`/admin/jobs` の取り込みジョブテーブルで 0304 行を観察:

```
- cell "01938f03…0304 pending-member.md"
- cell "待機中"
- cell "markdown"
- cell "01938f00…00a1"
- cell "2026/05/18 16:30"
- cell "—"
- cell    # action 列が空（再実行ボタンなし）
```

`IngestionRow` 実装は `job.status === "failed"` のときのみ button をレンダリングするため、pending 行には再実行ボタンが存在しない。

## スクリーンショット

- `screenshots/edge-1/no-retry-on-pending.png`
