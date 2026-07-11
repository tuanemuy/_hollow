# Review 003 — Test（テスト網羅性・テスト設計）

- 対象: PR #834（Issue #468: source blob のストレージ衛生）
- 観点: カバレッジ / アサーション実効性 / 独立性 / 決定性 / spec・testcases 同期
- 前提: ゼロベースのフルレビュー。既知の見送り（purge スループット上限・malformed 行の listing 耐性・reconcileRefs の構造的封鎖 — adr.md 記録済み）は対象外。
- 実行確認: `sweepAbandonedSourceIntakes.test.ts` / `service.test.ts` / `runPruneTick.test.ts`（42 件）green、`pnpm test:integration`（68 files / 844 tests）green をローカルで確認。

## 受け入れ基準とテストの対応

| AC | 担保 | 判定 |
|---|---|---|
| AC-1（保持ポリシーの明文化） | ドキュメント成果物（adr.md ADR-001、`spec/domains/media.md` 保持ポリシー節）。テスト対象外の性質で、manual-test 確認項目6で存在確認済み | 充足 |
| AC-2（put 成功・UoW ロールバック → 自動回収） | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」で blob 残存 → sweep → purge → blob+行消滅まで実 DB/実ストレージで実証。put 失敗側も「leaves a reclaimable pending row and no blob」で回収完走まで検証 | 充足 |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・sweep→purge 順序・失敗 swallow・戻り値契約不変）+ `handlers.integration.test.ts` の 2-tick 実 DB/R2 経路（container→adapter の seam を実経路で検証） | 充足 |
| AC-4（猶予内の誤回収防止） | sweep integration「skips a pending source still inside the grace window」、D1 repo test の RECENT 除外 + strict `<` 境界（cutoff 同時刻除外）、service unit の cutoff 演算境界。E2E テストで再 commit 済み attached source の無傷も確認 | 充足 |
| AC-5（既存フロー退行なし） | 既存の commit 正常系（#452 source 束縛）・overwrite 差し替え（#452 orphan 化）・purgeOrphans 系テストは無変更のまま green。integration 全 844 件 green | 充足 |

## レイヤー別カバレッジ（計画テスト方針との照合）

- ドメイン unit（service.test.ts）: cutoff 計算・strict `<` 境界・kind 除外・limit 委譲 — 計画どおり
- アダプター integration（D1）: status/kind/cutoff フィルタ・oldest-first 並び・limit・strict `<` 境界 — 計画どおり
- アプリ unit（sweep）: fresh `findById` ガード（attached 遷移・消失の両腕）・per-row 失敗分離（failed 計上 + ログ + 他行続行）・正常 orphan 化 + イベント — 計画どおり（per-row 失敗分離の unit 移管は adr.md「実装時の追加決定」に記録済みで、`purgeOrphans` の既存テスト分担とも整合）
- アプリ integration（sweep）: orphan 化 + `media.orphaned` outbox 記録 + `updatedAt` 再スタンプ・猶予内スキップ・他 kind 非対象・クエリレベル冪等（意図コメント付き）・purge 接続・blob なし行の purge 完走（delete 冪等性契約の検証） — 計画どおり
- commit（ingestion integration）: ロールバック E2E・put 失敗・DataIntegrityError 両腕（行消失 / 非 pending 遷移） — 計画どおり + α（後述 N-002）
- worker: unit（配線・順序・失敗分離・戻り値契約）+ integration（2-tick 実経路、adr.md の追加決定どおり） — 計画どおり

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** `runPruneTick.test.ts` の既存「isolates a tag-merge prune failure without unwinding the tick」が、後続に追加された media hygiene ペアの実行を assert していない
  - 場所: `app/worker/cloudflare/__tests__/runPruneTick.test.ts`（tag-merge 失敗分離テスト、L289 付近）
  - 理由: このファイルの確立した規約は「あるステップの失敗分離テストで、次のステップが実行されることを assert する」（例:「isolates an export-jobs prune failure: the tag-merge prune still runs」）。media ペアは tick 末尾に追加されたのに、直前ステップ（tag-merge）の失敗テストは拡張されていない。ミューテーション観点では「tag-merge の catch 内で early `return { outboxDeleted, processedEventsDeleted }` する」変異が現行の全 unit テストを通過する（戻り値・エラーログ 1 件の assert は満たされ、sweep/purge のスキップは検出されない）。新配線の「他ステップ非阻害」担保が片方向（sweep 失敗 → purge 続行）に留まっている。
  - 提案: tag-merge 失敗テストに `expect(mocks.sweepAbandonedSourceIntakes).toHaveBeenCalledTimes(1)`（および `mocks.purgeOrphans`）を追加し、ファイル内規約に揃える。

#### Notes

- **[N-001]** spec/testcases の同期が正確。`spec/testcases/media/index.md` の SweepAbandonedSourceIntakes テーブル 7 行は実装テストと 1:1 で対応し（per-row save 失敗の unit 担保・冪等の「クエリレベル」限定の意図まで spec 側に明記）、`spec/testcases/ingestion/index.md` の新 4 行も ingestion integration の新 4 テストと過不足なく一致する。`usecases/media.md` の PurgeOrphans にも「pruner tick から起動」が反映され、未配線という既存乖離の解消がドキュメントで追跡できる。
- **[N-002]** ロールバック E2E テスト（`ingestion.integration.test.ts` L774）は計画要求を超える実効的なアサーションを持つ: temp blob 保全（再 commit 可能性）、失敗 commit が outbox に `media.*` を漏らさないこと（ステージ (a) の「イベント collect なし」設計の検証）、同一 job の再 commit が放棄行と干渉せず完走すること、purge 後に生存 note の source blob が無傷であること。「回収される」だけでなく「回収してはいけないものが残る」側を同一テストで固定しており、誤回収リグレッションへの感度が高い。
- **[N-003]** 決定性の扱いが良い。strict `<` 境界の同時刻フレーク対策（クロックピン留め + 段階ごとのクロック前進）が計画どおり全 integration テストに適用され、意図がコメントで説明されている。実クロックを使う唯一のテスト（handlers 2-tick）も 25h バックデートで 24h 猶予に対し 1h のマージンを持ち、`OBJECT_STORAGE` binding 欠落時は明示的に fail する。独立性も問題なし（モジュールレベルの id 連番は単調増加で衝突せず、コンテナは per-test truncate）。
- **[N-004]** `findAbandonedSourceIntakes` のクエリ意味論（strict `<`・kind 限定・oldest-first）が 3 箇所に複製されている: D1 実装、`service.test.ts` の `InMemoryRepo`、sweep unit の `MutableFakeRepo`。両フェイクに「D1 実装と一致させる」コメントがあり、D1 integration テストが正本として境界・並びを直接検証しているため現状は安全だが、ポート契約を変える際は 3 箇所同時更新が必要になる。将来触るときはフェイクの共有化を検討する価値がある。
- **[N-005]** DataIntegrityError ガードのテスト（`uowRuns === 3` で第 3 UoW 直前に行を変異）は usecase 内部の UoW 呼び出し回数に結合している。ただし想定しうるトポロジ変化（UoW の追加・移動）はいずれも「commit が成功して `expect.fail` が発火」という loud failure に倒れることを確認済みで、silent false-pass の経路は見つからなかった。結合自体はコメントで文書化されている。任意の強化として、catch 後に `expect(uowRuns).toBe(3)` を置くとトポロジのピン留めが自己検証になる。
- **[N-006]** sweep usecase の `batchSize` オプションがそのまま `MediaService.listAbandonedSourceIntakes` の limit に渡ること自体は直接 assert されていない（limit の挙動は service unit / D1 integration で担保。引数取り違えは既存テストが間接的に検出する配置になっている）。実害シナリオは薄いので現状可だが、unit の fake repo は limit を尊重する実装なので 1 assert 追加のコストで閉じられる。
- **[N-007]** ADR-002 で新設された `ObjectStorage.delete` 冪等性のポート契約が、JSDoc だけでなく実行可能なテスト（blob なし行の purge 完走 — sweep integration と ingestion put 失敗 E2E の 2 経路）で固定されている点が良い。将来アダプターを追加した際に契約違反が purge の `deleting` stall として即座に検出できる形になっている。
