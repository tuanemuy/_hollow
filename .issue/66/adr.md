# ADR — Issue #66: pnpm dev での outbox inline dispatch

## ADR-001: dev 環境での outbox dispatch 戦略として「同一 isolate 内インライン dispatcher」を採用

### Status
Proposed

### Context

`pnpm dev`（Vite + `@cloudflare/vite-plugin`）はメイン Worker 1 個だけを起動し、`[env.relay] / [env.consumer] / [env.pruner] / [env.dlq]` の sibling Worker および Cloudflare Queues は走らない。結果として:

- UoW commit 時に積まれる outbox 行が dispatch されない
- consumer 側 (`dispatchDomainEvent`) のプロジェクション更新が走らず、`note_internal_links.resolved_note_id` 解決などのフルフロー検証ができない

検討した案は以下:

1. **複数 wrangler dev 並列起動 (A1)**: `pnpm dev:relay` / `dev:consumer` 等を `concurrently` で並列起動。miniflare の D1/Queue ローカルストアが per-process で分離する問題があり、`--persist-to` 同一指定でも SQLite ロック競合が発生する。新規 dep が増える。
2. **インライン dispatcher (A2 / A3)**: `RelayTrigger` ポートに dev 専用実装を 1 つ追加し、`kick()` 時に同一 isolate 内で `processOutboxEvents` を回して `dispatchDomainEvent` を直接呼ぶ。queue / Service Binding を経由しない以外のロジックは production と同等。
3. **dev:full スクリプト + docs 明記**: A1 をベースに docs だけ補強。A1 の根本問題は解決しない。
4. **README 明記のみ**: dev で確認できない問題そのものは未解決。

### Decision

**案 2 (インライン dispatcher) を採用する。**

- 新規アダプタ `InlineRelayTrigger`（`app/core/adapters/cloudflare/inlineRelayTrigger.ts`）を追加し、`RelayTrigger` ポートを実装する。
- DI 層 `buildRelayTrigger` に `options.inlineDispatch === true` のときだけ `InlineRelayTrigger` を返す分岐を追加する。
- dev フラグは `app/server.cloudflare.ts` の 1 ヶ所で `import.meta.env.DEV` を参照して決定する。

### Consequences

- **良い点**:
  - 既存 seam (`RelayTrigger` ポート) を再利用するため、UoW provider / handlers / usecase は無変更。
  - `import.meta.env.DEV` は `vite build` 時に `false` にインライン化されるため、production / staging deploy 経路には絶対に inline 経路が混入しない。
  - 単一 isolate / 単一 D1 で完結するため、外部プロセス起動・dep 追加・port 競合がない。
  - dev で UoW commit 後すぐにプロジェクションが反映されるため、開発体験が直感的になる。
- **トレードオフ**:
  - dev では queue を経由しないため、queue 固有の挙動（DLQ 振り分け、`max_retries` の Cloudflare 側カウント）は dev で検証できない。これらは staging で manual test する前提（docs に明記）。
  - dev/prod でレイテンシ特性が異なる（dev は同期実質ゼロ / prod は Queue 経由で数百ms〜）。これも docs に明記。

---

## ADR-002: `InlineRelayTrigger` 内 consumer container の `RELAY` 排除（無限カスケード & ログノイズ回避）

### Status
Proposed

### Context

`dispatchDomainEvent` 経由で呼ばれる `runIngestionJob` / `runExportJob` 等は、処理中に新たな domain event を outbox に積む（`ingestion.previewAttached` など）。`InlineRelayTrigger` が `kick()` 内で `processOutboxEvents` を回し、内部で `createConsumerContainer(env, ctx)` を呼ぶ場合、その consumer container の UoW provider に新たな `RelayTrigger` が wire される。

ここで注意すべき制約:
- top-level `wrangler.toml` に `[[services]] RELAY = tanstack-start-template-relay` が宣言済み（line 58-60）。
- `pnpm dev` (Vite + `@cloudflare/vite-plugin`) では `env.RELAY` が **Fetcher として注入される** が、相手の relay worker は起動していないため `relay.fetch()` は failure を返す。
- 既存の `buildRelayTrigger(relay, waitUntil, logger)` は `relay` が truthy なら `ServiceBindingRelayTrigger` を返す → consumer container 内で secondary kick が走るたびに `[relay-trigger] service binding kick failed` のエラーログが噴出する。

選択肢:

- **A**: secondary kick も inline でただちに処理する → 無限ループ防止のため明示的なループ上限機構が必要、複雑化。
- **B**: 内部 consumer container 構築時に `env.RELAY` を `undefined` で渡し、`buildRelayTrigger` が `NoopRelayTrigger` を返すよう仕向ける → secondary 行は次回 UoW commit / 次回 kick で拾われる。

### Decision

**選択肢 B を採用する。**

`InlineRelayTrigger.runOnce()` 内で consumer container を構築する際は、`consumerEnv = { ...env, RELAY: undefined as unknown as Fetcher | undefined }` を作って `createConsumerContainer(consumerEnv)` を呼ぶ。これにより:
- 内部 `buildRelayTrigger` は `relay = undefined` で `NoopRelayTrigger` を返す。
- secondary outbox 行は次の UoW commit / 次回 kick で拾われる。
- 存在しない relay worker への kick fetch が一切走らず、ログノイズが発生しない。

`processOutboxEvents` は `{ maxIterations: 1, batchSize: 25, workerId: "inline-dev" }` で固定し、1 kick = 1 batch のドレインに制限する。

### Consequences

- **良い点**:
  - `InlineRelayTrigger.kick()` の挙動が「1 回呼ばれたら 1 batch 分の outbox を捌く」と明確になる。
  - 無限ループの危険がない。
  - 存在しない RELAY service binding への fetch ログノイズが発生しない。
  - 実装がシンプル。
- **トレードオフ**:
  - 多段カスケードが必要な場面（A → A の dispatch が B を積む → B の dispatch が C を積む）では、ユーザー操作後に 1 回リロード必要になることがある。Issue #36 の主要シナリオは 1 段なので影響なし。
  - 将来的に多段が頻発するなら、ループ上限付きの再 kick を追加する余地は残しておく（今回は YAGNI で見送り）。

---

## ADR-003: dev 判定は `app/server.cloudflare.ts` の 1 ヶ所に限定し、`RelayTrigger` インスタンスを inject する

### Status
Proposed

### Context

`import.meta.env.DEV` を DI 層・アダプタ層・テストで直接参照するか、エントリポイント 1 ヶ所で判定するか。さらに、判定結果をどう DI 層に伝えるか：

- **A**: boolean フラグを `RequestServerConfig` に追加し、`buildRelayTrigger` で boolean + env を見て分岐する。`createRequestContainer` / `buildRelayTrigger` のシグネチャを env を持つよう拡張する必要がある。
- **B**: `RequestServerConfig` に optional `relayTriggerOverride?: RelayTrigger` を 1 つ追加し、エントリ側で `import.meta.env.DEV` を見て `new InlineRelayTrigger(env, ...)` を作って inject する。DI 層のシグネチャは無変更。

### Decision

**選択肢 B を採用する。**

`app/server.cloudflare.ts` の `fetch` ハンドラ内:
```ts
const baseConfig = readRequestServerConfig(env, ctx);
const config = import.meta.env.DEV
  ? { ...baseConfig, relayTriggerOverride: new InlineRelayTrigger(env, (p) => ctx.waitUntil(p), ConsoleLogger) }
  : baseConfig;
```

`createRequestContainer` 内では `config.relayTriggerOverride ?? buildRelayTrigger(...)` で wiring する。`buildRelayTrigger` / `createConsumerContainer` / `readRequestServerConfig` のシグネチャは無変更。

### Consequences

- **良い点**:
  - テストは `RelayTrigger` インスタンスを直接渡すだけで決定性が保たれる（`import.meta.env` のモックが不要）。
  - DI 層・アダプタ層の純度が高く保たれる。
  - dev 判定の「真の境界」がエントリ 1 ヶ所に集約され、レビュー時に確認しやすい。
  - `RequestServerConfig` の 1 optional フィールド追加のみで、他のシグネチャは無変更 → 既存テストの影響ゼロ。
  - `createConsumerContainer` 経路は `relayTriggerOverride` を受け取らないので production の consumer 経路に絶対影響しない。
- **トレードオフ**:
  - エントリで `new InlineRelayTrigger(...)` をリクエストごとに構築するコストがある（軽量なので問題なし、production では `import.meta.env.DEV` が false でこの行自体が dead-code）。
