# マニュアルテスト結果サマリー — Issue #3

実行日: 2026-05-18
対象ブランチ: `issue/3` (現状チェックアウト中の作業ブランチ)
実行者: agent-browser (Claude Code)

## 結果一覧

| TC | 名前 | 結果 | 失敗ステップ / 備考 |
|---|---|---|---|
| TC-1 | /admin/jobs ナビと初期表示 | PASS (条件付き) | 当初 seed defect で 500 → seed 修正後 PASS。`/admin` 自体は別の既存不具合で 500 |
| TC-2 | 取り込みジョブ一覧の表示 | PASS | failed 3 件先頭、pending 1 件、admin/member 混在表示確認 |
| TC-3 | エクスポートジョブ一覧の表示 | PASS | failed 2 件先頭、pending/completed 1 件ずつ、admin/member 混在 |
| TC-4 | 失敗 ingestion ジョブの再実行 | PASS | jobId 0301 が failed→pending, version 1→2, outbox に `ingestion.retryRequested` |
| TC-5 | 失敗 export ジョブの再実行 | PASS | jobId 0311 が failed→pending, progress/completedAt/failedNoteIds リセット, outbox に `export.job.retryRequested` |
| TC-6 | 非 admin ユーザーのアクセス拒否 | PASS | member で `/admin/jobs` 直接アクセス → 「アクセスできません」 |
| TC-7 | 既存 admin ページの非破壊 | FAIL (Issue #3 範囲外の既存不具合) | `/admin`・`/admin/llm`・`/admin/metrics` が既存不具合で 500。`/admin/users` のみ PASS |
| Edge-1 | pending ジョブへの retry 拒否 (UI) | PASS | pending 行に再実行ボタンが存在しない |
| Edge-2 | 同時 retry (OCC 衝突) | SKIP | testing.md にてオプション扱い |
| Edge-3 | tempStorageKey null での retry 拒否 | PASS (注意あり) | retry が 422 で拒否され status=failed のまま。UI 表示は汎用「エラーが発生しました」のみ（コード固有のメッセージなし） |

## カウント

- PASS: 8 (TC-1, TC-2, TC-3, TC-4, TC-5, TC-6, Edge-1, Edge-3)
- FAIL: 1 (TC-7) — ただし本 Issue 範囲外の既存不具合
- SKIP: 1 (Edge-2)

## 起票推奨 Issue

詳細は `analysis.md` 参照。

1. **`.issue/3/manual-test/seed-jobs.sql` がドメイン不変条件違反でロードできない**
   - ingestion #305 (saved だが preview/savedAsNoteId が NULL)
   - export #311/#312/#313 (非 PDF format で pdfPaperSize 設定済み)
   - export #314 (PDF だが pdfPaperSize='a4' と小文字)

2. **/admin Dashboard・/admin/metrics が 500 (TypeError 'collect')**
   - Issue #3 と無関係の既存リグレッション
   - `<AdminDashboard>`・`<MetricsPage>` 共通の loader / RSC 連携箇所

3. **/admin/llm が `Stored instance_settings violates invariants` で 500**
   - Issue #3 と無関係。`instance_settings` シードがドメイン不変条件違反

4. **`displayError` の admin retry 系エラーコード未対応**
   - `INGESTION_NO_TEMP_STORAGE_FOR_RETRY` 等、admin retry 由来の
     ビジネスルールエラーが UI 上で「エラーが発生しました」しか表示されない

## 機能的結論

Issue #3 の主要受入条件 (ジョブ監視ページ追加、admin retry 機能、403 ゲート) は
すべて期待通りに動作する。PR は seed 起因の検証ノイズと UX マイクロコピー以外には
ブロッカーはなく、リリース可能と判断できる。
