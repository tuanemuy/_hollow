# Review 002 — Test（テスト網羅性・テスト設計）

レビュー対象: PR #834（Issue #468: source blob のストレージ衛生）
レビュー方式: ゼロベースのフルレビュー（`gh pr diff 834` 全文精読 + working tree 照合）

## 検証サマリー

受け入れ基準とテストの対応を全数トレースした。

| AC | 担保するテスト | 判定 |
|---|---|---|
| AC-1（ポリシー明文化） | ドキュメント成果物（spec/domains/media.md ほか）。自動テスト対象外、manual TC-006 で確認済み | 充足 |
| AC-2（rollback → 自動回収） | `ingestion.integration.test.ts` の rollback → sweep → purge E2E と put 失敗 → 回収 E2E の2本。blob/行/temp/job の残存状態まで assert | 充足 |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・順序・swallow・戻り値契約）+ `handlers.integration.test.ts` の実DB 2-tick 経路（container → D1/R2 の実配線） | 充足 |
| AC-4（grace window） | sweep integration「猶予内スキップ」、D1 adapter「strict `<` 境界（updatedAt == cutoff 除外）」、domain service「cutoff 計算の境界」の3層 | 充足 |
| AC-5（既存フロー無退行） | 既存の commit 正常系（#452: attached/refCount=1/sourceFileId 束縛/temp 回収）・overwrite 差し替え（旧 source orphan 化）テストが新実装の経路をそのまま通る | 充足 |

spec/testcases との同期: `spec/testcases/media/index.md` の Sweep テーブル 7 行、`spec/testcases/ingestion/index.md` の追加 2 行は、いずれも対応する実テスト（integration 5 本 + unit 4 本 + ingestion E2E 2 本）に 1:1 で追跡できる。per-row 失敗分離と fresh ガードを unit（フェイク変異注入）に振った判断は adr.md「実装時の追加決定」に記録済みで、integration テスト側のコメントにも「この経路ではガードは exercise されない」と明示されており、分担の意図が読める。

フレーク対策: strict `<` 境界に対するクロックピン留め（`withFixedClock` / `withClock`）と sweep → purge 間のクロック前進が全チェーンテストで一貫して適用されている。実クロック依存の `handlers.integration.test.ts` も 25h/24h の 1h マージン + updatedAt バックデートで決定的。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** main UoW の `SystemError(DataIntegrityError)` ガード（pending 行が消失/非 pending の fail-loud 経路）が一切テストされておらず、spec/testcases にも対応行がない
  - 場所: `app/core/application/ingestion/commitIngestionPreview.ts:261-266` / `spec/testcases/ingestion/index.md:44-49`
  - 理由: plan.md の「リスクと注意点」が「null / 非 pending への防御（SystemError）を必ず入れる」と明記し、`spec/usecases/ingestion.md` のステージ (b) にも「null / 非 pending は `SystemError(DataIntegrityError)`」と仕様化された観測可能挙動なのに、テストが 1 本もない。sweep 側の同型ガード（fresh `findById`）は unit フェイクで丁寧に検証しているのと非対称。ガードの条件が反転・脱落しても（例: `!isPending` を落として非 pending 行を `markAttached` に通す）現行スイートは全て green のまま。spec/testcases のテーブルにも行がないため 1:1 同期原則からも漏れている。
  - 提案: integration で実経路のまま駆動できる — `commitIngestionPreview` の UoW 呼び出しは (1) job projection 読み (2) stage (a) 小 UoW (3) main UoW の順なので、`base.unitOfWorkProvider` を run 回数カウント付きデコレータで包み、3 回目の直前に `db.delete(mediaAssets)` で行を消してから委譲すれば、`SystemError(DataIntegrityError)` の throw と main UoW 全体のロールバック（note 未作成）を assert できる。併せて `spec/testcases/ingestion/index.md` に行を追加する。
- **[W-002]** rollback / put 失敗テストが outbox の無汚染を assert しておらず、「stage (a) はイベントを collect しない」という設計決定（spec/usecases/ingestion.md「イベント collect なし」）がテストで固定されていない
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:815-830`（rollback 後の残存状態 assert 群）、同 `:910-925`（put 失敗側）
  - 理由: `MediaAsset.create` は `media.created` の eventDraft を返す（`app/core/domain/media/entity.ts:315`）。stage (a) の小 UoW は意図的にこれを捨てているが（`commitIngestionPreview.ts:442` のコメント）、将来のリファクタで `collectEvents` を足すと、小 UoW は独立コミットのため **commit が失敗しても** `media.created` が outbox に永続化される退行になる。現行テストは media 行・blob・temp・job の残存は確認するが outbox には触れないため、この退行は検出されない。sweep 側は `media.orphaned` の outbox 記録を厳密に assert している（件数まで）のと対照的。
  - 提案: rollback / put 失敗テストの残存状態 assert に `outbox_events` が空（少なくとも `media.*` が 0 件）である確認を 1 行ずつ追加する。
- **[W-003]** 「失敗した commit は再試行できる」という回復ストーリーが状態 assert（temp 保全・job previewing）のみで、実際の再 commit 成功は一度も exercise されていない
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:832`（"the same job can be re-committed"）、同 `:920`（"the commit can simply be retried"）
  - 理由: AC-2 のユーザー可視の回復経路は「放棄行は掃除される」だけでなく「同じ job をやり直せる」ことまで含む。テストコメントは再 commit 可能と主張するが、放棄された `pending/source` 行が残った状態での 2 回目の commit（新 mediaId で新 pending 行 + blob を作り、旧行は sweep 行き）は実際には走らせていない。旧行との干渉（例えば将来 `owner+kind` 系の一意制約や「既存 pending があれば再利用」ロジックが入った場合）はこのテストがないと無検出。
  - 提案: rollback テストの末尾（sweep 前）で正しい入力による 2 回目の `commitIngestionPreview` を実行し、note 作成成功・新 source が attached・放棄行が pending のまま残る（その後 sweep で 1 件だけ orphan 化される）ことを assert する。既存テストの拡張で済み、新規セットアップ不要。

#### Notes

- **[N-001]** spec/testcases テーブルと実テストの 1:1 対応が良く維持されている。テスト分担の逸脱（per-row 失敗分離・fresh ガードを unit に振る、prune tick 実DB検証を 2-tick + バックデートにする）がすべて adr.md に決定として記録され、テストコード側のコメントにも意図（「orphan 行は候補クエリに載らないためこの経路ではガードを通らない」等）が書かれており、後続の読者が「なぜこの層でテストするのか」を追える。
- **[N-002]** strict `<` 境界の担保が 3 層（domain service の cutoff 計算 / D1 adapter の `updatedAt == cutoff` 除外 / チェーンテストのクロック前進）で一貫しており、計画レビュー（S-001）で指摘された同時刻フレークが構造的に排除されている。`handlers.integration.test.ts` の実クロック使用も 1h マージンで安全。
- **[N-003]** `ObjectStorage.delete` の冪等性契約（missing key = 成功）の検証は application helpers の `InMemoryObjectStorage` に対してのみで、実 R2 アダプターの当該性質を固定するテストはない。現行実装は `bucket.delete` 素通し（`app/core/adapters/cloudflare/r2ObjectStorage.ts:124-133`）で構造的に契約を満たすため実害はないが、アダプターに head-before-delete のような変更が入っても落ちるテストがない点は認識しておくとよい（`handlers.integration.test.ts` の実 R2 経路は blob ありのケースのみ）。
- **[N-004]** `findAbandonedSourceIntakes` の第2ソートキー（`updatedAt` 同値時の `id ASC` タイブレーク、`app/core/adapters/d1/repositories/mediaAssetRepository.ts:195`）は未検証。D1 の deferred-batch は同一 UoW 内の行に同一タイムスタンプを刻むため同値は実際に起こるが、影響はバッチ内の順序決定性のみで回収漏れは生じない。既存 `findPurgeableOlderThan` と同じ扱いなので現状維持で妥当。
- **[N-005]** `sweepAbandonedSourceIntakes` の `batchSize` オプションの usecase 層での貫通は未検証（limit 自体は domain service と D1 adapter の両層でテスト済み）。単純な passthrough なので優先度は低い。
- **[N-006]** sweep の JSDoc が fresh ガードの限界（deferred-batch UoW では再読〜flush 間の残余窓は閉じない）を正直に文書化しており、unit テストがガードを「実効」と過大表現しない設計になっている点は誠実で良い。
