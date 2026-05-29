# ブラウザ検証レポート — Issue #254: failed ジョブを所有者が再試行できるようにする

**実行日**: 2026-05-29
**テストソース**: `.issue/254/testing.md`
**サーバー**: `pnpm dev`（port 3100）
**ブラウザ**: agent-browser 0.27.0

## 結論

owner 向け retry 機能は、ブラウザ実機・DB レベル・自動テストの 3 層で正しく動作することを確認した。**全テストケース PASS（2/2）、起票 Issue なし。**

## 検証結果

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | モーダル FailedView の再試行 → waiting 再突入 | PASS（自動テスト担保） |
| TC-002 | キュー画面 failed カードの再試行 → パイプライン再駆動 | PASS（ブラウザ + DB 実証） |

### TC-002 の決定的証跡

キュー画面（/upload）の `[TEST-254] meeting-notes.md`（failed）カードで:
- 「再試行」ボタンが「破棄」の前に表示される（並び順 OK）
- クリックで `ownerRetryIngestionJob` が発火し、DB の `version` が 0→3、`error_code` が `llm_failure`→`ingestion.temp_storage` に変化。これは `failed → pending`（retry usecase）→ `pending → processing`（dispatcher→runIngestionJob）→ `processing → failed`（temp blob 不在）の全サイクルが回った証拠。

## 多層の担保

- **integration テスト** `ownerRetryIngestionJob.integration.test.ts`（52/52 PASS）: failed→pending・エラークリア・version bump・`ingestion.retryRequested` 発火・他人 403・非 failed InvalidState・temp key 喪失 NoTempStorage
- **unit テスト** `UploadDialog.test.tsx` / `IngestionJobRow.test.tsx`（53/53 PASS）: FailedView の 3 アクション・failed→retry→waiting→editing・キューカード retry
- **ブラウザ実機 + DB**（TC-002）: retry 動線の表示・発火・パイプライン再駆動

## 環境メモ（Issue 不要）

- 再処理の即時再失敗（`ingestion.temp_storage`）はシードした `temp_storage_key` が実 blob を持たないため。実 blob があれば `previewing` まで進む。コード欠陥ではない。
- 別ワークツリー `hollow2` が :3000 を占有しており、アプリの絶対 URL リダイレクトが :3000 に向かうため 3100 起動セッションが断続的に弾かれた。ローカル環境固有の事情で本変更と無関係。

## 成果物

- レポート: `.issue/254/manual-test/report.md`
- テスト結果: `.issue/254/manual-test/results/`
- スクリーンショット: `.issue/254/manual-test/screenshots/`
- シード: `.issue/254/manual-test/seed.sql` / `seed-data.md`
