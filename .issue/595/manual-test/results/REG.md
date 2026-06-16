# 既存機能への影響確認（回帰）

| # | 項目 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | 既存 4 metric-card（userCount/storage/uploadsToday/llmCallsToday）| #545 同様 scalar は null 固定で『取得失敗』表示のまま | 全 4 カードが「—」/「取得失敗」、ストレージは「R2 — · DO —」。D1 provider 差し替え後も挙動不変 | PASS |
| 2 | ステータスバナー | 「All systems operational / 重大アラートはありません」 | 表示維持 | PASS |
| 3 | 管理ナビ | 各設定リンク描画 | ダッシュボード/LLM設定/文字起こし設定/プロンプト/デザイントークン/登録制御/ユーザー/利用状況/ジョブ監視 すべて描画 | PASS |

注: ingestion ジョブ実行（runIngestionJob fan-out）・他 consumer の skipped・pruner の
新規 prune は backend 内部処理であり、ブラウザ UI からは直接観測不可（統合テストで担保）。

判定: **PASS**
