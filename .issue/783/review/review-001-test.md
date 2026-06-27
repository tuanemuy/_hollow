# レビュー Round 1 — Test（テスト網羅性・設計）

対象 PR: #792 / Issue #783
観点: テスト網羅性・設計

総評: AC-1〜AC-9 の中核不変条件（export `completed` 除外による artifact orphan 回避、非終端行の不可侵、`{deleted}` 件数一致、best-effort 隔離、retention デフォルト日単位）はいずれも**実際に固定**されており表面的でない。特に export の「古い completed を年齢に関わらず保持」を専用テストで二重に固定している点、隔離マトリクス（purge / export / tag-merge の各 throw を独立に検証）が網羅的な点は良質。Blocker はなし。境界値とtick内 retention 配線の2点に coverage gap が残る。

## Test

### Blockers
なし

### Warnings

- **[W-001]** cutoff ちょうど（`updated_at == cutoff`）の境界値が未検証
  - 場所: `app/core/adapters/d1/__tests__/jobStatePruner.integration.test.ts:22-24, 105-181`
  - 述語は `lt(updatedAt, cutoff)` で、cutoff と完全一致する行は「保持」が正。だが integration の seed は `OLD`（2026-06-10, cutoff より前）と `RECENT`（2026-06-25, cutoff より後）のみで、`updated_at == CUTOFF`（2026-06-20T00:00:00.000Z）の行を一切 seed していない。`lt` を `lte` に取り違える回帰（保持すべき境界行を誤って削除）をどのテストも捕捉できない。レビュー方針が明示的に挙げた「境界値（cutoff ちょうど）」が抜けている。tag_merge / export 各1行、cutoff と同一 `updated_at` の終端行を seed し「保持・deleted に含まれない」を固定すべき。

- **[W-002]** `runPruneTick` の tick 内では job-state prune の retention 配線が一切 pin されていない
  - 場所: `app/worker/cloudflare/__tests__/runPruneTick.test.ts:141-148, 203-250` / `app/worker/cloudflare/__tests__/handlers.integration.test.ts:273-432`
  - unit 側は `pruneExportJobs` / `pruneTagMergeJobs` を完全 mock し、呼び出し回数・順序・隔離は検証するが `toHaveBeenCalledWith` 等の引数アサートが無いため、`runPruneTick` が `tuning.exportJobsRetentionMs` を export prune に、`tuning.tagMergeJobsRetentionMs` を tag-merge prune に**正しく渡しているか**は未検証（取り違えても両 default が 7 日で等しいため実害も顕在化しにくく、なお検出されない）。integration 側（`handlers.integration.test.ts`）は `export_jobs` / `tag_merge_jobs` 行を一度も seed しないため、tick 経由の削除は「例外なく完走する」スモークに留まり、実削除は standalone アダプタテストでしか観測されない。結果として「`runPruneTick` → 正しい retention → 終端行が実削除される」end-to-end を固定するテストが存在しない。`toHaveBeenCalledWith({ retentionMs: tuning.exportJobsRetentionMs })` 相当の引数アサート追加、または integration に終端行 seed を1ケース足して tick 経由削除を観測するのが望ましい。AC-9 についても、purge は全 integration 実行で no-op（`completed`+期限切れ export を seed しないため）であり、tick 内で purge が `completed → expired` を実際に進める挙動は integration では観測されていない（purge ロジック自体は既存テスト済み・無変更のため許容範囲だが、配線の end-to-end 確証は弱い）。

### Notes

- **[N-001]** export の `completed` 除外（artifact orphan 回避 / ADR-003）を二重に固定しており強い。混在 seed テスト（`:144-169`）で `oldCompleted` を保持リストに含めつつ `oldFailed/oldCancelled/oldExpired` を削除、加えて専用テスト（`:171-181`、`veryOld = 2020-01-01`）で「年齢無関係に completed 保持・deleted=0」を固定。さらに `seedExportJob` が `completed`/`expired` に `artifactKey` を実際に付与し、回帰時に orphan が可視化されるコメント根拠も明確。最重要不変条件が表面的でなく固定されている。

- **[N-002]** tag_merge と export の終端集合の非対称（tag_merge は `completed` を含む / export は除外）を、tag_merge テストで `oldCompleted` を削除側に、export テストで `oldCompleted` を保持側に置くことで明確に対比固定している。

- **[N-003]** best-effort 隔離の検証マトリクスが網羅的（`runPruneTick.test.ts:190-250`）。outbox throw は伝播（後続 prune 全て未呼び出しを確認）、purge / export-jobs / tag-merge の各 throw は独立に隔離され `error` ログ1件のみ・後続継続・返り値契約不変を固定。purge が export prune より前に走る順序（`:203-214`）も `mocks.calls` 配列で実証。CLAUDE.md「worker → root」の per-row tolerance を正しく反映。

- **[N-004]** DI tuning テスト（`serverCloudflare.test.ts:125-176`）が default / env override / 独立 default / 非正数・非数値の reject を網羅。`exportJobsRetentionMs` だけ指定時に `tagMergeJobsRetentionMs` が独立に default へ落ちること、`"0"` / `"forever"` が throw することを固定し、ADR-004「テーブルごと独立 env var」を pin。

- **[N-005]** unit の `DEFAULT_*_RETENTION_MS` を `7 * 24 * 60 * 60 * 1000` でアサート（`pruneExportJobs.test.ts:162-164` / `pruneTagMergeJobs.test.ts:163-165`）し AC-5「日単位」を定数で固定。cutoff = `clock.now() - retentionMs` の `Date` 化・`{deleted}` 素通し・構造化ログ（deleted/retentionMs/cutoff）・0件ログも `pruneProcessedEvents` 前例を忠実に踏襲。

- **[N-006]** （軽微）unit で prune ポートメソッドの呼び出し回数（`toHaveBeenCalledTimes(1)`）を明示アサートしていない。JSDoc の「computed once」は spy の上書きで間接的にしか担保されない。実装が trivial な単一呼び出しのため実害は小さいが、回数アサートを足すと「一度だけ」がより明示的になる。

- **[N-007]** （軽微）integration helper の module-level mutable counter（`exportSeq` / `mergeSeq`、`:40, 67`）はファイル内逐次実行前提で ID 衝突を避ける作りで、各テストは `createTestContainer()` で独立 DB を張るため独立性は保たれている。並列化方針が変わると脆くなりうる点のみ留意。
</content>
</invoke>
