# 実装計画 — Issue #66: pnpm dev で outbox relay/consumer が走らず resolved_note_id 解決が pending

**Issue:** #66
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

`pnpm dev` (Vite + `@cloudflare/vite-plugin`) はメイン Worker (`app/server.cloudflare.ts`) のみを起動し、`[env.relay] / [env.consumer] / [env.pruner] / [env.dlq]` の sibling Worker と Queue は走らない。結果として:

- UoW commit 時に積まれる outbox 行が dispatch されない
- consumer 側の `dispatchDomainEvent` 経由の処理（`ingestion.created` → `runIngestionJob`、`export.job.requested` → `runExportJob` など）が走らない
- 開発時のフルフロー検証・マニュアルテストが dev では成立しない

本 Issue では、dev 環境でも outbox dispatch が「フルフロー検証できる」状態を実現する。production / staging 経路は完全に無変更とする。

### Issue 本文の精査

Issue 本文では `note.content_updated` → `resolveInternalLinkRefs` 経由で `note_internal_links.resolved_note_id` が解決されない、と書かれているが、現行実装の `dispatchDomainEvent` (`app/core/application/workers/dispatchDomainEvent.ts:71-94`) では `note.*` イベントはすべて `default: skipped` で routing されておらず、`resolveInternalLinks` は `NoteService.assembleFromInputs` 内で **request-path 同期** に実行される（`app/core/domain/note/service.ts:386`）。

したがって本 Issue の **dispatcher 改修では `resolved_note_id` 解決の DX 問題は直接解決されない**。`resolved_note_id` の null 残存は別の原因（リンク先ノート未作成・ノート再順序による未再解決など）であり、必要に応じて別 Issue で対処する。

ただし Issue の **意図**（pnpm dev で outbox 経路がドレインされない DX 問題の解消）は依然として有効である。`ingestion.created` 経由のファイルアップロードフローなど outbox 経由で動作する usecase は dev で実機検証できないため、本 Issue ではそちらを動作確認の主シナリオとする。

## スコープ

### 含まれるもの

- `pnpm dev` 起動時に、UoW commit で kick される `RelayTrigger` を「同一 isolate 内で `processOutboxEvents` を回し、`dispatchDomainEvent` を直接呼ぶ」インライン実装に差し替える
- DI 配線（`buildRelayTrigger`）への dev 分岐の seam 追加
- エントリポイント（`app/server.cloudflare.ts`）での `import.meta.env.DEV` 判定
- `docs/runtime_cloudflare.md` への dev 挙動の明記
- 上記をカバーするユニットテスト

### 含まれないもの

- production / staging の wrangler 設定変更、deploy フロー変更
- `pnpm dev` で relay/consumer worker をプロセスレベルで並列起動する仕組み（A1 案）— miniflare の D1/Queue 分離により実用性が低いため却下
- pruner / DLQ の dev 内挙動（dev では outbox 行が溜まったままで構わない）
- cron trigger の dev 実行
- Issue #36 で確認済みの「resolveInternalLinks の request-path 同期実行」ロジック変更
- 並列起動用の `concurrently` 等の dep 追加

## 実装ステップ

### 1. `RelayTrigger` ポートの JSDoc 微修正

- **対象ファイル:** `app/core/application/ports/relayTrigger.ts`
- **変更内容:** JSDoc に「`kick()` 呼び出し元は完了を待たない / 同期実装も非同期実装もどちらも契約上正当」「実装は throw してはならない（fire-and-forget）」「idempotent」の三点を明記。
- **理由:** 新規の `InlineRelayTrigger` が同 isolate 内で重い処理をするため、契約上の正当性をコード読者に保証する。

### 2. 新規アダプタ `InlineRelayTrigger` の追加

- **対象ファイル:** `app/core/adapters/cloudflare/inlineRelayTrigger.ts`（新規）
- **変更内容:** dev 専用 `RelayTrigger` 実装。
  - コンストラクタで `env: ServerEnv`, `waitUntil: (p: Promise<unknown>) => void`, `logger: Logger`, optional `options?: ProcessOutboxEventsOptions` を取る。
  - `env` は内部で `WorkerContainer` / `ConsumerContainer` を組むのに使う。
  - `kick()` は `waitUntil((async () => { await runOnce(); })())` で fire-and-forget。
  - `runOnce()` 内:
    1. `workerContainer = createWorkerContainer(env)` で構築
    2. `consumerEnv = { ...env, RELAY: undefined as unknown as Fetcher | undefined }` を作り、`consumerContainer = createConsumerContainer(consumerEnv)` を構築（**`RELAY` を排除して secondary kick の Service Binding fetch を抑制**。詳細は ADR-002）
    3. `processOutboxEvents(workerContainer, dispatch, { maxIterations: 1, batchSize: 25, workerId: "inline-dev", ...options })` を呼ぶ
    4. `dispatch` は queue を経由せず、各 event を以下で処理:
       - `consumerContainer.idempotencyStore.hasProcessed(event.id)` で済みなら `success` を返す（skip）
       - `dispatchDomainEvent(consumerContainer, event)` を呼ぶ
       - 結果が `handled` または `skipped` → `markProcessed` → `success`
       - 結果が `retry` → `failure { id, error }` を返して relay 側で `attempts++` させる
       - dispatch 内 throw → catch して `failure { id, error }` を返す
    5. 処理件数を debug ログに出す
  - エラーは必ず `logger.error` で握りつぶす（`kick()` は throw しない契約）。
- **理由:** Issue の選択肢2（インライン dispatcher）を最小コードで実現する。queue / Service Binding を経由しない以外のロジックは production の `handleQueue` / `runRelayTick` と完全に同等。`maxIterations: 1` で 1 kick = 1 batch 分のドレインに固定し、`waitUntil` 内で重い処理が膨らむのを防ぐ（ADR-002 の意図と整合）。

### 3. DI 配線への seam 追加（最小拡張）

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - `RequestServerConfig` に `relayTriggerOverride?: RelayTrigger` を optional 追加（未設定 = 既存パス）。
  - `readRequestServerConfig` には引数を**追加しない**。エントリ側で構築した `RelayTrigger` を `readRequestServerConfig(env, ctx)` の戻り値にスプレッドで合成するか、エントリ側で `{ ...readRequestServerConfig(env, ctx), relayTriggerOverride }` を組み立てる。
  - `createRequestContainer` 内の `buildRelayTrigger(relay, waitUntil, ConsoleLogger)` 呼び出しを、`config.relayTriggerOverride ?? buildRelayTrigger(relay, waitUntil, ConsoleLogger)` に置き換える。
  - `buildRelayTrigger` のシグネチャは**変更しない**（既存テストへの影響ゼロ）。
- **理由:** 既存 seam (`RelayTrigger` ポート) を override 1 フィールドで活用。シグネチャ拡張は `RequestServerConfig` の optional 1 フィールドのみで、`buildRelayTrigger` / `createRequestContainer` / `createConsumerContainer` のシグネチャは全て無変更（後方互換）。`createConsumerContainer` 経路は `readRequestServerConfig(env, ctx)` の戻り値そのままで `relayTriggerOverride` が undefined のため、production の consumer 経路に絶対影響しない。

### 4. エントリポイントでの `import.meta.env.DEV` 判定と override 注入

- **対象ファイル:** `app/server.cloudflare.ts`
- **変更内容:**
  ```ts
  async fetch(request, env, ctx) {
    const baseConfig = readRequestServerConfig(env, ctx);
    const config: RequestServerConfig = import.meta.env.DEV
      ? {
          ...baseConfig,
          relayTriggerOverride: new InlineRelayTrigger(
            env,
            (p) => ctx.waitUntil(p),
            ConsoleLogger,
          ),
        }
      : baseConfig;
    const container = createRequestContainer(config);
    return storage.run(container, async () => defaultEntry.fetch(request));
  },
  ```
- **理由:**
  - `import.meta.env.DEV` は vite が `vite build` 時に `false` にインライン化し、dead code として削除されるため、deploy 経路には絶対に混入しない。
  - DI 層・アダプタ層は `RelayTrigger` インスタンスを受け取るだけで `import.meta.env` を参照しない → testability が保たれる。
  - 型は `tsconfig.json` の `types: ["node", "vite/client"]` で `ImportMeta.env.DEV` が提供されているので追加の型補強不要。

### 5. テスト追加

- **対象ファイル:**
  - `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts`（新規）
  - `app/core/application/di/__tests__/serverCloudflare.test.ts`（既存ファイルに追記）
- **変更内容:**
  - `inlineRelayTrigger.test.ts`:
    - InMemory な outbox repo / idempotency store / `dispatchDomainEvent` spy で kick → dispatch → markProcessed の経路を検証
    - retry 結果のとき `attempts++` され `markProcessed` が呼ばれないこと
    - dispatch 内 throw でも `kick()` 自体は throw しないこと（fire-and-forget 契約）
    - idempotency store が hasProcessed=true のとき dispatch を呼ばずに skip すること
    - 内部で構築する `ConsumerContainer` の `RELAY` が排除され、secondary kick が `ServiceBindingRelayTrigger` ではなく `NoopRelayTrigger` となること（ADR-002 担保）
  - `serverCloudflare.test.ts`:
    - `createRequestContainer({ ...config, relayTriggerOverride: customTrigger })` が UoW provider に `customTrigger` を渡すこと（`instanceof` で確認）
    - `relayTriggerOverride` 未設定の場合は従来通り `buildRelayTrigger` の結果（`ServiceBindingRelayTrigger` / `NoopRelayTrigger`）が UoW provider に渡ること（**production 経路 zero-impact 回帰テスト**)
    - `createConsumerContainer(env, ctx)` 経路が `relayTriggerOverride` を受け取らないことを `readRequestServerConfig` の戻り値型・呼び出しで確認（consumer worker は dev でも production でも従来挙動）
- **理由:** 純関数ベースの合成なので unit で十分。既存の integration test (`eventRelayWorker.integration.test.ts`) には手を入れない。

### 6. ドキュメント更新

- **対象ファイル:** `docs/runtime_cloudflare.md`
- **変更内容:** "Quick start" もしくは Worker matrix 近辺に新セクション "Local dev outbox dispatch" を追加（10〜15 行）:
  - dev では `import.meta.env.DEV === true` のとき outbox が UoW commit 直後に **同一 isolate でインライン dispatch** されること
  - production / staging では従来通り Service Binding → relay Worker → Queue → consumer Worker 経路を辿ること
  - 挙動差: dev はレイテンシゼロで projection が反映される / production は Queue 経由で数百ms〜のレイテンシ
  - dev の制約: secondary event（dispatch 中に積まれた新規 outbox）は次の kick まで持ち越し（無限カスケード回避のため）
  - `pnpm start`（`wrangler dev` 直叩き）では `import.meta.env.DEV` が伝播しないため inline 経路は無効 → 従来通り Queue 経路（ただし worker は別途立てる必要あり）
- **理由:** Issue 選択肢4（README に明記）も同時に満たす。dev/prod 挙動差の予期しない混乱を防ぐ。

## 設計判断

- **A2 案（`InlineRelayTrigger` + `import.meta.env.DEV`）をベース採用。** 詳細は `adr.md` ADR-001 を参照。
- **secondary kick の RELAY 排除:** `InlineRelayTrigger` 内で組む consumer container は `env.RELAY` を `undefined` にして構築し、内側の `buildRelayTrigger` が `NoopRelayTrigger` を返すよう強制する。`adr.md` ADR-002 を参照。
- **dev フラグの参照は `app/server.cloudflare.ts` の 1 ヶ所のみ。** DI 層・アダプタ層は `RelayTrigger` インスタンスを受け取るだけ。`adr.md` ADR-003 を参照。

### Issue 本文「期待される動作」4 案との対応

| Issue 本文 | plan の扱い |
|------------|-------------|
| 案1 (dev サーバー同梱で relay/consumer 実行) | 部分採用（dev では同一 isolate で inline 同期 dispatch を実行する形で実現） |
| 案2 (インライン dispatcher) | **採用（本案のベース）** |
| 案3 (dev:full スクリプトで全 worker 並列起動) | 却下 — miniflare per-process 分離問題、新規 dep 増 |
| 案4 (README 明記) | 併用（docs/runtime_cloudflare.md の更新で対応） |

## リスクと注意点

- **dev/prod 挙動差**: inline 同期 dispatch は queue 経由の最終的整合性とタイミングが異なる。dev に慣れると本番のレイテンシで驚く可能性 → docs で明記。
- **secondary event の遅延**: 次回 UoW commit まで持ち越し。Issue #36 のフロー（content_updated → resolveInternalLinkRefs）は 1 commit で完結するため問題なし。仮に多段カスケードが必要なシナリオが現れたら、`InlineRelayTrigger` 内に「pending が残っているなら再 kick」ループ上限機構を追加する余地は残す（今回は実装しない）。
- **`import.meta.env.DEV` の信頼性**: `vite build`（`pnpm build` / `pnpm deploy:*`）では `false` にインライン化されることを実装後に確認する。`pnpm start`（vite 介在しない wrangler dev 直起動）では `undefined` → falsy となり、inline 経路は無効化される。これは想定挙動として docs に明記。
- **テストでの `import.meta.env` 依存回避**: DI 層は boolean フラグで受け取るので、テストは `import.meta.env` に依存しない（決定性確保）。
- **`waitUntil` 起源**: dev では `ctx.waitUntil` を `RequestServerConfig.waitUntil` 経由で取得。dev workerd でも有効。
- **既存テスト破壊リスク**: `buildRelayTrigger` のシグネチャ拡張は optional 引数を末尾に追加するだけで後方互換。既存テストはそのまま通る想定だが、念のため `pnpm test:unit` で確認。

## テスト方針

- **自動テスト**:
  - 新規 unit: `inlineRelayTrigger.test.ts`（dispatcher 動作 / retry / fire-and-forget / idempotency skip / RELAY 排除）
  - 既存 unit 追記: `serverCloudflare.test.ts`（override 適用 / production 経路 zero-impact 回帰）
  - `pnpm test:unit && pnpm test:integration` 全 green を確認
- **手動検証** (`testing.md` 詳細):
  - `pnpm dev` 起動 → ファイルアップロード ingestion を試行 → `ingestion.created` イベントが inline dispatch されて `runIngestionJob` が走り、Job ステータスが `pending → processing → preview_ready` まで進むことを確認
  - `wrangler d1 execute --local --command "SELECT id, type, processed_at, failed_at, attempts FROM outbox ORDER BY created_at DESC LIMIT 10"` で outbox 行が `processed_at NOT NULL` まで進んでいることを確認
  - `pnpm build` 後 `dist/**/*` 配下を grep して `import.meta.env.DEV` 参照が dead-code として消えていることを確認:
    `grep -r "import.meta.env" dist/ 2>/dev/null || echo "OK: dead-code eliminated"`
  - **note 系の `resolved_note_id` 解決確認は本 Issue のスコープ外**（Issue 本文に矛盾あり、目的セクション参照）
- **回帰確認**: `pnpm typecheck && pnpm lint:fix && pnpm format` で zero error/zero warning

## 参考: エージェント比較

| 観点 | エージェント1 (アーキ) | エージェント2 (保守性) | エージェント3 (シンプル) |
|------|------------------------|------------------------|--------------------------|
| ベース採用 | × | ○ | △（補助的に採用） |
| 取り込んだ点 | docs/runtime_cloudflare.md 更新の必要性、Issue 本文の精査 | DI seam の明確化、`InlineRelayTrigger` 設計、無限カスケード回避、テスト構成 | 4 案の比較根拠、production 経路 zero-impact の確認 |
| 却下点 | `wrangler dev --env` 並列起動は miniflare 分離問題で実用度低い | — | `LOCAL_DEV_INPROCESS_DISPATCH` var 方式は wrangler.toml への追加が必要で、`import.meta.env.DEV` のほうがビルド時固定で堅牢 |

## レビュー反映

### 修正した点（review-001 / レビュアー2 P-001）
- Issue 本文の `resolved_note_id` 解決経路が `dispatchDomainEvent` で `note.*` が `skipped` のため成立しないことを確認し、目的セクションに精査結果を明記。本 Issue のスコープを「outbox 経路のドレイン DX 改善」に絞り、手動検証も ingestion フロー中心に変更。

### 修正した点（review-001 / レビュアー2 P-002）
- `InlineRelayTrigger` 内で組む consumer container 構築時に `env.RELAY` を排除する処理を Step 2 で明記。secondary kick が `ServiceBindingRelayTrigger` を経由しないことをテスト追加（Step 5）で担保。ADR-002 にも反映。

### 修正した点（review-001 / レビュアー1 P-001〜P-003 / レビュアー2 P-003）
- `createRequestContainer` / `buildRelayTrigger` / `createConsumerContainer` のシグネチャ拡張を撤回。代わりに `RequestServerConfig` に optional `relayTriggerOverride?: RelayTrigger` を 1 つだけ追加し、エントリで `InlineRelayTrigger` インスタンスを構築して inject する設計に変更。consumer 経路への波及を完全に断つ。

### 取り込んだ改善提案
- **S-001（review-001 レビュアー2）**: `pnpm build` 後の `dist/` を grep して `import.meta.env.DEV` の dead-code elimination を確認する手順を testing に追加。
- **S-003（review-001 レビュアー2）**: `processOutboxEvents` を `maxIterations: 1`, `batchSize: 25` で固定し、1 kick = 1 batch のドレインに制限。
- **S-004（review-001 レビュアー2）**: dev 用 `workerId: "inline-dev"` 固定で診断ログをクリーンに。
- **S-002（review-001 レビュアー1）**: production 経路 zero-impact の回帰テストを `serverCloudflare.test.ts` 追記に明記。
- **P-004（review-001 レビュアー1）**: Issue 本文 4 案と plan A1-A4 の対応表を「設計判断」セクションに追加。

### 見送った提案とその理由
- **S-004（review-001 レビュアー1, `cloudflare/` 配下の妥当性）**: runtime-agnostic な場所への移動は本 Issue のスコープ外。`cloudflare/` 配下で命名規則上は適切。
- **S-005（review-001 レビュアー2, コンテナ寿命コメント）**: `InlineRelayTrigger` の JSDoc に簡潔に書く程度に留め、plan に追加コメントは入れない。実装時に対応。
