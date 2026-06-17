# PR #746 レビュー Round 2 — Adapter / Infrastructure

対象: Issue #595（P40 ダッシュボード backend）。前ラウンド指摘（W-001/W-002/W-003）の修正後をゼロベースで再レビューした。`.issue/595/plan.md`（AC-1〜AC-10）/ `adr.md`（ADR-001〜007 + 実装メモ）に照らして Adapter 層を検証。

主な確認ファイル:
- `app/core/adapters/d1/repositories/usageMetricsProvider.ts`
- `app/core/adapters/d1/repositories/activityLogRepository.ts`
- `app/core/adapters/d1/schema.ts`（ingestion_jobs index / activity_log / ingestion_burst_log）
- `app/core/adapters/d1/migrations/0018_activity_log.sql` / `0019_ingestion_jobs_created_at_index.sql`
- `app/core/application/activityLog/{ports,types}.ts` / `handleIngestionCreatedEvent.ts`
- `app/core/application/workers/pruneActivityLog.ts`
- 統合テスト 2 本（18 ケース全 pass を実行確認）

## Adapter / Infrastructure

### Blockers

なし。

冪等投影・partial-failure・スキーマ/migration 整合・SQL インジェクション耐性・エラー変換・DI 配線・index 設計はいずれも契約どおりで、AC・ADR に対する致命的逸脱は無い。前ラウンド W-001〜W-003 はいずれも適切に解消されており、回帰も検出されなかった。

### Warnings

なし。

前ラウンドの 3 Warning の修正妥当性を個別に検証した:

- **W-001（hourly 集計の index 不在 + doc 虚偽記述）→ 解消。**
  `ingestion_jobs(created_at)` の専用 index `idx_ij_created_at` が schema（`schema.ts:539-544`、コメント付き）と migration `0019_ingestion_jobs_created_at_index.sql` の両方に追加され整合。migration は `IF NOT EXISTS` で再実行冪等、wrangler の filename 順適用に正しく載る（0017/0018/0019 連番、journal 不要の運用）。provider docstring（`usageMetricsProvider.ts:25-29`）・ADR-002（45/52 行）も「既存 index は `created_at` 先頭でないため専用 `idx_ij_created_at` を足す」と実態に訂正済み。`created_at >= windowStartIso` の範囲述語がこの index で bound される記述は正しい。

- **W-002（固定窓 → 境界跨ぎ取りこぼし）→ 解消。**
  `findOwnerBurst`（`activityLogRepository.ts:220-258`）が真の two-pointer スライディング窓に再実装された。窓述語 `while (times[right] - times[left] >= WINDOW_MS) left += 1` は半開区間 `[left,right]`（span `< WINDOW_MS`）を維持し、`count = right - left + 1` の off-by-one なし。閾値判定（`count >= LARGE_UPLOAD_THRESHOLD`）・best 選好（windowEnd 最新優先 → count 大）も妥当。`event_id` unique なので distinct-event count が行数 count に縮約される前提も正しい。境界跨ぎテスト（同テスト 217-250 行、floor バケット境界を跨ぐ THRESHOLD 件で 1 行検出）が追加され回帰を固定。「別窓を merge しない」テスト（197-215）も両立。

- **W-003（global スキャンの starvation）→ 解消。**
  read-time 集約が per-owner 戦略に再設計（`readBursts`、141-210 行）。`GROUP BY owner_id HAVING count(*) >= threshold` で候補 owner を絞る前段は健全 — 「閾値以上の窓が存在する ⇒ 総行数 ≥ threshold」が必要条件なので候補からの false negative が無く、各候補を `findOwnerBurst` で sliding 窓確認するため false positive も無い。多数 sparse owner が新しい順を埋めても深い qualifying 窓を取りこぼさないことをテスト（252-284 行）で固定。各 owner 読みは `(owner_id, occurred_at)` index 経由（schema の `idx_ingestion_burst_log_owner_occurred`、ASC 読みは DESC index の逆走査で served）+ 24h prune で行数が bound される。

  性能: 候補クエリ 1 回 + 候補ごと 1 クエリ（`findOwnerBurst`）だが、候補は `.limit(limit)`（典型 10〜20）で打ち切られるため **N=全 owner にはならず N=limit に bound** される。`findRecent` 自体が `limit` 行しか返さない以上、limit 件超の qualifying owner が存在する稀ケースで `max(occurred_at)` 上位 limit に絞るのは表示要件上許容。妥当な戦略。

### Notes

- **[N-001] hourly 集計のタイムゾーン・境界・0 埋めは正しい（前ラウンドから不変、再確認）。**
  `substr(created_at,1,13)`（UTC "YYYY-MM-DDTHH"）の bucket キーと JS 側 `hourBucketKey`（`toISOString().slice(0,13)`）が完全一致。`floorToHourUtc` による 24 連続バケット生成・欠損 0 埋め・`gte` での窓外除外が整合。統合テスト（24 本/空テーブル 0/UTC バケット集約/窓外除外/部分時間）が網羅し AC-1〜3 を満たす。

- **[N-002] SQL インジェクション耐性は問題なし。**
  hourly の bucket キー・burst 集約・候補 HAVING（`count(*) >= ${LARGE_UPLOAD_THRESHOLD}`）はすべて drizzle のパラメータ化 select / 静的 `sql` リテラル。閾値・limit はコード定数 or `Number.isInteger` ガード後の数値で、ユーザー入力由来の文字列連結 SQL は無い。

- **[N-003] partial-failure 契約は provider 内に閉じている。**
  `collectUploadsHourly` の try/catch が provider 内に閉じ失敗時 `null` degrade（テスト 133-146 でブローカン DB 検証）。scalar 4 フィールドは `null` 固定（テスト 148-163）で #545「既存 4 metric-card 挙動不変」を満たす。LLM 系列不在も `llmCallsToday: null` 固定で ADR-002 A-1 確定どおり。

- **[N-004] 冪等性は AC-7 / ADR-001・005 どおり（二重防御）。**
  `insertIfAbsent` / `recordBurst` とも `onConflictDoNothing({ target: eventId })` で `event_id` unique 自然キーに DO NOTHING、件数加算なし。`handleIngestionCreatedEvent` も 1 event → 1 row（`recordBurst`）で fan-out retry に耐える設計。統合テスト（二重 dispatch で 1 行 / 同 eventId 再蓄積で count 不変）で検証済み。

- **[N-005] 安定 key は一意・決定的。**
  通常行 = `activity_log.id`（PK）、burst 行 = `large_upload:{ownerId}:{windowStart.toISOString()}` の決定的キー。同一データで再読込しても同一キー（テスト 311-343 で「再読込で key 列一致 + 全 key distinct」を検証）。windowStart は two-pointer が選ぶ best 窓の start で、同一入力に対し決定的。

- **[N-006] スキーマと migration SQL が完全一致。**
  `schema.ts:811-868`（activity_log / ingestion_burst_log）と `0018_activity_log.sql` を突き合わせ: 列型・NOT NULL・DEFAULT（''/'info'）・severity CHECK enum・`uniq_*_event_id` unique・`idx_activity_log_occurred_at (occurred_at DESC)`・`idx_ingestion_burst_log_owner_occurred (owner_id, occurred_at DESC)`・`idx_ingestion_burst_log_occurred_at` すべて一致。`occurred_at`/`created_at` は schema `integer(timestamp_ms)` ↔ migration `integer` で整合。`0019` の `idx_ij_created_at` も schema `index("idx_ij_created_at").on(table.createdAt)` と一致。両 migration とも `IF NOT EXISTS` で冪等。

- **[N-007] prune クエリは outbox 定型に準拠（AC-10）。**
  `pruneOlderThan` / `pruneBurstOlderThan` は `lt(occurred_at, cutoff)` + `.returning({id})` で削除件数を返す（既存 outbox prune と同形）。`pruneActivityLog.ts` が `ACTIVITY_LOG_RETENTION_DAYS`(90d) / `INGESTION_BURST_LOG_RETENTION_HOURS`(24h) の cutoff を計算し daily tick から両方を刈る。「保持を切っても直近 N 件表示は壊れない」も成立。

- **[N-008] driver エラー変換は共有契約に準拠。**
  全 D1 書き込み/読み出しが `mapDbError` でラップされ driver-native エラーは adapter 境界を越えない。`onConflictDoNothing` で eventId 衝突を正常パス吸収。application 層 OCC retry を持ち込んでおらず CLAUDE.md 準拠。

- **[N-009]（軽微・将来観点、修正不要）** `findOwnerBurst` は owner の burst 行を時間述語なしで全件読む（24h prune に依存して bound）。pruner tick が長時間停止すると 1 owner の読み件数が想定超になりうるが、prune 障害は運用監視の領域で、本 PR の設計判断（24h 保持で bound）として妥当。`users.username || users.name` の `|| name` フォールバックは `username` NOT NULL（value object が空文字を拒否）のため事実上 dead branch だが無害。いずれも修正対象ではない。

## まとめ

前ラウンドの W-001（index + doc 訂正）・W-002（真の sliding-window）・W-003（per-owner 集約 + HAVING 前段絞り）はすべて正しく解消され、対応する境界/starvation の統合テストが追加されて回帰を固定している（統合 18 ケース全 pass を実行確認）。冪等投影・partial-failure・スキーマ/migration 整合・SQL 安全性・エラー変換・DI 配線も契約どおり。Adapter / Infrastructure 観点で新たな問題・回帰は無く、Blocker / Warning ともになし。
