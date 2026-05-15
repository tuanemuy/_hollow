# Export テストケース

## StartExportJob（同期）

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分の active ノート、HTML | Start | bytes 返却 |
| 自分の active ノート、PDF | Start | PDF bytes、メディアは embedMedia オプションに従う |
| public ノート、訪問者（viewer=null） | Start | 成功 |
| private ノート、訪問者 | Start | `BusinessRuleError('export_unauthorized')` |
| サイズ超過 | Start | `BusinessRuleError('export_size_exceeded')` |

## EnqueueExportJob（非同期）

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分のノート 10 件 | Enqueue(multiple) | Job 作成、Queue enqueue |
| 他人ノート含む | Enqueue | `BusinessRuleError('export_unauthorized')` |
| クォータ超過 | Enqueue | `BusinessRuleError('export_quota_exceeded')` |
| viewQuery 指定 | Enqueue | view が resolve され Job 作成 |

## RunExportJob

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| pending Job | Run | processing → 各ノート処理 → completed |
| ノート 1 件レンダリング失敗 | Run | failedNoteIds に記録、他は継続 |
| PDF レンダラ全停止 | Run | `job.fail` |
| 全件 0 件 | Run | 空 ZIP で completed（or failed - 仕様判断: empty も成功） |

## GetExportJob / List / Download / Cancel / PurgeExpired

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分の completed | Download | presigned URL |
| 他人の Job | Download | `AuthorizationError` |
| processing 中 | Download | `BusinessRuleError('export_not_ready')` |
| expired | Download | `BusinessRuleError('export_expired')` |
| processing 中を cancel | Cancel | status=cancelled |
| completed を cancel | Cancel | `BusinessRuleError('export_already_finished')` |
| expires_at 経過した completed | PurgeExpired | status=expired、artifact 削除 |

## HandleUserDeletedEvent

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 該当ユーザーの Job 多数 | Event 受信 | 各 Job を cancel、artifact 削除 |
