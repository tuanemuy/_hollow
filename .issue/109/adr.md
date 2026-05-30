# ADR — Issue #109: queue consumer の processing 中断ジョブが自動再走できない（LLMRateLimitError 後の塩漬け）

## ADR-001: `LLMRateLimitError` 後の自動再走を `processing → pending` の state rollback で実現する

### Status
Proposed

### Context
#57 ADR-003 / ADR-005 で「`LLMRateLimitError` → queue retry で自然回復」と設計したが、ingestion path では成立していない（#57 ADR-003 の「既知の限界」）。`runIngestionJob` は entry guard が `IngestionJob.isPending` 固定で、1回目の配信で `pending → processing` を commit してから pipeline 内で `LLMRateLimitError` を rethrow する。stamp は post-dispatch 化で残らないが、redelivery 時に `isPending` ガードで no-op に縮退し、ジョブが `processing` のまま塩漬けになる。

Issue が挙げる3案:
1. `runIngestionJob` の entry guard を「`pending` または `processing` 中断」のいずれも受理する形に拡張（domain に新状態を追加 or `processing` 再開を許容）
2. `LLMRateLimitError` で rethrow する前に `processing → pending` への state rollback
3. cron で `processing` のまま N 分以上経過したジョブを `pending` に戻す safety net

### Decision
選択肢2を採用。`runIngestionJob` の pipeline catch 内で、`LLMRateLimitError` を rethrow する前に、UoW で `findById → isProcessing ガード → IngestionJob.rollbackToPending → save(expectedVersion)` を実行する。domain には `processing → pending` の rollback 遷移を1つ追加するのみで、新状態は増やさず `startProcessing`/`isPending` は無変更。

比較の要点:
- **案1** は「中断 processing」と「正常 processing 中」を型で区別できず、`startProcessing` の不変条件（pending 専用）を破壊する。#253 ADR-001 が「最もリスキー」として明示的に却下済み。
- **案2** は #253 ADR-001 が確立した「再処理が必要なら `→ pending` に戻して `runIngestionJob` の `isPending` 入口に合流」パターンと完全に一貫する。rollback で `pending` に戻すので「中断 vs 正常」の区別問題が消え、redelivery は常に「`pending` なら再走、それ以外は no-op」の既存冪等セマンティクスで判定できる。OCC（`expectedVersion`）で並行遷移と競合しても安全。波及が最小。
- **案3** は本 Issue に対しインフラ過剰（新 scheduled worker / wrangler cron / lease 設計）で、しかも「正常に長時間 processing 中のジョブを誤って巻き戻す窓」が残る。

### Consequences
- 良い点:
  - #57 ADR-003 の「既知の限界」（ingestion path の rate-limit 塩漬け）を解消。`LLMRateLimitError` 中断後の redelivery が自動再走するようになる。
  - #253 ADR-001 の `→ pending` パターン、admin retry path、楽観ロックをそのまま再利用でき、波及が最小。
  - domain は遷移を1つ追加するだけで新状態を増やさない（make illegal states unrepresentable を維持）。
- トレードオフ:
  - rate limit が長時間未解消だと「rollback → 再走 → rate limit → rollback」を繰り返すが、queue の `max_retries` 超過で DLQ に隔離されるため無限ループにはならない（#57 ADR-005 の意図挙動と一致）。`regenerationCount` とは別軸なので cap には影響しない。
  - rollback の `save(expectedVersion)` が並行遷移と競合し得るが、UoW 内で `isProcessing` を再確認し、非 processing なら skip。save が throw しても元の `LLMRateLimitError` を rethrow して retry outcome を維持する。
  - **収束経路（誤読防止）:** 並行遷移（`discard`/`markFailed` 等）で rollback が skip された場合でも `retry` ループにはならない。次回 redelivery はジョブが `pending` でない（`discarded`/`failed`）ため `runIngestionJob` 入口の `isPending` ガードで no-op に縮退し、pipeline に入らず `LLMRateLimitError` も throw されないので dispatch は `handled` outcome で stamp し drain する。rollback が D1 一時障害で失敗して rethrow した場合は、ジョブが `processing` のまま残り次回 redelivery で再度 rollback を試みる（rate limit 解消より先に rollback が再試行される二段構え）。いずれも queue の `max_retries` で最終的に DLQ に隔離されるため無限化しない。

---

## ADR-002: rollback 後の再駆動は queue `message.retry()` 一本化とし、rollback 遷移はイベントを emit しない

### Status
Proposed

### Context
rollback で `pending` に戻した後、ジョブを再走させる経路に2案がある:
1. rollback 遷移で新イベント（例 `ingestion.rateLimited`）を emit し、outbox 経由で `runIngestionJob` に再 dispatch する
2. 新イベントは emit せず、queue の `message.retry()`（dispatch 側の `LLMRateLimitError → retry` outcome）一本に再駆動を任せる

### Decision
選択肢2を採用。rollback 遷移（`IngestionJob.rollbackToPending`）は `eventDrafts: []` でイベントを emit しない。再駆動は dispatch 側が引き続き `LLMRateLimitError → retry` outcome に分類して呼ぶ `message.retry()` に任せる。stamp は post-dispatch で残らないため、redelivery で再 dispatch され、`pending` を見て自動再走する。

### Consequences
- 良い点:
  - 二重駆動を回避できる。新イベントも emit すると outbox 経由と queue redelivery の2経路で再 dispatch され、`isPending` + OCC で機能上は冪等だが UoW を余分に開く。
  - 変更が domain 1遷移 + usecase catch の1分岐に収まり、dispatch ルーティング（イベント → usecase 表）に手を入れずに済む。
- トレードオフ:
  - 「rate limit による自動 rollback」を専用イベントで観測する手段は持たない。必要なら将来 `logger.warn` 等で補える（本 Issue では追加しない）。
  - 再駆動が queue のライフサイクルに依存する（outbox の at-least-once とは別系統）。ただし `LLMRateLimitError → retry` は #57 ADR-005 で既に確立した経路であり、新たな依存は生じない。

---

## ADR-003（実装時追記）: rollback save 失敗時の観測点は `logger.warn`、成功時は無ログ

### Status
Accepted（実装で確定）

### Context
ADR-002 は「rate limit による自動 rollback を専用イベントで観測する手段は持たない。必要なら将来 `logger.warn` 等で補える」とした。実装ステップ3で rollback save を try/catch でラップする際、ログ出力の粒度を決める必要があった。

### Decision
rollback の save が成功した正常系では何もログ出力しない（`markFailedSafely` も成功時は無ログで対称）。save が throw した失敗系のみ `container.logger.warn("ingestion.rateLimitRollback.persistence_failed", …)` で記録し、元の `LLMRateLimitError` を必ず rethrow する。これは `markFailedSafely` が永続化失敗を `logger.error` で記録するのと同じ「永続化の副作用が握り潰されないようにする」方針に合わせたもので、rate-limit 自動 rollback の唯一の観測点となる。

### Consequences
- rollback 失敗が観測可能になり、ADR-001 Consequences の「二段構え rollback」が実際に発火していることを運用で確認できる。
- 正常系を無ログにすることで、rate limit が頻発しても通常運用のログを汚染しない。`logger.error` ではなく `logger.warn` にしたのは、rethrow により queue retry で回復見込みがある（=即時のオペレーター対応を要さない）ため。
