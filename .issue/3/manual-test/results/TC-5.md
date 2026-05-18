# TC-5: 失敗 export ジョブの再実行

**結果:** PASS

## 操作対象

- jobId: `01938f03-0000-7000-8000-000000000311`
- 事前状態: status=failed, version=1, progress=3/5, completedAt=2026-05-18T11:00:00.000Z, failedNoteIds=["01938f04-...0001"]

## 手順と結果

1. admin でログイン → `/admin/jobs` 開く
2. export テーブル 1 行目 (0311) の「再実行」ボタンを押下
3. サーバー fn `retryExportJobFn` が 200 で返り（network 計装で確認）
4. 一覧再描画後、当該ジョブは pending に遷移

## DB 検証

```sql
SELECT status, version, progress_processed, progress_total, completed_at, failed_note_ids_json
  FROM export_jobs WHERE id='01938f03-0000-7000-8000-000000000311';
```

| field | retry 前 | retry 後 |
|---|---|---|
| status | failed | **pending** |
| version | 1 | **2** |
| progress_processed | 3 | **0** |
| progress_total | 5 | **0** |
| completed_at | 2026-05-18T11:00:00.000Z | **null** |
| failed_note_ids_json | `["...001"]` | **`[]`** |

確認ポイント「retry 後の progress / completedAt / failedNoteIds がリセットされていること」を満たす。

## Outbox 検証

```sql
SELECT event_type, aggregate_id FROM outbox_events
  WHERE event_type LIKE '%retryRequested%' ORDER BY id DESC LIMIT 5;
```

- `export.job.retryRequested` / `aggregate_id=01938f03-0000-7000-8000-000000000311` が追加されている

## スクリーンショット

- `screenshots/tc-5/step-01-before.png` (failed 行)
- `screenshots/tc-5/step-02-after.png` (1 回目クリック直後)
- `screenshots/tc-5/step-03-after-retry.png` (retry 適用後)
