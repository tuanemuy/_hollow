# レビュー #792 — Use Case / Worker 観点（Round 2 / フル）

対象 PR: #792 / Issue #783
レビュー範囲: アプリケーション層（prune usecase・ポート・worker tick 配線・tuning env）
判定: **Blocker なし。Warning 1 / Note 3。**

確認した受け入れ基準（アプリケーション層関連）: AC-1/2/3/4（D1 述語 + usecase）、AC-5/6（DEFAULT 定数・env 読み取り）、AC-7（best-effort 隔離）、AC-8/9（completed 除外・purge 配線）。ADR-001/002/003/004/005/006 整合。いずれも実装で満たされている。

---

## Blockers

なし。

prune usecase 2本（`pruneExportJobs` / `pruneTagMergeJobs`）は `pruneProcessedEvents` / `pruneLlmCallLog` の確立パターンに完全に忠実（`cutoff = clock.now() - retentionMs` → ポート呼び出し → 構造化 info ログ → `{ deleted }` 返却）。D1 述語の終端集合（export=`{failed,cancelled,expired}` で completed 除外、tag_merge=`{completed,failed}`）はスキーマの status enum（`app/core/adapters/d1/schema.ts:646-648, 685-687`）と一致し、非終端不可侵・artifact orphan 回避を構造的に担保。`runPruneTick` の best-effort 隔離（outbox は先頭 throw 可、以降は各々独立 try/catch）と purge→export-prune の実行順序は ADR-005 どおり。レイヤー責務（port=application / adapter=d1 / usecase=workers / 配線=handlers）の分離も適切で、ドメインロジック漏出なし。

---

## Warnings

### [W-001] purge の成功時 expired 件数がログにも返り値にも現れず、tick の可観測性が兄弟 sweep と非対称 — `app/worker/cloudflare/handlers.ts:166-173`

`runPruneTick` 内で `await purgeExpiredExports({ container: purgeContainer, input: {} })` の戻り値 `{ expired }` が破棄されている。`purgeExpiredExports` 本体（`app/core/application/export/purgeExpiredExports.ts:54-67`）は per-row の `logger.warn`/`logger.error` しか出さず、**成功時に「何件 expire したか」のサマリ info ログを一切出さない**。

一方、隣接する全ての sweep（`pruneExportJobs:23` / `pruneTagMergeJobs:23` / `pruneProcessedEvents:27` / `pruneLlmCallLog:27` / `pruneActivityLog`）は usecase 自身が `deleted` 件数の info ログを出す。結果として pruner tail を見る operator は「export-jobs を N 件 prune」「tag-merge を N 件 prune」は見えるのに、その前段の「completed→expired を何件進めたか」だけが見えない。completed→expired→prune の連鎖が実際に回っているか（AC-9 の運用確認）を tail から検証できない。

plan.md:96 は「purge の戻り値 `{ expired }` は**ログのみ**で `runPruneTick` の返り値契約は不変」と明記しており、`expired` 件数はログに反映する想定だった。実装はログにも返り値にも反映していないため、計画意図とのズレ。

- 提案: purge の try ブロック内で `const { expired } = await purgeExpiredExports(...)` を受け、`container.logger.info("[prune] expired N export(s)", { expired })` を出す。返り値契約（`{ outboxDeleted, processedEventsDeleted }`）は据え置きでよい。兄弟 sweep のログ規約に揃い、AC-9 の連鎖を tail で観測可能になる。

---

## Notes

### [N-001] retention env のパースが try/catch 外で eager 実行されるため、新規2 var の設定ミスが outbox prune ごと tick 全体を落とす — `app/worker/cloudflare/handlers.ts:127` / `app/core/application/di/env.ts:46-55`

`readPruneTuning(env)` は `runPruneTick` 冒頭・最初の `pruneOutbox` より前で呼ばれ、`exportJobsRetentionMs` / `tagMergeJobsRetentionMs` は `z.coerce.number().int().positive()`。`EXPORT_JOBS_RETENTION_MS="abc"` のような非数値だと `parse` が throw し、best-effort 隔離に入る前に tick 全体（outbox prune 含む）が失敗する。既存の `OUTBOX_RETENTION_MS` / `PROCESSED_EVENTS_RETENTION_MS` と同一挙動なので**回帰ではない**が、env 設定面が2 var 分広がり、config typo の blast radius が拡大した点は記録に値する。`DEFAULT_*` フォールバックは「未設定」のみ救済し「不正値」は救済しない（z の仕様上妥当）。現状維持で許容範囲。

### [N-002] purge 用 `RequestContainer` が purge 対象ゼロでも毎 tick 再構築される — `app/worker/cloudflare/handlers.ts:167`

`createRequestContainer(readRequestServerConfig(env))` を try 内で毎 tick 構築。LLM/OCR/PDF/objectStorage adapter も併せて生成されるが、コンストラクタは文字列 stash のみで安価（ADR-005 で許容済み・`serverCloudflare.ts` コメント参照）。日次 tick の per-tick コストとして妥当で対応不要。コンテナ構築自体を try 内に置いているのは正しい設計（構築失敗・`readRequestServerConfig` 失敗も outer catch で握れ、outbox の確定削除を巻き戻さない）。

### [N-003] 「同一 tick で新規 expired 化された行は当 tick で prune されない」claim はドメイン実装に裏付けあり — `app/worker/cloudflare/handlers.ts:107-110` / `app/core/domain/export/entity.ts:363`

handlers.ts の doc コメントが「purge で expired 化した行は `updated_at = now ≥ cutoff` なので同 tick では prune されない」と主張する。`ExportJob.expire` が `updatedAt: now` を確定（entity.ts:363）し、`exportJobRepository.save` がその値を永続化（`toRowValues` 経由）するため、claim は正しい。R2 削除に失敗した expired 行を即時に同 tick で prune してしまう懸念は構造的に発生しない（ADR-003 の残存 orphan リスクは「次回以降の tick」での話に限定され、purge→prune 同 tick 競合は無い）。load-bearing な claim が実装と一致していることを確認。

---

## 補足（良い点 / 確認済み）

- ADR-006 の `ConsumerContainer` への `jobStatePruner` forward（`di/types.ts:365-372` / `serverCloudflare.ts:974`）は、`dispatchDomainEvent` 経由の handler 群が `WorkerContainer` を要求する型包含を正しく復元。worker 専用ポート forward の既存機構（`outboxRepository` 等）と一貫。
- `runPruneTick.test.ts` が (1) purge→export-prune の順序、(2) purge throw 時の後続 prune 継続（AC-7/9）、(3) 各テーブル retention の取り違えなし（no swap）、(4) outbox throw 時の早期離脱を検証しており、配線の不変条件をカバー。
- D1 述語は `inArray(status, terminalSet)` + `lt(updatedAt, cutoff.toISOString())` を `mapDbError` でラップし `returning({id})` で件数化。`updated_at` の ISO8601 UTC text 比較は既存 `findExpired` / llm prune と同前提で正しい。
</content>
</invoke>
