# 実装計画 — Issue #580: impl: 領域3 P18 タグ統合のバックグラウンド進捗バナー（非同期化前提）

**Issue:** #580
**作成日:** 2026-06-26
**複雑度:** 中〜大規模

---

## 目的

タグ統合（`mergeTags`）を既存の非同期ジョブ基盤（outbox + relay + consumer）に載せて非同期ジョブ化し、進捗（n/total）を永続化、フロントへポーリングで供給して、`MergeTagDialog`/P18 タグ画面の indeterminate バーを determinate（実進捗）バナーへ差し替える。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | タグ統合が UnitOfWork 内同期処理ではなく非同期ジョブとして実行される（enqueue → outbox イベント → relay → consumer → `runTagMergeJob`）。リクエストはジョブ受付で即時応答する | Issue「非同期ジョブ化（outbox + relay worker）」 | 1,2,3,4,5,6,7,8,13 |
| AC-2 | ジョブの進捗 n/total が永続化され、処理が進むにつれて更新される（`tag_merge_jobs.progress_processed/total`） | Issue「進捗状態の永続化（n/total）」 | 1,2,5,6,8 |
| AC-3 | フロントが進捗を `getTagMergeJobFn({ jobId })` の **interval polling**（ステップ10）で取得し `processed/total` を反映する。完了時**のみ** `routerInvalidate` で一覧を再取得し消えたソースタグを反映する（ステップ11）。進捗ポーリング（クライアント interval 取得）と完了反映（ローダ再取得）は**別機構として分離**されており、AC-3 の合格判定は前者を指す | Issue「進捗のポーリング/SSE 供給」/ ADR-002（coverage S-001 で由来明確化） | 9,10,11 |
| AC-4 | `MergeTagDialog` は submit 後もダイアログを開いたまま自ジョブを job id で polling し、ダイアログ内の determinate バーが実 `processed/total`（幅% + `aria-valuenow/min/max`）を反映する。完了でダイアログが閉じ、統合結果（ソースタグ消滅・参照更新）が一覧に反映される | Issue「`MergeTagDialog` の determinate 進捗バナー追従」 | 10,11,12 |
| AC-5 | 統合完了後、ソースタグが一覧から消え、参照ノートが統合先タグへ更新されている（既存 `mergeTags` のドメイン結果と同一） | 既存仕様の保全 | 5,11 |
| AC-6 | 統合失敗時にジョブが `failed` になり、ダイアログ内表示がエラーを伝える。一覧の楽観状態は壊れない | リグレッション防止 / ADR-005 | 5,10,11 |
| AC-7 | 既存テスト（`mergeTags`/`tagRepository`/`TagList`）がグリーンを維持し、新規ジョブのドメイン状態遷移・進捗更新・ディスパッチがテストされる | テスト方針 | 14 |
| AC-8 | ポーリング供給クエリ `getTagMergeJob` は `actorUserId` を受け取り `TagMergeJob.assertOwnedBy` で所有者検証する。`getTagMergeJobFn` はクライアント state の jobId を直接ポーリングするため、他オーナーのジョブを jobId 推測で読めない（IDOR 防止、先行 `getExportJob` と同形） | arch S-001（IDOR）/ 先行 `getExportJob` | 2,6,9,14 |

## スコープ

### 含まれないもの

- A/B/C（検索・ソート・最終使用列） — #569 / PR #577 で対応済み。
- エクスポートのような専用ジョブ一覧/詳細ルート（P15/P16 相当）。本Issueは P18 上の**進捗バナー**のみ。ジョブ履歴 UI は要件にないため作らない。
- SSE / WebSocket 等の新規リアルタイム伝送路（ADR-002 で polling を選択）。
- ジョブのキャンセル・リトライ UI（エクスポートにはあるが本Issueの要件外）。失敗時の再実行はユーザーが統合をやり直す導線で足りる。
- 新規 Cloudflare Queue の追加（既存 `EVENTS_QUEUE` を再利用、ADR-001）。
- **ページ全体／オーナースコープの進捗バナー**（ナビをまたいで残る常駐バナー）。モックに無い新規 UI サーフェスでスコープ膨張。進捗はあくまで `MergeTagDialog` 内の determinate バーに閉じる（coverage P-001 / ADR-004）。`listActiveTagMergeJobs`（オーナー単位の active ジョブ一覧）も不要。

## 調査結果

- **関連ファイル:**
  - ジョブ基盤の先行事例（最重要）: `app/core/domain/export/`（`entity.ts` の status 判別共用体 + `ExportProgress{processed,total}`）、`app/core/application/export/{enqueueExportJob,runExportJob,getExportJob,listExportJobs,view}.ts`、`app/core/adapters/d1/repositories/exportJobRepository.ts`、`app/core/adapters/d1/schema.ts`（`export_jobs` テーブル: `progress_processed/total`, `version`）。
  - 非同期基盤本体: `app/core/adapters/d1/schema.ts`（`outbox_events` / `processed_events`）、`app/core/application/execution/unitOfWork.ts`（`UnitOfWorkContext` / `collectEvents`）、`app/core/application/workers/dispatchDomainEvent.ts`（イベント→ユースケースのディスパッチ表）、`app/worker/cloudflare/{relay,consumer,handlers}.ts`、`wrangler.toml`（`EVENTS_QUEUE = hollow-local-events`）。
  - タグ統合の現状: `app/core/application/tag/mergeTags.ts`（UoW 内同期、500件ページング、`NoteEntity.replaceTags` → source タグ delete + `tag.deleted`）、`app/core/domain/tag/service.ts`（`computeMergePlan`）、`app/core/domain/tag/events.ts`（`tag.deleted` のみ）。
  - フロント現状: `app/components/tag/actions.ts`（`mergeTagsFn` 同期サーバ関数）、`app/components/tag/{TagList,TagActions,MergeTagDialog}.tsx`、`app/components/tag/styles.ts`（`progressTrack`/`progressBarIndeterminate` は #563 のために温存された未参照定数）、`app/routes/_app/tags/index.tsx` + `loaders.ts`。
  - ポーリング機構の先行事例: `app/components/export/ExportJobDetail/index.tsx`（3秒間隔 `routerInvalidate(router)` → ローダ再取得 → `role="progressbar"` 描画）、`app/components/common/routerInvalidate.ts`、`app/components/common/ProgressBar.tsx`（indeterminate 対応済みの再利用部品）。
  - デザインモック: `spec/design/pages/P18-merge-tag-dialog.html`（**現状 indeterminate のみ**。`aria-busy=true` + `.progress-bar` の pulse。コメントに「統合進捗バナー(D)のみ非同期ジョブ基盤を要するため別Issueへ引き渡し継続（本モックでは持たせない）」と明記）、`spec/design/pages/P18-tags.html`。
  - 仕様ドキュメント: `spec/domains/tag.md`、`spec/usecases/tag.md`（MergeTags は同期処理として記述。ジョブ化の記述なし）。
  - 次のマイグレーション番号: `0021`（手書き連番 SQL。`app/core/adapters/d1/migrations/0020_llm_call_log.sql` が最新。drizzle メタ journal なし）。

- **あるべきアーキテクチャ:** ヘキサゴナル + DDD、依存は内向き。長時間ジョブ＋進捗永続化＋フロント供給は **export / ingestion がすでに確立したパターン**を持つ。新概念は「ジョブ」を判別共用体エンティティ（`pending|processing|completed|failed`）で表し、進捗は値オブジェクト `{processed,total}`、永続化は専用テーブル + OCC `version`、非同期化は `collectEvents` で outbox イベントを積み relay→consumer→`dispatchDomainEvent`→runner ユースケースへ。フロントは専用伝送路を作らず**ローダ再取得ポーリング**で供給する（export と同一）。タグ統合はこの確立パターンに「正しく載せる」のが本質。

- **既存実装の状態:**
  - `mergeTags`（同期 UoW）は「あるべき姿（非同期ジョブ）」と**乖離**。本Issueでノート書き換え＋source削除のロジックを worker 側 `runTagMergeJob` へ移し、enqueue 経路へ作り替える。
  - `progressTrack`/`progressBarIndeterminate` は indeterminate 専用で、determinate（width 反映）に**部分乖離**。determinate 用に拡張する。
  - デザインモックは determinate バナーを**未保有**（D を意図的に先送り）。実装に合わせてモックを determinate へ更新する必要がある（ADR-004 / リスク参照）。
  - 非同期基盤（outbox/relay/consumer/UoW/dispatch）・ポーリング機構は**あるべき姿に合致**。最大限踏襲する。
  - **export の逐次 determinate バーは実質デッドコード**（arch S-002）: `runExportJob` は `startProcessing(found, 0)` で `total=0` を seed したまま `recordProgress` を一度も呼ばず `assembleAndComplete` へ進むため、`ExportJobDetailView` の `total>0` determinate 分岐には入らない（常に「処理待ち」）。よって export の**ジョブ構造**（判別共用体・進捗 VO・専用テーブル OCC・outbox→relay→consumer→runner・ポーリングループ）は踏襲できるが、**実 n/total を供給する determinate バーは本Issueが初実装**になる（`recordProgress` API 自体は実在し VO もあるが、本物の incremental 駆動は前例がない）。フロントは end-to-end（ローダ／クエリ→ポーリング→幅%反映）を新規に検証する前提。

- **依存関係:** `UnitOfWorkContext` への新リポジトリ追加は D1 UoW プロバイダ・consumer コンテナ両方に波及。`dispatchDomainEvent` の switch に `tag.merge.requested` ケースを1行追加。**加えてイベントデコーダの登録が必須**（実機検証で判明 = ADR-008。plan 当初の arch S-001「デコーダ不要」判断は誤りだった）: relay（`eventRelayWorker.processOutboxEvents`、ローカル inline 経路含む）は outbox 行を `defaultEventDecoderRegistry` で**デコードしてから** dispatch する。`tag.merge.requested` のデコーダが未登録だと「No decoder registered」でリレーが行を quarantine し `runTagMergeJob` に到達しない。`TagMergeJobEvent` を `AllDomainEvents` union に加え（`satisfies DefaultEventDecoderRegistry` がデコーダ網羅をコンパイル時強制）、`tagMergeJobEventDecoders` を registry に spread する。`pruner`（`app/worker/cloudflare/pruner.ts`）に完了ジョブの保持期間プルーニングを足すか判断（リスク参照）。`tag.merge.requested` 追加に伴う `wrangler.toml` 変更は**不要**（既存 `EVENTS_QUEUE` を再利用、ADR-001）。

## 設計

レイヤー内側→外側で設計する。export ジョブを構造・命名・ポーリング方式の規範とし、タグ統合に最小限の差分で適用する。

### ドメインモデルへの影響

新アグリゲート **`TagMergeJob`** を追加（export の `ExportJob` を規範に、タグ統合に必要な最小限へ縮約）。

- 配置: `app/core/domain/tag/mergeJob/`（タグ凝集を保ちつつ export の判別共用体スタイルに揃える。ADR-003）。
- エンティティ（判別共用体）: `PendingTagMergeJob | ProcessingTagMergeJob | CompletedTagMergeJob | FailedTagMergeJob`。
  - 共通フィールド: `id`, `ownerId`, `sourceTagId`, `targetTagId`, `progress: TagMergeProgress`, `version`, `createdAt`, `updatedAt`。
  - completed: `affectedNoteIds`（または件数）, `completedAt`。failed: `errorCode`, `errorReason`, `completedAt`。
- 値オブジェクト（`valueObject.ts`）: `TagMergeJobId`, `TagMergeProgress{processed,total}`（不変条件 `processed ≤ total`, 非負）, `TagMergeStatus`。
- 状態遷移メソッド（export 同形 + イベントドラフト）: `create()`→pending、`startProcessing(total)`→**pending 専用遷移**（processing）、`recordProgress(processed)`→processing（イベントなし。**既存 `progress.total` を保持**し processed のみ前進。再入時の total 再 seed は行わない＝バー逆行防止。arch S-002）、`complete(affectedNoteIds)`→completed、`fail(code,reason)`→failed。
  - 所有者検証メソッド `assertOwnedBy(job, actorUserId)`（export `ExportJob.assertOwnedBy` 同形）を追加。`getTagMergeJob` クエリが IDOR を防ぐために必須で呼ぶ（arch S-001 / AC-8）。
- ドメインイベント（`events.ts`）: `tag.merge.requested`（enqueue 時。payload: `{ jobId }`）。完了/進捗イベントは worker→フロント供給に**不要**（フロントはジョブ行をポーリングで読む。export と同方針）ので最小限に留める。`tag.deleted`（既存）は statt source 削除時に従来どおり発火。
- ドメインサービス: `TagService.computeMergePlan`（既存）を enqueue 時の事前検証で再利用。新規ドメインロジックは増やさない（ノート書き換え集合演算 `mergeTagSets` はユースケース層の純関数として runner へ移設）。
- ポート（`app/core/domain/tag/ports/tagMergeJobRepository.ts`）: `findById(id): Versioned<TagMergeJob> | null`, `insert(job)`, `save(job, expectedVersion)`（OCC）。**`findActiveByOwner` は不要**（バナーはオーナー単位の一覧ではなく、1ダイアログが自分の起動した単一ジョブを id で polling するため。coverage P-001 / S-005）。`getTagMergeJob` クエリは `findById` でジョブを取得した上で **`TagMergeJob.assertOwnedBy(found, actorUserId)` を必須で実行**する（id 取得のみでは IDOR になる。arch S-001 / AC-8）。

### ユースケース / アプリケーションロジック

- **`enqueueTagMergeJob.ts`**（新規。`mergeTagsFn` の新しい呼び先）:
  - source/target を取得し owner 一致・存在検証（現 `mergeTags` 冒頭と同じ `NotFoundError`/`ForbiddenError`）。
  - `TagService.computeMergePlan` で source≠target/owner 一致を事前検証（不正なら即エラー応答、ジョブを作らない）。
  - `TagMergeJob.create()` で pending ジョブ生成、`tagMergeJobRepository.insert`、`collectEvents([TagMergeEvents.requested(jobId)])`。
  - 出力: ジョブ DTO（`jobId`, status, progress）。
  - **重複統合の抑止は行わない**（coverage S-002 で確定）: タグ統合は冪等で再実行安全（`replaceTags` は既に target を持つノートに対し no-op）なため、同 source の再 submit でハードな `BusinessRuleError` ガードを置かない。ガードを置くと固着ジョブが唯一の回復導線（ユーザーの再統合）を塞ぐ（arch P-002）。二重ジョブが走っても結果は同一・冪等。
- **`runTagMergeJob.ts`**（新規。worker ユースケース。`runExportJob` を規範に複数 UoW 境界で分割。**runner 本体 = AC-1 のランナー実行チェーンの末端**。coverage S-001）:
  - **(1) ワークセットの事前スナップショット化**（arch P-001 / coverage S-002・S-003）: まず read-only で **source タグを持つノートID集合を読み切って確定**（メモリ上の ID 配列）し、その件数で `startProcessing(total)` に total を投入する。`mergeTags` 現行の `collectNotesWithTag`（全件読み切り後に変更）と同じ不変条件を踏襲する。**「offset を加算しながら同時にミューテーションする」パターンは明示的に禁止**（`findByOwner(tagIds:[source])` は変更後ノートが結果集合から外れ、offset 加算で繰り上がったノートをスキップしてデータ欠落＝AC-5 違反になる）。
  - **(2) スナップショット ID 集合を順次処理**: 固定 ID リストをバッチ分割（`MERGE_NOTE_PAGE_SIZE = 500`、現行踏襲）し、各バッチで `findById`→`NoteEntity.replaceTags`→save、独立 UoW でコミット（長時間 deferred-batch を開きっぱなしにしない＝export と同じ理由）。`note.saved` 系イベントは従来どおり collectEvents。
  - **(3) processed は「検査した（処理を試みた）ノート数」で数える**（arch S-003）: no-op（`eventDrafts.length === 0`、既に target 保有）も含めてカウントする。変更ノートのみで数えるとバーが 100% 手前で停滞する。実際に変更した集合 `affectedNoteIds` は別カウンタで保持。
  - **(4) source 削除 + 完了の冪等耐性**（arch S-003）: 全 ID 処理後、source タグを delete + `tag.deleted` 発火、`complete(affectedNoteIds)` でジョブ完了。ただし ADR-006 が二重ジョブ並走を許容する以上、**先行 run が既に source を削除済み（`tagRepository.delete` の OCC 競合 / NotFound）のケースは失敗ではなく冪等な完了として扱う**（残件0で統合は実際に完了している → 自ジョブも `complete` 扱い、`fail` にしない）。これを握り潰さないと後発ジョブが不要に `fail` してダイアログがエラー表示する一方で実際は統合完了、という矛盾（AC-6 の体感劣化）が起きる。それ以外の例外時は `fail(code, reason)`。
  - **(5) クラッシュ中断の冪等再開（Pending/Processing 分岐）**（arch P-002 / S-002 / ADR-006）: 再配信冪等性は consumer の `processed_events` で担保しつつ、**`processing` を見てハードスキップする `isProcessing` ガードは採らない**。runner 冒頭で **Pending と Processing を分岐**する（`startProcessing` は Pending 専用遷移のため、Processing で呼ぶと不正遷移）:
    - **Pending**: `startProcessing(total=全 source 保持ノート件数)` で total を確定。
    - **Processing（再入）**: **total を再 seed しない**（最初に確定した永続 total を保持）。残りの source 保持ノートを再スキャン（スナップショット再取得は「まだ source を持つノート」を対象にすれば自然に残りだけを拾う）し、`processed = total − 残件数` から `recordProgress` で**前進のみ**させる（バー逆行を防ぐ＝AC-4「実 processed/total 反映」と整合）。`recordProgress` は Processing からの再入で呼べる（既存 total を保持して processed のみ更新）。
    - いずれの分岐も処理 → source delete（上記(4)の冪等耐性）→ `complete` へ到達する。固着・部分統合のまま永久に `processing` で宙吊りにしない。
- **`getTagMergeJob.ts`**（新規。ダイアログのポーリング供給用クエリ）: 入力に `actorUserId` を取り、`findById(jobId)` で取得したジョブに `TagMergeJob.assertOwnedBy(found, actorUserId)` を必須で適用してから DTO を返す（`getExportJob` と同形。IDOR 防止＝AC-8）。`getTagMergeJobFn` はクライアント state の jobId を直接ポーリングするため、所有者検証が無いと他オーナーのジョブを id 推測で読めてしまう（進捗・source/target タグ ID が漏れる）。`listActiveTagMergeJobs`（オーナー単位の一覧）は**作らない**（coverage P-001 / S-005）。
- **DTO**: `app/core/application/dto/tagMergeJob.ts`（`id`, `status`, `sourceTagId`, `targetTagId`, `progress:{processed,total}`, `errorReason?`）+ `view.ts` の projection。
- 既存 `mergeTags.ts` の扱い: ノート書き換えロジックは `runTagMergeJob` へ移設。`mergeTags.ts` は削除 or runner から呼ばれる内部関数へ縮約（テスト資産を活かすなら runner の中核として温存）。

### アダプター / 永続化 / 外部連携

- **スキーマ**（`app/core/adapters/d1/schema.ts`）: `tag_merge_jobs` テーブル追加。
  - 列: `id`(pk), `owner_id`, `source_tag_id`, `target_tag_id`, `status`, `progress_processed`(default 0), `progress_total`(default 0), `affected_note_ids_json`(default "[]"), `error_code`, `error_reason`, `version`(default 0), `created_at`, `updated_at`, `completed_at`。
  - インデックス: `idx_tag_merge_jobs_owner_status`（owner+status、active ジョブ取得）。完了ジョブのプルーニング用に `idx_tag_merge_jobs_updated_at` を任意で。
- **マイグレーション**: `app/core/adapters/d1/migrations/0021_tag_merge_jobs.sql`（手書き `CREATE TABLE` + インデックス。`pnpm db:apply:local` で適用）。
- **リポジトリ**: `app/core/adapters/d1/repositories/tagMergeJobRepository.ts`（`exportJobRepository.ts` を規範。`Versioned` + OCC `.addOcc()`、JSON シリアライズ、`TagMergeJob.reconstruct()` でリハイドレート）。
- **UoW 配線**: `UnitOfWorkContext`（`app/core/application/execution/unitOfWork.ts`）に `tagMergeJobRepository` 追加 → `app/core/adapters/d1/unitOfWork.ts` の D1 実装に注入。
- 外部 API・ストレージ連携なし（タグ統合はストレージ成果物を生成しない。export より単純）。

### worker / 非同期配線

- `app/core/application/workers/dispatchDomainEvent.ts`: `case "tag.merge.requested"` を追加し、`payload.jobId` から VO を構築して `runTagMergeJob({container, input:{jobId}})` を呼ぶ（既存 `export.job.requested` ケースと同形。`payload as {jobId}` キャスト → VO ファクトリ。`NotFoundError`/`BusinessRuleError` は ack してリトライループを避ける既存ハンドリングに乗る）。**1行追加のみ**。
- **イベントデコーダ登録は不要**（arch S-001）: relay は outbox 行を生の `DomainEvent` のまま転送し復号しない。デコーダ（`tagEventDecoders` 等）は `dispatchDomainEvent` 内の activity-log 投影ハンドラ専用で、ジョブ runner 経路では使われない。`tag/eventDecoders.ts` への登録作業は余剰。
- consumer コンテナ（`createConsumerContainer`）は UoW 経由で `tagMergeJobRepository` を自動取得（UoW に足せば追加配線不要）。
- **Queue 変更不要**: 既存 `EVENTS_QUEUE`（`hollow-local-events`）を再利用（ADR-001）。
- pruner: 完了ジョブの保持/削除方針を決める（当面プルーニング無しでも可。リスク参照）。

### UI / プレゼンテーション

- `app/components/tag/actions.ts`: `mergeTagsFn` を `enqueueTagMergeJob` 呼び出しへ差し替え（即時 `{ jobId }` を返す）。ポーリング用に `getTagMergeJobFn({ jobId })` サーバ関数（`getTagMergeJob` を呼ぶ）を追加。**`getTagMergeJobFn` は認証アクターの id を `actorUserId` として渡す**（`ExportJobDetail/loader.ts` 同様。所有者検証は usecase 側で実行＝AC-8）。クライアントから渡る jobId のみで他オーナーのジョブを引かせない。`listActiveTagMergeJobs` は不要。
- `app/routes/_app/tags/index.tsx` / `loaders.ts`: **active 統合ジョブをローダで取得する必要はない**（ダイアログがクライアント state に保持した jobId で polling するため）。route ローダ変更は最小限（統合完了時の `routerInvalidate` で一覧を再取得し、消えたソースタグを反映する経路のみ）。
- **`MergeTagDialog` 内 determinate 進捗バー**（coverage P-001 で確定。新規の常駐バナーは作らない）: submit → `enqueueTagMergeJob` で `{ jobId }` を受領 → **ダイアログを開いたまま**、`ExportJobDetail` のポーリングループ（`POLL_INTERVAL_MS`、`document.visibilityState` ガード、interval）を踏襲し `getTagMergeJobFn({ jobId })` で**自ジョブのみ**を polling。`progress.processed/total` から幅% を算出して determinate な `role="progressbar"`（`aria-valuenow/min/max`）を描画。完了でポーリング停止 → ダイアログを閉じて `routerInvalidate(router)` → ソースタグが一覧から消える。失敗時はダイアログ内にエラーを表示（タグは残る）。**1ダイアログ＝1統合＝自ジョブのみ参照**なので複数同時統合のバナー多重性（旧 S-005）は構造的に発生しない。
- `app/components/tag/styles.ts`: `progressTrack` は流用、`progressBarIndeterminate` の隣に **determinate 用**（`width` をスタイルで動かす、`transition` 付き、`bg-accent`）の定数を追加。indeterminate 定数は受付直後（total 確定前）の不確定期間用に残すか判断。
- 楽観削除の整合（ADR-005）: enqueue 時点でソースタグを即時楽観削除**しない**（非同期で失敗しうるため）。ダイアログを開いたまま `統合中` を示し、ジョブ完了の `routerInvalidate` で消す。`TagList` の `useOptimistic` を壊さない。
- デザインモック更新: `spec/design/pages/P18-merge-tag-dialog.html`（および必要なら `P18-tags.html`）を indeterminate→determinate バナーへ更新（モックは SSOT。ADR-004 / リスク）。

## 実装ステップ

依存方向の順（内側→外側）。

### 1. ドメイン: `TagMergeJob` 値オブジェクト

- **対象ファイル:** `app/core/domain/tag/mergeJob/valueObject.ts`
- **変更内容:** `TagMergeJobId`, `TagMergeProgress{processed,total}`（`processed≤total`/非負の不変条件）, `TagMergeStatus` を定義。export の `valueObject.ts` を規範。
- **理由:** ジョブ・進捗という概念を型で表し、不正状態を排除（AC-2）。

### 2. ドメイン: `TagMergeJob` エンティティとイベント

- **対象ファイル:** `app/core/domain/tag/mergeJob/entity.ts`, `app/core/domain/tag/mergeJob/events.ts`, `app/core/domain/tag/ports/tagMergeJobRepository.ts`
- **変更内容:** 判別共用体エンティティ + `create/startProcessing(pending専用)/recordProgress(processing再入可・既存total保持)/complete/fail/reconstruct`、**`assertOwnedBy(job, actorUserId)`**（`getTagMergeJob` の IDOR 防止用。`ExportJob.assertOwnedBy` 同形。AC-8）、`TagMergeEvents.requested`、`TagMergeJobRepository` ポート。
- **理由:** ジョブのライフサイクルと永続化境界を内側で定義し、所有者検証を型に持たせる（AC-1, AC-2, AC-8）。

### 3. アダプター: スキーマ + マイグレーション

- **対象ファイル:** `app/core/adapters/d1/schema.ts`, `app/core/adapters/d1/migrations/0021_tag_merge_jobs.sql`
- **変更内容:** `tag_merge_jobs` テーブルとインデックスを drizzle 定義 + 手書き SQL で追加。
- **理由:** 進捗 n/total と OCC を永続化（AC-2）。

### 4. アダプター: リポジトリ + UoW 配線

- **対象ファイル:** `app/core/adapters/d1/repositories/tagMergeJobRepository.ts`, `app/core/application/execution/unitOfWork.ts`, `app/core/adapters/d1/unitOfWork.ts`
- **変更内容:** `exportJobRepository.ts` を規範にリポジトリ実装、`UnitOfWorkContext` に `tagMergeJobRepository` 追加、D1 UoW へ注入。
- **理由:** ユースケースがポート経由でジョブを読み書きできるようにする（AC-1, AC-5）。

### 5. アプリケーション: `runTagMergeJob`（中核 runner / AC-1 ランナー実行の末端）

- **対象ファイル:** `app/core/application/tag/runTagMergeJob.ts`（`mergeTags.ts` のノート書き換え/集合演算 `mergeTagSets` を移設）
- **変更内容:**
  - **ワークセット事前スナップショット**: 先に source タグ保持ノートID集合を read-only で読み切って total を確定 → `startProcessing(total)`。**offset 加算とミューテーションの交互実行は禁止**（データ欠落防止。arch P-001）。
  - 固定 ID リストをバッチ（500件）分割し、各バッチを独立 UoW で `findById`→`replaceTags`+save+`recordProgress`。
  - `recordProgress` は**検査したノート数**（no-op 含む）で数える。`affectedNoteIds` は変更分のみ別カウンタ（arch S-003）。
  - **冪等再開の Pending/Processing 分岐**（arch P-002 / S-002 / ADR-006）: runner 冒頭で分岐。Pending は `startProcessing(total=全件)`。**Processing（再入）は total を再 seed せず**永続 total を保持し、残件再スキャンで `processed = total − 残件数` から `recordProgress` で前進のみさせる（バー逆行防止）。`isProcessing` ハードスキップは採らない。
  - 全 ID 処理後 source delete + `tag.deleted` → `complete(affectedNoteIds)`。**source 削除が OCC 競合 / NotFound（先行 run が削除済み）の場合は `fail` ではなく冪等な `complete` として扱う**（並走時の AC-6 体感劣化を防ぐ。arch S-003）。それ以外の失敗時 `fail`。
- **理由:** 統合の実処理を worker 側へ移し、進捗を逐次永続化し、クラッシュ耐性を持たせる（AC-1, AC-2, AC-5, AC-6）。

### 6. アプリケーション: `enqueueTagMergeJob` + `getTagMergeJob` + DTO

- **対象ファイル:** `app/core/application/tag/enqueueTagMergeJob.ts`, `app/core/application/tag/getTagMergeJob.ts`, `app/core/application/dto/tagMergeJob.ts`, `app/core/application/tag/view.ts`
- **変更内容:** 事前検証 + pending ジョブ作成 + `collectEvents(requested)`（**重複統合の抑止ガードは置かない**。coverage S-002）、`getTagMergeJob({actorUserId, jobId})` = `findById` + **`assertOwnedBy` の所有者検証付き**単一ジョブ取得クエリ（IDOR 防止。`getExportJob` 同形。AC-8）、DTO/projection。`listActiveTagMergeJobs` は作らない。
- **理由:** リクエストの即時受付と、所有者検証付きポーリング供給データの projection（AC-1, AC-3, AC-8）。

### 7. ワーカー: ディスパッチ + イベントデコーダ登録

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`, `app/core/application/tag/mergeJobEventDecoders.ts`（新規）, `app/core/application/workers/eventRelayWorker.ts`
- **変更内容:**
  - `dispatchDomainEvent` に `case "tag.merge.requested"` を追加し `runTagMergeJob` を呼ぶ（既存 export ケースと同形）。
  - **イベントデコーダ登録（必須。ADR-008 / 実機検証で判明）:** `tagMergeJobEventDecoders`（`tag.merge.requested` の zod `.strict` スキーマ + `TagMergeJobId` 復元）を新設し、`eventRelayWorker.ts` の `AllDomainEvents` union に `TagMergeJobEvent` を追加、`defaultEventDecoderRegistry` に spread する。これが無いと relay がイベントをデコードできず行を quarantine して runner に到達しない。`satisfies DefaultEventDecoderRegistry` が網羅をコンパイル時に強制する。
- **理由:** outbox イベントが relay でデコードされ consumer で runner を起動する経路を繋ぐ（AC-1）。

### 8. DI / consumer コンテナ確認

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:** UoW に `tagMergeJobRepository` が入ったことで consumer/request 両コンテナがジョブを扱えることを確認。Queue 設定（`wrangler.toml`）は変更不要であることを確認。
- **理由:** 配線漏れ防止（AC-1）。

### 9. プレゼンテーション: サーバ関数

- **対象ファイル:** `app/components/tag/actions.ts`, `app/routes/_app/tags/loaders.ts`（最小調整）
- **変更内容:** `mergeTagsFn`→ `enqueueTagMergeJob` 呼び出しへ（`{ jobId }` を返す）。ポーリング用 `getTagMergeJobFn({ jobId })` を追加し、**認証アクターの id を `actorUserId` として usecase へ渡す**（所有者検証＝AC-8。`ExportJobDetail/loader.ts` 同様）。`schema.ts` の入力検証は流用/調整。**active ジョブのローダ取得は不要**（ダイアログがクライアント state の jobId で polling）。
- **理由:** 非同期受付と所有者検証付きポーリング供給の配線（AC-1, AC-3, AC-8）。

### 10. プレゼンテーション: `MergeTagDialog` 内 determinate 進捗バー（ポーリング）

- **対象ファイル:** `app/components/tag/MergeTagDialog.tsx`, `app/components/tag/styles.ts`
- **変更内容:** submit で enqueue → **ダイアログを開いたまま** `getTagMergeJobFn({ jobId })` を `ExportJobDetail` 同形のポーリングループ（interval、`document.visibilityState` ガード）で自ジョブのみ取得。determinate `role="progressbar"`（width=`processed/total`%、`aria-valuenow/min/max`）を描画。完了で停止 → ダイアログを閉じて `routerInvalidate(router)`。失敗時はダイアログ内にエラー表示。`progressBar`（determinate, width 反映, transition）定数を `styles.ts` に追加。
- **理由:** 実進捗のフロント供給と determinate 表示（AC-3, AC-4, AC-6）。

### 11. プレゼンテーション: 一覧の楽観整合

- **対象ファイル:** `app/components/tag/TagList.tsx`, `app/components/tag/TagActions.tsx`
- **変更内容:** enqueue 時の即時楽観削除をやめ、ジョブ完了の `routerInvalidate` でソースタグを反映（ADR-005）。`統合中` 状態表示。`useOptimistic` 構造を壊さない。
- **理由:** 非同期化に伴う UI フローの整合（AC-4, AC-5, AC-6）。

### 12. デザインモック更新

- **対象ファイル:** `spec/design/pages/P18-merge-tag-dialog.html`（必要なら `P18-tags.html`）
- **変更内容:** **ダイアログ `<form>` 内**の進捗ブロックを indeterminate → determinate（n/total・幅%・`aria-valuenow/min/max`）へ更新し、D 先送りコメントを解消。配置はダイアログ内に確定（ページ全体バナーは作らない。ADR-004）。
- **理由:** モックは SSOT。実装と整合させる（AC-4）。

### 13. spec ドキュメント同期

- **対象ファイル:** `spec/usecases/tag.md`, `spec/domains/tag.md`
- **変更内容:** MergeTags の「同期処理」記述を非同期ジョブ化へ更新し、`TagMergeJob` アグリゲート（判別共用体ジョブ + 進捗 VO）・enqueue→runner 経路・進捗永続化を反映（arch S-004）。
- **理由:** spec を SSOT として実装と同期させる規律（spec-sync）。非同期化はドメイン/ユースケース記述を陳腐化させる。

### 14. テスト

- **対象ファイル:** `app/core/domain/tag/mergeJob/__tests__/`, `app/core/application/tag/__tests__/`, `app/core/adapters/d1/repositories/__tests__/`, 既存 `TagList`/tag テストの追従
- **変更内容:** ジョブ状態遷移・進捗不変条件・**`assertOwnedBy`（他オーナー拒否）**のユニット、`runTagMergeJob` の進捗更新（no-op 含む検査数カウント）/完了/失敗/**冪等再開（Processing 再入で total 非再 seed・processed 前進のみ＝バー逆行なし）**/**並走・source 先行削除時の冪等 complete（OCC 競合/NotFound を fail にしない）**の統合、`getTagMergeJob` の**所有者検証（他オーナーの jobId は NotFound/Forbidden）**、`tagMergeJobRepository` の OCC/シリアライズ統合、`dispatchDomainEvent` の `tag.merge.requested` ルーティング、フロントの determinate バー（n/total・aria・ポーリング停止）と楽観整合。
- **理由:** AC-7。`docs/test.md` のレイヤー分割に従う。

## 設計判断

- **ADR-001:** タグ統合を非同期ジョブ化する（同期で determinate 進捗は供給不能。確立済みジョブ基盤へ載せる）。
- **ADR-002:** 進捗供給は **polling**（既存エクスポートと同一の `routerInvalidate` ローダ再取得。SSE は前例なし）。
- **ADR-003:** `TagMergeJob` を export 同形の判別共用体アグリゲートとしてタグドメイン配下に新設する。
- **ADR-004:** determinate 進捗は `MergeTagDialog` 内のバーに確定（ページ全体バナーは作らない）。export のジョブ構造は踏襲するが実 n/total を駆動する determinate バーは本Issueが初実装。モック（D 先送り）を実装に合わせて更新する。
- **ADR-005:** enqueue 時の即時楽観削除をやめ、ジョブ完了の `routerInvalidate` で反映する。
- **ADR-006:** クラッシュ中断ジョブを冪等再開可能にする（`isProcessing` ハードスキップを採らず、`processed_events` 冪等性と整合させて回復導線を塞がない）。再入時は total を再 seed せず processed を前進のみ（S-002）、二重ジョブ並走時の source 先行削除は冪等 complete として握る（S-003）。
- **認可（arch S-001 / AC-8）:** `getTagMergeJob` は `getExportJob` 同形に `actorUserId` + `assertOwnedBy` を必須化し IDOR を防ぐ（確立パターン踏襲のため独立 ADR は設けない）。

詳細は `.issue/580/adr.md`。

## リスクと注意点

- **デザイン SSOT の不在:** モックは determinate バナーを意図的に未保有。実装が「あるべきデザイン」を新規に定義することになるため、トークン/レイアウトはモックを更新して整合させる必要がある（ADR-004）。デザインレビュー（`spec/design/review/`）での確認が望ましい。
- **楽観 UI と非同期の不整合（ADR-005）:** #607 で導入した「即時楽観削除」を残すと、失敗時にタグが消えたまま不整合になりうる。完了駆動の反映へ変更し、`useOptimistic` を壊さないこと。
- **複数同時統合のバナー多重性は解消済み:** 進捗を `MergeTagDialog` 内（1ダイアログ＝1統合＝自ジョブを id で polling）に閉じたため、複数バナーの集約問題（旧 S-005）は構造的に発生しない。オーナースコープの常駐バナーは作らない（スコープ膨張回避）。
- **データ欠落（arch P-001）:** ページング＋逐次ミューテーションの交互実行は source 保持ノートをスキップしうる。runner は**事前スナップショット（全 ID 読み切り → total 確定 → 固定リスト処理）**でこれを回避する。「offset 加算しながらミューテーション」は禁止。
- **進捗カウント（arch S-003）:** `recordProgress` は no-op を含む**検査済みノート数**で数える。変更分のみだとバーが 100% 手前で停滞する。
- **大規模統合の worker 実行時間:** ノート数が多いと consumer の実行時間上限に近づく。export 同様、複数 UoW 境界で逐次コミット。crash しても冪等再開（ADR-006）で残りを処理して complete へ到達できる。必要なら 1 ディスパッチあたりのバッチ数を区切り再 enqueue する継続方式も検討（当面は単一 dispatch、リスクとして記録）。
- **完了ジョブの蓄積:** `tag_merge_jobs` の completed/failed 行が増え続ける。pruner への保持期間プルーニング追加を検討（当面は無害だが要監視）。
- **クラッシュ回復性（arch P-002 / S-002 / ADR-006）:** タグ統合は途中で実データを変更してコミットするため、`isProcessing` ハードスキップを踏襲すると `processing` 固着＋部分統合のまま宙吊りになる。タグ統合は冪等なので**再開可能**にし、`processed_events` の consumer 冪等性と矛盾しない形で回復導線を塞がない。重複統合のハードガードも置かない（coverage S-002）。再入（Processing→Processing）では **total を再 seed せず**永続 total を保持し processed を前進のみさせる（バー逆行防止。`startProcessing` は Pending 専用なので Processing では呼ばない）。
- **二重ジョブ並走の冪等耐性（arch S-003）:** ADR-006 が二重実行を許容する以上、固着 `processing` ジョブの再開中にユーザーが再 submit すると同一 source に 2 runner が並走しうる。ノート書き換えは冪等（`replaceTags` no-op）で安全だが、終盤の `tagRepository.delete`（OCC）と `complete` は先行 run が source を消すと**後発側で OCC 競合 / NotFound** になる。これを**冪等な完了として握る**（`fail` にしない）。握り潰さないと後発ジョブが不要に `fail` してダイアログがエラー表示する一方で統合は実際に完了、という矛盾（AC-6 体感劣化）が起きる。
- **オーナー認可 / IDOR（arch S-001）:** `getTagMergeJobFn` はクライアント state の jobId を直接受けて polling するため、`getTagMergeJob` で `assertOwnedBy` を必須にしないと**他オーナーのジョブを id 推測で読める IDOR**（進捗・source/target タグ ID が漏れる）。`getExportJob` 同形に `actorUserId` + 所有者検証を必須化する（AC-8）。
- **`mergeTags.ts` 移設の回帰:** 既存テスト資産を `runTagMergeJob` へ確実に引き継ぐ。集合演算 `mergeTagSets` のロジックを温存。

## テスト方針

- ドメイン: `TagMergeProgress` 不変条件、`TagMergeJob` 状態遷移（pending→processing→completed/failed、不正遷移の拒否、`startProcessing` が Pending 専用・`recordProgress` が Processing 再入で既存 total を保持すること）、`assertOwnedBy` が他オーナーを拒否すること。
- アプリ（統合・実 DB）: `runTagMergeJob` の total 投入・スナップショット処理・検査数ベースの `progress_processed` 更新（no-op 含む）・source 削除・完了/失敗・**冪等再開**（Processing からの再 dispatch で total を再 seed せず残りを処理して complete、processed が逆行しない）・**並走/source 先行削除**（OCC 競合/NotFound を fail にせず冪等 complete）、`enqueueTagMergeJob` の事前検証とイベント発火、`getTagMergeJob` の**所有者検証**（他オーナーの jobId を拒否＝IDOR 防止）。
- アダプタ（実 DB）: `tagMergeJobRepository` の OCC 競合・JSON ラウンドトリップ・`findById`。
- ワーカー: `dispatchDomainEvent` が `tag.merge.requested` を `runTagMergeJob` へ振り分ける。
- フロント: `MergeTagDialog` 内 determinate バーの描画（n/total・aria）、ポーリング停止条件（完了で閉じる）、楽観整合（統合中→完了で消える/失敗で戻る）。export で実走していない determinate 経路を end-to-end で新規検証（arch S-002）。既存 `TagList`/tag テストのグリーン維持。
- 手動/ブラウザ: P18 で統合実行 → `MergeTagDialog` 内バーが実進捗で進む → 完了でダイアログが閉じソースタグ消失。`docs/test.md` 準拠。

## レビュー履歴

### 1周目

**修正した点（要修正・両視点）**:
- coverage P-001（進捗バナーの配置）: ページ/オーナースコープの常駐バナー案を不採用とし、**`MergeTagDialog` 内の determinate バーに確定**。ダイアログは submit 後も開いたまま自ジョブを job id で polling し、完了で閉じる。AC-4 を「ダイアログ内 determinate バーが実 processed/total を反映し、完了で統合結果が一覧に反映される」検証可能な単一条件へ書き換え。`listActiveTagMergeJobs`/`findActiveByOwner` を廃し `getTagMergeJob`（id 取得）へ置換。ADR-004 を更新。
- arch P-001 + coverage S-002・S-003（ワークセットのスナップショット化）: runner を「先に対象ノートID集合を読み切って total 確定 → 固定リスト処理」に変更し、offset 加算＋ミューテーションの交互実行を明示禁止（データ欠落防止）。`recordProgress` は no-op を含む**検査済みノート数**で数えることを明記。重複統合のハードガードは置かない（冪等で再実行安全）と確定。
- arch P-002（クラッシュ中断ジョブの回復性）: `isProcessing` ハードスキップを採らず、冪等再開可能にする方針へ変更。`processed_events` の consumer 冪等性と整合させ回復導線を塞がない。ADR-006 を追加。
- arch S-001（イベントデコーダ登録は不要）: 旧ステップ7からデコーダ登録を削除し、`dispatchDomainEvent` への1行追加のみに。relay が生イベントを転送し復号しない事実を調査結果・依存関係・worker 配線に反映。
- arch S-002（「export から determinate を踏襲」の誤り）: export の逐次 determinate バーが実質デッドコードである事実を明記し、「ジョブ構造は踏襲するが実 n/total determinate バーは本Issueが初実装」へ記述を是正（plan・ADR-004）。

**取り込んだ改善提案**:
- arch S-004（spec 同期）: `spec/usecases/tag.md`・`spec/domains/tag.md` を非同期ジョブ化に合わせて更新するステップ13を追加。
- coverage S-001（runner トレーサビリティ）: AC-1 の対応ステップに runner 本体（ステップ5 `runTagMergeJob`）を追加。
- coverage S-002（重複抑止の確定）: 「本Issueでは抑止しない」と明記して曖昧さを解消。
- arch S-005（バナー多重性）: 進捗をダイアログ内（1ダイアログ＝1統合＝自ジョブのみ）に閉じたことで構造的に解消。

**整合性更新**:
- AC 表の対応ステップ列を更新（AC-1 に 5・13 を追加、AC-7 を 13→14）。ステップを振り直し（旧7=ディスパッチ+デコーダ → 7=ディスパッチのみ、spec 同期を13に新設、テストを14へ）。スコープ「含まれないもの」にページ全体バナーを追記。

### 2周目

両レビューとも**要修正（P）ゼロ**。改善提案（arch S-001/S-002/S-003・coverage S-001）を全て取り込み。

**取り込んだ改善提案**:
- arch S-001（`getTagMergeJob` のオーナー認可 / IDOR 防止）: 先行 `getExportJob` に倣い `getTagMergeJob` を `actorUserId` + `TagMergeJob.assertOwnedBy` 必須化。`getTagMergeJobFn` はクライアント state の jobId を直接ポーリングするため所有者検証が無いと他オーナーのジョブを id 推測で読める IDOR になる。新規 **AC-8** を追加し、エンティティに `assertOwnedBy` を追加、ドメイン設計・ステップ2/6/9・サーバ関数記述・テストへ反映。
- arch S-002（ADR-006 の processing→processing 再入セマンティクス確定）: `startProcessing` は Pending 専用遷移・`recordProgress` は Processing 再入で既存 total 保持（実コードで裏取り）。runner 冒頭で Pending/Processing を分岐し、**再入時は total を再 seed せず**永続 total を保持して `processed = total − 残件数` から前進のみ（バー逆行防止）。runner ステップ5・ADR-006 Decision/Consequences に明記。
- arch S-003（二重ジョブ並走時の source 削除 + complete の冪等耐性）: 先行 run が source を削除済み（OCC 競合 / NotFound）の場合を `fail` ではなく冪等な `complete` として握る。runner ステップ5の注意点・リスク・ADR-006 Decision/Consequences・テスト方針に追記。
- coverage S-001（AC-3 由来/紐づけ文言の精度向上）: AC-3 を「`getTagMergeJobFn` の interval polling（ステップ10）で `processed/total` を反映」と「完了時のみ `routerInvalidate` で一覧反映（ステップ11）」の別機構として書き分け、合格判定が前者を指すことを明確化。

**整合性更新**:
- AC 表に AC-8（認可）を追加（対応ステップ 2,6,9,14）。AC-3 の由来欄を実機構に合わせて書き分け。
- ADR-006 を S-002（再入 total 非再 seed）/ S-003（並走 source 先行削除の冪等 complete）を含む形に更新。設計判断リストに認可（S-001）の注記を追加。
- リスクに「二重ジョブ並走の冪等耐性」「オーナー認可 / IDOR」を追加。テスト（ステップ14・テスト方針）に認可検証・再入 total 保持・並走 source 先行削除の観点を追加。

**2周目: 要修正（P）ゼロ。改善提案を反映してレビューループ終了**
