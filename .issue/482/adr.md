# ADR — Issue #482: export usecase の id 入力契約を string に統一する

## ADR-001: `runExportJob` の入力を `string` 化しても空 jobId 検証は worker に残す

### Status
Accepted

### Context

本 Issue で 4 つの export usecase の `jobId` 入力を `string` に統一する。`getExportJob`/`cancelExportJob`/`downloadExportArtifact` は presentation 起点で、現状ただのキャスト（検証なし）で domain ブランドを渡していたため、`string` 入力 + 内部 `as ExportJobIdBrand` への変更は挙動を変えない。

`runExportJob` は **worker 起点**（`app/core/application/workers/dispatchDomainEvent.ts`）で、outbox ペイロードの生 string から `ExportJobId.create(payload.exportJobId)` で **検証付きの domain ブランド**を構築して渡している。`dispatchDomainEvent.test.ts` の「空 `exportJobId` のとき runExportJob は呼ばれず、warn が 1 回ログされ、outcome は handled」というテストが、この **worker レベルでの検証契約**を pin している。

`runExportJob` の入力を `string` 化するにあたり、検証（`.create()`）を usecase 内部へ移すか、worker に残すかの選択があった。

### Decision

**検証は worker に残し、`runExportJob` は受け取った `string` を内部で `as ExportJobIdBrand` するだけにする。**

- `ExportJobId.create()` は引き続き worker（`dispatchDomainEvent.ts`）で実行され、検証済み domain ブランドを `runExportJob({ input: { jobId } })` に渡す。domain ブランドは構造的に `string` なので `string` 入力へ暗黙代入でき、worker・テストの変更は不要。
- `runExportJob` 本体冒頭で一度だけ `const jobId = input.jobId as ExportJobIdBrand` と橋渡しし、内部ヘルパー（`transitionPendingToProcessing`/`failJob`/`assembleAndComplete`）は domain ブランドで型付けしたまま使う。

### Consequences

- 良い点:
  - worker・既存テスト（空 jobId 検証含む）を一切変えずに済み、挙動変更ゼロを保証できる。
  - worker での `ExportJobId.create()` による境界検証が温存される（outbox ペイロードの正当性チェックは worker に集約されたまま）。
  - 4 usecase すべて入力 `jobId: string` で揃い、`retryExportJob` の確立パターンと完全に一致する。
- トレードオフ:
  - `runExportJob` の入力 `string` は「検証済みであること」を型では表現しない。ただし呼び出し元が worker のみで、そこで検証されることが `dispatchDomainEvent.test.ts` に pin されているため、実害はない。
