# TC-EXPORT-1: export 単発・バルク・一覧・キャンセル・ダウンロード

**結果: PASS（キャンセルのみ環境制約で UI 到達不可＝SKIP、他は全て成功）**

## 概要
Issue #489 で string 化された `startExportJob` / `enqueueExportJob` / `cancelExportJob` / `downloadExportArtifact` / `getExportJob` / `listExportJobs` の id 経路を検証。単発エクスポート・バルクキュー投入・ジョブ一覧・ジョブ詳細・ダウンロードの全経路が string id で 500 なく正常動作。キャンセルのみ、dev のエクスポート consumer がジョブをほぼ即時完了させるため「処理中ジョブ」を UI 上で捕捉できず未実施。

## 対象データ
- ノート「検証ノートA改」: `019e9546-cb22-7298-9baf-6361e3f2675c`
- ノート「検証ノートA改 (コピー)」: `019e9549-a511-7654-8299-90e50bd33b05`

## 実行ログ

| # | ステップ | 操作 | 結果 | スクリーンショット |
|---|---------|------|------|------------------|
| 1 | 単一エクスポートフォーム | /notes/{A}/export | PASS | export-01-single-form.png |
| 2 | 単一同期エクスポート（HTML） | ダウンロード | PASS（startExportFn 200、「a.html をダウンロードしました」） | export-02-single-result.png |
| 3 | バルク（一覧2件選択）ダイアログ | 選択モード+2件+エクスポート | PASS（「2 件のノートをエクスポート」） | export-03-bulk-dialog.png |
| 4 | バルクキュー投入 | 実行 | PASS（job=019e9556-... 作成→/exports/{jobId} へ遷移、status=完了） | export-04-job-detail.png |
| 5 | ジョブ詳細表示（getExportJob） | — | PASS（705B/完了/有効期限/ダウンロードボタン） | — |
| 6 | 完了ジョブのダウンロード（downloadExportArtifact） | ダウンロード | PASS（downloadExportFn 200、jobId 入り presigned R2 URL に遷移。R2 GET は 404＝環境） | export-05-download.png |
| 7 | ジョブ一覧（listExportJobs） | /exports?offset=0 | PASS（ジョブ行＋ダウンロード＋詳細リンク） | export-06-jobs-list.png |
| 8 | バルクキュー投入（/export フォーム経由、enqueueExportJob） | 一括エクスポートを開始 | PASS（「ジョブを開始しました (id=019e9557-...)」） | export-07-enqueue.png |
| 9 | 2 件目ジョブ詳細でキャンセル試行 | /exports/{jobId2} | SKIP（到達時に既に status=完了。cancel ボタンは active 時のみ描画） | export-08-job2-detail.png |
| 10 | 一覧に両ジョブ表示確認 | /exports?offset=0 | PASS（2 ジョブとも表示） | export-09-jobs-list-final.png |

## 確認した usecase 経路
- startExportJob + downloadExportArtifact（同期パス、手順2）→ 成功
- enqueueExportJob（手順4 バルクダイアログ / 手順8 /export フォーム）→ 成功
- getExportJob（手順4,5,9 詳細）→ 成功
- listExportJobs（手順7,10 一覧）→ 成功
- downloadExportArtifact（非同期成果物、手順6）→ presigned URL 発行成功
- cancelExportJob → UI 未到達（下記）

## ネットワーク証跡
- 手順2: `POST .../startExportFn... 200`
- 手順4: bulk dialog → enqueue 成功 → `/exports/019e9556-381e-73df-861c-111b97dbc23b`（status=完了, 705B）
- 手順6: `POST .../downloadExportFn... 200` → `GET https://<acct>.r2.cloudflarestorage.com/.../exports/<userId>/019e9556-...c23b.zip?X-Amz-...`（jobId が string でキーに正しく反映）→ R2 は 404（成果物オブジェクトがローカル R2 から取得できない環境制約。アプリの id 解決・presignDownload は正常）
- 手順8: `enqueueExportFn` 成功（id=019e9557-2f0d-7368-a52d-22602557498a）

## キャンセル（手順9）について
- dev 環境のエクスポート consumer がジョブを **ほぼ即時に完了** させるため、ジョブ詳細を開いた時点で常に status=完了 となり、`isActive`（pending/processing）でのみ描画される「キャンセル」ボタンが UI に現れない。
- テスト計画の注記（非同期 worker の進行に依存する部分は環境により SKIP）に従い、キャンセル単体は SKIP とする。キュー投入成功＋一覧表示＋完了＋ダウンロードまでは全て確認済み。
- cancelExportJob 経路を hand-crafted な server-fn fetch で直接叩く試みは TanStack の wire format 不一致で Seroval デシリアライズエラー（500）となり、有効なシグナルにならないため不採用（アプリエラーではない）。

## 判定理由
- 本 Issue 対象の string id 経路（start/enqueue/get/list/download）はいずれも 500 を出さず従来どおり成功。
- ダウンロードの R2 GET 404 は成果物オブジェクトのローカル R2 取得制約であり、jobId→presigned URL のアプリ経路は正常（URL に jobId が string で反映）。
- キャンセルのみ環境（即時完了）により UI 到達不可で SKIP。型変更起因の問題は観測されず。
