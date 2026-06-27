# PR #792 レビュー — Round 2（観点: Test 網羅性・設計）

対象: Issue #783 / `.issue/783/plan.md`（テスト方針・AC-1〜AC-9）
レビュー種別: フルレビュー（ゼロベース）
判定: **APPROVED**（Blocker なし。中核不変条件はすべてテストで固定されている）

## サマリ

- Blockers: 0
- Warnings: 1
- Notes: 3

中核不変条件はいずれも実際に固定されている:

- completed 除外による artifact orphan 回避 → `jobStatePruner.integration.test.ts:156-193`（古い completed は年齢に関わらず保持。artifactKey を seed して回帰時に orphan が可視化される仕掛けまで入っている `:55-64`）
- 非終端不可侵（pending/processing） → 両テーブルで固定（`:118-119, 166-167`）
- `{deleted}` 件数一致 → `:123, 171` で実 DELETE 行数と一致を確認
- cutoff 境界（`updated_at == cutoff` は保持＝`lt` であり `lte` でない） → 両テーブルで pin（`:143-152, 195-204`）
- best-effort 隔離 → purge / export-jobs / tag-merge の各 throw を独立に隔離（`runPruneTick.test.ts:234-268`）＋ outbox throw 時は後続全停止（`:195-206`）
- retention 日単位 → `DEFAULT_*` 定数アサート（`pruneExportJobs.test.ts:162-164` / `pruneTagMergeJobs.test.ts:163-165`）
- purge → export 順序 → `runPruneTick.test.ts:208-219`（purgeIdx < exportIdx）
- retention 配線の非転置 → 別値モックで pin（`runPruneTick.test.ts:221-232`）
- AC-6 env parsing（default / override / 部分 default / 0・非数値の reject） → `serverCloudflare.test.ts:122-193` で網羅

status enum 網羅も確認: export 6状態（pending/processing/completed/failed/cancelled/expired, schema `:647`）・tag_merge 4状態（schema `:687`）とも integration テストが終端／非終端を漏れなくカバー。

## Warnings

### [W-001] `runPruneTick` 経由の実 D1 削除を end-to-end で固定するテストがない（兄弟 prune との非対称・best-effort 握りつぶしが回帰を隠す）
- 場所: `app/worker/cloudflare/__tests__/handlers.integration.test.ts`（`runPruneTick` describe `:273-435`）
- 事実:
  - 同ファイルの `runPruneTick` integration は outbox / processed_events / activity_log / llm_call_log については「実行を seed → `runPruneTick` 実行 → 行が消えた／残ったことを実 DB で assert」する確立パターンを持つ（`:274-354, 361-434`）。
  - 今回追加の `export_jobs` / `tag_merge_jobs` 終端行 prune は、この describe 内で **seed も削除 assert も追加されていない**。adapter SQL は `jobStatePruner.integration.test.ts` が直接検証するが、それは `runPruneTick` を経由しない。`runPruneTick.test.ts` は `pruneExportJobs` / `pruneTagMergeJobs` を丸ごと mock するため、実コンテナ→実 `D1JobStatePruner`→実 DELETE の継ぎ目は素通しになる。
- なぜ重要か: 本番 `runPruneTick` は両 prune を best-effort `try/catch` で握りつぶす（`handlers.ts:174-191`）。型システムが `jobStatePruner` フィールドの存在を保証し、unit が呼び出し回数・retention 配線を、adapter が述語を、それぞれ別個に固定しているため大半の回帰は層をまたいで捕捉される。しかし「`runPruneTick` が実コンテナ経由で実際に終端行を削除する」継ぎ目だけは無検証で、かつ握りつぶしにより runtime 失敗が静かに消える。兄弟 prune が持つ seeded-deletion integration を欠く非対称でもある。
- 提案: `runPruneTick` describe に1〜2ケース追加 — 古い `failed`(export) と古い `completed`(tag_merge) を seed し、`runPruneTick(prunerEnv())` 後に当該行が消え、古い `completed`(export) と新しい終端行が残ることを実 DB で assert する。これで継ぎ目と握りつぶしの両方をカバーできる。（plan テスト方針は「必要に応じ seed 追加」と任意化していたが、Test 観点では兄弟パターンとの整合上追加が望ましい。）

## Notes

### [N-001] usecase unit がポート呼び出しの「ちょうど1回」を pin していない
- 場所: `pruneExportJobs.test.ts:91-111` / `pruneTagMergeJobs.test.ts:92-112`
- plan テスト方針は「cutoff が `Date` で**一度だけ**正しく渡る」と記すが、テストは spy で受領 cutoff の値を assert するのみで `expect(...).toHaveBeenCalledTimes(1)` を持たない。二重呼び出し回帰は info ログ件数 `toHaveLength(1)` で間接的に弾けるが、`pruneTerminalExportJobs`/`pruneTerminalTagMergeJobs` への直接の呼び出し回数アサートを足すと意図がより明確になる。低優先。

### [N-002] purge の完全連鎖（completed→expired→R2 delete）が pruner integration で実行されていない
- 場所: `handlers.integration.test.ts`（`runPruneTick` describe）
- AC-9 の purge 配線は `runPruneTick.test.ts:208-245` で「順序」「throw 隔離」を mock で固定し、integration happy-path は実 `createRequestContainer` を unmock で構築・実行する（buildability は exercise 済み）。ただし completed-expired 行を seed して purge→expire 遷移→prune（次 tick 相当）まで通す end-to-end は無い。`purgeExpiredExports` 本体ロジックは無変更（スコープ外）かつ既存テストが別途あるため Blocker ではないが、W-001 のケース追加と合わせて completed→expired→prune の連鎖を1ケースで通すと AC-9 の運用主張が直接担保される。

### [N-003] purge が WorkerContainer と別の RequestContainer を使う点はテストで明示されていない
- 場所: `runPruneTick.test.ts:38-58`
- mock は `createWorkerContainer` と `createRequestContainer` を共に `{ logger }` で返すため、purge に渡るコンテナの出所は区別されない。`purgeExpiredExports` は型上 `RequestContainer` を要求するので worker container を渡す回帰は typecheck で落ちる（型安全でカバー済み）。テスト上の追加対応は不要だが、ADR-005 の「別コンテナ構築」を pin したい場合は `createRequestContainer` の呼び出しを assert する余地がある。低優先。

## 確認した良い点（回帰防止として価値が高い）

- `jobStatePruner.integration.test.ts:55-64` — completed/expired に artifactKey を seed し、completed を prune する回帰が「ライブ artifact の orphan 化」として可視化される仕掛け。ADR-003 の中核不変条件を最も鋭く守っている。
- cutoff 境界（`AT_CUTOFF`）を両テーブルで独立に pin（`:143-152, 195-204`）— `lt`/`lte` 取り違えを確実に捕捉。
- `runPruneTick.test.ts:26-28, 221-232` — export/tag_merge の retention を別値（9日/11日）にして配線転置を検出。本番 default が両者 7日で隠れる問題を回避する良い設計。
- `serverCloudflare.test.ts:122-193` — AC-6 を default/override/部分/不正値 reject まで網羅。ハードコード禁止・DEFAULT フォールバックを直接固定。
