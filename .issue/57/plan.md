# 実装計画 — Issue #57: queue consumer から runIngestionJob / runExportJob を呼ぶ配線が未整備

**Issue:** #57
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

`app/worker/cloudflare/handlers.ts` の `handleQueue` が現状 `DomainEvent` を `idempotencyStore.markProcessed` で stamp して `ack` するだけで、`runIngestionJob` / `runExportJob` を呼ぶ配線が無い。これにより:

- 新規 ingestion / export ジョブが `pending` に置かれても自動的に消化されない
- Issue #3 で実装した `retryIngestionJob` / `retryExportJob` は `failed → pending` 遷移と `*.retryRequested` イベント発行までを担うが、実際に処理を再走するパイプラインが繋がっていない

Issue #3 の ADR-002 で本 Issue に切り出された残課題に対応する。

## スコープ

### 含まれるもの

- `handleQueue` から `runIngestionJob` / `runExportJob` への dispatch 配線
- 対象イベント 4 種:
  - `ingestion.created` — 新規 IngestionJob 作成時（Issue 本文の `ingestion.requested` は実コード上のイベント名 `ingestion.created` を指す）
  - `ingestion.retryRequested` — `retryIngestionJob` 経由 `failed → pending`
  - `export.job.requested` — 新規 ExportJob 作成時
  - `export.job.retryRequested` — `retryExportJob` 経由 `failed → pending`
- consumer Worker 用 DI container builder の新設 (`createConsumerContainer`)
- dispatch ロジックの application 層への純粋関数化 (`dispatchDomainEvent`)
- `IdempotencyStore.hasProcessed` を新規追加し、stamp を「成功後」に動かす順序変更（at-least-once × retry を成立させるため。ADR-003 参照）
- ユニットテスト + 統合テスト

### 含まれないもの

- `ingestion.regenerated` の dispatch — `regenerate` は `previewing → processing` への遷移で、`runIngestionJob` の `isPending` ガードを通過できない。regenerate 機能の処理パイプラインは別 Issue で扱う
- `wrangler.toml [env.consumer]` への新規 binding 追加（R2 / LLM 実体アダプタの差し替え、`SECRET_BOX_MASTER_KEY` / `ADMIN_LLM_API_KEY` 等の追加）— 本 Issue は配線のみ。Stub アダプタ越しでも dispatch 経路が機能することを示せれば足りる
- 「`pending` で塩漬けになったジョブ」の自動リカバリ機構 — 既存の admin 手動 retry ボタン（Issue #3）が safety net
- `note.*` / `publication.*` / `ingestion.previewAttached` 等の非 dispatch イベントの挙動変更 — 現状の「stamp + ack のみ」を維持

## 実装ステップ

### 1. IdempotencyStore に hasProcessed を追加（port + adapter + テスト）

- **対象ファイル:**
  - `app/core/application/ports/idempotencyStore.ts`
  - `app/core/adapters/d1/repositories/idempotencyStore.ts`
  - `app/core/adapters/d1/repositories/__tests__/idempotencyStore.integration.test.ts`（既存があれば追記、無ければ最低限のケース追加）
- **変更内容:**
  - port: `hasProcessed(id: EventId): Promise<boolean>` を追加。JSDoc で「副作用無しの存在チェック。`markProcessed` の前にあらかじめ dedup を取りたい場合に使う」と明記。
  - adapter: `SELECT 1 FROM processed_events WHERE id = ? LIMIT 1` 相当の最小実装。
  - テスト: 「初回 false → markProcessed 後 true」「並行性は markProcessed 側で担保（hasProcessed はあくまで snapshot）」を確認するケース。
- **理由:** `markProcessed` 先行のままだと `LLMRateLimitError → message.retry()` のとき stamp が既に commit されており次回 redelivery で skip され retry が機能しない（ADR-003 で詳細）。「dispatch 前は読み取りで dedup、成功後に stamp」順序に変えるため hasProcessed を導入する。

### 2. ConsumerContainer 型を DI に追加

- **対象ファイル:** `app/core/application/di/types.ts`
- **変更内容:** `ConsumerContainer = RequestContainer & Pick<WorkerContainer, "outboxRepository" | "idempotencyStore" | "indexJobRepository">` を export。JSDoc で「queue consumer は domain aggregate を mutate するため request scope と同等の DI が必要、加えて冪等性 stamp / outbox / index-job 操作のため worker-only ポートを合成したもの」と明記。
  - **重要:** `searchIndex` は `RequestContainer` と `WorkerContainer` の両方に存在するため、`Pick<WorkerContainer, "outboxRepository" | "idempotencyStore" | "indexJobRepository">` で worker 側 3 件のみを抜き出し、`searchIndex` の重複を避ける。
- **理由:** `runIngestionJob` / `runExportJob` の `ServiceArgs` は `RequestContainer` を要求する一方、`handleQueue` は冪等性 stamp に `idempotencyStore` も必要。`WorkerContainer` の minimal 契約を維持しつつ、consumer 用に明示的な合成型を追加する。

### 3. createConsumerContainer を DI に追加

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `createConsumerContainer(env: ServerEnv): ConsumerContainer` を新設。実装方針:
  - `const requestContainer = createRequestContainer(readRequestServerConfig(env));`
  - `const workerContainer = createWorkerContainer(env);`
  - 戻り値は明示的に request 全体 + worker から必要な 3 ポートのみ:
    ```ts
    return {
      ...requestContainer,
      outboxRepository: workerContainer.outboxRepository,
      idempotencyStore: workerContainer.idempotencyStore,
      indexJobRepository: workerContainer.indexJobRepository,
    } satisfies ConsumerContainer;
    ```
  - 全展開 spread を避け、worker 側ポートを 1 つずつ明示することで `searchIndex` 上書きを発生させない。
  - SSR の `config` は consumer 経路で読まれないが `RequestContainer` 型が要求するため、`readRequestServerConfig` 経由でそのまま埋める。
- **理由:** `createWorkerContainer` を太らせると pruner / relay / dlq に過剰な依存が漏れる。consumer 専用ビルダで明示的に責務分離する。ポートの重複は明示的合成で回避する。

### 4. dispatchDomainEvent を application 層に切り出す（純粋関数）

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`（新規）
- **変更内容:**
  - 関数シグネチャ:
    ```ts
    export type DispatchOutcome =
      | { readonly kind: "handled" }
      | { readonly kind: "skipped" }
      | { readonly kind: "retry"; readonly error: unknown };

    export async function dispatchDomainEvent(
      container: RequestContainer,
      event: DomainEvent,
    ): Promise<DispatchOutcome>;
    ```
    - `container` 型は `RequestContainer`。`ConsumerContainer` は subtype なので呼び出し側はそのまま渡せる。dispatch 内で worker-only ポート（outboxRepository 等）は触らないため、型は `RequestContainer` で十分（LSP）。
  - `switch (event.type)` で 4 種を明示的にルーティング:
    - `ingestion.created` / `ingestion.retryRequested` → `IngestionJobId.create(event.payload.jobId)` を経由してから `as unknown as IngestionJobIdDTO` で DTO 型に整える（`runIngestionJob` の引数型は `dto/ingestion.IngestionJobId`）→ `runIngestionJob({ container, input: { jobId } })`
    - `export.job.requested` / `export.job.retryRequested` → `ExportJobId.create(event.payload.exportJobId)` で domain VO を再構築 → `runExportJob({ container, input: { jobId } })`
    - 上記 4 種以外 → `{ kind: "skipped" }`
  - try/catch で usecase の throw を outcome に変換:
    - `isLLMRateLimitError(error)` → `{ kind: "retry", error }`
    - `error instanceof NotFoundError` (`INGESTION_JOB_NOT_FOUND` / `EXPORT_JOB_NOT_FOUND`) → `{ kind: "handled" }`（消えた行を再配信で復活させる手段はない）
    - その他（D1 一時障害含む）→ `{ kind: "retry", error }`
  - usecase が正常終了（throw 無し）→ `{ kind: "handled" }`
- **理由:** dispatch 表を queue runtime（`message.ack` / `message.retry`）から切り離すことで、unit test で全ルートを miniflare 抜きで網羅できる。既存の `consumeIndexJob` と outcome discriminated union パターンが揃う（`dlq` 相当は本 dispatch では queue 側の `max_retries` 経由で間接的に到達する）。payload からの VO 再構築を両イベント種で揃え、cast 戦略の一貫性を持たせる。

### 5. dispatchDomainEvent のユニットテスト

- **対象ファイル:** `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`（新規）
- **変更内容:** `vi.mock` で `runIngestionJob` / `runExportJob` を stub し、各ルートを検証:
  - `ingestion.created` / `ingestion.retryRequested` → `runIngestionJob` が `{ jobId }` 引数で 1 回呼ばれ、`kind: "handled"`
  - `export.job.requested` / `export.job.retryRequested` → `runExportJob` が `{ jobId }` 引数で 1 回呼ばれ、`kind: "handled"`
  - `note.trashed` / `ingestion.regenerated` / `ingestion.previewAttached` → どの usecase も呼ばれず、`kind: "skipped"`（`ingestion.regenerated` を明示することで「将来うっかり dispatch 対象に追加されないか」を regression guard する）
  - `runIngestionJob` が `LLMRateLimitError` を throw → `kind: "retry"`
  - `runIngestionJob` が `NotFoundError("INGESTION_JOB_NOT_FOUND")` を throw → `kind: "handled"`
  - `runIngestionJob` が一般 `Error` を throw → `kind: "retry"`
  - `runExportJob` が `NotFoundError` を throw → `kind: "handled"`
  - 各 ingestion/export ルートで payload の `jobId` / `exportJobId` が usecase 引数に正しく届くこと（`expect(spy).toHaveBeenCalledWith({ container, input: { jobId: ... } })`）
- **理由:** dispatch 表の網羅とエラー分類を high speed で担保。container は `as unknown as RequestContainer` で型穴埋め（mock で実呼び出しが無いため安全）。

### 6. handleQueue を再構成（stamp post-dispatch + dispatch 配線）

- **対象ファイル:** `app/worker/cloudflare/handlers.ts`
- **変更内容:**
  - import: `createConsumerContainer`, `dispatchDomainEvent` を追加。
  - `ConsumerEnv` 型は変更不要（`ServerEnv` 互換のまま）。
  - `handleQueue` 本体の新フロー:
    1. `const container = createConsumerContainer(env);` に差し替え。
    2. ループ内 try ブロック:
       1. `if (await container.idempotencyStore.hasProcessed(event.id))` → `logger.info("[queue] skipping redelivery ...")` + `message.ack()` + `continue`
       2. `const outcome = await dispatchDomainEvent(container, message.body);`
       3. `outcome.kind` ごとに分岐:
          - `"handled"` または `"skipped"` → `await container.idempotencyStore.markProcessed(event.id)` で stamp、`message.ack()`
          - `"retry"` → `logger.warn("[queue] dispatch retry", { eventId, error })` + `message.retry()`（stamp しない）
    3. 外側 catch → 既存と同じく `message.retry()`（想定外 throw のフォールバック）。
  - 順序変更を JSDoc コメントで明示:「`hasProcessed` → dispatch → success stamp の順序にすることで、retry path が機能する（ADR-003 参照）。usecase 側の `isPending` ガード + 楽観ロックが二重実行に対する追加の防御。」
- **理由:** 既存の stamp 先行構造は `LLMRateLimitError → retry` のとき stamp が残って redelivery を skip させる致命的バグを内包していた（ADR-003）。順序を post-dispatch に変えることで at-least-once + idempotent + retry が正しく成立する。

### 7. handlers.integration.test.ts に dispatch 経路を追加

- **対象ファイル:** `app/worker/cloudflare/__tests__/handlers.integration.test.ts`
- **変更内容:**
  - 既存 helper を踏襲し、ingestion / export ジョブ行を `pending` 状態で seed するヘルパを追加:
    - `seedIngestionJob({ jobId, ownerId, kind, tempStorageKey, ... }): Promise<void>` — D1 に最小スキーマで insert（既存の `app/core/application/ingestion/__tests__/` 内 fixture 構造を参考にし、テスト localで完結する形で書く）
    - `seedExportJob({ jobId, ownerId, format, scope, ... }): Promise<void>` — 同様
  - 既存 describe `consumer Worker — handleQueue` に dispatch ケースを追加:
    - **dispatch happy path (ingestion)**: `seedIngestionJob({ status: "pending" })` → `ingestion.created` イベントを `createMessageBatch` で投入 → `handleQueue` 実行 → IngestionJob の `status` が `pending` から進んでいる（`processing` 以降、`StubLLMProvider` が `BusinessRuleError` を throw する場合は `failed` でも可）+ `processed_events` に stamp。
    - **dispatch happy path (export)**: 同様に `export.job.requested` で ExportJob を確認。
    - **dispatch skip (既存)**: `note.trashed` が引き続き stamp + ack だけで終わること（回帰防止）。
    - **dispatch retry path**: `vi.spyOn(D1IdempotencyStore.prototype, "markProcessed").mockRejectedValueOnce(...)` のような既存パターンを活用するか、`vi.spyOn(StubLLMProvider.prototype, "structureToHtml")` 相当で `LLMRateLimitError` を throw させ、`message.retry()` 経路に乗り **`processed_events` に stamp が残っていない**ことを確認（at-least-once + retry が機能していることの証明）。
    - **already-processed skip path (既存)**: 同一 event ID を二度配信 → 1 回目で stamp 残り、2 回目は `hasProcessed=true` で skip + ack。これは既存テストを `hasProcessed` ベースに移植する形で残す。
  - 既存テスト「acks redelivered without re-running」の assertion は `hasProcessed` 経路に合わせて更新する（観察可能な behavior は不変）。
- **理由:** application 層のテストとは独立に、Cloudflare 固有の queue runtime（`createMessageBatch` / `getQueueResult`）越しの動作 + 順序変更後の stamp タイミング + retry path が正しく機能することを E2E で担保する。

## 設計判断

詳細は `.issue/57/adr.md` を参照:

- **ADR-001**: dispatch 表を application 層の純粋関数 `dispatchDomainEvent` に切り出し、`handleQueue` は queue runtime glue として薄く保つ
- **ADR-002**: consumer 用 DI は `RequestContainer & 一部の WorkerContainer ポート` を返す `createConsumerContainer` を新設し、`createWorkerContainer` の minimal 契約を保つ
- **ADR-003**: `IdempotencyStore.hasProcessed` を新設して stamp を「成功後」に動かす（旧 stamp 先行から変更）。これにより `LLMRateLimitError → message.retry()` が正しく機能する
- **ADR-004**: `ingestion.regenerated` は dispatch 対象に含めない（`isPending` ガード越えできず no-op になる構造的事情）
- **ADR-005**: `NotFoundError` は `handled`（ack）扱い、`LLMRateLimitError` のみ `retry` 扱い。`runIngestionJob` / `runExportJob` 内部の UoW が D1 一時障害で throw した場合も `retry` 扱い

## リスクと注意点

- **at-least-once × idempotent × retry の三重防御の整合**: 新フローは `hasProcessed → dispatch → 成功時のみ stamp` の順序で、retry path が機能する。dispatch 中の crash（stamp 未実施）で再配信されたとき、usecase 側の `isPending` ガード + 楽観ロックが二重実行を防御する。
- **port 追加の影響範囲**: `IdempotencyStore.hasProcessed` を増やすため、既存の port を実装する全アダプタ（現状 `D1IdempotencyStore` のみ）と Stub / テストハーネス側に追従が必要。
- **`runExportJob` の戻り値**: `{ job: ExportJobDTO | null }` を返すが consumer 側では捨てる（最終状態の観測は `export.job.completed` event 等で行う）。ログには `jobId` のみ載せる。
- **D1 UoW 自体の throw**: `runIngestionJob` / `runExportJob` は内部 UoW を try/catch しない部分があり、D1 接続不可などで `unitOfWorkProvider.run` 自体が throw する可能性がある。dispatchDomainEvent の catch がこれを `retry` outcome に変換する（ADR-005 で明示）。
- **`createConsumerContainer` の起動コスト**: 全 adapter（Stub 系含む）の new が増えるが、いずれも軽量なコンストラクタ呼び出しでパフォーマンス影響は無視できる。
- **CPU/wall-clock 制約 (Cloudflare Workers)**: `max_batch_size` × LLM 重処理で wall-clock 30s 制限に達する可能性。本 Issue では wrangler 設定変更を含めず、運用上は単発 enqueue 前提とする。Stub アダプタ運用中はそもそも処理時間がほぼゼロのため、本番 binding 差し替え時に再評価する（別 Issue）。
- **wrangler `[env.consumer]` への binding 追加は別 Issue**: 本 Issue は Stub 越しでの配線確認まで。本番 LLM / R2 / SECRET_BOX_MASTER_KEY 等の binding を consumer に配る作業は別 Issue として切り出す（`createConsumerContainer` 経路が `RequestContainer` 用の env 変数を `optional` 経由で読むため、未設定でも型は通るが実体は Stub / Null adapter に縮退する）。
- **イベント payload のスキーマ齟齬**: `message.body` は relay 側で構築済みの `DomainEvent`。dispatchDomainEvent 内では各 VO factory（`IngestionJobId.create` / `ExportJobId.create`）で再 validate することで、relay 側との不整合が起きた場合に Zod / branded VO の validation で確実に throw され、`retry` outcome に変換される。

## テスト方針

- `pnpm test app/core/application/workers/__tests__/dispatchDomainEvent.test.ts` — dispatch 表の全ルート + エラー分類を pure unit で網羅
- `pnpm test:integration app/worker/cloudflare/__tests__/handlers.integration.test.ts` — miniflare 経由で end-to-end dispatch + retry path + 既存 redelivery 経路の回帰確認
- `pnpm test:integration app/core/adapters/d1/repositories/__tests__/idempotencyStore.integration.test.ts` — 新規 `hasProcessed` メソッドの動作確認（既存があれば追記）
- `pnpm typecheck` — `ConsumerContainer` 型の整合性、`createConsumerContainer` の戻り値が usecase に渡せること
- `pnpm lint:fix && pnpm format` — Biome 整形

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | × | ◯ | × |
| 取り込んだ点 | `createConsumerContainer` 新設の DI 規約整理 / リスクと注意点の網羅性 / Issue 本文と実装名の乖離整理 | 純粋関数 `dispatchDomainEvent` + outcome union パターン / unit test 戦略 / `NotFoundError` の ack 扱い | switch のみのミニマル指針 / YAGNI |

`ingestion.regenerated` の扱い: エージェント1は dispatch 対象に含める提案だったが、`regenerate` は `previewing → processing` への直接遷移で `runIngestionJob` の `isPending` ガードを通過できない構造的事情を確認し、本 Issue のスコープから外す判断とした（regenerate 機能の処理パイプラインは別 Issue で対応）。

## レビュー反映

### 修正した点

- **[P-003 (reviewer 2)]** 「`markProcessed` 先行 + `LLMRateLimitError → retry` で stamp が残って redelivery を skip する致命的バグ」を解消するため、`IdempotencyStore.hasProcessed` を新設し、stamp を post-dispatch に移す方針へ変更。Step 1 / Step 6 / ADR-003 を更新。
- **[P-001 (reviewer 1)]** 統合テストで ingestion / export ジョブ行を `pending` 状態で seed するヘルパを追加する旨を Step 7 に明示。
- **[P-002 (reviewer 1)]** `LLMRateLimitError` の注入は `vi.spyOn(StubLLMProvider.prototype, ...)` 等の既存パターンで行う旨を Step 7 に明示。
- **[P-001 (reviewer 2)]** `dispatchDomainEvent` の container 型は `RequestContainer`（LSP 上は最も狭く十分）に固定し、ConsumerContainer は subtype として呼び出し側で渡せる旨を Step 4 で明示。
- **[P-002 (reviewer 2)]** D1 UoW の throw（`unitOfWorkProvider.run` 自体の例外）を ADR-005 とリスク欄で明示。
- **[P-003 (reviewer 1)]** ingestion / export の payload cast 戦略を統一: 両者とも対応する VO factory（`IngestionJobId.create` / `ExportJobId.create`）を経由する形に揃え、ingestion は DTO 型への cast を末尾で行う（Step 4 詳細化）。
- **[P-004 (reviewer 2)]** wrangler `[env.consumer]` の binding 追加が別 Issue である旨をリスク欄に明記。
- **[S-005 (reviewer 2)]** `ConsumerContainer` の `searchIndex` 重複問題を回避するため、`Pick<WorkerContainer, ...>` で worker 側 3 ポートのみを明示的に抜き出す（Step 2 / Step 3 で詳細化）。

### 取り込んだ改善提案

- **[S-001 (reviewer 1)]** `dispatchDomainEvent.test.ts` に `ingestion.regenerated` の skip ケースを明示的に追加（Step 5）。将来の regression guard。
- **[S-001 (reviewer 2)]** `dispatchDomainEvent.test.ts` で payload の `jobId` / `exportJobId` が usecase に正しい型で届くことを assert（Step 5）。
- **[S-003 (reviewer 1)]** `markProcessed` 順序変更の意図と Issue #3 admin retry safety net の関係を `handleQueue` の JSDoc コメントに明示（Step 6）。

### 見送った提案とその理由

- **[S-002 (reviewer 1)]** `DISPATCH_TARGETS` を export 定数として外出しする提案: dispatch 表は `switch` で読めば全件が一目で分かるため、追加の export 定数は重複情報になる。テストで全ケース列挙する形で十分カバー可能。
- **[S-002 (reviewer 2)]** ADR-001 の「同型」表現の精度: 文言を「outcome を discriminated union で返す方針が同じ」に揃える形で本文に反映済み（Step 4）。改めて ADR-001 の文言は更新しないが、計画本文で意図は通っている。
- **[S-003 (reviewer 2)]** `LLMRateLimitError` 以外の transient エラー（LLMUnavailable / LLMTimeout / OCRFailure 等）の retry 化: 本 Issue のスコープ外。`runIngestionJob` 側の分類を信頼し、現状の挙動を維持する旨をリスク欄で間接的に表明。
