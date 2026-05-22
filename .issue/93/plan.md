# 実装計画 — Issue #93: bulkRebuildFromSnapshots を呼ぶ admin operation / worker 経路の配線

**Issue:** #93
**作成日:** 2026-05-22
**複雑度:** 中〜大規模

---

## 目的

`SearchIndex.bulkRebuildFromSnapshots` を呼び出す **production の admin operation 経路** を新設し、port → adapter → usecase → presentation の通電を完成させる。`.issue/50/adr.md` ADR-002 で deferred になっていた「migration 内リビルド vs 運用経路リビルドの責務分担」を本 Issue 内で確定させる。

## スコープ

### 含まれるもの
- `app/core/application/adminSettings/rebuildSearchIndex.ts` の新規ユースケース（`assertAdmin` → AsyncIterable<SearchDocument> generator → `searchIndex.bulkRebuildFromSnapshots`）
- `app/core/application/search/buildNoteSnapshot.ts` の snapshot 構築ヘルパ（バッチ版含む）
- `app/core/application/dto/adminSettings.ts` への `RebuildSearchIndexResultDTO` 追加
- `app/core/domain/search/errorCode.ts` に `RebuildAlreadyRunning` 等の必要なコードを追加（本実装で投げない場合は不要）
- admin server-fn `rebuildSearchIndexFn`（presentation 層、`app/components/admin/Jobs/action.ts` に追記）
- admin UI ボタン（`/admin/jobs` ページに追加 / 新規 route は作らない）
- 単体テスト + integration テスト
- `spec/usecases/adminSettings.md` / `spec/domains/search.md` の更新
- 本 Issue 用 ADR の追加（`.issue/93/adr.md`）
- 動作確認用 `.issue/93/testing.md` の作成

### 含まれないもの
- migration 内の `INSERT … SELECT FROM search_documents` の変更（ADR-002 維持）
- `dispatchDomainEvent` の `note.saved` skipped 解消（別 Issue）
- resumable rebuild（cursor 永続化）— 本実装は単一リクエスト完結。corpus 拡大時の拡張余地として ADR にメモ
- LIKE フォールバック等の検索 UX 改善（`.issue/50/adr.md` ADR-001 と同じく out of scope）
- 排他制御の実装（永続ロック / 専用 port / 等）— rebuild 経路は idempotent な DELETE + INSERT で eventual consistency を採用、明示的な排他は行わない（ADR-003 参照）
- rebuild 結果の永続化（最終 rebuild 時刻 / 件数の instance_settings 等への保存）— server-fn 戻り値のみで、UI はセッション内表示

## 配線方針の選択

候補 A / B / C を比較した結果、**候補 A（admin route + usecase + presentation）** を採用する。

| 観点 | A: admin route + usecase | B: rebuild worker (cron) | C: CLI / wrangler |
|---|---|---|---|
| 運用イメージ | admin が任意のタイミングで叩く | cron 自動 | admin が手動で wrangler 経由 |
| Cloudflare 制約 | 30s 上限あり（本 corpus サイズでは余裕） | 15 min 上限・自動化向き | TS 経路なし、SQL 直叩き相当 |
| インフラ追加 | なし | Worker 1 つ追加・4 ファイル更新 | なし |
| Issue 意図適合 | 高（port 通電・admin 経路） | 低（"on demand" には不向き） | 低（SQL 直叩きと等価） |
| 採否 | **採用** | 不採用 | 不採用 |

採用根拠は `.issue/93/adr.md` ADR-001 に詳述。

## 実装ステップ

### 1. snapshot 構築ヘルパの追加

- **対象ファイル:** `app/core/application/search/buildNoteSnapshot.ts`（新規）
- **変更内容:**
  - `buildNoteSnapshots(notes: Note[], deps: { directoryRepository, tagRepository, publicationStateRepository, htmlSanitizer }): Promise<NoteSnapshot[]>` をバッチ版として提供
  - 内部で `directoryRepository.findByIds`, `tagRepository.findByIds`, `publicationStateRepository.findByNoteIds` をまとめて呼ぶ（N+1 防止）
  - `note.contentHtml` → `htmlSanitizer.toPlainText` で `plainBody` 生成
  - `note.frontMatter['date']` を `Date | null` に解釈する小さなヘルパ `parseFrontMatterDate(value: unknown): Date | null` を併設（不正値は null）
  - `directoryPath` は `DirectoryService.computePath` を利用、`tagNames` は `tags.map(t => t.name)`、`visibility` は publication_state が無ければ `'private'`
- **理由:** snapshot は複数 repository を跨ぐ projection であり、application 層の concern。rebuild 経路で初めて production に乗るため、再利用可能なヘルパとして切り出す

### 2. ユースケース `rebuildSearchIndex` の追加

- **対象ファイル:** `app/core/application/adminSettings/rebuildSearchIndex.ts`（新規）、`app/core/application/adminSettings/index.ts`（export 追加）
- **変更内容:**
  - 入力: `{ actorUserId: UserId }`
  - 出力: `RebuildSearchIndexResult = { processedCount: number; startedAt: Date; finishedAt: Date }`
  - 定数: usecase 冒頭に独立した `const REBUILD_PAGE_SIZE = 50;` `const REBUILD_USER_PAGE_SIZE = 50;`（`SearchLimit` 上限とは独立、ADR-002 参照）
  - フロー:
    1. 認可 UoW: `unitOfWorkProvider.run(({ userRepository }) => assertAdmin(userRepository, actorUserId))`
    2. `now = clock.now()`、`startedAt = now`、`let processedCount = 0;`（usecase スコープの closure 変数）
    3. AsyncIterable generator を以下のように構築（外側 closure の `processedCount` を increment する）:
       - owner enumerator: **cursor ベース**で `userRepository.listAll({ limit: REBUILD_USER_PAGE_SIZE, cursor })` を loop。終端条件は **`results.length === 0` または `results.length < REBUILD_USER_PAGE_SIZE`**（後者は最終ページ）。次の `cursor` は最後の `user.id`
       - per-owner notes: `noteRepository.findByOwner(ownerId, { status: 'active', limit: REBUILD_PAGE_SIZE, offset })` を offset ベースでページング。終端条件は **`results.length < REBUILD_PAGE_SIZE`**。各ページごとに **新しい UoW を開いて** `buildNoteSnapshots` を呼び、`SearchDocument.fromSnapshot(snapshot, now)` を `yield` する直前に `processedCount++`
    4. `searchIndex.bulkRebuildFromSnapshots(generator())` を UoW の外で `await`
    5. `{ processedCount, startedAt, finishedAt: clock.now() }` を返す
  - エラー:
    - `assertAdmin` 失敗 → `ForbiddenError('FORBIDDEN_ADMIN_ONLY')`
    - `SearchIndexUnavailableError` / `SystemError(DatabaseError)` → propagate
    - 排他は行わない（ADR-003 参照）。並走時の挙動は eventual consistency に任せる
- **理由:** spec/usecases/adminSettings.md の admin operation 規約（`assertAdmin` 入口）に準拠。snapshot 構築は read-only なので per-page UoW で D1 statement budget 内に収まる。`userRepository.listAll` は port が cursor ベースなので offset ではなく cursor ループを採用。`processedCount` は usecase スコープの closure 変数で counter を持ち、generator が yield するたび increment、adapter 側が consume 完了後に最終値を return DTO に含める

### 2-a. SearchErrorCode の整備（必要な場合のみ）

- **対象ファイル:** `app/core/domain/search/errorCode.ts`
- **変更内容:** ADR-003 で排他不採用に決めたため `BusinessRuleError('rebuild_already_running')` は投げない。`SearchErrorCode` への追加は本 Issue 範囲では不要。将来排他を実装する Issue で `RebuildAlreadyRunning: "search_rebuild_already_running"` を追加する想定
- **理由:** CLAUDE.md `*ErrorCode` 命名規約（`BusinessRuleError(...)` の文言は対応する `*ErrorCode` 定数値と verbatim 一致）。本 Issue では新たな `BusinessRuleError` を投げないため定数追加なし

### 3. DTO と spec の更新

- **対象ファイル:**
  - `app/core/application/dto/adminSettings.ts` — `RebuildSearchIndexResultDTO = { processedCount: number; startedAt: string; finishedAt: string }`（ISO）を追加
  - `spec/usecases/adminSettings.md` — `## RebuildSearchIndex` 節を追加
  - `spec/domains/search.md` — 「`bulkRebuildFromSnapshots` は AdminSettings.RebuildSearchIndex から呼ばれる」「`frontMatter['date']` を Date | null に解釈する」を 1-2 行追記
  - `spec/usecases/search.md` — 「`bulkRebuildFromSnapshots` 経路は AdminSettings.RebuildSearchIndex を参照」を 1 行で相互参照（ADR-004 Consequences と整合）
  - `docs/runtime_cloudflare.md` — 「migration 内リビルド vs admin operation リビルドの使い分け（schema 変更時 / index 破損時）」を 1 文追記（ADR-001 Consequences と整合）
- **理由:** spec が code authority。新ユースケースを spec に反映しないと spec-sync で乖離が出る。運用知識（どちらのリビルドをいつ使うか）も ADR にしか残らないと spec-sync で乖離する

### 4. presentation 層: admin server-fn の追加

- **対象ファイル:**
  - `app/components/admin/Jobs/action.ts`（既存に追記、または新規 `app/components/admin/SearchRebuild/action.ts`）
  - `app/routes/admin/jobs.tsx`（UI ボタンを追加）
- **変更内容:**
  - 既存 admin 系 server-fn（`app/components/admin/UsersTable/action.ts` の `suspendUserFn` 等）と同じパターンで実装:
    ```ts
    export const rebuildSearchIndexFn = createServerFn({ method: "POST" })
      .middleware([errorResponseMiddleware])
      .handler(async () => {
        const { requireAdminUser } = await import("@/lib/server/currentUser");
        const actor = await requireAdminUser(); // Promise<User>
        const { container, module } = await loadServerDeps(
          () => import("@/core/application/adminSettings/rebuildSearchIndex"),
        );
        return module.rebuildSearchIndex({
          container,
          input: { actorUserId: toUserIdDTO(actor.id) },
        });
      });
    ```
    （`toUserIdDTO` ヘルパは同 file 内に `UsersTable/action.ts` と同様に定義、または既存ヘルパを再利用）
  - `/admin/jobs` ページに「検索インデックスを再構築」セクションを追加。React 19 form action で `rebuildSearchIndexFn` を呼び、結果（`processedCount` / `finishedAt`）を表示。**実行中はボタンを disabled** にして多重押下を防止（ADR-003 のクライアント側多重押下防止）
- **理由:** 既存 admin server-fn パターン（`requireAdminUser` + `loadServerDeps`）に準拠。`errorResponseMiddleware` で structurally serialize される

### 5. テスト追加

- **対象ファイル:**
  - `app/core/application/adminSettings/__tests__/rebuildSearchIndex.test.ts`（unit）
  - `app/core/application/adminSettings/__tests__/rebuildSearchIndex.integration.test.ts`（integration）
- **変更内容:**
  - unit:
    - non-admin → `ForbiddenError`
    - 0 user → `processedCount === 0`、空 generator で `bulkRebuildFromSnapshots` 呼び出し
    - 複数 user × 複数 note → 全 active が yield される、trashed 除外、frontMatterDate 解釈、tagNames / visibility / directoryPath が一致
    - `SearchIndexUnavailableError` propagate
  - integration:
    - 2 user × 各 5 note（active / trashed / public / private mix）を seed
    - rebuild 実行後、`search_documents` 行数と内容を直接 SELECT で検証、`searchIndex.query` で代表ノートが hits
- **理由:** unit はロジック網羅、integration は adapter 連携と排他確認

### 6. typecheck / lint / format / test

- 変更後 `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit && pnpm test:integration` を通す

## 設計判断

詳細は `.issue/93/adr.md` を参照。

- **ADR-001:** 候補 A（admin route + usecase）採用、`.issue/50/adr.md` ADR-002 の責務分担再評価
- **ADR-002:** `REBUILD_PAGE_SIZE = 50`（`SearchLimit` 上限とは独立した定数）/ per-page UoW / `bulkRebuildFromSnapshots` 全体は UoW の外
- **ADR-003:** 排他は採用しない。`bulkRebuildFromSnapshots` の DELETE + INSERT は冪等で、並走時は eventual consistency に任せる。モジュールレベル可変フラグは application 層の stateless 原則・test isolation に反するため不採用
- **ADR-004:** usecase の所属先は `adminSettings/`（search/ ではない）

## リスクと注意点

- **Worker 30s 上限**: 本 corpus サイズ（数千ノート想定）では数秒。超過時の段階的拡張として `ctx.waitUntil` 越しの background 化 → さらなる拡大で resumable rebuild、を ADR-001 Consequences に明記（本 Issue では実装しない）
- **`note.frontMatter['date']` 解釈**: `parseFrontMatterDate` で string/Date/null 判定、不正値は null 扱い。仕様を `spec/domains/search.md` に追記
- **`note.saved` event dispatch が `skipped`** という現状は本 Issue スコープ外だが rebuild の運用意義を強化している。別 Issue で扱う
- **`searchIndex.bulkRebuildFromSnapshots` 内部の DELETE 影響**: 他テストとの干渉を避けるため integration test は専用ファイルに分離。実装ステップ 5 で `pnpm test:integration` を実走させ、`searchIndex.integration.test.ts` 等と干渉するか確認。干渉が見られたら vitest projects の sequential / isolate 設定を追加
- **D1 statement budget**: `REBUILD_PAGE_SIZE=50` × ~4 repository = ~200 statements/UoW で D1 上限 1000 内だが、`findByOwner` が JOIN を含む可能性があり実測で増える余地がある。実装時に EXPLAIN を取り、超過しそうなら PAGE_SIZE を 25 に下げる
- **rebuild 中の generator throw**: usecase の generator が throw した場合、`bulkRebuildFromSnapshots` 内部の最初の `DELETE` 実行後だと index が空になる可能性。`mapDbError` でラップされた `SystemError(DatabaseError)` として presentation 層に届くので、admin は再実行で復旧可能（生 throw は presentation 層で structurally serialize される）
- **並走 rebuild**: 排他しない方針（ADR-003）のため、2 つの rebuild が並走すると index が片方のスナップショットに収束する。admin 操作が稀である前提で受け入れ、UI 側でボタン disable などのクライアント側の多重押下防止だけ行う
- **rebuild 結果の永続化なし**: 「最終 rebuild 時刻」を後から確認する手段は本実装にはない。server-fn の戻り値で実行直後にだけ表示する

## テスト方針

- unit: vitest（fake repositories + fake searchIndex で網羅）
- integration: miniflare D1 で seed → rebuild → 直接 SELECT で検証
- 手動: `/admin/jobs` の rebuild ボタン → 完了表示 → `/search` で結果確認（testing.md）

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点）**:
- S-001: server-fn は `app/components/admin/Jobs/action.ts` に追記すると確定（「含まれるもの」へ反映）
- S-002: rebuild 結果の永続化はスコープ外であることを「含まれないもの」とリスクに明記
- S-003: `testing.md` の作成を「含まれるもの」に追加

**修正した点（アーキ・リスク視点）**:
- P-001: `BusinessRuleError('rebuild_already_running')` を投げる方針自体を取り下げた（ADR-003 で排他不採用）。`SearchErrorCode` 追加は不要であることをステップ 2-a で明記
- P-002: `userRepository.listAll` は cursor ベース（port は `{ limit, cursor?: UserId }`）なので、計画を cursor ループに修正
- P-003: モジュールレベル `let isRunning` を廃止。stateless 原則・test isolation 違反のため。排他は採用せず eventual consistency に任せる（ADR-003 改訂）
- P-004: `processedCount` は usecase スコープの closure 変数で持つ。generator が yield するたび increment、`bulkRebuildFromSnapshots` consume 完了後に return DTO に含める、と明示
- S-002（R2）: `REBUILD_PAGE_SIZE` を `SearchLimit` と独立した定数として宣言
- S-003（R2）: `ctx.waitUntil` 越しの background 化を corpus 拡大時の段階的拡張として ADR-001 Consequences に追記
- S-004（R2）: integration test の vitest 設定確認をリスク欄に追加

**取り込まなかった改善提案**:
- S-001（R2）「`searchOwnNotes` との DRY」: `searchOwnNotes` は SearchQuery を作るだけで snapshot 構築はしないため重複なし。スコープ外

### 2周目

**修正した点（要件カバレッジ視点）**:
- S-001（R1-R2）: `spec/usecases/search.md` への相互参照追加をステップ 3 に追記（ADR-004 Consequences と整合）
- S-002（R1-R2）: `docs/runtime_cloudflare.md` の使い分け 1 文追記をステップ 3 に追記（ADR-001 Consequences と整合）

**修正した点（アーキ・リスク視点）**:
- P-001（R2-R2）: server-fn のサンプルコードを修正。`requireAdminUser()` は `Promise<User>` を返すので `actor.id` を `toUserIdDTO` で UserIdDTO に変換して渡す。既存 `suspendUserFn` パターンに揃えた。`isolatedModules` 互換のため `requireAdminUser` は handler 内で動的 import
- S-001（R2-R2）: cursor 終端条件を「空配列 OR `< limit`」と明示
- S-002（R2-R2）: offset 終端条件を「`< REBUILD_PAGE_SIZE`」と明示
- S-003（R2-R2）: D1 statement budget の試算と「EXPLAIN で実測、超過時 PAGE_SIZE=25」のフォールバックをリスク欄に明記
- S-004（R2-R2）: vitest sequential 設定の検討フローを「実装ステップ 5 で `pnpm test:integration` を実走」のリスク欄に追記

**取り込まなかった改善提案**: なし


