# ADR — Issue #254: failed ジョブを所有者が再試行できるようにする

## ADR-001: owner retry は admin retry とは別 usecase として新設する

### Status
Proposed

### Context
owner 向け retry を実現する手段は 2 案あった:

1. 既存 `retryIngestionJob`（admin 専用、`assertAdmin`）に「actor が admin か owner か」の分岐を追加する
2. owner 認可の別 usecase（`ownerRetryIngestionJob`）を新設する

admin retry は P46 admin dashboard 用途で全 job を retry できる権限、owner retry は自分の job のみ。認可セマンティクスが根本的に異なる。

### Decision
**owner 認可の別 usecase `ownerRetryIngestionJob` を新設する。** 既存 owner usecase（`regenerateIngestionPreview` / `discardIngestionPreview` / `getIngestionJob`）が `found.entity.ownerId !== actor` → `ForbiddenError("INGESTION_JOB_FORBIDDEN")` の個別 usecase 認可を確立しており、それに揃える。ドメインの状態遷移 `IngestionJob.retry`（認可非依存）は両 usecase が共有する。admin retry はそのまま温存。

### Consequences
- 良い点: 「どの権限で通ったか」が usecase 単位で明確。admin retry に手を入れずリグレッションリスクが小さい。既存 owner usecase 群と一貫。
- トレードオフ: retry usecase が 2 つになる（admin / owner）。ただしドメインメソッドは共有なので重複は認可・取得部分のみ。

---

## ADR-002: retry 専用の回数制限フィールドは新設しない（manual-action 前提・再アップロードで自明に迂回可能なため）

### Status
Proposed

### Context
Issue は「リトライ回数制限の検討」を挙げている。failed → retry → 再 failed のループで LLM が過剰に呼ばれるのを防ぐ必要があるか検討した。

検討にあたり既存の抑制機構を実装で検証した結果、当初想定していた「自然な終端」は**存在しないことが判明した**:

- `IngestionJob.markFailed`（`entity.ts`）は `tempStorageKey` を**保持したまま** failed へ遷移する。failed ジョブの temp key を回収するのは `commitIngestionPreview`（消費）と `discardIngestionPreview`（解放）のみで、stale な failed ジョブの temp key を回収する pruner 等の機構は**存在しない**（pruner は outbox 専用）。したがって `NoTempStorageForRetry` による終端は、ユーザーが discard しない限り効かない。
- `IngestionJob.retry` は `regenerationCount` を**保持するが参照も加算もしない**。`regenerationCount` は `regenerate` でのみ加算される。`previewing` に一度も到達せず即 failed したジョブは `regenerationCount === 0` のままなので、regeneration キャップ（`MAX_REGENERATIONS = 5`）は owner retry ループを**抑制しない**。

つまり owner retry には現状**事実上の回数上限が存在しない**。

### Decision
**それでも retry 専用カウンタは新設せず、上限なしを許容する。** 根拠:

1. owner retry は**手動・所有者起点のアクション**（ボタンクリック）であり、自動再駆動ではない。runaway な無限ループは構造上起きず、回数は人間の操作で律速される。
2. **per-job の retry 上限は同一ファイルの再アップロードで自明に迂回できる**（新規ジョブが作られ LLM が同じように走る）。よって retry 上限はコスト保護として実効性がなく、複雑さに見合わない。
3. LLM 利用のコスト制御は per-job retry カウンタではなく、インスタンス単位の利用上限（`spec/scenario/ingest.md` B2 異常系の「同一日のアップロード上限」）という直交した仕組みで扱うべき関心事。
4. retry カウンタの新設はドメインへのフィールド追加・マイグレーション・spec 改訂を伴い、実効性のない保護のためにスコープを膨らませる。

### Consequences
- 良い点: ドメイン・スキーマを触らずスコープを UI + application + spec に収められる。
- トレードオフ: owner が perpetually-failing なジョブで「再試行」を連打すると、その回数だけ LLM が呼ばれる（ただし手動操作で律速）。spec の不変条件に「owner retry には per-job 上限が無く、コスト制御はインスタンス単位の利用上限に委ねる」方針を明記して、暗黙の事実誤認を残さない。

---

## ADR-003: 再 enqueue 経路は既存の retryRequested → runIngestionJob をそのまま使う

### Status
Proposed

### Context
Issue は「再 enqueue 経路（#253 の dispatchDomainEvent ルーティング問題と同根の可能性）」を懸念点に挙げていた。

### Decision
**dispatch / runIngestionJob を一切変更しない。** 調査の結果、#253 は解決済みで `dispatchDomainEvent` は `ingestion.created` / `ingestion.retryRequested` / `ingestion.regenerated` をすべて `runIngestionJob` にルーティング済み。retry の `failed → pending` 遷移は regenerate と同じく `runIngestionJob` の `isPending` ガードを通過し再駆動される。

### Consequences
- 良い点: 本 Issue の再 enqueue 対応はゼロ。owner retry usecase がイベントを発火するだけで既存パイプラインが処理する。
- トレードオフ: なし（既存経路に乗るだけ）。
