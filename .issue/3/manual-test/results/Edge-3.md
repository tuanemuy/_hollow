# Edge-3: tempStorageKey が null の failed ingestion への retry

**結果:** PASS (機能的判定) / 注意 (エラーメッセージ表示)

## 操作対象

- jobId: `01938f03-0000-7000-8000-000000000303`
- 事前状態: status=failed, temp_storage_key=NULL, version=1

## 手順と結果

1. admin で `/admin/jobs` 開く
2. 0303 行の「再実行」ボタン押下
3. サーバー fn `retryIngestionJobFn` が HTTP 422 を返す (network 計装で確認)
4. UI 上は再実行ボタン横に「エラーが発生しました」と表示される
5. 一覧再描画後、当該ジョブは依然 failed のままで pending には遷移しない

## DB 検証

```sql
SELECT status, version, temp_storage_key FROM ingestion_jobs WHERE id='01938f03-0000-7000-8000-000000000303';
-- status=failed, version=1, temp_storage_key=NULL（変化なし）
```

ドメイン規則 `INGESTION_NO_TEMP_STORAGE_FOR_RETRY` が機能している。

## 注意（潜在 Issue）

testing.md エッジケース 3 期待結果には「`BusinessRuleError('INGESTION_NO_TEMP_STORAGE_FOR_RETRY')` が `displayError` で表示される」とあるが、
実際の UI 表示は汎用的な「エラーが発生しました」のみ。

エラーコード固有のメッセージ（例: 「一時保存ファイルが既に削除されているため再実行できません」）が
表示されない。`displayError` の `INGESTION_NO_TEMP_STORAGE_FOR_RETRY` 用ローカライズが
欠落している可能性あり。要 spec-sync / 起票検討。

## スクリーンショット

- `screenshots/edge-3/step-01-before.png`
- `screenshots/edge-3/step-02-error.png`
