# 実装計画 — Issue #145: search: note.* / publication.* dispatch が skipped のままで HandleNoteSavedEvent 等が動作していない

**Issue:** #145
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

`dispatchDomainEvent` で skipped されている `note.*` / `publication.*` イベントを routing し、event-driven な search index 更新経路（HandleNoteSavedEvent / HandleNoteTrashedEvent / HandlePublicationChangedEvent → IndexJob → ConsumeIndexJob → SearchIndex 書き込み）を production で稼働させる。事実関係調査の結果、現状 production の `search_documents` テーブルへの書き込み経路は皆無（`AdminSettings.RebuildSearchIndex` の手動再構築のみ）であり、本 Issue はその欠落を埋める意味合いを持つ。

## スコープ

### 含まれるもの

- `dispatchDomainEvent` の switch 拡張（6 つの note save 系 + note.trashed + note.purged + note.publish_changed の routing）
- dispatcher 内での NoteSnapshot 再構築（D1 採用案）
- `note.trashed` を search / publication の両 handler に fan-out
- IndexJob drainer worker entry の新設（`processIndexJobs` + `app/worker/cloudflare/indexer.ts` + `wrangler.toml` の `[env.indexer]`）
- `dispatchDomainEvent.test.ts` の更新（skipped assertion 削除 + 新 routing 網羅）
- `processIndexJobs` のユニットテスト
- integration テスト（dispatcher → IndexJob 行投入 → drainer → search_documents 反映）
- `spec/usecases/search.md` / `spec/domains/index.md` / `spec/domains/search.md` の event 名修正と NoteSnapshot 再構築場所の明文化
- `docs/runtime_cloudflare.md` の indexer worker 運用説明追加

### 含まれないもの

- 既存 handler（`handleNoteSavedEvent` 等）の input シグネチャ変更（snapshot 受け取りのまま）
- event payload 構造の変更（emit 側は触らない）
- `IndexJob` / `IndexJobRepository` / `SearchService` / `D1SearchIndex` の実装変更
- 既存 migration / DDL の変更（`search_documents` / `index_jobs` 両テーブルは既存定義のまま）
- `share_link.issued` / `share_link.revoked` の skipped → handled 変更（本 Issue では skipped 継続を明示）
- **`note.purged` 系の他ドメイン handler への routing**:
  - `publication.handleNotePurgedEvent`
  - `media.handleNotePurgedEvent`
  - `view.handleNotePurgedEvent`
  - 本 Issue は「search 経路を有効化する」ことが主目的。同じ症状（dispatch skipped で handler 死蔵）を抱える上記 handler 群は別 Issue として起票する候補（Phase 4 で重複確認のうえ起票）
- **`note.trashed` の view 側 handler への routing**:
  - `view.handleNoteTrashedEvent`（broken marker 用）— 存在する場合は同じく別 Issue 候補
- **`tag.*` / `directory.*` / `media.*` / `user.*` event の search/view routing**:
  - `view.handleDirectoryDeletedEvent` / `view.handleTagDeletedEvent` 等は同じく dispatch されていないが、Issue 本文の対象外。別 Issue で対応
  - これら未配線 handler を本 Issue で「skipped 継続」と明示するため、`dispatchDomainEvent.test.ts` に regression guard テストを追加する（後述ステップ 2）

## 実装ステップ

### 1. dispatcher の routing 拡張（NoteSnapshot 再構築 helper を含む）

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`
- **変更内容:**
  - search 側 3 handler / publication 側 `handleNoteTrashedEvent` / `buildNoteSnapshots` / `NoteId` を import
  - private helper `buildSnapshotByNoteId(container, noteIdRaw): Promise<NoteSnapshot | null>` を追加 — `unitOfWorkProvider.run` 内で `noteRepository.findById` → 以下の優先順で null 判定:
    1. `note === null`（既に purge 等で消えた）→ null
    2. **`note.status === 'trashed'` → null**（trashed なノートは search index に乗せない。これは ADR-007 の「trashed status guard」）
    3. それ以外（active）→ `buildNoteSnapshots([note], deps)` の配列要素 0 を返す
  - dispatch switch に 9 ケース追加（詳細は ADR-001 / ADR-002 参照）
  - container type を `RequestContainer` から `ConsumerContainer` に変更（noteRepository への UoW 経由アクセスのため）。`ConsumerContainer extends RequestContainer & Pick<WorkerContainer, ...>` なので LSP は破れない
  - 既存の error classification (`LLMRateLimitError` retry / `NotFoundError` handled / `BusinessRuleError` handled + warn / 残り retry) はそのまま流用
- **理由:** Issue の主目的。spec 仕様の event-driven 経路を production で動かす。trashed status guard により「outbox の順序保証なし」で `note.publish_changed` が `note.trashed` より後に dispatch されるレースで index に蘇生する不整合を防ぐ。

### 2. dispatchDomainEvent ユニットテストの更新

- **対象ファイル:** `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`
- **変更内容:**
  - search 側 / publication 側の handler を `vi.mock` で stub
  - `STUB_CONTAINER` を `ConsumerContainer` 互換に拡張（`unitOfWorkProvider.run` モック + 必要な repository fake + `htmlSanitizer` stub）
  - 既存の "skips note.trashed" 系 assertion を削除
  - 以下のケース追加:
    - save 系 6 event → `handleNoteSavedEvent` が呼ばれて handled
    - `note.trashed` → search + publication の両 handler が呼ばれて handled
    - `note.purged` → search trash handler のみ呼ばれて handled
    - `note.publish_changed` → `handlePublicationChangedEvent` が呼ばれて handled
    - Note 不在（`findById` null）→ handled + logger.info（snapshot 不在ケース）
    - **trashed status guard: `findById` が trashed note を返したケース → handled + logger.info（save 系 / publish_changed の両方をテスト）**
    - BusinessRule（`noteId = ""`）→ handled + logger.warn
    - transient error → retry
    - **fan-out partial failure: search trash 成功 → publication trash transient error → retry（後続の冪等再実行を許容するパターンを確認）**
    - `share_link.issued` / `share_link.revoked` → skipped 維持
    - **`tag.*` / `directory.*` / `media.*` / `user.*` event → skipped 維持**（本 Issue 範囲外であることの regression guard）
    - **`note.purged` を publication / media / view が consume しないこと**（dispatcher 内に該当 routing が無いことの regression guard）
- **理由:** routing と error classification の網羅的保証。Phase 3 のレビューで設計逸脱を防ぐ regression guard。「本 Issue で routing しないと決めた経路が skipped で残る」ことの明示も含める。

### 3. IndexJob drainer の application 層実装 + dlq 行除外対応

- **対象ファイル:**
  - `app/core/application/workers/processIndexJobs.ts`（新規）
  - `app/core/domain/search/ports/indexJobRepository.ts`（既存 port のシグネチャ拡張）
  - `app/core/adapters/d1/repositories/indexJobRepository.ts`（既存 adapter の WHERE 句拡張）
  - 対応するテスト群（`indexJobRepository.test.ts` 等）
- **変更内容:**
  - **port 拡張**: `IndexJobRepository.nextBatch(limit, now, maxAttempts)` に第3引数 `maxAttempts: number` を追加する。dlq 行（attempts ≥ maxAttempts）を SQL レベルで除外するため
  - **adapter 拡張**: `D1IndexJobRepository.nextBatch` の inner SELECT WHERE に `lt(indexJobs.attempts, maxAttempts)` を追加。outer UPDATE の WHERE にも同じ条件を加えて二重ガード
  - `processIndexJobs(container: WorkerContainer, opts: { batchSize: number; maxBatches?: number }): Promise<{ completed: number; retried: number; dlq: number }>` を実装
  - ループで `indexJobRepository.nextBatch(batchSize, now, CONSUME_INDEX_JOB_MAX_ATTEMPTS)` → 空なら break → 各 job を `consumeIndexJob` に渡し outcome を集計 → maxBatches で打ち切り
  - per-row try/catch で partial failure tolerant（CLAUDE.md "worker → root" 規約）
  - `CONSUME_INDEX_JOB_MAX_ATTEMPTS` は `consumeIndexJob.ts` から re-export または新規 shared constant に切り出す（drainer / adapter で同じ値を使う）
- **理由:**
  - spec の `ConsumeIndexJob worker` の実体化。production で IndexJob テーブルを drain する経路が現状存在しないため必須。
  - 現行 `D1IndexJobRepository.nextBatch` は `WHERE processed_at IS NULL` のみで attempts フィルタを持たないため、dlq 行（`consumeIndexJob` outcome dlq 時に `processed_at` が埋まらない）が `nextBatch` で再選択され続けて attempts が永久にインクリメントされる問題がある（ADR-006 末尾の前提を実装と整合させる対応）。
  - ADR-006 の DLQ 運用方針「`nextBatch` の attempts フィルタ前提」を実装と一致させる正式対応。

### 4. cloudflare worker entry + handlers の追加

- **対象ファイル:** `app/worker/cloudflare/handlers.ts`（追記）、`app/worker/cloudflare/indexer.ts`（新規）
- **変更内容:**
  - `handlers.ts`: `runIndexJobTick(env, override?)` を追加 — `createWorkerContainer(env)` → `processIndexJobs(container, readIndexerTuning(env))` → 戻り値ロギング
  - `handlers.ts`: `readIndexerTuning(env)` を追加（`INDEXER_BATCH_SIZE` / `INDEXER_MAX_BATCHES` の string → number）
  - `indexer.ts`: `relay.ts` / `pruner.ts` と同じ `default { scheduled(_, env, ctx) { ctx.waitUntil(runIndexJobTick(env)) } }` パターン
- **理由:** cron driver 配線。既存 relay/pruner のパターンを踏襲。

### 5. wrangler.toml に `[env.indexer]` を追加

- **対象ファイル:** `wrangler.toml`
- **変更内容:**
  - `[env.indexer]` セクション追加（`name`, `main = "app/worker/cloudflare/indexer.ts"`, vars, d1_databases, triggers の cron）
  - `INDEXER_BATCH_SIZE` / `INDEXER_MAX_BATCHES` 等のチューニング var
- **理由:** drainer の cron 駆動。relay の構成を参考に。
- **注意:** deploy 時に `pnpm wrangler deploy --env indexer` の追加が必要 → docs 更新（次ステップ）。

### 6. spec / docs の更新

- **対象ファイル:**
  - `spec/usecases/search.md`
  - `spec/domains/index.md`
  - `spec/domains/search.md`
  - `docs/runtime_cloudflare.md`
- **変更内容:**
  - `spec/usecases/search.md`: `note.saved` / `note.deleted` を実装 event 名に対応させ、論理集約名であることを明記。NoteSnapshot は dispatcher 側で再構築する旨追記
  - `spec/domains/index.md`: event 購読対応表に物理 event 名を注記
  - `spec/domains/search.md`: NoteSnapshot 構築場所の説明を「dispatcher が `findById` + `buildNoteSnapshots` で再構築」に修正
  - `docs/runtime_cloudflare.md`: `indexer` worker の運用説明と deploy 手順を追加
- **理由:** spec と実装の同期。Phase 3 review-guide.md の「spec 同期」観点で必要。

### 7. integration テスト

- **対象ファイル:** `app/worker/cloudflare/__tests__/handlers.integration.test.ts`（追記）または新規 `dispatchSearchEvents.integration.test.ts`
- **変更内容:**
  - シード: user / directory / note / publication_state を D1 に投入
  - `note.created` を `handleQueue` 経由で流し、`index_jobs` テーブルに upsert 行が現れることを検証
  - `note.trashed` を流し、`index_jobs` に delete 行 + `publication_states.visibility = 'private'` を検証
  - `processIndexJobs` を application 層から直接呼んで `search_documents` への反映を検証（cron トリガー経路は wrangler 設定の単体テストでは cover しない方針 — application 層 tick の網羅で十分）
  - **trashed note を seed した状態で `note.publish_changed` を流すシナリオを追加** — `index_jobs` に upsert 行が積まれず、handled として終了することを検証（status guard の E2E）
- **理由:** dispatcher + handler + drainer の結合 E2E。蘇生レースの regression を結合レベルでも担保。

### 8. 仕上げ

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- 関連ドキュメント（CLAUDE.md 直下）に追記が必要なら追加

## 設計判断

ADR-001 〜 ADR-007 として `.issue/145/adr.md` に詳細を記録。要約:

- **ADR-001 (D1)**: NoteSnapshot は dispatcher 側で再構築する。handler / emit 側の改修コストと outbox payload 設計の制約を考慮した最適解。
- **ADR-002 (D2)**: 物理 note event ↔ search handler のマッピング表を確定。save 系 6 / trash 系 2 (trashed + purged) / publish_changed の 9 ケース。
- **ADR-003 (D3)**: `note.trashed` の fan-out は dispatcher 内で順次 await（合成関数や outbox 多重化は YAGNI）。
- **ADR-004 (D4)**: spec/usecases/search.md の event 名は「論理 event」と明示し、物理 event の集約マッピングを併記。
- **ADR-005 (D5)**: dispatchDomainEvent.test.ts の skipped assertion は note.* 系を handled に切り替え、share_link 系は skipped 継続として明示。
- **ADR-006**: IndexJob drainer 不在問題をスコープに含める判断（Issue の意図 = production 経路を完成させること）。DLQ 行の運用方針も併記。
- **ADR-007**: trashed status guard — dispatcher が `findById` で trashed note を取得した場合は null 扱いし handled + logger.info で skip。NoteSnapshot 型には status フィールドがないため、dispatcher 側でガードしないと outbox 順序保証無しの仕様下で蘇生レースが発生する。

## リスクと注意点

1. **dispatcher の責務拡大（UoW 開設）**: ADR-001 で許容するが、レビュー時に「dispatch 純粋性原則からの逸脱」として明示的に議論。代替案 A2 / A3 はより破壊的なので妥協する。ingestion / export 経路（usecase 内部で UoW を開く）との非対称性は ADR-001 で明文化。
2. **dispatch あたり 1 UoW 開設のオーバーヘッド**: note.* event 1 件につき D1 read 4 リポジトリ程度。relay/queue スループットへの影響は許容範囲（既存 `buildNoteSnapshots` の per-page UoW モデルと同じ）。production で監視。
3. **publication 側 handleNoteTrashedEvent 内の event 再収集（蘇生レース対策）**: `publication.changeVisibilityAndCascade` は trash 時に `note.publish_changed` を emit する。outbox は順序保証無しなので、search 側で `note.publish_changed` が `note.trashed` より後に dispatch されるレースが存在する。**ADR-007 の trashed status guard により dispatcher は dispatch 時点で trashed なノートを null 扱いする**ため、典型的な蘇生レース（trash 後に publish_changed が後追い dispatch されるパターン）は塞がれる。NoteSnapshot 型には status フィールドがなく、buildNoteSnapshots も status を見ないため、dispatcher 側でガードする必要がある（実装ステップ 1）。**残存リスク**: `findById` 実行と IndexJob enqueue の間に他 UoW が trash を進める "find-after-active, enqueue-after-trash" 窓は完全には塞げない（dispatcher 単体トランザクションでは aggregate lock を保持しないため）。この残存窓は `bulkRebuildFromSnapshots`（Issue #93 / PR #144）の補完経路で吸収する。
4. **note が dispatch 時に既に消えているケース（trash → purge 連続）**: `findById` で null → handled + logger.info で skip。queue を汚さず observability も確保。
5. **fan-out 失敗時の partial commit**: search trash 成功 → publication trash 失敗 (transient) → 全体 retry → 次回 search trash は冪等 (delete x2 = no-op) で OK。逆も同様。テストでカバーする（ステップ 2）。**fan-out 順序は search → publication で固定**する（副作用最小の handler を先に終わらせることで retry セマンティクスが読みやすくなる。publication 側は内部で `note.publish_changed` を emit するため、search delete を先に済ませる方が後続 dispatch との順序が明確になる）。
6. **migration / DDL 不要**: 既存テーブル定義のまま。production migration 時の不整合なし。新 routing 有効化後、events queue 経由で IndexJob が積まれ、drainer で消化されて search_documents が更新される。
7. **deploy 順序**: `consumer` deploy → `indexer` deploy → relay 再起動。indexer 不在期間に IndexJob が滞留しても次回 drainer 起動で消化されるだけで害は無い。**docs/runtime_cloudflare.md に deploy 順序の節を明記する**（CI が `[env.*]` を並列 deploy する場合の事故防止）。
8. **rollback path**: dispatch switch 拡張部だけ revert すれば handler / drainer は無動作のまま残るので副作用なし。indexer worker は止めれば IndexJob テーブルが一時的に滞留するだけ。
9. **既存運用との両立**: `bulkRebuildFromSnapshots` (admin) と event-driven 更新は両立可能（互いに idempotent）。タイミング次第で「rebuild 中に enqueue された IndexJob」が一時的に上書き対象になるが、最終的に最新 snapshot に収束。
10. **DLQ 行の運用**: `consumeIndexJob` は `attempts >= 3` で outcome `dlq` を返すが、queue を持たない drainer 設計では「`index_jobs` テーブルに `attempts >= 3` 行が残留する」だけになる。**現行 `D1IndexJobRepository.nextBatch` は WHERE 句が `processed_at IS NULL` のみで attempts フィルタを持たないため、放置すると dlq 行が再選択され続け、attempts が永久にインクリメントされる**。本 Issue ステップ 3 で `nextBatch` のシグネチャに `maxAttempts` を追加して dlq 行を SQL レベルで除外する対応を含める。dlq 行は admin の手動オペレーション（`bulkRebuildFromSnapshots` または `index_jobs` テーブル直接操作）で re-drive する運用を docs に明記する。
11. **nextBatch 同時実行**: `D1IndexJobRepository.nextBatch` は at-least-once セマンティクスで「concurrent workers may observe the same job」。indexer の cron 間隔は前回 tick が長引いて重なる可能性を考慮し、relay の 5 分 / pruner の daily と揃える方針を docs に明記。`SearchService.applyUpsert/delete` は idempotent なので結果整合性は保たれる。
12. **`note.purged` の payload 取り扱い**: `note.purged` event payload は `noteId / ownerId / mediaRefs` を含むが、search delete に必要なのは `noteId` のみ。dispatcher の switch case 内で payload type を inline 注記（または `noteEventDecoders` 経由）で取り出す。
13. **本 Issue 範囲外として残る dispatch 漏れ**: `note.purged` の publication / media / view 側 handler、view 側の各種 handler、`tag.*` / `directory.*` event の subscriber 群は引き続き skipped 継続。Phase 4 で別 Issue 起票候補として整理。

## テスト方針

### 自動テスト

**Unit (vitest)**:
- `dispatchDomainEvent.test.ts`: ステップ 2 で列挙したケース全て
- `processIndexJobs.test.ts`（新規）: 空 batch / 複数 batch / maxBatches 打ち切り / per-row partial 失敗 tolerance
- 既存 `handleEvents.test.ts` / `consumeIndexJob.test.ts` / `buildNoteSnapshot.test.ts` は handler シグネチャ不変のため影響なし

**Integration (vitest miniflare / D1)**:
- `dispatchSearchEvents.integration.test.ts`（新規 or 既存 handlers.integration.test.ts 追記）: ステップ 7 のシナリオ

### 手動確認

`docs/runtime_cloudflare.md` の `wrangler dev --env consumer` 系で起動し:
1. ノート作成 → relay → events queue → consumer の dispatch handled
2. D1 `index_jobs` テーブルに upsert 行
3. `indexer` worker scheduled → `index_jobs.processed_at` 埋まる + `search_documents` 反映
4. 検索ページで該当ノートがヒット
5. ノート trash → 検索結果から消える
6. 公開設定変更 → public 検索の絞り込みに反映

詳細手順は `.issue/145/testing.md` に記載。

## レビュー履歴

### 1周目: 2026-05-23

**修正した点**:
- 要件P-001 / アーキP-002 への対応: スコープ「含まれないもの」を厳密化。`publication.handleNotePurgedEvent` / `media.handleNotePurgedEvent` / `view.handleNotePurgedEvent` / view 側 trash handler / `tag.*` / `directory.*` 経路を本 Issue 範囲外として明示。別 Issue 起票候補として Phase 4 に引き継ぐ。
- アーキP-001 への対応（最重要）: dispatcher の `buildSnapshotByNoteId` に **trashed status guard** を追加。`note.status === 'trashed'` を null 扱いし、handled + logger.info で skip。これにより outbox 順序保証無しの仕様下で `note.publish_changed` が `note.trashed` より後に dispatch されるレースで index に蘇生する不整合を防ぐ。ADR-007 として記録。
- アーキP-003 への対応: DLQ 行の運用（admin re-drive 経路の必要性）をリスク 10 に追記。ADR-006 にも明文化。
- 要件P-002: `note.trashed` の view 側 handler routing を含まれないものに追加（存在を前提とせずスコープ境界を明示）。
- 要件P-003: `tag.*` / `directory.*` 経路の skipped 継続を regression guard としてテストに追加（ステップ 2）。
- 要件S-003 / アーキS-004: integration テストの観点を追加（fan-out partial retry, trashed status guard E2E, cron 経路は cover しない方針）。
- アーキS-001: ADR-001 の dispatch 純粋性逸脱に対する justification を強化（ingestion/export 経路との非対称性を明記）。
- アーキS-002: nextBatch 同時実行への配慮をリスク 11 に追記。
- アーキS-003: `note.purged` payload の扱いをリスク 12 に追記。
- アーキS-005: deploy 順序の docs 化をリスク 7 に明記。

**取り込んだ改善提案**:
- 要件S-001: drainer 不在問題を Issue コメントとして残す件は Phase 2 でコミット説明 / PR 説明で言及する方針（plan には改めて追記しない）。
- 要件S-002: dispatcher 責務拡大の境界（note.* / publication.* のみ例外）を ADR-001 Consequences に明記。

**見送った提案とその理由**:
- なし。指摘は全て plan / ADR に反映済み。

**未解決の問題**:
- なし。両レビュアー指摘は全て対応済み。

### 2周目: 2026-05-23

**修正した点**:
- アーキ P-001（最重要）: `D1IndexJobRepository.nextBatch` の現行実装が attempts フィルタを持たないことを確認。dlq 行が再選択されて attempts が永久にインクリメントされる問題への対応として、`IndexJobRepository.nextBatch` のシグネチャに `maxAttempts` 引数を追加し、adapter の WHERE 句に `attempts < maxAttempts` を追加する対応をステップ 3 に組み込み。ADR-006 の DLQ 運用方針と実装を整合させる。

**取り込んだ改善提案**:
- アーキ S-001: `note.trashed` の fan-out 順序を search → publication に固定する旨をリスク 5 に明記（partial retry セマンティクスが読みやすくなる）。
- アーキ S-002: 「ADR-007 により蘇生は起きない」の断言を「主要な蘇生レースは塞ぐが残存窓は bulkRebuild で補完」と補正（リスク 3）。
- 要件 S-001: DLQ 可視化（admin UI で `index_jobs WHERE attempts >= 3` を見る）を Phase 4 の別 Issue 起票候補に含める方針（plan の「含まれないもの」セクションと整合）。

**見送った提案とその理由**:
- なし。

**未解決の問題**:
- なし。

### 3周目: 2026-05-23

**結果**: 両視点（要件カバレッジ / アーキ・リスク）とも問題点ゼロを報告。レビューループを終了。
