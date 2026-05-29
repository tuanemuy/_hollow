# TC-2: `/upload` キュー画面の `IngestionJobRow` 再生成ボタン

**結果**: PASS
**セッション**: verify-253
**確認項目**: testing.md 確認項目 2

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | モーダルを閉じて `/upload` に移動 | previewing ジョブカード表示 | `issue253-sample.md` のカードが「プレビュー可能」状態で表示 | PASS |
| 2 | カードに「再生成」ボタン確認 | RefreshCw 付きの再生成ボタン | 「ノートとして保存 / 再生成 / 破棄」の3ボタン、再生成に svg アイコンあり、enabled | PASS |
| 3 | 「再生成」ボタン押下 | pending/processing に変化 | 押下後 routerInvalidate。状態遷移は数秒で完了し直接 previewing を観測（pending/processing は短時間で通過） | PASS（注記あり） |
| 4 | 再読込/待機後の状態確認 | previewing に復帰、新 preview | 複数回 reload で一貫して `SPAN: プレビュー可能`。previewing に復帰 | PASS |
| 5 | regenerationCount 確認（DB） | +1 増加 | D1 で `regeneration_count=2`（TC-1 で1→TC-2 で2）を確認 | PASS |

## 観察

- **バックエンド再駆動の痕跡**: TC-2 の押下後、サーバーログに新規 `[relay-trigger] inline dispatch drained 3 { processed: 3 }` が追加。
  dispatch 経由で `runIngestionJob` が再駆動されたことを確認。
- **DB 確証（最重要）**: D1 の `ingestion_jobs` で対象ジョブを直接確認:
  ```
  id=019e7218-... status=previewing original_file_name=issue253-sample.md regeneration_count=2
  ```
  `regeneration_count=2` は TC-1（モーダル再生成=1）と TC-2（行再生成=2）の累積で、
  両方の再生成が実際に LLM を再駆動しカウントを増やしたことの動かぬ証拠。従来の no-op では `regeneration_count` は増えない。
- **状態遷移の高速性**: ローカル dev の LLM 抽出が数秒で完了するため、pending→processing の中間状態は
  routerInvalidate/reload の間隔では捕捉できなかったが、最終的に previewing へ復帰している。
  これは testing.md「LLM はローカル dev で数秒で完了」「状態反映に数秒〜十数秒」という前提と整合。

## スクリーンショット

- Step 1-2 (previewing + 再生成ボタン): `screenshots/05-tc2-upload-previewing.png`
- Step 3 (再生成押下直後): `screenshots/06-tc2-after-regen-click.png`
- Step 4 (previewing 復帰): `screenshots/07-tc2-after-regen-previewing.png`

## 結論

`/upload` の `IngestionJobRow` 再生成ボタンが実際に LLM を再駆動し、`regeneration_count` がインクリメントされ、
previewing に復帰することを DB レベルで確認。従来 no-op だった不整合の解消を PASS。
