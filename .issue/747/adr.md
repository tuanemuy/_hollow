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

## ADR-003: `processed_events.processed_at` に専用 index を張らない

### Status
Proposed

### Context
レビュー（adapter 視点）で、刈り込み DELETE が `WHERE processed_at < cutoff` で走るのに `processed_events` には PK（`id`）しか index がなく、毎日の刈り込みがテーブル full scan になる点が指摘された。`processed_events` は高頻度イベント全件を積むため、テーブルが肥大すると初回・日次の scan コストが `outbox_events` より大きくなりうる。選択肢:
1. `processed_at` に index を張り、刈り込み DELETE を `O(削除件数)` にする。
2. index を張らず full scan を許容する（手本の `outboxRepository.pruneProcessed` と同方式）。

### Decision
選択肢2を採用。本PRでは `processed_at` に index を張らない。理由:
- **手本との一貫性**: 既存の outbox prune（`processedAt < cutoff AND processed_at NOT NULL`）も prune 専用 index を持たず full scan で運用実績がある。`processed_events` だけ別方式にするより、確立されたパターンに揃える。
- **スコープ**: index 追加はマイグレーション（`spec/database/` 連動）を要し、plan.md で「スキーマ変更・マイグレーションなし」と宣言したスコープを超える。
- **書き込みパスへの影響**: `markProcessed` の INSERT は最もホットな経路。index を増やすと全 INSERT がその維持コストを負う。刈り込みは日次1回なので、日次 scan を避けるためにホットパスを重くする取引は割に合わない（`processed_at` は単調増加で append-mostly なため維持コスト自体は小さいが、日次 cron は scan を許容できる）。

### Consequences
- 良い点: スコープが締まり、手本パターンと一貫。ホットな INSERT 経路に追加コストを乗せない。
- トレードオフ: テーブルが非常に大きくなった場合、日次刈り込みの scan コストが増える。実運用で問題化したら `processed_at` への index 追加 + バッチ分割を別Issueで検討する（outbox prune も同じ改善余地を持つため、両者まとめて対応するのが筋）。本PR時点では投機的最適化を避ける。

---
