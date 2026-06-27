# ADR — Issue #783: prune terminal-state job rows (export_jobs / tag_merge_jobs)

## ADR-001: prune を専用アプリケーション層ポートで表現する（既存ドメイン集約リポジトリに足さない）

### Status
Proposed

### Context
`export_jobs` / `tag_merge_jobs` には既にドメイン集約リポジトリ（`ExportJobRepository` / `TagMergeJobRepository`）が存在する。保持期間 prune の永続化をどこに置くかで2案:

- 案A: 既存ドメイン集約リポジトリに `pruneTerminal(cutoff)` を追加し、`WorkerContainer` にこれらリポジトリを載せる。
- 案B: prune 専用の細いアプリケーション層ポート（`JobStatePruner`）を新設し、`WorkerContainer` に載せる。

制約・前提:
- prune は非トランザクショナルな bulk DELETE であり、集約のロードや OCC バージョン照合を行わない。
- 既存集約リポジトリのコンストラクタは `(db, pending: PendingBatch, idGenerator)`。write 系（insert/save/delete）は UoW の `PendingBatch` 経由 + OCC。`WorkerContainer` は UoW も `PendingBatch` も持たない（pruner は集約をミューテートしない）。
- 既存の prune 群（outbox / processed-events / activity-log / llm-call-log）はすべて**アプリケーション層の細い専用ポート**を `WorkerContainer` 上に直接置き、D1 アダプタは `(db)` のみ依存。

### Decision
案B を採用。`app/core/application/ports/jobStatePruner.ts` に `JobStatePruner` ポートを新設し、`D1JobStatePruner`（`(db)` のみ）で実装、`WorkerContainer` に載せる。

理由:
- 案A は worker で使うために throwaway な `PendingBatch` を集約リポジトリへ渡す必要が生じ、UoW を持たない `WorkerContainer` の前提と矛盾する。
- 非トランザクショナルな一括削除を OCC 集約リポジトリに混在させると、集約リポジトリの責務（集約単位のロード／バージョン整合書き込み）が曖昧になる。
- 案B は既存 prune ポート群（`OutboxRepository.pruneProcessed`, `ActivityLogRepository.pruneOlderThan`, `LlmCallLogRecorder.pruneOlderThan`）と完全に同じ設計で、worker prune の確立パターンに一致する。

### Consequences
- 良い点: ドメイン集約リポジトリを純粋に保つ。worker prune パターンと一貫。アダプタ依存が `(db)` のみで軽量・テスト容易。
- トレードオフ: 同一テーブルに対し「集約リポジトリ（request/consumer 経路）」と「prune ポート（worker 経路）」の2ポートが並存する。ただし責務（トランザクショナル集約操作 vs メンテナンス sweep）は明確に分離され、activity-log でも read/write/prune がポート構成上分離している前例に沿う。

---

## ADR-002: テーブル横断の1ポート2メソッド構成にする

### Status
Proposed

### Context
prune ポートを「テーブルごとに2ポート（`ExportJobPruner` / `TagMergeJobPruner`）」にするか、「1ポート2メソッド（`JobStatePruner`）」にするか。`export` と `tag` は別のドメイン文脈であり、ポートをドメイン文脈ごとに分けるべきとの見方もある。

### Decision
1ポート2メソッド（`pruneTerminalExportJobs` / `pruneTerminalTagMergeJobs`）を採用。

理由:
- Issue 自身が「job-state テーブルの共通課題」として2テーブルを1 Issue に束ねている。
- `ActivityLogRepository` が `pruneOlderThan`（activity_log）+ `pruneBurstOlderThan`（ingestion_burst_log）の2テーブル prune を1ポートで持つ前例がある。
- DI フィールド・コンテナ stub・配線が1つで済み、worker 横断メンテナンス用途として凝集する。
- prune はドメインロジックを含まない worker 層の機械的 sweep なので、ドメイン文脈ごとの分割よりも「job-state 行のメンテナンス」という worker 関心での凝集が自然。

### Consequences
- 良い点: DI / コンテナ / テストの面数が少ない。`ActivityLogRepository` 前例と一貫。
- トレードオフ: 2つの異なるドメイン文脈のテーブルが1ポートに同居する。ただしポートはドメイン層ではなくアプリケーション（worker）層に属し、各メソッドは独立した DELETE で結合がない。将来テーブルが増えた場合はメソッド追加で対応（ポート肥大が問題化したら再分割を検討）。

---

## ADR-003: export_jobs の `completed` 行は prune 対象から除外する

### Status
Proposed

### Context
Issue Proposal は export の prune 対象を「`completed`/`failed`/`cancelled`/`expired`」と列挙する一方、acceptance criteria は「artifact ライフサイクルが解決済みの行のみ prune し、未削除の artifact を orphan 化してはならない」と制約する。

ドメイン不変条件（`export/entity.ts`）:
- `completed`: `artifactKey: string`（**ライブな R2 オブジェクトを保持**）、必ず `expiresAt` を持つ。
- `expired`: `artifactKey: string`（`purgeExpiredExports` が R2 オブジェクトの削除を**試みた**後の状態。ただし下記のとおり削除成功は保証されない）。
- `failed` / `cancelled`: `artifactKey: null`（artifact なし）。

`completed` 行を `updated_at` の年齢だけで prune すると、`expiresAt` 未到来でライブ artifact を持つ行を削除し、artifact を orphan 化する。`purgeExpiredExports` は `status=completed AND expiresAt<now` の行を `expire`（`completed`→`expired` 遷移 + R2 削除）する。

**purge の配線状況（Round 1 coverage [P-001] 訂正）:** 当初の本 ADR は「completed→purge→expired→prune の連鎖が回るので恒久蓄積は起きない」と断定していたが、実コード確認の結果 `purgeExpiredExports` は**定義のみでどの cron/worker/route からも呼ばれておらず、completed→expired 遷移が運用上一度も走らない**ことが判明した。よって本 Issue #783 では `purgeExpiredExports` を `runPruneTick` に配線する（ADR-005）。本 ADR の「completed 除外で恒久蓄積を防ぐ」前提は、この配線を含めて初めて成立する。

**「expired ⇒ 削除済み」前提の穴（Round 1 arch [P-001] 訂正）:** `purgeExpiredExports` は `completed→expired` の DB 遷移を**先にコミット**し、その**後**に `objectStorage.delete(artifactKey)` を best-effort（`try/catch` で warn 握りつぶし・再試行なし）で実行する。R2 削除が失敗しても行は `expired` のまま確定する。さらに `findExpired` は `status=completed` の行しか拾わないため、一度 `expired` になった行の R2 削除は**二度と再試行されない**。したがって「`expired` ⇒ artifact 削除済み」は厳密には成立せず、R2 削除に失敗した `expired` 行が存在しうる。

### Decision
export prune の対象集合を `{failed, cancelled, expired}` に限定し、`completed` を除外する。`completed` 行の最終削除は「`purgeExpiredExports`（completed→expired, artifact 削除を試行）→ 本 prune（expired を `updated_at` 経過で削除）」の連鎖に委ねる。この連鎖の第一リンク（purge による expired 化）は ADR-005 で `runPruneTick` に配線することで実際に回す。

`completed` は必ず `expiresAt` を持ち（不変条件）、`findExpired` は `expiresAt<now` の completed を拾うため、purge が配線された健全な運用下では全 completed 行が最終的に `expired` 経由で prune される。

`expired` を prune 対象に**残す**判断は維持する。恒久蓄積防止という Issue 目的の達成には `expired` 行の削除が必要であり、上記「R2 削除失敗の expired 行を prune すると artifact が orphan 化しうる」リスクは **purge の堅牢性（R2 削除の信頼性）の問題**であって終端行 GC の責務外だからである。purge の削除順序入れ替え・再試行導入は本 Issue スコープ外とする。

### Consequences
- 良い点: ライブ artifact（`completed`）の orphan 化を構造的に排除（acceptance criteria を厳密に満たす）。2つの sweep の責務分離が明確（artifact ライフサイクル=purge、行 GC=prune）。
- トレードオフ: `completed` 行は「expiry 到来 → 次の purge tick で expired 化 → さらに retention 経過 → prune」と二段の遅延を経て削除される。即時性は犠牲だが、本 Issue は恒久蓄積の防止が目的でありレイテンシ要件はない。tag_merge には artifact がないため `completed` をそのまま対象に含める（除外は export 固有）。
- 残存リスク（事実記述）: R2 削除に失敗した `expired` 行を本 prune が削除すると、その artifact は確定的に orphan 化し、行が消えることで orphan を辿る手段も失われる。これは purge の best-effort 削除の弱点に起因し、対象から `expired` を外すと恒久蓄積防止が達成できないためトレードオフとして受容する。purge 側の堅牢化は別 Issue 候補。

---

## ADR-004: retention デフォルトは7日、テーブルごとに独立した env var

### Status
Proposed

### Context
保持期間ウィンドウのデフォルト値と、env var を export/tag_merge で共有するか分けるかを決める。acceptance criteria は「ポーリング完了ウィンドウより十分長く、分単位でなく日単位」を要求。既存パターンは関心ごとに1 env var + `DEFAULT_*_RETENTION_MS`（outbox=7日, processed-events=14日）。

### Decision
- デフォルト: 両テーブルとも `7 * 24 * 60 * 60 * 1000`（7日）。
- env var: テーブルごとに独立（`EXPORT_JOBS_RETENTION_MS` / `TAG_MERGE_JOBS_RETENTION_MS`）+ それぞれの `DEFAULT_*_RETENTION_MS` 定数。

理由:
- ポーリング完了ウィンドウ（`ExportJobDetail` 3000ms 間隔、`MergeTagDialog` も同程度）に対し7日は桁違いに長く、終端状態の読み取りを確実に許容する（AC-5）。
- 既存の「関心ごとに独立した env var」規約に沿う。export `completed` 行は purge(expiry)という二次ライフサイクルを持ち、tag_merge は持たないため、両者は本質的に異なる下限を持ちうる。独立した knob により operator が個別調整できる。
- outbox の audit grace と同じ7日を採るのは、終端 job 行も「完了後しばらくは運用調査のために残す」という同種の猶予だからで、idempotency-correctness bound（processed-events=14日）のような厳密な下限要件はない。

### Consequences
- 良い点: 既存 env 規約と一貫。テーブルごとに独立調整可能。デフォルトがポーリング窓を大きく上回り安全。
- トレードオフ: env var が2つ増える（operator が把握すべき knob が増える）。共有1 var 案より柔軟だが設定面はやや冗長。`wrangler.toml [env.pruner.vars]` にコメント付きで明示し把握コストを抑える。

---

## ADR-005: `purgeExpiredExports` を pruner tick に配線する（コンテナ太らせ vs 別ビルダー）

### Status
Proposed

### Context
Round 1 coverage [P-001] で、`purgeExpiredExports` が定義のみでどの cron/worker/route からも呼ばれていない（completed→expired 遷移が運用上一度も走らない）ことが判明した。ADR-003 で export `completed` を prune 対象から除外する以上、purge が配線されない限り completed export 行が無限蓄積し Issue ゴール「stop growing without bound」を満たせない。ユーザー決定により、purge の配線を本 Issue #783 のスコープに含める。

配線先は日次 pruner tick（`app/worker/cloudflare/handlers.ts` の `runPruneTick`）。ここで問題になるのが purge が要求するコンテナ型である。

実コード確認:
- `purgeExpiredExports({ container, input }: ServiceArgs<...>)` の `ServiceArgs.container` は `app/core/application/types.ts` で **`RequestContainer`** と型付けされる。purge 本体が実際に使うのは `unitOfWorkProvider` / `objectStorage` / `clock` / `logger` の4つだが、引数の静的型は `RequestContainer` 全体。
- `runPruneTick` は現状 `createWorkerContainer(env)`（= `WorkerContainer`）を使う。`WorkerContainer` は意図的に `unitOfWorkProvider` も `objectStorage` も持たない（`di/types.ts:298-302`、ADR-001 の前提）。
- `RequestContainer` を構築する `createRequestContainer(readRequestServerConfig(env))` が既存し、UoW（`D1UnitOfWorkProvider`）と objectStorage（presign 4点が揃えば `R2ObjectStorage`、欠落時は unavailable フォールバック）を組み立てる。`createConsumerContainer` は内部で request+worker の両コンテナを構築する前例。

検討した案:
- **案X:** `WorkerContainer` に `unitOfWorkProvider` + `objectStorage` を追加し、`createWorkerContainer` で構築する。
- **案Y:** `WorkerContainer` は太らせず、purge には `createRequestContainer(readRequestServerConfig(env))` で `RequestContainer` を別途構築して渡す（既存ビルダー再利用）。

### Decision
案Y を採用する。`runPruneTick` 内で purge 用に `const purgeContainer = createRequestContainer(readRequestServerConfig(env))` を構築し、`purgeExpiredExports({ container: purgeContainer, input: {} })` を best-effort `try/catch` で、export-jobs prune の**前段**に呼ぶ。既存 prune sweep は従来どおり `createWorkerContainer(env)` の `WorkerContainer` を使う。

決定的な理由:
- purge の引数型は `RequestContainer` であり、案X で `WorkerContainer` に2フィールド足しても `RequestContainer`（`config`/`htmlSanitizer`/各 export renderer 等を含む広い面）には**代入できず型エラー**になる。案X を成立させるには purge の引数型を構造的部分型へ狭める必要があり、それは共有 `ServiceArgs` 型と purge の変更（スコープ外）を伴う。
- 案Y は既存ビルダー（`createRequestContainer` / `readRequestServerConfig`）の再利用のみで、新規構築コードも型変更もゼロ。`createConsumerContainer` が同じ「request コンテナを worker 経路で構築する」前例に倣う。
- `WorkerContainer` 型を太らせないため、同型を使う relay / dlq / indexer / `ConsumerContainer`（`Pick<WorkerContainer, ...>`）への波及がない。

### Consequences
- 良い点: 型安全（`RequestContainer` をそのまま渡す）。purge ロジック無変更。`WorkerContainer` を共有する他 worker への波及ゼロ。テストヘルパー（`WorkerContainer` リテラル構築）は `jobStatePruner` 追加のみで、purge 用フィールドの stub は不要。
- トレードオフ:
  - pruner tick が `RequestContainer` を1つ追加構築する（LLM/OCR/PDF 等の adapter も構築されるが、コンストラクタは文字列を stash するだけで安価 — `serverCloudflare.ts:878-886` のコメント参照）。日次 tick の per-tick コストとして許容。
  - purge が R2 artifact を実削除するには pruner env に R2 binding が必要。`wrangler.toml [env.pruner]` に `OBJECT_STORAGE` r2_bucket + `R2_OBJECT_BUCKET_NAME` var を追加し、presign 3 secret（`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`）は SOPS で deploy 時注入する。これらが揃わないと `createRequestContainer` は objectStorage を unavailable フォールバックにし、purge の `objectStorage.delete` が `StorageUnavailableError` を throw → purge の per-row `catch` で warn 握りつぶし → tick はクラッシュしないが prod では artifact が削除されず orphan が残る。よって prod では binding 追加が必須。
  - purge を export-jobs prune の前段に置くが、同一 tick で新規 expired 化された行は `updated_at = now`（≥ retention cutoff）なので、その tick では prune されず次回以降の tick で削除される（即時削除ではない）。
- 案X を採らない代償: 仮に将来 worker 経路で UoW/objectStorage を要する処理が増えるなら `WorkerContainer` 拡張も再検討余地があるが、現時点では purge 単独のために型を太らせ他 worker へ波及させるのは過剰。

---

## ADR-006: `jobStatePruner` を `ConsumerContainer` の `Pick` に含める（実装時の事実訂正）

### Status
Accepted（実装時に追加）

### Context
plan / ADR-005 は「`jobStatePruner` は `ConsumerContainer`（`Pick<WorkerContainer, ...>`）の pick 外なので consumer への波及はない」と判断していた。しかし実装後の `pnpm typecheck` でこれが誤りであると判明した。

`dispatchDomainEvent`（`app/core/application/workers/dispatchDomainEvent.ts`）は `container: ConsumerContainer` を受け取り、その `container` を queue dispatch handler 群（`searchHandleNoteTrashedEvent` / `handleNoteSavedEvent` / `handlePublicationChangedEvent` 等）へそのまま渡す。これらの handler の引数 `container` は **`WorkerContainer` 型**（`searchIndex` / `indexJobRepository` を使うため）。したがって `ConsumerContainer` は **`WorkerContainer` に代入可能でなければならない**。

`WorkerContainer` の既存フィールドはいずれも `RequestContainer` 側にも存在する（`searchIndex` / `activityLogRepository` / `llmCallLogRecorder`）か、`ConsumerContainer` の `Pick` に含まれる（`outboxRepository` / `idempotencyStore` / `indexJobRepository`）ため、これまで `ConsumerContainer ⊇ WorkerContainer` が成立していた。今回追加した `jobStatePruner` は **worker 専用ポートで `RequestContainer` に無く**、`Pick` にも入っていないため、この包含関係が崩れて型エラーになった。

### Decision
`ConsumerContainer` の `Pick<WorkerContainer, ...>` に `"jobStatePruner"` を追加し、`createConsumerContainer` で `jobStatePruner: workerContainer.jobStatePruner` を供給する。これは `outboxRepository` / `idempotencyStore` / `indexJobRepository` という他の worker 専用ポートが consumer に forward されているのと同じ機構であり、`ConsumerContainer ⊇ WorkerContainer` の不変条件を復元する。

consumer 自身は prune を行わないため `jobStatePruner` は consumer では未使用だが、dispatch handler が `WorkerContainer` を要求する以上、型の包含を保つために載せる。`D1JobStatePruner` のコンストラクタは `db` を stash するだけで安価。

### Consequences
- 良い点: 型安全（`ConsumerContainer` が `WorkerContainer` に代入可能なまま）。dispatch handler 群の引数型を狭める大規模リファクタを回避。既存の worker 専用ポート forward と一貫。
- トレードオフ: consumer container に未使用ポートが1つ増える（既存の `outboxRepository` 等と同種の軽微な bloat）。
- plan / ADR-005 の「pick 外なので波及なし」という記述は事実誤認だったため本 ADR で訂正する。

---
