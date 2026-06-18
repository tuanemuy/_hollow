# ADR — Issue #747: processed_events の刈り込み経路を新設

## ADR-001: 刈り込み能力を `IdempotencyStore` ポートに置く

### Status
Proposed

### Context
`processed_events` を削除する能力をどこに置くか。選択肢:
1. 既存 `IdempotencyStore` ポートに `pruneProcessed` を追加する。
2. 新しい port（例: `ProcessedEventsPruner`）を新設する。
3. `OutboxRepository.pruneProcessed` に相乗りさせる（1メソッドで両テーブル削除）。

`processed_events` テーブルを所有しているのは `IdempotencyStore`（`hasProcessed` / `markProcessed` がこのテーブルを読み書きする唯一の経路）。`outbox_events` を所有する `OutboxRepository` には既に `pruneProcessed(olderThan)` があり、刈り込みは「テーブル所有ポートが自テーブルの GC 能力を持つ」という確立済みパターンがある。

### Decision
選択肢1を採用。`IdempotencyStore` に `pruneProcessed(olderThan: Date): Promise<{ deleted: number }>` を追加する。`OutboxRepository.pruneProcessed` と同一シグネチャにして対称性を保つ。

新ポート新設（選択肢2）は、テーブルごとに所有ポートが GC を持つ既存パターンを崩し、DI 配線（`WorkerContainer` への追加）も増えるため不採用。相乗り（選択肢3）は所有境界を跨ぐ（`OutboxRepository` が `processed_events` を触る）ため不採用。

### Consequences
- 良い点: 既存パターンと対称で学習コストが低い。`WorkerContainer` は既に `idempotencyStore` を保持しており DI 配線の追加が不要。
- トレードオフ: `IdempotencyStore` ポートの JSDoc が「atomic claim」中心の説明だったところに GC メソッドが加わる。JSDoc を補足して責務を明示する。

---

## ADR-002: retention を `outbox_events` と独立させる

### Status
Proposed

### Context
`processed_events` の保持期間を、既存の `OUTBOX_RETENTION_MS`（7日）と共有するか、独立した定数・env var にするか。

両者は意味が異なる:
- `outbox_events` の retention は「dispatch 済み outbox 行をどれだけ保持するか」（監査・再送調査向けの猶予）。
- `processed_events` の retention は「再配信され得るメッセージの dedup 記録をどれだけ保持するか」（冪等化の正しさに直結）。

将来、Queue のリトライ設定や監査要件が変われば片方だけ調整したくなる可能性がある。

### Decision
独立させる。`DEFAULT_PROCESSED_EVENTS_RETENTION_MS`（**14日** = CF Queues メッセージ最大保持期間）と env var `PROCESSED_EVENTS_RETENTION_MS` を新設し、`PruneTuning` に `processedEventsRetentionMs` を加える。`outbox_events`（7日, 監査猶予）と `processed_events`（14日, 冪等化の正しさ＝再配信窓の上限）は意味も既定値も異なり、独立させることで初めて正しく表現できる。

### Consequences
- 良い点: 冪等化用と監査用の retention を独立にチューニングできる。意味の異なる2つの値が同一 env var に縛られない。JSDoc で「再配信され得ない古い行のみを刈る」根拠を `processed_events` 固有に書ける。
- トレードオフ: env var が1つ増える（`wrangler.toml` / docs / `ServerEnv` 型に追記が必要）。既定値が同じなので一見冗長に見えるが、意味の分離を優先する。

---
