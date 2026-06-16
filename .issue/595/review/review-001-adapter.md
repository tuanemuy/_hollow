# PR #746 レビュー — Adapter / Infrastructure

対象: Issue #595（P40 ダッシュボード backend）。`.issue/595/plan.md`（AC-1〜AC-10）/ `adr.md`（ADR-001〜007 + 実装メモ）に照らして Adapter 層を検証した。

主な確認ファイル:
- `app/core/adapters/d1/repositories/usageMetricsProvider.ts`
- `app/core/adapters/d1/repositories/activityLogRepository.ts`
- `app/core/adapters/d1/schema.ts`（activity_log / ingestion_burst_log）
- `app/core/adapters/d1/migrations/0018_activity_log.sql`
- `app/core/application/activityLog/{ports,types}.ts` / `handleIngestionCreatedEvent.ts`
- `app/core/application/workers/pruneActivityLog.ts`
- DI: `app/core/application/di/{serverCloudflare,types}.ts`

## Adapter / Infrastructure

### Blockers

なし。

冪等性・partial-failure・スキーマ/migration 整合・DI 配線・エラー変換はいずれも契約どおりで、AC・ADR に対する致命的な逸脱は見つからなかった。

### Warnings

- **[W-001] hourly 集計クエリが `created_at` の index を使えず全表スキャンになる（provider/ADR の「index で bounded」記述が事実と不一致）**
  場所: `usageMetricsProvider.ts:71-79`（`where(gte(ingestionJobs.createdAt, windowStartIso))` + `groupBy(substr(created_at,1,13))`）。
  理由: `ingestion_jobs` の既存 index は `idx_ij_owner_status (owner,status,updated_at)` / `idx_ij_status_updated (status,updated_at)` / `idx_ij_updated_at (updated_at DESC,id DESC)` の 3 本で、**いずれも `created_at` を先頭に持たない**（`schema.ts:527-538` / migration 0001:320-321 で確認）。よって `created_at >= windowStartIso` の範囲述語は index で絞れず、毎リクエストで `ingestion_jobs` 全行スキャンになる。provider docstring（28-29 行）と ADR-002（52 行）の「既存 `idx_ij_status_updated` index がスキャンを bounded に保つ」という記述は誤り（この index は `status` 始まりで `created_at` レンジには効かない）。
  影響度: ダッシュボードは loader cache 付き・低頻度アクセスで、ジョブ総数が小さいうちは実害は軽微（24h 集約のカーディナリティ自体は小さい）。ただし `ingestion_jobs` は刈り込み対象外で恒久増大するテーブルであり、行数が育つと毎回の admin ダッシュボード描画が全表スキャンになる。
  提案: (a) `ingestion_jobs(created_at)`（または `(created_at, id)`）の index を 0018 migration / schema に追加して範囲スキャンを bound する、もしくは (b) index を足さない判断なら provider docstring と ADR-002 の「index で bounded」記述を「フィルタは created_at で行うが現状その index は無い／カーディナリティが小さいため許容」と実態に正す。最低限ドキュメントの虚偽記述は直すべき。

- **[W-002] burst の read-time 集約が固定窓（floor バケット）で、境界をまたぐバーストを取りこぼしうる**
  場所: `activityLogRepository.ts:162`（`Math.floor(row.occurredAt.getTime() / WINDOW_MS)` でキー化）。
  理由: ADR-005 / port doc は「per-owner sliding-window `COUNT(DISTINCT event_id)`」と書くが、実装は固定 5 分窓（epoch 起点の floor バケット）であってスライディングではない。閾値ぎりぎりのバーストが窓境界（例: 12:04〜12:06）を跨ぐと 2 つの固定窓に分割され、どちらも閾値未満になって「大量アップロード」行が出ない取りこぼしが起きうる。統合テスト（`activityLogRepository.integration.test.ts:139-215`）は全イベントを単一窓内（1 秒間隔）に固めているためこの分割ケースを踏んでおらず、回帰検出できない。
  影響度: 機能上は「ノイズ抑制された近似集約」であり虚偽表示には当たらない（出した行は実データに一致する）。ただし ADR/doc の「sliding-window」表現と乖離し、境界条件で表示が不安定。
  提案: (a) doc/ADR を「固定窓近似」と実態に合わせて訂正する、または (b) 真のスライディング窓に寄せる。少なくとも window 境界跨ぎの取りこぼしを 1 ケース統合テストに足し、挙動を仕様として固定することを推奨。

- **[W-003] burst 読み出しの `scan = limit * THRESHOLD` バウンドが、複数 owner / 古い行が混ざると qualifying 窓を取りこぼしうる**
  場所: `activityLogRepository.ts:141-153`（`scan` 件だけ occurred_at desc で読み、in-process 集約）。
  理由: 「各 qualifying 窓は最低 threshold 行を消費するから `limit*threshold` 件読めば最大 `limit` 窓を組める」という前提は、**スキャン範囲内に閾値未満の owner/窓の行が多数混ざる**と崩れる。閾値に届かない散発アップロード（多数 owner の単発 ingestion）が新しい順で `scan` 件を埋めると、その奥にある真の大量アップロード窓が読み出されず欠落する。`idx_ingestion_burst_log_owner_occurred` はあるが、このクエリは owner 述語なしの全体 occurred_at desc 読みなので効かず、`idx_ingestion_burst_log_occurred_at` 単独 index 依存。
  影響度: 24h 保持で母数が限られるため実運用での顕在化は限定的だが、低閾値・多 owner 環境では大量アップロード行が出ないことがある。
  提案: read-time 集約を SQL 側（`GROUP BY owner_id, floor(occurred_at/window)` 相当 + `HAVING COUNT(DISTINCT event_id) >= threshold`）に寄せて in-process スキャン上限への依存を外すか、`scan` を保持窓全体（24h ぶん）に広げる。最低限、混在ケースの統合テストを足して取りこぼし境界を仕様化する。

### Notes

- **[N-001] hourly 集計のタイムゾーン・境界・0 埋めは正しい。**
  `created_at`（UTC ISO8601 TEXT）に対し `substr(...,1,13)`（"YYYY-MM-DDTHH"）で UTC 時バケット化（`usageMetricsProvider.ts:71`）し、JS 側の bucket キー（`hourBucketKey` = `toISOString().slice(0,13)`、105-107 行）と桁・フォーマットが完全一致。`floorToHourUtc` による 24 連続バケット生成・欠損 0 埋め（86-89 行）、`gte` で 24h 窓外を除外も整合。統合テスト（`usageMetricsProvider.integration.test.ts:81-131`）が境界（窓外ジョブ除外・空テーブル 24 本 0・現在の部分時間）を網羅。AC-3 の「0 と null の区別」も成立。

- **[N-002] SQL インジェクション耐性は問題なし。**
  hourly クエリの bucket キーは静的 `sql` リテラル（`substr(...,1,13)`）で、ユーザー入力は混じらない。`windowStartIso` は clock 由来 Date の ISO 文字列でパラメータバインド（`gte`）。burst 集約は全て drizzle のパラメータ化 select / バインドで、文字列連結 SQL は無い。

- **[N-003] partial-failure 契約は provider 内に正しく閉じている。**
  `collectUploadsHourly` の try/catch（`usageMetricsProvider.ts:68-95`）が provider 内に閉じ、失敗時は系列 `null`・throw せず（テスト 133-146 でブローカン DB を検証）。scalar 4 フィールドは `null` 固定（42-53 行、テスト 148-163）で #545「既存 4 metric-card 挙動不変」を満たす。AC-2 の LLM 系列不在（記録源無し）も `llmCallsToday: null` 固定で整合（ADR-002 A-1 確定結果どおり）。

- **[N-004] insertIfAbsent / recordBurst の冪等性は AC-7 / ADR-001・005 どおり。**
  両 insert とも `onConflictDoNothing({ target: eventId })`（`activityLogRepository.ts:55,70`）で `event_id` unique 自然キーに対し DO NOTHING。件数加算なし＝再配信で二重行も二重計上も起きない。統合テスト（同 55-79 行 = 二重 dispatch で 1 行、170-195 行 = 同 eventId 再蓄積で count 不変）で検証済み。

- **[N-005] prune クエリは `outboxRepository.pruneProcessed` の定型に準拠（AC-10）。**
  `pruneOlderThan` / `pruneBurstOlderThan`（`activityLogRepository.ts:86-104`）は `lt(occurred_at, cutoff)` + `.returning({id})` で削除件数を返す形で、既存 outbox prune（`outboxRepository.ts:213-226`）と同形。`pruneActivityLog.ts` が `ACTIVITY_LOG_RETENTION_DAYS`(90d) / `INGESTION_BURST_LOG_RETENTION_HOURS`(24h) の cutoff を計算し daily tick から両方を刈る。`occurred_at < cutoff` の境界も統合テスト（同 218-267 行）で検証。AC-10 の「保持を切っても直近 N 件表示は壊れない」も成立。

- **[N-006] driver エラー変換・retry は共有契約に準拠。**
  全 D1 書き込み/読み出しが `mapDbError`（`helpers.ts:98-116`）でラップされ、SQLITE_CONSTRAINT → `ConflictError`、その他 → `SystemError(DatabaseError)` に変換。driver-native エラーは adapter 境界を越えない。`onConflictDoNothing` を使うため activity_log の eventId 衝突は例外化せず正常パスで吸収（適切）。retry は driver/adapter 層の既存方針に委ね、本 PR で application 層 OCC retry を持ち込んでいない点も CLAUDE.md 準拠。

- **[N-007] スキーマ定義と migration SQL は一致している。**
  drizzle schema（`schema.ts:805-861`）と手書き migration `0018_activity_log.sql` を突き合わせ: 列（型・NOT NULL・DEFAULT '' / 'info'）、`uniq_*_event_id` unique index、`idx_activity_log_occurred_at (occurred_at DESC)`、`idx_ingestion_burst_log_owner_occurred (owner_id, occurred_at DESC)`、`idx_ingestion_burst_log_occurred_at`、severity の CHECK enum すべて一致。`occurred_at`/`created_at` は schema `integer(timestamp_ms)` ↔ migration `integer` で整合。migration は `IF NOT EXISTS` で再実行冪等。index 設計も findRecent（occurred_at DESC）/ burst owner+occurred の読みパスに沿っており妥当。

- **[N-008] activityLogRepository の RequestContainer / WorkerContainer 両載せは ADR-006 補足どおり。**
  `serverCloudflare.ts:746`（request）/ `1207`（worker）で `new D1ActivityLogRepository(db)` を両コンテナにインスタンス化、`di/types.ts:259,306` で両 container 型に追加。`UnitOfWorkContext` には足していない（read usecase `getRecentActivity` が request 路で呼ぶため request にも必要、`searchIndex` 同様）。ADR-006 実装メモの判断と一致。

## まとめ

冪等投影・partial-failure・スキーマ/migration 整合・エラー変換・DI 配線は契約どおりで Blocker なし。Warning 3 点はいずれも「機能は成立するが、(a) ドキュメント記述が実態と食い違う、(b) スキャン/窓近似に取りこぼし境界がある」もので、虚偽表示やデータ破壊には至らない。優先度は W-001（index 不在 + doc 虚偽記述）> W-003 > W-002。最低限、W-001/W-002 の docstring・ADR の事実誤認の訂正は本 PR で行うべき。
