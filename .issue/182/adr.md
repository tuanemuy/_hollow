# ADR — Issue #182: handle queue visibility timeout risk in user.deleted fan-out

## ADR-001: Issue 前提（visibility timeout）の是正と、対処を観測（候補4軽量版）に絞る判断

### Status
Proposed

### Context

Issue #182 は `user.deleted` の fan-out（`publication.handleUserDeletedEvent` → `export.handleUserDeletedEvent` を dispatcher 内で逐次 await）が、公開ノート・in-flight export job の多いユーザーで累積レイテンシがキューの visibility timeout を超え、prior handler 完了前にメッセージが再配信されるリスクを指摘し、4つのミティゲーション候補を挙げる:

1. ハンドラレイテンシ最適化（publication 状態更新のバッチ化 / export job の並列クエリ）
2. queue visibility timeout を増やす
3. fan-out を別 queued event に分解
4. モニタリング追加

**調査での重要発見（Cloudflare 公式ドキュメントで確認、Issue 前提の是正）:**

本プロジェクトの consumer は push（Worker）consumer であり、Issue が前提とする visibility timeout モデルは push consumer には当てはまらない:

- **`visibility_timeout_ms` は push consumer に存在しない設定キー**。pull-based consumer 専用（そちらのデフォルトは 12 時間）。push の `[[queues.consumers]]` の有効フィールドは `queue` / `max_batch_size` / `max_batch_timeout` / `max_retries` / `max_concurrency` / `retry_delay` / `dead_letter_queue` のみ。よって**候補2（visibility timeout を TOML で延ばす）は技術的に実行不可能**。
- **push consumer に「処理中（mid-flight）の再配信」は存在しない**。バッチは consumer Worker invocation の上限内に完了するか、上限超過で失敗して再試行されるかのいずれか。Issue が恐れる「prior handler 完了前にメッセージが再エンキューされる」シナリオ自体が起きない。
- push consumer invocation の上限: **wall-clock 最大 15 分** / **CPU 時間デフォルト 30 秒（`limits.cpu_ms` で最大 5 分まで延長可、CPU 時間は I/O・ネットワーク待ちを除外）**。本リポジトリには `limits` ブロックが無く、CPU はデフォルト 30 秒。
- バッチ内 1 件失敗時は全体再試行が基本だが、**`handleQueue`（`app/worker/cloudflare/handlers.ts`）は既に per-message `ack()` / `retry()` を行っている**。成功イベントは個別 ack 済みなので、後続イベント失敗による巻き添え再配信は起きない。つまり「重い `user.deleted` が同一バッチの無関係イベントを道連れに重複処理させる」懸念は**既存コードで既に緩和済み**。

→ Issue が想定したリスクの大半（mid-flight 再配信・道連れ重複）は push consumer では成立しないか既に緩和済み。残存リスクは「heavy user の `user.deleted` 単体が 1 invocation の CPU 30 秒 / wall 15 分上限を超えて kill され、ack 未確定のまま全体再試行される」場合に限られる。そしてこの上限が CPU bound（30秒）か wall bound（15分）かは、fan-out が D1 I/O 主体である以上**実測しないと分からない**。

各ハンドラは既にページング（`PAGE_LIMIT=200` / `BATCH_LIMIT=100`）+ 個別 UoW で「1ユーザー大量データでも UoW batch budget を溢れさせない」設計で、冪等・retry-safe。本 Issue は機能バグではなく perf/ops のチューニング + 可観測性の追加であり、Issue 本文も「mitigation depends on performance profile and operational constraints」「Not a blocker」と明記する。

### Decision

**候補4（モニタリング）の軽量版のみ採用する。**

- **候補4 軽量版 採用:** `dispatchDomainEvent.ts` の `user.deleted` case で fan-out 所要時間（`container.clock.now()` の `.getTime()` 差分）を `logger.info` に `durationMs` として出力。残存リスク（CPU/wall 上限への近接）を実トラフィックで観測し、将来の対処要否・手段の定量的根拠にする。percentile アラートはコードに持たず Cloudflare tail / Logpush の運用に委ねる。
- **候補2 不採用（実行不可能）:** `visibility_timeout_ms` は push consumer に存在しないキーのため設定できない。Issue 前提の誤りを docs / 本 ADR で是正する。
- **候補1 deferred:** 「1ノート=1UoW」「1ジョブ=1UoW」は #159 ADR-001/004 が意図的に選んだ設計。D1 interactive tx 不可でバッチ化は UoW 境界・イベント収集の再設計を伴い、並列化は OCC・部分失敗 retry を複雑化させる。実測根拠なしの着手は過剰実装。
- **候補3 deferred:** 新イベント型・relay/consumer routing・順序保証の再担保が必要で、ADR-004 の論理順序の明快さと retry セマンティクスの読みやすさを犠牲にする。残存リスクが実測で確認されるまで時期尚早。
- **`limits.cpu_ms` 延長 / `max_batch_size` 縮小も deferred:** 残存リスクが CPU bound か I/O bound か未測定の段階で値を変えても binding な上限に効くか不明。候補4のログで実測してから判断する。

### Consequences

- **良い点:**
  - Issue 前提の誤り（push consumer に存在しない visibility timeout モデル）を是正し、無効な `visibility_timeout_ms` 設定を試みる将来の手戻りを防ぐ。
  - 残存リスクが CPU bound か wall bound か未知である以上、まず実測する（候補4）のは過剰実装を避けつつ将来判断の根拠を残す最も honest な一手。
  - `handleQueue` の per-message ack が既に「道連れ重複」を緩和している事実を明文化し、リスクの実像を正確にする。
  - 候補1/3 と `limits.cpu_ms`/`max_batch_size` 調整を実測根拠なしに先取りせず、#159 ADR-001/004 の方針と整合。
- **トレードオフ:**
  - 候補4は観測であって、それ自体は残存リスクを低減しない。実測で上限近接が判明した場合は別途対処（次節のトリガー条件）が必要。
  - 構造化ログの集計・アラートは Cloudflare 側の運用に依存する（コードでは閾値判定を持たない）。

### 将来の対処を検討するトリガー条件

`durationMs` ログを実トラフィック / staging 負荷テストで観測し、以下が確認された場合に対処を検討する。`durationMs` は `clock.now()` の **wall-clock 差分**であって CPU 時間ではない点に注意 — CPU 30 秒上限への近接判定には Cloudflare tail / Logpush 側の `cpuTime` メトリクスを併用する（wall-clock の `durationMs` 単体では CPU bound か wall bound か判別できない）。

- **CPU 30 秒上限への近接が観測される場合**（`cpuTime` メトリクス） → まず `limits.cpu_ms` を 300000（5分）へ延長（relay の `OUTBOX_LEASE_MS=300000` と整合）。これは push consumer で有効な唯一の TOML 上限調整ノブ。
- **wall-clock 15 分上限への近接が観測される場合**（`durationMs` が大きいのに `cpuTime` は小さい = I/O bound でリトライしても解消しない） → 候補1（ハンドラ最適化）または候補3（fan-out 分解）を別 Issue で検討。`limits.cpu_ms` は wall-clock 上限には効かない点に注意。

いずれの対処も本 Issue のスコープ外であり、観測データが上限近接を示した時点で**別 Issue として起票**して再評価する（本 Issue は観測基盤の導入とドキュメント是正で完了とする）。

---
