# レビュー #580 PR #782 — Test（網羅性・テスト設計・回帰防止）

対象: タグ統合の非同期ジョブ化（`TagMergeJob` アグリゲート + enqueue/run/get + relay デコーダ + UI determinate バー）

実行確認:
- `pnpm test:unit`（全体）: 272 files / 4236 tests すべて green。新規の domain（entity/valueObject）・`mergeJobEventDecoders`・`dispatchDomainEvent`・`errorCodeNaming`・`TagList.test.tsx`（happy-dom）を含む既存テストのグリーン維持を確認。
- `pnpm test:integration`（tagMergeJob 系）: ローカルのタイムアウトで完走前に打ち切り（exit 143）。出力末尾は workerd の teardown ノイズで失敗ではない。クリーンな集計は取得できなかったが、テスト記述自体は健全。

総評: テスト層の振り分け（unit/integration/frontend）・命名規約・fake 方針は `docs/test.md` に正しく従っている。ドメイン不変条件・状態遷移・所有者検証・冪等再開・並走 source 先行削除・デコーダ回帰・OCC/JSON ラウンドトリップ・dispatch ルーティングは押さえられており、Blocker なし。ただし AC-2（進捗の逐次更新）と AC-6（失敗）の **バックエンド側の核心経路が単一バッチ／正常完了に偏っており未検証**で、Warning として 3 件指摘する。

## Test

### Blockers

なし。

### Warnings

#### [W-001] 複数バッチの逐次進捗（AC-2 の核心）が一度も実行されない — `app/core/application/tag/__tests__/tagMergeJob.integration.test.ts` / `app/core/application/tag/runTagMergeJob.ts:13,173`

- **場所/理由:** `MERGE_NOTE_PAGE_SIZE = 500`（`runTagMergeJob.ts:13`）に対し、integration の全シナリオは source 保持ノートが 3 件以下（`tagMergeJob.integration.test.ts` の 3 件、`tag.integration.test.ts` は 1 件）。`processBatches` のループ（`runTagMergeJob.ts:173`）は**常に 1 回だけ**回り、`recordProgress` も終端で一度呼ばれるだけ。結果として「`processed` が `total` 未満のまま前進していく」という determinate バーの本質（AC-2 = 「処理が進むにつれて n/total が更新される」）が integration で一度も観測されない。検証されているのは単一バッチの最終状態 `processed === total` のみ。
- **影響:** バッチ間で `tag_merge_jobs.progress_processed` が中間値で永続化されるロジック（`baseProcessed + inspected + inspectedInBatch` の累積、各バッチ独立 UoW コミット）に回帰が入ってもテストが素通りする。crash-resume テスト（processing 1/3 → 完了）は「再入後に前進する」ことは見るが、これも残 2 件＝単一バッチで、複数バッチ跨ぎの中間 commit は通らない。
- **提案:** (a) `MERGE_NOTE_PAGE_SIZE` をテストから注入可能にする（runner の引数 or container 定数化）か、(b) `tag.merge.runner.pageSize` を小さく差し替えられる形にして、3〜4 件で 2 バッチを跨ぐシナリオを 1 本追加。バッチ 1 commit 後に `findById` で `0 < processed < total` を確認し、最終で `processed === total` を確認する。少なくとも「中間 progress 行が永続化される」ことを 1 本で押さえたい。

#### [W-002] runner の失敗経路（catch → `failJob` → status=`failed`）が integration で未検証 — `app/core/application/tag/runTagMergeJob.ts:90-98,281-301`

- **場所/理由:** `tag_merge_jobs.status = 'failed'` を生成するのは runner 末端の catch（`runTagMergeJob.ts:90`）→ `failJob`（`errorCode="tag_merge_run_failed"`, `errorReason=describe(error)`）だけ。だが integration の 4 シナリオは completed / 冪等 re-run / crash-resume completed / **twin 先行削除→冪等 complete** で、いずれも `failed` に到達しない（twin ケースは意図的に `complete` で握る＝ADR-006 S-003）。AC-6「統合失敗時にジョブが `failed` になる」のバックエンド半分が無検証。
- **影響:** entity 単体の `fail`（`entity.test.ts:81`）と、frontend の failed DTO 描画（`TagList.test.tsx:550`、pollMock で固定）は通るが、「実処理中の例外が catch され `failed` として `errorReason` 付きで永続化される」オーケストレーションは誰も通らない。`isConflictError/isNotFoundError` の判定漏れ・catch の取りこぼし・`failJob` の OCC 衝突などが回帰しても検出できない。
- **提案:** fault injection で `processBatches` / `finalize` を非 Conflict/非 NotFound のエラーで落とすシナリオを 1 本。実 DB で素直に作りにくいなら、`noteRepository.findById` 等が想定外エラーを投げる経路を container でラップして注入、もしくは runner の中核を関数分割してエラー注入可能にする。アサートは `run.job?.status === "failed"` と `errorReason` 非空、かつ `tag_merge_jobs` 行が failed で永続化されていること。

#### [W-003] enqueue 時の `tag.merge.requested` outbox 発火が直接アサートされていない — `app/core/application/tag/__tests__/tag.integration.test.ts` / `tagMergeJob.integration.test.ts`

- **場所/理由:** plan テスト方針は「`enqueueTagMergeJob` の事前検証**とイベント発火**」。事前検証（MergeSameTag / Forbidden / NotFound + 「不正リクエストではジョブ行を作らない」）は手厚いが、**enqueue が `tag.merge.requested` を outbox に積むこと**を確認するテストが無い。integration は enqueue 後に `runTagMergeJob` を**直接**呼んでおり（`mergeViaJob` ヘルパ）、relay/outbox 経路を迂回している。デコーダ（`mergeJobEventDecoders.test.ts`）は「デコード可能」、dispatch（`dispatchDomainEvent.test.ts:732`）は「ルーティング」を孤立して見るが、`enqueue → outbox 行 → relay デコード` の連結（AC-1 の受付チェーンの起点）は誰も検証しない。
- **影響:** `collectEvents([requested(...)])` の発火漏れや payload 不整合（jobId 取り違え）が入っても、integration は手動 run で素通りする。ADR-008 で「デコーダ未登録だと relay が quarantine」という実機バグを踏んだ経緯があるだけに、outbox への実書き込みは押さえる価値が高い。
- **提案:** `enqueueTagMergeJob` 実行後に `outbox_events` を select し、`type === "tag.merge.requested"` かつ `payload.jobId === job.id` の行が 1 件あることをアサートする integration を 1 本。可能なら同じ行を `defaultEventDecoderRegistry` でデコードして runner 入力に一致することまで繋ぐと AC-1 の起点が end-to-end で固定できる。

### Notes

#### [N-001] 他オーナー拒否が `NotFound` ではなく `Unauthorized`（存在リーク）— `app/core/application/tag/getTagMergeJob.ts:39`

`getTagMergeJob` は非オーナーに `BusinessRuleError(Unauthorized)` を投げる（test も Unauthorized を期待、`tagMergeJob.integration.test.ts:323`）。AC-8 拒否そのものは満たすが、plan 文言「他オーナーの jobId は **NotFound/Forbidden**」に対し 403 は「その id のジョブが存在する」事実を漏らす（厳密な IDOR では 404 で存在も隠すのが定石）。これは主に arch/security の判断で、テスト網羅としては拒否を検証できているので可。設計判断として意図的なら ADR に明記、そうでなければ NotFound 化と期待値変更を検討。

#### [N-002] `getTagMergeJob` の jobId 不在（`found === null` → NotFoundError）分岐が未テスト — `getTagMergeJob.ts:33`

所有者ありジョブに対する owner / other-owner は押さえているが、「そもそも存在しない jobId」での `TAG_MERGE_JOB_NOT_FOUND` は通っていない。ポーリングが完了プルーニング後の id を引いた場合の経路。1 行追加で足りる。

#### [N-003] リポジトリの `delete` と DataIntegrity 変換が未テスト — `app/core/adapters/d1/repositories/tagMergeJobRepository.ts:26-43,174-194`

OCC 衝突・JSON ラウンドトリップ・`findById` null は `tagMergeJobRepository.integration.test.ts` で良くカバー。一方 `delete(OCC)` メソッドと、`parseStringArray` の非配列／非文字列・`RehydrationError → SystemError(DataIntegrityError)` 変換（`toEntity` の catch）は無検証。`delete` は現状 runner からは未使用（pruner 想定の余剰 API の可能性）。`affected_note_ids_json` を壊した行を入れて DataIntegrityError を観測する 1 本があると堅い。

#### [N-004] 不正遷移は型で排除済み・`illegalTransition` はデッドコード — `app/core/domain/tag/mergeJob/entity.ts:96-101,343`

`startProcessing`(Pending 専用) / `recordProgress`・`complete`(Processing 専用) / `fail`(Pending|Processing) は引数型で違法遷移をコンパイル時に排除しており、ランタイムの「不正遷移拒否」テストは不要（plan の「不正遷移の拒否」は構造的に充足）。ただし `illegalTransition` ヘルパは定義・export されているが entity 内のどこからも呼ばれていない（switch は exhaustive）。テストではなく実装側のデッドコードとして整理候補。reconstruct の status×フィールド不整合（completed が completedAt 欠落）は `entity.test.ts:134` で検証済みで良い。

#### [N-005] バッチ途中で twin がジョブを完了させる「stop」分岐が未テスト — `runTagMergeJob.ts:180`

`processBatches` 内の「`found === null || !isProcessing` で break」は並走で他 run が先に完了/失敗させたケース。決定論的に再現しづらく省略は妥当だが、冪等性の要なので記録に留める。twin 先行削除の冪等 complete（`finalize` の catch）は `tagMergeJob.integration.test.ts:245` でカバー済み。

#### [N-006] 変更ノートと no-op が混在するバッチの併走検証が無い — `tag.integration.test.ts`

「全件変更 → 3/3」と「単一 no-op → 1/1」は個別に押さえているが、「2 件変更 + 1 件 no-op で `processed=3` かつ `affectedNoteIds=2`」のように `processed`（検査数）と `affectedNoteIds`（変更数）が乖離する代表ケースを 1 本で同時にアサートすると arch S-003 の意図がより明確になる。加えて runner 完了ジョブの `affectedNoteIds` 内容を runner 経由でアサートするテストが無い（repository round-trip では手動 complete で確認済み）。

#### [N-007] ポーリング停止・interval・visibility ガードは未検証（frontend 最小方針として許容）— `app/components/tag/__tests__/TagList.test.tsx:496`

completed で「ダイアログが閉じ routerInvalidate される」「processing で determinate バー（aria-valuenow/max・`3/4`）が出る」「failed でエラー表示・source タグ残存・invalidate されない」は良くカバー。一方 pollMock は即時解決の単発で、`POLL_INTERVAL_MS` の interval・`document.visibilityState` ガード・「完了後にポーリングが**止まる**（再 poll されない）」は検証されていない。`docs/test.md` の frontend「必要最小限」方針に沿っており許容だが、回帰時はマニュアルテスト頼みになる点を記録。

## 受け入れ基準 × テスト対応マップ

| AC | テスト | 状態 |
|---|---|---|
| AC-1 非同期化（enqueue→outbox→relay→dispatch→runner） | dispatch ルーティング○ / デコーダ○ / runner 完了○ だが **enqueue→outbox 発火は未アサート（W-003）** | 部分 |
| AC-2 進捗 n/total 永続化・逐次更新 | 単一バッチ終端 `processed===total`○ / **複数バッチ中間前進は未検証（W-001）** | 部分 |
| AC-5 データ欠落防止（source 消滅・参照更新） | `tag.integration` / `tagMergeJob.integration` で noteTags 全 target 化・source 削除○ | 充足 |
| AC-6 失敗 → failed / 楽観非破壊 | frontend failed 描画○ / **runner の failed 生成経路は未検証（W-002）** | 部分 |
| AC-7 既存テスト green + 新規ジョブ系 | unit 全 green / mergeTags 移設に伴う tag.integration 追従○ / errorCodeNaming nested glob 追加○ | 充足 |
| AC-8 認可/IDOR（assertOwnedBy） | entity 単体○ / getTagMergeJob 他オーナー拒否○（N-001/N-002 は nuance） | 充足 |

## テスト層・規約の所見（良い点）

- 層分割は適正: domain は `entity.test.ts`/`valueObject.test.ts`（pure unit）、adapter/usecase は `*.integration.test.ts`（実 D1）、dispatch ルーティングは mock を使った unit、UI は happy-dom。`docs/test.md` の振り分けと一致。
- fake 方針順守: リポジトリ fake を作らず実 DB で OCC・冪等・並走を検証。crash-resume は `container.db.insert` で processing 中間状態を直接 seed しており、entity を通さず mid-flight を作る妥当な手法。
- 命名規約: `TagMergeJobErrorCode` の value は lower_snake_case、key は PascalCase。`errorCodeNaming.test.ts` を深さ2 glob（`../*/*/errorCode.ts`）対応に拡張し `EXPECTED_ERROR_CODE_NAMES` へ追加済み。新規ネストアグリゲートをガード対象に正しく取り込んでいる。
- 脆い/過剰アサート: dispatch の重 mock・TagList の serverFn mock はいずれも既存の確立パターンで、ルーティング/UI ロジックを孤立検証する正当な範囲。過剰モックや実装内部への過度な結合は見られない。デコーダの `.strict`（余剰フィールド拒否）・空 jobId 再検証も押さえられている。
</content>
</invoke>
