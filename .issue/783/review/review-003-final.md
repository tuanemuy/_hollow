# レビュー Round 3（最終フルレビュー / 収束確認）— Issue #783 / PR #792

**日付:** 2026-06-27
**レビュアー:** シニアレビュアー（最終確認）
**対象:** PR #792（`gh pr diff 792`）/ `.issue/783/plan.md` / `.issue/783/adr.md`
**目的:** Round 1/2 修正の収束確認、AC-1〜AC-9・ADR-001〜006 の実装＋テスト整合、CLAUDE.md 規約準拠の最終確認

## Verdict

**APPROVED**（Blockers: 0 / Warnings: 0 / Notes: 2）

全レイヤー（Use Case / Worker / Adapter / DI / Test / wrangler）を横断でゼロベース確認した。実装は既存 prune 群（outbox / processed-events / activity-log / llm-call-log）の確立パターンに厳密に一致し、依存方向（ポート → container 型 → usecase → アダプタ → tuning → 配線 → DI）も内向きに正しく並ぶ。`pnpm typecheck` クリーン、対象ユニットテスト 38 件 pass を確認済み。新規 Blocker / Warning は検出されなかった。

---

## Blockers

なし。

---

## Warnings

なし。

---

## Notes（任意・将来検討、修正不要）

- **[N-001] 統合テストで purge の `completed→expired` 遷移そのものは駆動されない**
  — `app/worker/cloudflare/__tests__/handlers.integration.test.ts:490`（e2e）/ `:230`
  e2e の `seedExportJobRow` は `expiresAt: null` で seed するため、purge の `findExpired`（`status='completed' AND expiresAt<now`）に拾われず、purge は同 tick で実遷移しない（SQL の `NULL < now` は false 相当で正しくスキップ）。結果として e2e は「prune の container→adapter→DELETE seam」と「completed が prune されず残存」を正しく固定するが、purge の expire 実遷移は実 D1 では未踏。ただし purge のロジックは本 Issue でスコープ外（無変更）であり、purge の配線（前段順序・best-effort 隔離・called-once）は `runPruneTick.test.ts` で十分に固定されているため、責務分担として妥当。将来 purge 自体を強化する Issue で expire 実遷移の e2e を足すと網羅が閉じる。Blocker/Warning ではない。

- **[N-002] purge throughput（`PurgeExpiredExportsInput` のデフォルト limit 100/tick）**
  — `app/core/application/export/purgeExpiredExports.ts:12`
  既知の見送り事項（Phase 4 フォローアップ候補）として再掲のみ。日次 tick で expire バックログが 100 件/日でしか減らないが、本 Issue の目的（恒久蓄積の bound）は retention prune 側で達成され、purge は完了済み artifact の R2 GC を漸進的に進める役割。蒸し返さない。

---

## 確認した収束ポイント（Round 1/2 修正の最終検証）

- **cutoff 境界テスト（lt, not lte）** — `jobStatePruner.integration.test.ts` で tag_merge / export 双方に `AT_CUTOFF`（cutoff 同値）行が**保持**されることを固定（`lt` セマンティクスの回帰を捕捉）。✔
- **retention 配線 pin（swap 検出）** — `runPruneTick.test.ts` が `exportJobsRetentionMs=9日` / `tagMergeJobsRetentionMs=11日` の**相異なる**モック値で transposed wiring を検出。`pruneExportJobs`/`pruneTagMergeJobs` への引数を `toHaveBeenCalledWith` で固定。✔
- **purge 可観測性ログ** — `handlers.ts:172` で `logger.info('[prune] expired N export(s)')`、失敗時 `:174` で `logger.error('[prune] expired-export purge failed')`。両方テストで固定。✔
- **e2e integration テスト** — `handlers.integration.test.ts:490` で実 D1 に対し `runPruneTick` が `D1JobStatePruner` を駆動し、古い終端を削除しつつ completed/非終端/recent を保持することを検証（mock 透過の回帰を遮断）。✔
- **called-once** — purge / export-jobs / tag-merge prune が各 `toHaveBeenCalledTimes(1)`。outbox throw 時は後続が全て `not.toHaveBeenCalled()`。✔

## AC トレーサビリティ（実装＋テスト）

| AC | 実装 | テスト | 判定 |
|----|------|--------|------|
| AC-1 tag_merge completed/failed prune | `jobStatePruner.ts:43` inArray | integration（old completed/failed 削除） | ✔ |
| AC-2 export 終端 prune・completed 除外 | `jobStatePruner.ts:28` `['failed','cancelled','expired']` | integration（completed 保持・artifact seed 付き） | ✔ |
| AC-3 非終端不可侵 | DELETE 述語に pending/processing 不含 | integration（old pending/processing 保持） | ✔ |
| AC-4 recent 保持 | `lt(updatedAt, cutoff)` | integration（recent terminal 保持） | ✔ |
| AC-5 日単位デフォルト | `DEFAULT_*_RETENTION_MS = 7日` | unit（定数アサート） | ✔ |
| AC-6 env から読む | `env.ts:46-55` coerce+default | `readPruneTuning` モック拡張 | ✔ |
| AC-7 best-effort 隔離 | `handlers.ts:166-195` 各 try/catch | unit（各失敗分岐） | ✔ |
| AC-8 artifact 不干渉（completed 構造除外） | アダプタ述語 | integration（old completed 保持） | ✔ |
| AC-9 purge 配線で連鎖が閉じる | `handlers.ts:166` 前段配線 + wrangler R2 binding | unit（purge→export 順序・隔離） | ✔ |

## ADR 整合

- ADR-001（専用ポート）: `JobStatePruner` を application/ports に新設、`D1JobStatePruner(db)` のみ依存。集約リポジトリ非汚染。✔
- ADR-002（1ポート2メソッド）: `pruneTerminalExportJobs` / `pruneTerminalTagMergeJobs`。✔
- ADR-003（export completed 除外）: アダプタ終端集合・JSDoc・テストで構造的に固定。✔
- ADR-004（7日 / テーブル別 env var）: `env.ts` + `wrangler.toml [env.pruner.vars]` コメント宣言一致。✔
- ADR-005（purge 別 RequestContainer・前段・R2 binding）: `handlers.ts:166-177` + `wrangler.toml [env.pruner] r2_buckets`/`R2_OBJECT_BUCKET_NAME`。✔
- ADR-006（`jobStatePruner` を `ConsumerContainer` の Pick に追加）: `types.ts:371` + `serverCloudflare.ts:974` forward。typecheck で包含関係復元を確認。✔

## CLAUDE.md 規約準拠

- レイヤー分離・依存方向: ポート（application）→ アダプタ（adapters/d1）→ DI、内向き厳守。✔
- エラー契約: アダプタは `mapDbError` で driver→shared 変換、usecase は再翻訳せず、worker 境界（`runPruneTick`）のみ best-effort catch。CLAUDE.md「worker → root」「adapter → application」に一致。✔
- コメント方針: 追加コメントは全て WHY（不変条件・ADR 参照・非自明制約）で、自明な言い換えなし。Issue/ADR 参照は設計根拠ポインタとして妥当（MEMORY 規約と一致）。✔
- env 検証境界: `readPruneTuning` が worker entry で coerce+default、ハードコードなし。✔

## 結論

Round 1/2 の全指摘が実装＋テストで収束し、新たな破綻は生じていない。Blocker・Warning ともになし。**APPROVED 相当**。
