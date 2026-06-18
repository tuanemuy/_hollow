# Plan Review Round 1 — Issue #747（要件カバレッジ・スコープ整合性）

レビュー視点: Issueの要件カバレッジ・スコープ整合性
対象: `.issue/747/plan.md` / `.issue/747/adr.md`
日付: 2026-06-18

## サマリー判定

Issue #747 の本文「やること」3項目（保持方針の定義 / 専用刈り込み経路の追加 / 冪等化の正しさを壊さない）は、受け入れ基準 AC-1〜AC-5 にすべて落ちており、各 AC は実装ステップに正しく紐づいている。スコープ外の作業の混入もない。コメントでの追加議論は無し（`comments: []`）。要件カバレッジ・スコープ整合性の観点で**重大な問題はゼロ**。検証可能性とトレーサビリティに関する軽微な改善提案のみ。

---

## 要件 → AC マッピング検証

| Issue「やること」 | 対応 AC | カバー判定 |
|---|---|---|
| `processed_events` の保持方針（retention）を定義する | AC-1 | ✅ 定数 + env var 上書き |
| 専用刈り込み経路を pruner の daily tick に足す | AC-2, AC-4 | ✅ daily tick 相乗り、両テーブル同一 tick |
| 冪等化の正しさを壊さない（再配信され得ない古い行のみ刈る） | AC-3 | ✅ cutoff 根拠を明記 |
| （暗黙）`outbox_events` 既存刈り込みを壊さない | AC-4 | ✅ 非回帰を明示 |
| （暗黙）既存 `pruneOutbox` のログ規約整合 | AC-5 | ✅ 削除件数を構造化ログ |

Issue 本文の要件はすべて AC に反映されており、**漏れた要件は確認できない**。

---

## コード調査による裏取り（事実確認）

- `outboxPrune.ts`: `DEFAULT_OUTBOX_RETENTION_MS = 7日`、`pruneOutbox(container, {retentionMs})` パターン、構造化ログ `{deleted, retentionMs, cutoff}` — plan の手本記述と一致。
- `outboxRepository.ts:213` `pruneProcessed(olderThan)`: `mapDbError` + `.delete().where(lt(...)).returning({id})` で件数取得 — plan の対称化方針と一致。`processedAt IS NOT NULL` 条件は `outbox_events` 固有（plan が `processed_events` では不要と判断しているのは妥当：schema 上 `processed_at` は `notNull`）。
- `schema.ts:48` `processedEvents`: `id` PK / `processed_at timestamp_ms notNull` のみ。quarantine 列なし — plan の「除外条件不要」「DDL 変更なし」の前提は正しい。
- `idempotencyStore.ts`（adapter）: `mapDbError` 経由・drizzle。`pruneProcessed` 追加先として整合。
- `handlers.ts:84 runPruneTick`: 現状 `{deleted}` を返し `pruneOutbox` のみ呼ぶ。plan の戻り値型変更 `{outboxDeleted, processedEventsDeleted}` は妥当。
- `pruner.ts:15`: `ctx.waitUntil(runPruneTick(env))` で戻り値未使用 — plan の「本番経路無影響」は正しい。
- `env.ts`: `TuningEnv` / `pruneTuningSchema` / `readPruneTuning` の追記箇所は plan 記述どおり存在。
- `serverCloudflare.ts`: `ServerEnv` に `OUTBOX_RETENTION_MS?: string` があり `readPruneTuning` を re-export。plan の追記方針と整合。
- `di/types.ts`: `WorkerContainer` は既に `idempotencyStore` を保持 — plan/ADR の「DI 配線追加不要」は正しい。
- `wrangler.toml`: `[env.pruner.vars] OUTBOX_RETENTION_MS = "604800000"` 実在 — plan の追記対象と一致。
- `handlers.integration.test.ts`: pruner ブロックが `result.deleted` を assert（L271, L290）— plan の「既存テストを `outboxDeleted` に更新」は必要かつ正確。

事実関係の誤りは確認できなかった。

---

## 問題点（要修正）

問題点ゼロ

（要件カバレッジ・スコープ整合性の観点で、修正必須の欠落・スコープ逸脱・検証不能な基準は確認されなかった。）

---

## 改善提案（検討推奨）

- **[S-001]** AC-3 を「数値で検証可能」な形に踏み込む
  - 理由: AC-3 は「配信タイムアウト/リース期間・Queue 再配信可能期間を十分に超え」と定性的。plan のリスク節では「7日 は Cloudflare Queues の最大メッセージ保持期間・リトライ猶予を十分に上回る」と根拠を述べているが、AC 表自体には具体的な閾値（例: Queue の max retention は N、retention 7日 ≫ N）が無い。レビュアー/実装者が「十分」を客観判定できるよう、AC-3 または対応テスト方針に「retention > Queue最大保持期間（具体値）」という形で参照値を1つ書いておくと、検証可能性が上がる。スコープは増えない（既存値の根拠明文化のみ）。

- **[S-002]** AC-4 の「非回帰」を検証する観測点を AC に明記
  - 理由: AC-4 は「`outbox_events` の既存刈り込みは挙動を変えず、両方が同一 tick で実行される」。実装ステップ3で戻り値型を `{deleted}` → `{outboxDeleted, processedEventsDeleted}` に**破壊的変更**する。これは挙動非回帰の検証対象（`outbox_events` の削除件数・条件が不変であること）と、戻り値キー rename の波及（テスト更新）が同居している。AC-4 の検証手段として「既存 outbox 刈り込みテストが `outboxDeleted` で同じ削除件数を出すこと」を明示しておくと、rename を「挙動変更」と取り違える誤読を防げる。plan のテスト節 L148 は既にこの意図を含むため、AC 表側に一行補えば十分。

- **[S-003]** `.issue/595/` 参照の所在確認
  - 理由: Issue 本文・plan ともに派生元として `.issue/595/plan.md` リスク節 / `.issue/595/adr.md` ADR-007 を引用しているが、当該ディレクトリは現リポジトリに存在しない（`ls .issue/595/` で空）。要件カバレッジ上の支障はない（Issue 本文が要件の SSOT）が、plan の「調査結果」が実在しない一次資料に依拠しているように読めるため、参照を「PR #746 / Issue #595」に寄せるか、根拠を plan 内に self-contained で残すとトレーサビリティが安定する。

---

## 良い点

- **Issue 3要件 → AC → 実装ステップの三段トレーサビリティが明示的**。AC 表の「由来」「対応ステップ」列、各ステップの「理由: AC-x」注記で双方向に追跡でき、カバレッジ検証が容易。
- **スコープ境界の宣言が的確**。「含まれないもの」で outbox ロジック改変・quarantine 扱い・新 cron・スキーマ変更を明示除外。特に「`processed_events` に quarantine 概念なし → `failed_at` 相当の除外条件不要」は schema（`processed_at notNull`、quarantine 列なし）と一致した正しい根拠で、不要作業の混入を防いでいる。
- **冪等化破壊リスクへの正面からの言及**。リスク節で「`markProcessed` は dispatch 成功直後（ack 直前）に書かれ、必要窓は秒〜分、7日 はそれを大きく上回る」と、なぜ古い行を消して安全かを因果で説明。AC-3 の意図が実装に正しく伝わる。
- **既存パターンへの忠実な対称化**。`OutboxRepository.pruneProcessed` と同一シグネチャ、同一 DELETE 方式、同一ログ規約に揃える方針で、レビュー・回帰のコストを最小化。ADR-001/002 の判断（所有ポートに GC を置く / retention を独立定義）も既存実装の所有境界と整合し妥当。
- **本番経路の無影響を裏取り済み**。戻り値型変更が `pruner.ts`（戻り値未使用）に波及しないことを特定し、影響範囲をテストのみに限定できている。
