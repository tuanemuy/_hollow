# Manual Test Summary — Issue #595

実施: 2026-06-16（UTC）/ http://localhost:3000 / pnpm dev（vite+workerd）/ agent-browser 0.27.3

| TC | 内容 | 対応 AC | 判定 |
|---|---|---|---|
| TC-1 | 24h チャート（アップロード系列）実データ描画 | AC-1, AC-3 | PASS |
| TC-2 | LLM 系列が虚偽表示にならない | AC-2 | PASS |
| TC-3 | 最近のアクティビティ テーブル描画（4列/全kind/tone/降順） | AC-4, AC-5 | PASS（直接シード）|
| TC-4 | 設定変更の書き込み側（emit→projection）E2E | AC-6 | BLOCKED（agent-browser 制約）|
| TC-5 | 導線（期間を変更/すべて見る）非表示 | AC-8 | PASS |
| EC-1 | アクティビティ空状態 + 導線非表示の共存 | AC-8/C-1 | PASS |
| EC-2 | チャート取得失敗 degrade | AC-3 | NOT RUN（UI 再現手段なし、コード/統合テスト担保）|
| EC-3 | 同一イベント二重配信の冪等性 | AC-7 | PASS（スキーマ/コード/統合テスト）|
| REG | 既存 4 metric-card 等の回帰 | — | PASS |

集計: 総数 9 / PASS 6 / BLOCKED 1 / NOT RUN 1 /（REG は PASS）

ブラウザ UI で直接確認した PASS: TC-1, TC-2, TC-3, TC-5, EC-1, REG。
EC-3 はスキーマ/コード/統合テスト、EC-2 はコード/統合テストで担保（UI 実再現は手段なし）。
TC-4 のみ agent-browser の click 制約で E2E 未確証（実装コードは整合）。

## アクティビティ projection の確認方式
- inline-relay 経由の E2E projection は確認できず。原因は agent-browser の CDP synthetic
  click が admin 設定フォームの React onClick / server-fn 送信に届かないこと。
- テーブルのレンダリング（4 列・全 ActivityKind・severity tone・降順・可読 target/detail・
  空状態）は activity_log への直接シードで確認した。
