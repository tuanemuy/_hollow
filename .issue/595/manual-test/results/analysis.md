# 失敗・未確証の分析 — Issue #595

## TC-4: 設定変更の書き込み側 E2E（BLOCKED）

分類: **agent-browser 偽陽性 / 環境制約**（実装バグではない）

事象:
- `/admin/registration` のスイッチ（Radix/headless `role=switch`, BUTTON）を
  agent-browser click / find role switch click しても aria-checked が変わらない。
- 「変更を保存」ボタンを click しても outbox_events に instance_settings.updated が
  emit されず（0 件）、activity_log も 0 件。トースト・エラー表示なし。
- server ログに RegistrationForm/action.ts のモジュールロードはあるが server-fn 実行
  ログ・usecase エラーなし → サーバー側でフォーム送信が走っていない。

分析:
- CDP の synthetic click が React の onClick / onCheckedChange / form submit
  ハンドラに届かない既知の agent-browser 偽陽性。実ブラウザでは発火する可能性が高い。
- 実装コードは静的確認で整合: 各 adminSettings usecase は save 成功時に
  `collectEvents([AdminSettingsEvents.updated(...)])` を無条件 emit し、
  dispatcher が activity ハンドラへ fan-out、handler が insertIfAbsent で projection する。
  発火さえすれば活動行が出る。

→ **実装バグと即断しない**。実ブラウザでの手動確認（スイッチ切替→保存→
   数秒待ち→ダッシュボードに「設定変更」行）を推奨。

## EC-2: チャート取得失敗（NOT RUN）

分類: 環境制約。D1 を壊さず provider に null を返させる手段が UI 経由ではない。
コード（try/catch で null degrade）・UI（null 時「取得失敗」プレースホルダ）・
統合テスト（usageMetricsProvider.integration.test.ts の degrade ケース）で担保。

## 起票推奨候補

なし（実装バグは検出していない）。
TC-4 / EC-3 の書き込み側 E2E は「manual-test 環境の制約」であり、実装の問題ではない。
メインが必要と判断すれば「実ブラウザでの adminSettings 変更→活動行 projection の手動確認」を
別途タスク化する程度。Issue 起票は不要と考える。
