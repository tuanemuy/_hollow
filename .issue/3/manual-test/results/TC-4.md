# TC-4: 失敗 ingestion ジョブの再実行

**結果:** PASS

## 操作対象

- jobId: `01938f03-0000-7000-8000-000000000301`
- 事前状態: status=failed, version=1, tempStorageKey=あり

## 手順と結果

1. admin でログイン → `/admin/jobs` 開く
2. ingestion テーブル 1 行目 (0301) の「再実行」ボタンを押下
3. 一覧再描画後、当該ジョブは failed セクションから消え、pending 行として表示された
   - 行表示: `01938f03…0301 failed-admin.md 待機中 markdown 01938f00…00c1 2026/05/18 19:58 — (action なし)`

## DB 検証

```sql
SELECT status, version FROM ingestion_jobs WHERE id='01938f03-0000-7000-8000-000000000301';
-- status=pending, version=2 （retry 前は status=failed, version=1）
```

## Outbox 検証

```sql
SELECT id, event_type, aggregate_id FROM outbox_events ORDER BY id DESC LIMIT 5;
-- 最新行: event_type='ingestion.retryRequested', aggregate_id='01938f03-0000-7000-8000-000000000301'
```

`ingestion.retryRequested` イベントが outbox に積まれていることを確認。

## スクリーンショット

- `screenshots/tc-4/step-01-before.png` (failed 行 + 再実行ボタン)
- `screenshots/tc-4/step-02-after.png` (retry 完了後の一覧)
