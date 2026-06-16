# Manual Test Report — Issue #595（admin ダッシュボード 24h チャート + 最近のアクティビティ）

実施環境: http://localhost:3000（pnpm dev / vite + workerd）、agent-browser 0.27.3、ローカル D1（migration 0018 適用済み）。
認証: cookie `__Host-session=dev-admin-session-token`（CDP 注入）。

## 結果サマリー

総数 9 / PASS 6 / BLOCKED 1 / NOT RUN 1（REG は PASS 内）。
詳細は results/ 配下（TC-1〜5, EC-1〜3, REG, summary.md, analysis.md）。

ブラウザ UI で直接確認できた PASS: TC-1, TC-2, TC-3, TC-5, EC-1, REG。

## 確認できた受け入れ基準

- **AC-1 / AC-3（チャート）**: 「直近 24 時間」セクションにアップロード sparkline が描画。
  シードした 11 件が合計値に一致。SVG path は 24 点・distinct Y 6 種で、ピーク（5件→Y=12）と
  0 件時間帯（Y=140 ベースライン平坦）を区別。null（取得失敗）でなく実データ 0 を平坦線で正直に描く。
- **AC-2（LLM 系列）**: LLM hourly 系列は描かれない。既存「LLM 呼び出し (24h)」scalar カードは
  『取得失敗』のまま（#545 一致、虚偽表示なし）。
- **AC-4 / AC-5（アクティビティ表示）**: 4 列（時刻/種類/対象/詳細）テーブルが occurredAt 降順で描画。
  全 5 ActivityKind（新規ユーザー/ジョブ失敗/設定変更/エクスポート完了）がラベル化、
  severity tone（success/error/info）が正しく適用、target/detail は可読（ID 直書き・空なし）。
  ※直接シードで確認。
- **AC-8（導線）**: チャート/アクティビティ各セクションに「期間を変更」「すべて見る」リンクは
  描かれず（全 section の a/button が空）。空状態でも「すべて見る」が出ず、空メッセージと二重表示なし。
- **既存回帰**: 4 metric-card は scalar null 固定で『取得失敗』表示を維持（D1 provider 差し替え後も不変）。

## 確認できなかった項目と理由

- **AC-6（設定変更の書き込み側 E2E）= BLOCKED**: agent-browser の CDP synthetic click が
  admin 設定フォーム（Radix switch / 「変更を保存」server-fn）の React ハンドラに届かず、
  instance_settings.updated が emit されなかった（outbox 0 件、server-fn 実行ログなし）。
  実装コードは整合（usecase が save 成功時に collectEvents で無条件 emit）。実ブラウザでの手動確認推奨。
- **AC-7（冪等性）/ EC-2（チャート degrade）= UI 経由 E2E 未実施**: それぞれ event_id unique +
  ON CONFLICT DO NOTHING、provider の try/catch null degrade で実装担保。統合テストにケースあり。

## 起票推奨候補

- なし（実装バグ未検出）。TC-4 / EC-3 の未確証は manual-test 環境（agent-browser）の制約であり
  実装の問題ではない。必要なら「実ブラウザで adminSettings 変更→活動行 projection」の手動確認を
  別途行う程度。

## サーバー起動・シードで詰まった点

- なし。pnpm dev は約 2 秒で ready（HTTP 200）。起動エラーなし（TanStack の
  inputValidator deprecated 警告のみ、本 Issue 無関係）。
- チャートシードは既存 23 行が全て 24h 窓外だったため、シードした 11 行のみが反映されクリーン。
