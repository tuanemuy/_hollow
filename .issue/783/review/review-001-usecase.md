# レビュー — Issue #783 PR #792（Use Case / Worker 観点）

対象 PR: #792
レビュー視点: アプリケーション層（prune usecase / runPruneTick 配線 / purge 配線 / retention tuning / best-effort 隔離 / レイヤー責務）

## 総評

既存 prune 群（outbox / processed-events / activity-log / llm-call-log）の確立パターンに極めて忠実。新 usecase 2本は `pruneProcessedEvents` と寸分違わぬ構造（`cutoff = clock.now() - retentionMs` → ポート呼び出し → 構造化 info ログ → `{ deleted }` 返却）で、retention は env から `pruneTuningSchema` で coerce/default され、ハードコードはない。`runPruneTick` の best-effort 隔離・purge を export-jobs prune の前段に置く順序・返り値契約の不変はいずれも AC-7/AC-9 を満たす。ADR-003（completed 除外）/ADR-005（案Y）/ADR-006（ConsumerContainer Pick）はコードと完全整合。テスト（usecase unit / D1 integration / runPruneTick 配線 unit）も AC を検証可能な形で固定している。

Blocker は無い。スケール時の purge スループット上限（後述 W-001）を Warning として、残りは Note として記録する。

### Use Case / Worker

#### Blockers
- なし

#### Warnings

- **[W-001]** purge を `input: {}`（default limit 100）で日次1回呼ぶため、completed→expired の変換スループットが最大 100 件/日に固定される。
  - 場所: `app/worker/cloudflare/handlers.ts:168`（`purgeExpiredExports({ container: purgeContainer, input: {} })`）／ `app/core/application/export/purgeExpiredExports.ts:12,25`（`DEFAULT_LIMIT = 100`）
  - 理由: AC-9 のゴールは export `completed` 行を「無限蓄積させない」ことだが、purge は1 tick あたり最大 `DEFAULT_LIMIT=100` 行しか expire 化せず、cron は日次（`wrangler.toml:296` `0 3 * * *`）。したがって completed→expired の最大変換速度は約 100 件/日。(a) 本 PR で purge を初配線するため、これまで一度も走っていない分の expiry 適格 completed 行が初回に大量に滞留しうる（100/日では長期間ドレインが続く）。(b) 定常運用でも「1日に expiry を迎える export 数 > 100」のデプロイでは変換が流入に追いつかず、completed 行が事実上 unbounded に蓄積し AC-9 をスケール時に満たせない。purge ロジック自体の変更（limit 引き上げ・tick 内ループ）は本 Issue スコープ外だが、配線時に `input: {}` を選んだ点（=既定 100）はこの PR の判断であり、throughput 上限が AC-9 の達成度を左右することは認識・記録しておくべき。
  - 提案: 最低限、本 PR の判断記録（plan/ADR か PR 説明）に「purge は 100 件/tick・日次のため大規模デプロイでは completed のドレインが流入に追いつかない可能性があり、その場合は purge の limit 引き上げ or tick 内反復を別 Issue 化する」と明記する。可能なら `purgeExpiredExports` を残件が無くなるまで反復呼び出しする（既存ロジック非改変のまま `runPruneTick` 側でループ）か、`input` に大きめの limit を渡す配線も検討に値する。
  - **→ 見送り（本PR）/ Phase 4 フォローアップ候補:** purge の `DEFAULT_LIMIT=100` は1 tick を有界に保つ purge 側の意図的設計であり、tick 内ループでの無制限ドレインは Cloudflare Workers の duration/CPU 上限リスクを伴う（既存 prune と異なり purge は per-row UoW + R2 delete を伴うため重い）。hollow は個人向けノートアプリで export は低頻度のため steady-state の expiry レートは 100/日を大きく下回り、AC-9 は実運用スケールで満たされる。初回バックログ・大規模デプロイ時の throughput はスコープ外の purge 設計に属するため、Phase 4 で「purge throughput / backlog drain（limit 引き上げ or tick 内反復）」のフォローアップ Issue 化を検討する。配線（`input: {}` = 既定 100）自体は本 PR では維持。

#### Notes

- **[N-001]** purge の `collectEvents(eventDrafts)` は別途構築した `RequestContainer` の UoW 経由で outbox に**トランザクショナル永続化**され、pruner とは別 cron の relay worker が拾って dispatch する。pruner 側に `waitUntil` でのキュー直接 produce は不要で、outbox の at-least-once 機構に正しく委ねられている（懸念点に挙がっていた「collectEvents 経由の outbox 書き込みが relay で拾われるか」は問題なし）。
- **[N-002]** `createRequestContainer(readRequestServerConfig(env))` と `purgeExpiredExports(...)` がいずれも purge の `try/catch` 内（`handlers.ts:167-168`）にあるため、config 読み取り失敗・コンテナ構築失敗・objectStorage unavailable（R2 binding 欠落時の `StorageUnavailableError`）も含めて tick 全体に波及せず `logger.error` で握りつぶされる。best-effort 隔離として堅牢（CLAUDE.md「worker → root」に整合）。
- **[N-003]** `getDatabase`（`app/core/adapters/d1/client.ts:12`）は memoize せず毎回 `drizzle()` を生成するため、`runPruneTick` 1回につき `createWorkerContainer` と purge 用 `createRequestContainer` で D1 ハンドルが2つ作られる。`drizzle()` は binding をラップするだけで安価、かつ同一 D1 binding を指すため整合性問題はない。ADR-005 の「per-tick の追加構築コストとして許容」と一致。重複構築は副作用なし。
- **[N-004]** export 終端集合 `["failed","cancelled","expired"]` / tag_merge `["completed","failed"]` は D1 アダプタの DELETE 述語（`jobStatePruner.ts:28,43`）に文字列リテラルで直書きされる。`inArray(exportJobs.status, [...])` は schema の status enum に型付けされるためタイポはコンパイルエラーになるが、「どの status が終端かつ artifact-free か」という意味的網羅性は型で保証されない。将来 export に新たな終端 status（artifact 有無含む）が追加されても本述語は自動更新されず検出もされない。ただしこれは既存 prune 群と同じ設計で ADR-003 の明示的判断（終端定義をアダプタの述語にエンコード）であり、ドメイン不変条件は JSDoc で根拠参照されているため、現時点では受容可能。新終端 status 追加時の更新ポイントとして認識しておけば十分。
- **[N-005]** `WorkerContainer` 型拡張の波及（`jobStatePruner` 必須フィールド）は本番 `createWorkerContainer`、共有 integration ヘルパー2本（`app/core/application/__tests__/helpers.ts:171` / `app/core/adapters/d1/__tests__/helpers.ts:156`）、`pruneProcessedEvents.test.ts:82`、`ConsumerContainer` の Pick + `createConsumerContainer`（ADR-006）すべてに漏れなく反映済み。`ConsumerContainer ⊇ WorkerContainer` 不変条件の復元（ADR-006）も dispatch handler 群が `WorkerContainer` を要求する事実に基づき正しい。
- **[N-006]** retention は `z.coerce.number().int().positive().default(DEFAULT_*)` で coerce/検証され、`wrangler.toml [env.pruner.vars]` に `DEFAULT_*` と一致する値・コメント付きで宣言（`604800000` = 7日）。`positive()` により 0・負値・非数は env 由来でも default にフォールバックせず reject（厳密には coerce 失敗で parse エラー）するため、不正値での無音縮退は起きない。エッジ（0件 → ログのみ／巨大 retention → cutoff が過去すぎて何も消さない）も既存パターン同様に安全。
- **[N-007]** AC 対応状況: AC-1（tag_merge completed/failed 削除）/AC-2（export 終端削除・completed 除外）/AC-3（非終端不可侵）/AC-4（recent 保持）/AC-8（completed 構造的除外）は D1 integration テストで固定。AC-5（日単位 default）は usecase unit の定数アサートで固定。AC-6（env 由来・ハードコードなし）は `env.ts` + `wrangler.toml` で充足。AC-7（best-effort 隔離）/AC-9（purge 前段配線・連鎖クローズ）は `runPruneTick.test.ts` で順序・隔離を検証済み。アプリケーション層に関わる AC はすべて実装・テストで裏付けられている。

## サマリー
- Blockers: 0 / Warnings: 1 / Notes: 7
