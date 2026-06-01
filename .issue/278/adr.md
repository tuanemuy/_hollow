# ADR — Issue #278: IngestionQueue polling 専用テストの追加

## ADR-001: 子コンポーネント `IngestionJobRow` をモックして polling 制御に集中する

### Status
Accepted

### Context

`IngestionQueue` テストの目的は polling 制御パス（可変間隔・visibilitychange・fatal 永久停止・failures カウンタ・inflight ガード・unmount cleanup）のリグレッション検出である。`IngestionQueue` は描画時に各ジョブを `IngestionJobRow` で展開するが、`IngestionJobRow` は `commit` / `discard` / `regenerate` / `ownerRetry` の server fn や router に依存し、描画も重い。実物のまま描画すると、本テストが子の都合（server fn モック追加・router モック・ボタン描画）で脆くなり、polling 検証の意図がぼやける。

### Decision

`vi.mock("../IngestionJobRow", ...)` で `job.id` を含む単純な要素を返す軽量スタブに差し替える。本テストは `fetchJobsMock`（`getIngestionJobsFn`）の呼び出し回数・引数・`pollErrorMessage` 表示のみで polling 制御を検証する。子の描画詳細は既存 `IngestionJobRow.test.tsx` が担保する。

### Consequences

- 良い点: テストが polling 制御だけに依存し、子の変更に対して頑健になる。モック構成も最小（server fn 1 本 + 子スタブ）で読みやすい。
- トレードオフ: 親子結合（親が子に正しい props を渡すか）はこのテストでは検証しない。ただしそれは Issue #278 のスコープ外であり、結合は型と既存の子テストでカバーされる。

---

## ADR-002: fatal 種別エラーは `AppServerError` を直接構築して注入する

### Status
Accepted

### Context

シナリオ 3（`unauthorized` で永久停止）と 4（`notFound` は failures 経由）を検証するには、`fetchJobs` が特定の `SerializedError.kind` を持つエラーで reject する必要がある。`IngestionQueue` は `extractSerializedError(e)` で kind を分類し、`unauthorized` / `forbidden` のみ fatal、それ以外は failures カウンタに回す。

### Decision

`new AppServerError({ kind, code, message, retryable })` を直接構築して `fetchJobsMock.mockRejectedValue(...)` に渡す。`extractSerializedError` は `error instanceof AppServerError` 経路で `error.serialized` をそのまま返す（`app/core/presentation/errorResponse.ts`）ため、テストは任意の kind を確実に再現できる。既存 `UploadForm.test.tsx` / `IngestionJobRow.test.tsx` も `AppServerError` 直接構築のパターンを採っており、踏襲する。

### Consequences

- 良い点: 実際の usecase / transport を経由せず、kind 分岐を決定論的に注入できる。既存テストと一貫したパターン。
- トレードオフ: 実 transport が本当にその kind を返すかはこのテストでは保証しない。それは application / integration 層の責務であり、本コンポーネントテストの関心事ではない。
