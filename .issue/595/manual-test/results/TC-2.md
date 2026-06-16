# TC-2: LLM 系列の扱いが虚偽表示にならない

対応 AC: AC-2

| # | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | `/admin`「直近 24 時間」セクションの系列を確認 | LLM hourly 系列が描かれない | セクション内のチャートカードは「アップロード数」のみ。LLM 系列カードなし | PASS |
| 2 | 既存「LLM 呼び出し (24h)」metric-card を確認 | #545 同様『取得失敗』のまま | 値「—」/「取得失敗」表示で変化なし | PASS |

D1UsageMetricsProvider は scalar フィールド（llmCallsToday 含む）を null 固定で返し、
hourly も uploads のみ。記録源の無い LLM 系列は描画されない（虚偽表示なし）。

判定: **PASS**
