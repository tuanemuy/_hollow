# 実装計画 — Issue #747: chore(worker): processed_events の刈り込み経路を新設（無制限増大の歯止め）

**Issue:** #747
**作成日:** 2026-06-18
**複雑度:** 中〜大規模

---

## 目的

consumer の冪等化（`hasProcessed` → `markProcessed`）に使う `processed_events` テーブルは各イベントごとに1行ずつ無制限に積まれ続ける。再配信の可能性が事実上消えた古い行だけを安全に削除する刈り込み経路を、既存 pruner の daily tick に追加して無制限増大を止める。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `processed_events` の保持方針（retention）が定数として定義され、env var で上書きできる。既定値は Cloudflare Queues のメッセージ最大保持期間（14日）以上 | Issue「保持方針を定義する」 | 1, 4 |
| AC-2 | pruner の daily tick が `processed_events` の cutoff より古い行を削除する | Issue「専用の刈り込み経路を pruner の daily tick に足す」 | 2, 3, 5 |
| AC-3 | cutoff = `now - retentionMs` が、メッセージがキューに滞留し再配信され得る最大期間（= Queue `message_retention_period`、CF 既定4日・上限14日）以上。再配信され得る新しい行（cutoff 以降）は削除しない | Issue「冪等化の正しさを壊さないこと」 | 1, 2, 5 |
| AC-4 | `runPruneTick` の戻り値は rename されるが `outbox_events` 刈り込みの**挙動は不変**（既存 outbox テストが回帰しない）。`outbox` と `processed_events` の両方が同一 tick で実行される | Issue「同様のパターン」/ 既存 pruner 非回帰 | 3 |
| AC-5 | 削除件数が構造化ログに残る | 既存 `pruneOutbox` のログ規約に整合 | 2 |

## スコープ

### 含まれないもの

- **`outbox_events` 刈り込みロジックの変更** — 既存 `pruneOutbox` / `outboxRepository.pruneProcessed` はそのまま。本Issueは `processed_events` 用経路の追加のみ。
- **quarantine / DLQ 行の扱い** — `processed_events` には quarantine 概念がない（成功 dispatch 後にのみ書かれる）ため、`outbox_events` の `failed_at` のような除外条件は不要。
- **新規 worker / cron trigger の追加** — 既存 pruner Worker（`app/worker/cloudflare/pruner.ts`）の daily tick に相乗りする。新しい cron は足さない。
- **`outbox_events` / `activity_log` / `ingestion_burst_log` 等の他テーブル刈り込み** — Issue 本文は派生元 #595/PR #746 を「activity_log / ingestion_burst_log 刈り込み追加時に発見」と記すが、現リポジトリにそれらの刈り込みは存在しない（#595/#746 は実際にはダッシュボード機能として出荷され当該刈り込みは descope 済み）。本Issueは `processed_events` 用経路の追加に閉じ、他テーブルは扱わない。`.issue/595/` ディレクトリも現存しないため本計画は自己完結とする。
- **スキーマ変更・マイグレーション** — `processed_events.processed_at` は既存。削除に必要な列は揃っているので DDL 変更なし。

## 調査結果

- 関連ファイル:
  - `app/core/application/ports/idempotencyStore.ts` — `IdempotencyStore` ポート（`hasProcessed` / `markProcessed`）。`processed_events` を所有する論理的オーナー。
  - `app/core/adapters/d1/repositories/idempotencyStore.ts` — `D1IdempotencyStore` 実装。`mapDbError` 経由で drizzle 操作。
  - `app/core/adapters/d1/schema.ts` — `processedEvents` テーブル（`id` PK, `processed_at` timestamp_ms notnull）。
  - `app/core/application/workers/outboxPrune.ts` — 既存の刈り込み worker。`DEFAULT_OUTBOX_RETENTION_MS = 7日`、`pruneOutbox(container, { retentionMs })` パターンの手本。
  - `app/core/adapters/d1/repositories/outboxRepository.ts:213` — `pruneProcessed(olderThan)` の DELETE パターン（`mapDbError` + `.returning()` で件数取得）の手本。
  - `app/core/application/di/env.ts` — `pruneTuningSchema` / `readPruneTuning`。env var パース境界。
  - `app/core/application/di/serverCloudflare.ts` — `ServerEnv` 型と `readPruneTuning` re-export。
  - `app/worker/cloudflare/handlers.ts:runPruneTick` — pruner Worker のエントリ。現在 `pruneOutbox` のみ呼ぶ。
  - `app/worker/cloudflare/pruner.ts` — cron `scheduled` → `runPruneTick`。結果は捨てている（`ctx.waitUntil`）。
  - `wrangler.toml` `[env.pruner.vars]` — `OUTBOX_RETENTION_MS = "604800000"`（7日）。
  - `docs/runtime_cloudflare.md` — pruner の役割・tuning 変数の記述。
- あるべきアーキテクチャ: ヘキサゴナル + DDD。依存は内向き（presentation → application → domain、adapter は port を実装）。クロスカッティングな worker 関心はポート越しに。`processed_events` の所有者は `IdempotencyStore` ポートなので、刈り込み能力もそのポートに足すのが筋（`OutboxRepository.pruneProcessed` と対称）。
- 既存実装の状態: `outbox_events` の刈り込みは確立済みで「あるべき姿」と一致。`processed_events` には刈り込み経路が**欠落**しており、本Issueでそれを `outbox_events` と同じパターンで補う（理想形に寄せる作業ではなく、欠けたパターンの追加）。
- 依存関係: `runPruneTick` の戻り値型を変更するため、`handlers.integration.test.ts` の pruner テストが影響を受ける。`pruner.ts` エントリは戻り値を使わないので無影響。`WorkerContainer` は既に `idempotencyStore` を保持しているため DI 配線の追加は不要。

## 設計

### ドメインモデルへの影響

なし。`processed_events` は冪等化のためのインフラ的記録であってドメイン概念ではない。刈り込みは時間ベースの GC であり、ドメイン不変条件を持たない。

### ユースケース / アプリケーションロジック

- **ポート拡張**: `IdempotencyStore` に `pruneProcessed(olderThan: Date): Promise<{ deleted: number }>` を追加する。`OutboxRepository.pruneProcessed` と同じシグネチャで対称性を保つ。
- **worker 追加**: `app/core/application/workers/pruneProcessedEvents.ts` を新設。`outboxPrune.ts` を手本に、
  - `DEFAULT_PROCESSED_EVENTS_RETENTION_MS` 定数（**14日 = `14 * 24 * 60 * 60 * 1000` = 1209600000ms**）を export。14日は Cloudflare Queues のメッセージ最大保持期間に一致し、`message_retention_period` をどう設定しても再配信窓を無条件で上回る（現行 wrangler は未設定 = CF 既定4日。14日に倒すことで設定変更にも耐える保守側の既定）。
  - `pruneProcessedEvents(container, { retentionMs })` が `cutoff = clock.now() - retentionMs` を一度だけ計算し、`idempotencyStore.pruneProcessed(cutoff)` を呼んで件数を構造化ログに出す。
- ドメインロジックの漏出なし — worker は薄いオーケストレータ（cutoff 計算 + ログ）に徹する。

### アダプター / 永続化 / 外部連携

- **`D1IdempotencyStore.pruneProcessed`**: `DELETE FROM processed_events WHERE processed_at < olderThan` を drizzle で（`lt(processedEvents.processedAt, olderThan)`）、`mapDbError` でラップし `.returning({ id })` の長さで件数を返す。`outboxRepository.pruneProcessed` と同型。`processed_events` には quarantine 列がないので `isNotNull` 条件は不要。
- スキーマ変更・マイグレーションなし。

### tuning / 設定

- **`env.ts`**: `TuningEnv` に `PROCESSED_EVENTS_RETENTION_MS?: string` を追加。`pruneTuningSchema` に `processedEventsRetentionMs`（既定 `DEFAULT_PROCESSED_EVENTS_RETENTION_MS`）を追加。`readPruneTuning` で `env.PROCESSED_EVENTS_RETENTION_MS` を渡す。
- **`serverCloudflare.ts`**: `ServerEnv` の tuning knobs に `PROCESSED_EVENTS_RETENTION_MS?: string` を追加。
- **`wrangler.toml`** `[env.pruner.vars]`: `PROCESSED_EVENTS_RETENTION_MS = "1209600000"`（14日）を追加しコメントで根拠（CF Queues 最大保持期間 = 再配信窓の上限）を記す。

### worker エントリの配線

- **`handlers.ts:runPruneTick`**: `pruneOutbox` に加え `pruneProcessedEvents` を同一 tick で実行。戻り値を `{ outboxDeleted: number; processedEventsDeleted: number }` に変更し、両者の件数を明示的に返す（現状 `{ deleted }`）。`pruner.ts` は戻り値未使用のため無影響。

### UI / プレゼンテーション

なし。バックエンド/worker のみ。

## 実装ステップ

依存方向の順（内側のレイヤーが先）に並べる。

### 1. retention 定数 + worker（application 層）

- **対象ファイル:** `app/core/application/workers/pruneProcessedEvents.ts`（新規）
- **変更内容:** `DEFAULT_PROCESSED_EVENTS_RETENTION_MS`（14日 = 1209600000ms）と `pruneProcessedEvents(container, { retentionMs })` を実装。`outboxPrune.ts` を手本に、cutoff 計算・`idempotencyStore.pruneProcessed(cutoff)` 呼び出し・構造化 info ログ。JSDoc に「`markProcessed` は成功 dispatch 後にのみ書かれるため quarantine 概念はなく、dedup 行が必要な最長窓は Queue `message_retention_period`（CF 上限14日）。既定14日はその上限に一致し、再配信窓を無条件で上回るため安全に GC できる」旨を記す。
- **理由:** AC-1, AC-2, AC-3, AC-5。刈り込みオーケストレーションの中核。

### 2. ポート拡張（domain/application ポート）

- **対象ファイル:** `app/core/application/ports/idempotencyStore.ts`
- **変更内容:** `IdempotencyStore` に `pruneProcessed(olderThan: Date): Promise<{ deleted: number }>` を追加。JSDoc で「`olderThan` より古い processed 記録を削除。冪等化の正しさを壊さないため再配信され得ない古い行のみを刈る前提」を明記。
- **理由:** AC-2。`processed_events` の所有ポートに刈り込み能力を持たせる（`OutboxRepository` と対称）。

### 3. worker エントリ配線（presentation/worker）

- **対象ファイル:** `app/worker/cloudflare/handlers.ts`
- **変更内容:** `runPruneTick` で `pruneOutbox` と `pruneProcessedEvents` を実行し、戻り値を `{ outboxDeleted, processedEventsDeleted }` に変更。`readPruneTuning(env)` から両 retention を取得。**着手前に `grep -rn "runPruneTick" app/` で呼び出し元を確定**し、戻り値型変更の波及先が `pruner.ts`（戻り値未使用）と `handlers.integration.test.ts` のみであることを確認する。
- **理由:** AC-2, AC-4。daily tick に相乗りさせる。

### 4. tuning 配線（application DI）

- **対象ファイル:** `app/core/application/di/env.ts`, `app/core/application/di/serverCloudflare.ts`
- **変更内容:** `TuningEnv` / `ServerEnv` に `PROCESSED_EVENTS_RETENTION_MS` を追加。`pruneTuningSchema` に `processedEventsRetentionMs` フィールドを追加し `readPruneTuning` で読む。
- **理由:** AC-1, AC-3。env var で上書き可能にする。

### 5. アダプター実装（adapter）

- **対象ファイル:** `app/core/adapters/d1/repositories/idempotencyStore.ts`
- **変更内容:** `D1IdempotencyStore.pruneProcessed` を実装。`mapDbError("Failed to prune processed events", …)` で `DELETE … WHERE processed_at < olderThan` を `.returning({ id })` し件数を返す。`lt` を drizzle-orm から import。
- **理由:** AC-2, AC-3。実際の DELETE。

### 6. 設定 + ドキュメント

- **対象ファイル:** `wrangler.toml`, `docs/runtime_cloudflare.md`
- **変更内容:** `[env.pruner.vars]` に `PROCESSED_EVENTS_RETENTION_MS = "604800000"` を追加。docs の pruner 説明・tuning 変数表に `processed_events` 刈り込みと新 env var を追記。
- **理由:** AC-1。運用上の可視性・上書き可能性。

### 7. テスト

- **対象ファイル:**
  - `app/core/application/workers/__tests__/pruneProcessedEvents.test.ts`（新規, unit）
  - `app/core/adapters/d1/__tests__/idempotencyStore.integration.test.ts`（`pruneProcessed` ケース追加）
  - `app/worker/cloudflare/__tests__/handlers.integration.test.ts`（pruner ブロックに `processed_events` 刈り込みケース追加 + 既存テストを `outboxDeleted` に更新）
- **変更内容:** cutoff 計算・件数転送・ログ（unit）、cutoff 境界での削除/保持（adapter integration）、daily tick での両テーブル刈り込み（handler integration）。
- **理由:** 全 AC の回帰防止。

## 設計判断

詳細は `adr.md` を参照。要点:
- **ADR-001**: 刈り込み能力を `IdempotencyStore` ポートに置く（新ポート新設や `OutboxRepository` への相乗りではなく）。
- **ADR-002**: `processed_events` の retention を `outbox_events` とは独立した定数・env var にする（共有しない）。

## リスクと注意点

- **冪等化の破壊リスク（最重要）**: retention が短すぎると、まだ Queue に滞留・再配信され得るメッセージの dedup 記録を消してしまい二重実行を招く。`markProcessed` は dispatch 成功直後（= ack 直前）に書かれるため、当該行が必要な最長窓は「worker が markProcessed 後・ack 前にクラッシュ → メッセージがキュー保持期間いっぱい再配信され続ける」ケース = Queue `message_retention_period`。現行 wrangler は未設定で CF 既定4日、CF の上限は14日。よって既定を **14日** にすれば `message_retention_period` をどう設定しても再配信窓を無条件で上回り、冪等化の正しさを壊さない。consumer の `max_retries=3` で失敗系は早期に DLQ 行き（DLQ ハンドラは再 dispatch せずログのみ・operator 再 drive は新 id イベント再発行なので dedup を迂回しない）。
- **戻り値型変更の波及**: `runPruneTick` の戻り値を `{ deleted }` → `{ outboxDeleted, processedEventsDeleted }` に変えるので呼び出し元を要確認。`grep -rn "runPruneTick" app/` で波及先が `pruner.ts`（戻り値未使用 = 本番経路無影響）と `handlers.integration.test.ts` のみであることを実装前に確定する。
- **D1 一括 DELETE の負荷**: 大量行の DELETE が単一文で走る。`processed_events` は `user.created` / `ingestion.*` / `note.*` など高頻度イベント全件を積むため、初回刈り込みで滞留分が一気に消える量は `outbox_events` より大きくなりうる。→ 既存 `outboxRepository.pruneProcessed` も同じ単一 DELETE 方式で運用実績あり。同方式に揃えることで一貫性を保つ。バッチ分割は本Issueのスコープ外（初回後は daily 増分のみなので定常負荷は軽微。必要なら別Issue）。

## テスト方針

- **unit (`pruneProcessedEvents`)**: cutoff = `clock.now() - retentionMs` を一度だけ計算し adapter に正しい `Date` を渡す / 件数をそのまま返す / 構造化 info ログ（deleted, retentionMs, cutoff）/ 0件でもログする。`outboxPrune.test.ts` と同等のカバレッジ。
- **adapter integration (`idempotencyStore.pruneProcessed`)**: cutoff より古い行のみ削除、新しい行は保持、削除件数が正しい。
- **handler integration (`runPruneTick`)**: daily tick で `outbox_events` と `processed_events` の両方が刈られ、`{ outboxDeleted, processedEventsDeleted }` が正しい。既存の outbox 刈り込みテストが回帰しない。
- **typecheck / lint / format**: `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目
**修正した点（P-001 への対応）**:
- 既定 retention を 7日 → **14日（1209600000ms = CF Queues メッセージ最大保持期間）** に変更。事実誤認だった「7日 は Queues 最大保持期間を超える」という安全論拠を、「dedup 行が必要な最長窓 = Queue `message_retention_period`（CF 上限14日）。14日に倒せば設定値に依らず無条件で再配信窓を上回る」という正しい論証に置き換え。AC-1 / AC-3 / 設計（worker・wrangler）/ リスク節を一括更新。

**取り込んだ改善提案**:
- [coverage S-001 / arch-risk S-001] AC-3 を数値化（cutoff ≥ Queue `message_retention_period`、CF 既定4日・上限14日）。
- [coverage S-002] AC-4 を「戻り値 rename」と「outbox 挙動の非回帰」に分離して明記。
- [arch-risk S-002] 実装ステップ3に `grep -rn "runPruneTick" app/` で波及先を確定する手順を追加。
- [arch-risk S-003] 高頻度イベント全件を積むため初回大量 DELETE リスクが outbox より高い点をリスク節に追記。
- [coverage S-003] `.issue/595/` が現存しない件をスコープ節に明記し、計画を自己完結化（#595/#746 はダッシュボード機能として出荷・当該刈り込みは descope 済み）。

**見送った提案**:
- なし（全提案を取り込み）。
