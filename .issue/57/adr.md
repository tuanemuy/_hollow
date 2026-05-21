# ADR — Issue #57: queue consumer から runIngestionJob / runExportJob を呼ぶ配線

## ADR-001: dispatch 表を application 層の純粋関数として切り出す

### Status
Proposed

### Context
`handleQueue` 内に `switch (event.type)` を inline で書く案と、application 層に純粋関数 `dispatchDomainEvent(container, event)` として切り出す案があった。

選択肢:
1. `handleQueue` 内 inline switch — 最小変更
2. application 層の純粋関数 `dispatchDomainEvent` に切り出し、handler は queue runtime glue のみ

### Decision
選択肢 2。`dispatchDomainEvent` を `app/core/application/workers/dispatchDomainEvent.ts` に新設し、`{ kind: "handled" | "skipped" | "retry" }` の discriminated union を返す純粋関数として実装する。handler 側は outcome を見て `message.ack()` / `message.retry()` を呼ぶだけにする。

container の型は `RequestContainer`。consumer 側で構築する `ConsumerContainer`（`RequestContainer & 一部 WorkerContainer ポート`）は subtype として渡せるため、handler→dispatch→usecase の流れで worker-only ポートを参照する責任は handler に閉じ、dispatch は最小契約で動く。

### Consequences
- 良い点:
  - dispatch 表が単独で pure-unit テスト可能（miniflare 不要、`vi.mock` で usecase を stub するだけ）
  - 既存 `consumeIndexJob` (`app/core/application/search/consumeIndexJob.ts`) と outcome を discriminated union で返す方針が一貫
  - 将来イベントを追加するときの変更箇所が 1 箇所（dispatch 表）に集約される
  - handler が「queue runtime glue」だけになり読み手の認知負荷が低い
- トレードオフ:
  - 新規ファイル + テストファイルが増える（複雑度の僅かな増加）

---

## ADR-002: consumer 用 DI は `createConsumerContainer` を新設する

### Status
Proposed

### Context
`runIngestionJob` / `runExportJob` の `ServiceArgs<T>` は `RequestContainer`（UoW + 全ポート）を要求する。一方、現 `handleQueue` は `createWorkerContainer(env)` で `WorkerContainer`（minimal: outboxRepository / idempotencyStore / searchIndex / indexJobRepository）を作るのみで、dispatch には型が足りない。

加えて、両 container 型には `searchIndex: SearchIndex` が重複して存在する。雑にスプレッドで合成すると、後勝ちで一方が他方を上書きしてしまう（実害は同一実装なので無いが、型の意図が曖昧になる）。

選択肢:
1. `createWorkerContainer` を太らせて `RequestContainer` 相当を返す
2. `createRequestContainer` をそのまま consumer から呼ぶ（idempotencyStore 等を別途取得）
3. `createConsumerContainer(env): ConsumerContainer` を新設し、`RequestContainer & Pick<WorkerContainer, "outboxRepository" | "idempotencyStore" | "indexJobRepository">` を合成して返す

### Decision
選択肢 3。`ConsumerContainer = RequestContainer & Pick<WorkerContainer, "outboxRepository" | "idempotencyStore" | "indexJobRepository">` を `di/types.ts` に追加し、`createConsumerContainer` を `serverCloudflare.ts` に新設する。実装は `createRequestContainer(readRequestServerConfig(env))` 全体 + `createWorkerContainer(env)` から 3 ポートを明示的に抜き出して合成（searchIndex の重複を避ける）。

### Consequences
- 良い点:
  - `WorkerContainer` の minimal 契約（relay / pruner / dlq のための「UoW を持たない / config を持たない」JSDoc 規約）を保てる
  - 「consumer は domain mutation を伴うため request scope と同等の DI が必要」という事実を型レベルで明示できる
  - `as unknown as RequestContainer` のような unsafe キャストを避けられる
  - `Pick` で worker 側 3 ポートのみを明示する合成にすることで、searchIndex の重複上書きを発生させない
- トレードオフ:
  - DI コンテナビルダが 1 つ増える
  - consumer 起動時に `RequestContainer` 用の全 adapter（Stub 含む）が new される — ただし全て軽量コンストラクタなのでオーバーヘッドは無視できる

---

## ADR-003: stamp を post-dispatch に動かし、dispatch 前は `hasProcessed` で読み取り dedup する

### Status
Proposed

### Context
本 Issue 着手時点の `handleQueue` は「dispatch の前に `markProcessed` で atomic claim → 既処理ならearly ack、新規なら処理続行」という stamp 先行の構造だった。これは「ack だけしてジョブを実行しない」設計の下では妥当だったが、本 Issue で `LLMRateLimitError → message.retry()` 経路を初めて有効化すると、構造的バグが顕在化する:

1. 1 回目の配信: `markProcessed` で stamp 確定 → dispatch 開始 → `LLMRateLimitError` で throw → `message.retry()`
2. 2 回目の配信（redelivery）: `markProcessed` が `alreadyProcessed=true` を返す → early ack → **dispatch が走らない**

つまり stamp が retry 経路を遮断してしまい、`LLMRateLimitError` の rethrow（runIngestionJob のコメント「Surface so the queue consumer can re-deliver with backoff」）が実質機能しない。これは ADR-005 の `LLMRateLimitError → retry outcome` 分類と矛盾する構造的問題。

選択肢:
1. stamp 先行を維持し、retry path は「DLQ 経由 + admin 手動 retry」だけに頼る（運用負担増）
2. 既存 `markProcessed` に加えて `unmarkProcessed`（compensating delete）を port に増やし、retry outcome 時に呼ぶ
3. port に `hasProcessed`（副作用無しの読み取り）を追加し、dispatch 前は `hasProcessed` で dedup、dispatch 成功時に `markProcessed` で stamp する順序に変える

### Decision
選択肢 3。`IdempotencyStore` に `hasProcessed(id: EventId): Promise<boolean>` を追加し、`handleQueue` の順序を以下に変える:

1. `hasProcessed` で読み取り dedup → 既処理なら early ack
2. `dispatchDomainEvent` 実行
3. outcome `handled` / `skipped` → `markProcessed` で stamp + ack
4. outcome `retry` → stamp **しない** + `message.retry()`

read-only check と atomic claim の間に race window は理論上存在するが、Cloudflare Queue は同一メッセージを同時並行で複数 consumer に配信しない（FIFO 内 at-least-once）ため実害は無い。crash で stamp 前に worker が落ちた場合の二重実行は、usecase 側の `isPending` ガード + 楽観ロック（`expectedVersion`）が防御する（既存の二重防御）。

### Consequences
- 良い点:
  - `LLMRateLimitError → retry` が正しく機能する（retry 経路が stamp で遮断されない）
  - 既存の at-least-once + idempotent 契約を維持
  - usecase 側の冪等性（domain entity の状態遷移ガード + 楽観ロック）に依拠した二重防御を活用できる
  - DLQ への到達経路が壊れない（retry が `max_retries` に達したら DLQ）
- トレードオフ:
  - `IdempotencyStore` port に method が 1 つ増える（adapter 全箇所の追従が必要 — 現状 `D1IdempotencyStore` のみ）
  - 「dispatch 中に worker crash」「stamp 前に crash」の組み合わせでは、次回 redelivery で再度 dispatch される。usecase 側の `isPending` ガードで no-op に縮退するが、UoW を 1 回多く開く軽微なオーバーヘッドはある
  - 既存テスト「acks redelivered without re-running」の assertion を `hasProcessed` 経路に合わせて更新する必要がある（observable behavior は不変）

---

## ADR-004: `ingestion.regenerated` は本 Issue の dispatch 対象に含めない

### Status
Proposed

### Context
Issue 本文は `ingestion.requested` / `ingestion.retryRequested` / `export.job.requested` / `export.job.retryRequested` を期待 dispatch 対象として挙げている。Issue 本文中の `ingestion.requested` は実コード上のイベント名 `ingestion.created` に相当する。

`ingestion.regenerated` を含めるかが論点。`IngestionJob.regenerate` は `previewing → processing` への直接遷移であり、`runIngestionJob` の入口にある `IngestionJob.isPending` ガードを通過できない。

### Decision
本 Issue では `ingestion.regenerated` を dispatch 対象に含めない。`ingestion.created` / `ingestion.retryRequested` / `export.job.requested` / `export.job.retryRequested` の 4 種のみを dispatch する。

unit test には `ingestion.regenerated → kind: "skipped"` を明示的なケースとして追加し、将来の誤配線（うっかり dispatch 対象に追加してしまう）に対する regression guard とする。

### Consequences
- 良い点:
  - 本 Issue のスコープが明確になり、`runIngestionJob` のシグネチャ変更を伴わない
  - `ingestion.regenerated` を dispatch しても `isPending` ガードで no-op になるだけで、誤って成功扱いするリスクも回避できる
- トレードオフ:
  - regenerate 機能の処理パイプラインが繋がっていない既存課題は別 Issue で扱う必要がある
  - 実装後に regenerate ジョブが `processing` のまま塩漬けになる挙動は Issue #57 時点でも変わらない（既存挙動の維持）

---

## ADR-005: `NotFoundError` は `handled`（ack）、`LLMRateLimitError` のみ `retry`、D1 UoW 自体の throw も `retry`

### Status
Proposed

### Context
dispatch 中に usecase が throw する可能性のある例外をどう扱うか:

- `runIngestionJob` は `LLMRateLimitError` のみ再 throw し、他の pipeline 失敗は `markFailedSafely` で `failed` に畳む
- `runExportJob` は通常 `failJob` に畳む（内部 catch あり）が、最初の `transitionPendingToProcessing` を呼ぶ `unitOfWorkProvider.run` 自体は try/catch されていない。D1 一時障害で `run` が throw すると `runExportJob` 全体を抜ける可能性がある
- 両者とも対象 job 行が見つからない場合 `NotFoundError` を throw する

選択肢:
1. すべての throw を `retry` 扱い
2. `LLMRateLimitError` のみ `retry`、`NotFoundError` は `handled`、その他の throw は `retry`（D1 throw 含む）

### Decision
選択肢 2。
- `LLMRateLimitError` → `retry`（rate limit が解消されたら自然回復するため）
- `NotFoundError` → `handled`（消えた job 行を redelivery で復活させる手段はない、queue 上は完了扱いで良い）
- その他の想定外 throw（D1 接続不可、UoW commit 失敗など）→ `retry`（一時障害として queue retry の backoff で吸収。最終的に `max_retries` 超過で DLQ に隔離される）

### Consequences
- 良い点:
  - 復活不能なエラー（NotFoundError）を redelivery ループに乗せず queue 効率が良い
  - 一時障害（LLMRateLimitError / D1 一時停止）は queue retry の backoff で吸収される
  - ADR-003 の post-dispatch stamp 順序と組み合わさることで、retry 経路が stamp で遮断されず正しく機能する
- トレードオフ:
  - 「job 行が消えた」事象の運用観測には別途ログ / メトリクスが必要（本 Issue では `logger.info` で記録するに留める）
  - `runIngestionJob` 内の「内部 markFailedSafely で `failed` に畳んだ後で stamp」と「外部 throw → retry → 後で再走で再 markFailedSafely」の二重実行が起きる場合があるが、`isPending` ガードと楽観ロックで二重実行は防がれる

---

## ADR-006: 統合テストの fixture 実装方針（実装時の判断記録）

### Status
Accepted（実装時）

### Context
`app/worker/cloudflare/__tests__/handlers.integration.test.ts` の dispatch path をテストするにあたり、いくつかの非自明な fixture 上の制約を踏む必要があった:

1. **UUIDv7 strict validator**: `D1IngestionJobRepository` / `D1ExportJobRepository` の `toEntity` はリハイドレーション時に `IdGenerator.validate` を強制する。pattern は `^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`。テスト fixture の id 生成器は 4 group 目を `[89ab]` 始まりに固定しないと `SystemError(DATA_INTEGRITY_ERROR)` で吹き飛ぶ。
2. **ExportJob `scope` 不変条件**: `assertScopeTargetShape` で `scope='single'` は exactly 1 target、`scope='multiple'` は >=1 target、`scope='view'` は viewQuery 必須。seed ヘルパで `scope='single'` + 空 targetNoteIds は invariant 違反になる。
3. **StubTempFileStorage の挙動**: `createConsumerContainer` 経由で wired される `StubTempFileStorage.get` は常に `TempFileStorageUnavailableError` を throw する。これが `runIngestionJob` の最初の I/O ステップなので、ここで failure path に入ると LLM 呼び出しまで到達しない — `LLMRateLimitError → retry` テストでは `vi.spyOn` でこの stub を bytes を返すように override する必要がある。

### Decision
- 統合テスト内に local helpers (`nextOwnerId` / `nextIngestionJobId` / `nextExportJobId` / `seedOwner` / `seedPendingIngestionJob` / `seedPendingExportJob`) を追加し、UUIDv7 pattern を満たす id を組み立てる。
- export seed は `scope='multiple'` + 1 件の placeholder noteId にして、リハイドレーション通過 + `resolveTargetNotes` で 0 件返却 → `failed` 遷移という観察可能な dispatch エビデンスにする。
- LLM rate limit テストは `vi.spyOn(StubTempFileStorage.prototype, "get")` で bytes を return させ、その後 `vi.spyOn(StubLLMProvider.prototype, "suggestMetadata")` で `LLMRateLimitError` を throw させる。

### Consequences
- 良い点:
  - dispatch path 全体（D1 リハイドレーション → UoW → usecase → 結果観測）を E2E で確認できる
  - 本番 binding 差し替え時に Stub の制約が観察される箇所が `vi.spyOn` 1 行で済んでいるため、binding 切替時の追従コストが低い
- トレードオフ:
  - テストが Stub アダプタの内部挙動（`TempFileStorageUnavailableError` を throw する事実）に依存する。本番 R2 binding を consumer に配る Issue でこの spy は不要になる
  - export job の seed が `scope='multiple'` 固定。`scope='single'` / `scope='view'` の dispatch 経路も同様に動くはずだが、本 Issue のスコープでは確認していない（dispatch 表の routing は usecase に閉じており、scope は usecase 内部の `resolveTargetNotes` 経路の分岐に過ぎないため、ケース追加は別 Issue で十分）
