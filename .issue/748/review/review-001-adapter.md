# Review 001 — Adapter / Infrastructure (PR #760, Issue #748)

レビュー観点: Adapter / Infrastructure（ポート準拠・エラー契約変換・retry・D1 規約・SQL/型/タイムゾーン）。

対象主要ファイル:
- `app/core/adapters/d1/repositories/llmCallLogRecorder.ts`
- `app/core/adapters/d1/repositories/usageMetricsProvider.ts`
- `app/core/adapters/d1/migrations/0020_llm_call_log.sql`
- `app/core/adapters/d1/schema.ts`（`llmCallLog` 追加分）
- 参照: `app/core/application/workers/pruneLlmCallLog.ts`, `llmCallLog/ports.ts`, `llmCallLog/types.ts`, 呼び出し側 `previewPrompt.ts` / `runIngestionJob.ts`

総評: ADR-001〜010 に忠実で、既存のアップロード系列・activity_log・ingestion_burst_log のパターンと高い整合。ポート分割（recorder=write/prune、provider=read）も妥当。エラー契約変換・SQL インジェクション・タイムゾーン（UTC）扱いに実害のある欠陥は見当たらなかった。Blocker なし。Warning 1（scalar 窓と series 窓のズレの意図確認）、Notes 数件。

## Adapter / Infrastructure

### Blockers
なし。

### Warnings

#### [W-001] scalar `llmCallsToday` の 24h 窓が hourly series の窓と境界定義が異なる（仕様どおりだが UI 一致性に注意）
- 場所: `usageMetricsProvider.ts:137-152`（scalar）vs `:98-104`/`:113-129`（series）
- 内容: scalar は `now - 24h`（`HOURS_IN_WINDOW * HOUR_MS` = 厳密な 24 時間ロール窓）を下限にする。一方 hourly series は `floorToHourUtc(now) - 23h`（= 現在の部分時間バケット + 過去 23 完全時間）を下限にする。両者は数十分〜1 時間ぶんずれ、series の合計と scalar の値は一般に一致しない。
- 理由: ADR-004 が scalar を `COUNT(*) WHERE occurred_at >= now-24h` と明記しており、series（ADR-007: アップロード系列流用）とは別定義なので、これは設計どおりの意図的な差異。ただし JSDoc（`usageMetricsProvider.ts:131-136`）は「The window start is the same ISO8601 lower bound the hourly series uses, so the scalar and the series agree on the window」と書いており、実コードと食い違う。series は `windowStartIso()`（floor 起点・23h）、scalar は `now - 24h`（floor なし・24h）で、**下限は一致していない**。
- 提案: 実害（ダッシュボードは「概算」表示・ADR-002）はないが、JSDoc の「same ISO8601 lower bound … agree on the window」は誤り。`collectLlmCallsToday` は `windowStartIso()` を使っていない事実に合わせて JSDoc を「scalar は厳密 24h ロール窓、series は時間バケット境界起点で、両者の窓は厳密一致しない（いずれも概算）」と訂正するか、もし「一致」を意図するなら scalar も `windowStartIso()` を使う。どちらでも良いが、コードとコメントの不一致は解消すべき。

### Notes

#### [N-001] `recordCall` の `createdAt` に `occurredAt` を流用している
- 場所: `llmCallLogRecorder.ts:32`（`createdAt: entry.occurredAt`）
- 内容: `LlmCallLogEntry` は `occurredAt` のみを持ち `createdAt` を持たない。アダプタが `createdAt` に `occurredAt` を流用している。呼び出し側（`previewPrompt.ts` / `runIngestionJob.ts`）は `occurredAt: container.clock.now()` を LLM 呼び出し成功**直後**に採るため、`created_at` ≒ 記録時刻になり実害はない。
- 理由: `created_at` は read 側（series/scalar はいずれも `occurred_at` を使用）で参照されず、prune も `occurred_at` 基準。よって `created_at` は純粋に診断用メタで、値の厳密さは問われない。activity_log / ingestion_burst_log と異なり insert 直前に別途 `clock.now()` を取らない点だけ非対称だが、port が `createdAt` を運ばない設計上やむを得ず、合理的。
- 提案: 対応不要。気になるなら JSDoc に「`created_at` は記録時刻の近似（= `occurredAt`）で診断専用」と一言。

#### [N-002] `pruneOlderThan` の境界は厳密 `<`（cutoff ちょうどは残す）で series 窓と矛盾しない
- 場所: `llmCallLogRecorder.ts:41`（`lt(llmCallLog.occurredAt, cutoff.toISOString())`）、`pruneLlmCallLog.ts:23-26`
- 内容: cutoff = `now - 48h`、`occurred_at < cutoff` を削除。保持窓 48h は表示窓 24h（series/scalar とも）より厳密に大きく、daily tick の着地タイミングに依らず直近 24h 表示対象は刈られない（AC-6 充足）。境界が `<`（cutoff 同値は保持）なのも off-by-one で表示対象を巻き込まない安全側。
- 理由: ISO8601 text の辞書順比較は UTC 時刻順と一致（occurred_at は常に `Z` 付き UTC・固定幅）。`occurred_at` index（`idx_llm_call_log_occurred_at`）でレンジ削除が index 利用される。
- 提案: なし。

#### [N-003] `returning({id})` で削除件数を数えるコストは許容範囲
- 場所: `llmCallleLogRecorder.ts:39-43`
- 内容: 削除件数を `.returning({ id })` の配列長で得ている。D1/SQLite では `changes()` を直接拾えない drizzle の制約上、`returning` で件数化するのは既存パターン（他 pruner も同型なら整合）。高頻度テーブルだが prune は daily tick 1 回なので、48h ぶんの削除行 id を一時的にメモリ展開するコストは運用上問題になりにくい。
- 理由: 件数ログ（`pruneLlmCallLog.ts:27`）のために件数が必要で、D1 では返り値以外に取得手段が乏しい。
- 提案: なし。将来、刈り込み量が極端に増えたら `returning` を外して件数ログを諦める/別手段に変える検討余地がある程度。

#### [N-004] エラー契約変換は `mapDbError` 経由で既存規約に準拠
- 場所: `llmCallLogRecorder.ts:26,38`
- 内容: write/prune とも `mapDbError` でドライバ固有エラーを `ConflictError`/`SystemError` の共有契約へ変換。unique 制約を持たないため write での `UNIQUE_VIOLATION` は構造上発生せず（ADR-008）、insert 失敗は基本 `SystemError(DatabaseError)` に倒れる。呼び出し側は best-effort で局所 try/catch して握り潰すため、この throw は本処理を壊さない（AC-5）。
- 理由: adapter→application のエラー契約変換規約（CLAUDE.md「Cross-layer catch policy」）どおり。provider 側（read）は `mapDbError` を通さず自前 try/catch で `null` degrade するが、これは「partial-failure 契約: never throw」というアップロード系列と同型の意図的設計で、アップロード系列（`collectUploadsHourly`）と完全に一致しているため一貫している。
- 提案: なし。

#### [N-005] migration 0020 は採番・冪等性・index・型すべて規約準拠で schema と一致
- 場所: `0020_llm_call_log.sql`、`schema.ts:878-889`
- 内容:
  - 採番: 既存最大が 0019 で 0020 は次番。衝突なし。
  - 冪等性: `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`（0018/0019 と同型）。
  - `occurred_at` = ISO8601 text（`text NOT NULL`）、unique なし、`idx_llm_call_log_occurred_at` 1 本。ADR-007/008 どおり。
  - schema 一致: migration の列（`id text PK`, `owner_id text NOT NULL`, `provider text NOT NULL`, `occurred_at text NOT NULL`, `created_at integer NOT NULL`）と Drizzle 定義（`occurredAt: text`, `createdAt: integer timestamp_ms`）が一致。`created_at` を `integer` にし `occurred_at` を `text` にする「時刻列の二系統」は outbox/activity_log（integer-ms）と Identity（ISO text）の既存使い分けに沿う。
- 理由: 既存 manual migration（drizzle-kit 非生成）の慣行に従い手書き。`db:generate` 不要との PR 記述とも整合。
- 提案: なし。owner_id に FK（`users.id ON DELETE CASCADE`）を張らない点は ingestion_burst_log / activity_log（read-model はアプリ側で owner を持つだけで FK なし）と同型で整合。read-model なので FK 不在は許容。

#### [N-006] SQL インジェクション・型変換・UTC 扱いは健全
- 場所: `usageMetricsProvider.ts` 全般
- 内容:
  - インジェクション: `substr(${col},1,13)` の `${col}` は drizzle のカラム参照（識別子バインド）で文字列連結ではない。`where` は `gte(col, this.windowStartIso())` のパラメータバインド。ユーザ入力が SQL に混ざる箇所なし。
  - 型変換: `count` を `Number(row.count)` で正規化（D1 が string/number どちらで返しても安全）。`rows[0]?.count ?? 0` で空結果も 0 に倒す。
  - UTC: bucket 化は `substr(...,1,13)`（ISO8601 の `YYYY-MM-DDTHH`）で、`hourBucketKey` は `Date.toISOString().slice(0,13)` と完全一致。`floorToHourUtc` は epoch ms ベースで TZ 非依存。`occurred_at` が必ず `Z` UTC text であることに依存する（recorder が `toISOString()` で保証）。
- 理由: アップロード系列の確立済みパターンを LLM 系列が忠実に流用。
- 提案: なし。

#### [N-007] fillBuckets / windowStartIso の共通化は据え置きで妥当
- 場所: `usageMetricsProvider.ts:59-129`
- 内容: `collectUploadsHourly` と `collectLlmCallsHourly` は SQL のテーブル/列だけ差し替えたほぼ同型の 2 メソッドだが、bucket 0 埋め（`fillBuckets`）と窓下限（`windowStartIso`）は private ヘルパとして既に共通化済み。クエリ本体を更に汎用化（テーブル/列を引数化）する余地はあるが、drizzle の型付き select を引数化すると型がぼやけるため、現状の「ヘルパ共通化＋クエリは各メソッド」は読みやすさと型安全のバランスとして妥当。
- 理由: ADR-007 の「アップロード系列ロジック流用」をヘルパ抽出で達成済み。重複は SQL の 2 行程度に限定されている。
- 提案: なし（過度な抽象化は不要）。

#### [N-008] retry 観点
- 内容: ドライバレベルの transient retry は adapter 内（D1 client 層）で吸収する規約であり、本 PR は新クエリ追加のみで retry 方針に変更なし。application 層 OCC retry も意図的に持たない規約に沿い、本 read-model は OCC を持たない（version 列なし）ため該当なし。
- 提案: なし。

## まとめ
- ポート準拠（write/prune と read の分離）: OK
- エラー契約変換（`mapDbError` / partial-failure null degrade）: OK
- D1 規約（migration 採番・冪等・index・schema 一致・時刻列使い分け）: OK
- SQL/型/UTC: OK
- 唯一の指摘 W-001 は「コードと JSDoc の窓定義の食い違い」で、機能的実害はないが訂正推奨。
