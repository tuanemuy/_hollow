# 実装計画 — Issue #48: search 経路 (searchOwnNotes) の updatedAt / directoryId / slug projection 実値化 + ADR-013/014 解消

**Issue:** #48
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

`searchOwnNotes` 経由で取得される `OwnedNotesResult.notes[]` に残っている 3 つのプレースホルダ (`updatedAt = new Date(0)` / `directoryId = ""` / `slug = ""`) を、`NoteRepository.findByIds` の二次クエリで実値に置き換える。これにより `.issue/1/adr.md` ADR-013 (`showVisibilityBadge = mode === "filter"` ガード) と ADR-014 (`CalendarView` の search 経路フォールバック) を解消する。

バッジ表示と `updatedAt` 表示は**同時に**有効化することで、Issue #29 ADR-004 が警告する「公開 · 1970年1月1日」 UX 破綻を回避する。

## スコープ

### 含まれるもの

- `NoteRepository` ポートに `findByIds(ids: readonly NoteId[]): Promise<readonly Note[]>` を追加
- `D1NoteRepository.findByIds` を `selectInChunks` + `hydrateMany` で実装
- `searchOwnNotes` usecase 内で `findByIds` を呼び、`directoryId` / `slug` / `updatedAt` を hit に side-join
- 新 DTO `OwnedSearchHitDTO` を `application/dto/search.ts` に追加（`SearchHitDTO` は他 usecase 共有のため触らない）
- `loaders.ts` の search 分岐で `OwnedNoteSearchItem` を `OwnedNoteFilterItem` と field-for-field 同形に
- `NoteList.tsx` の `showVisibilityBadge = kind === "filter"` ガード撤廃と calendar 分岐の一本化
- `CalendarView.tsx` の `kind === "search"` フォールバック分岐撤廃
- `ListView.tsx` の `kind === "search"` 分岐 (`updatedAtDisplay="—"`) の撤廃
- `searchOwnNotes.test.ts` の fake 更新と新ケース追加
- `noteRepository.integration.test.ts` に `findByIds` integration test 追加
- `.issue/1/adr.md` ADR-013 / ADR-014 の Status を `Superseded by Issue #48` に更新

### 含まれないもの

- `searchPublicNotes` 経路の DTO 拡張（公開検索に `directoryId` 等を載せる必要なし）
- `SearchHitDTO` 自体の改変（複数 usecase 共有のため別 DTO で分離）
- `searchOwnNotes` の integration test ハーネス整備（`.issue/29/adr.md` ADR-003 で別 Issue に括られた領域）
- React Testing Library 導入（`.issue/1/adr.md` ADR-023 で導入見送り済み）
- `searchOwnNotes` の `count` セマンティクス変更（既存の `hits.length` 踏襲）

## 実装ステップ

### 1. `NoteRepository` ポートに `findByIds` を追加

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `NoteRepository` interface に以下を追加:
  ```ts
  /**
   * Bulk read by ids. Used by listing pipelines (notably the search
   * path) to materialise per-note fields that are not carried by
   * `SearchHit` (`directoryId` / `slug` / `updatedAt`) without
   * producing N+1 queries. Order is not guaranteed; the caller must
   * re-index by id (typically via `Map<NoteId, Note>`) when preserving
   * input order matters. Ids without a matching row are simply absent
   * from the result. An empty `ids` argument short-circuits to `[]`
   * without touching the DB.
   */
  findByIds(ids: readonly NoteId[]): Promise<readonly Note[]>;
  ```
- **理由:** `TagRepository.findByIds` / `PublicationStateRepository.findByNoteIds` と同命名規約。順序非保証は呼び出し側の `Map` lookup を強制し、adapter 実装をシンプルに保つ。

### 2. `D1NoteRepository.findByIds` を実装

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** `findByOwnerAndSlug` の直後あたり（既存メソッドの並び順に従う）に以下を追加:
  ```ts
  findByIds(ids: readonly NoteId[]): Promise<readonly Note[]> {
    return mapDbError("Failed to find notes by ids", async () => {
      if (ids.length === 0) return [];
      const rows = await selectInChunks(ids as readonly string[], (chunk) =>
        this.db.select().from(notes).where(inArray(notes.id, [...chunk])),
      );
      return this.hydrateMany(rows);
    });
  }
  ```
- **理由:** `findReferrers` (L575-605) と同型。`selectInChunks` で D1 host-var cap (~100) に対する将来防御。`hydrateMany` で child tables (`tagIds`/`internalLinkRefs`/`mediaIds`) を含む完全な `Note` を返す。`SEARCH_LIMIT_MAX = 50` なので現状 1 chunk で完結する。

### 3. 新 DTO `OwnedSearchHitDTO` と projection helper を追加

- **対象ファイル:**
  - `app/core/application/dto/search.ts`
  - `app/core/application/search/view.ts`
- **変更内容:**
  - `dto/search.ts` に `OwnedSearchHitDTO = SearchHitDTO & Readonly<{ directoryId: string; slug: string; updatedAt: string }>` を追加。`directoryId` / `slug` は branded 型を剥がして `string` 平打ちで露出（filter 経路 `loaders.ts` で `n.directoryId as unknown as string` している既存規約に揃える）。`updatedAt` は ISO 8601 文字列。
  - `search/view.ts` に以下を追加:
    ```ts
    export function toOwnedSearchHitView(hit: SearchHit, note: Note): OwnedSearchHitDTO {
      return {
        ...toSearchHitDTO(hit),
        directoryId: note.directoryId as unknown as string,
        slug: note.slug as unknown as string,
        updatedAt: note.updatedAt.toISOString(),
      };
    }
    ```
    `Note.updatedAt` は `Date` 型なので `.toISOString()` で必ず変換する。`Note.directoryId` (branded `DirectoryId`) / `Note.slug` (branded `NoteSlug`) は `as unknown as string` でキャスト。
- **理由:** `SearchHitDTO` は `searchPublicNotes.ts` でも使われている共有 DTO。owner-scope 検索固有の付加情報を直接載せると、公開検索や将来の他検索経路に不要なフィールドが波及する。新 DTO を別名で分離して責務を明確に保つ（`.issue/13` ADR-003 の「sentinel 値を型から消す」と同じ温度感）。

### 4. `searchOwnNotes` で二次クエリを発火し戻り型を拡張

- **対象ファイル:** `app/core/application/search/searchOwnNotes.ts`
- **変更内容:**
  1. `SearchOwnNotesOutput.hits` の要素型を `SearchHitDTO` から `OwnedSearchHitDTO` に変更。
  2. `SearchService.runQuery` の結果が空配列の場合は早期 return（`findByIds` を呼ばない）。
  3. 非空の場合、`container.unitOfWorkProvider.run(async ({ noteRepository }) => noteRepository.findByIds(hitIds))` を発火し、結果を `Map<string, Note>` に再構成。
  4. `result.hits.flatMap(hit => { const note = map.get(hit.noteId); if (note === undefined) return []; return [toOwnedSearchHitView(hit, note)]; })` で hit 順を維持しつつ、DB から消えた id は drop。
- **理由:**
  - **順序保持**: `result.hits` は score 降順。`findByIds` は順序非保証なので `Map.get` 経由で hit 順を維持。
  - **N+1 回避**: 1 ページにつき `findByIds` 1 回（adapter 内も最大 1 chunk）。
  - **競合時の drop**: search index は eventual consistency (`.issue/29/adr.md` ADR-001)。purge 後 index に stale hit が残る僅かなウィンドウで `findByIds` がミスしうる。throw も log もせず drop することで UX を保つ。
  - **UoW 分離**: read-only クエリだが UoW 経由がプロジェクト規約 (CLAUDE.md "Unit of Work")。`resolveDirectoryPathPrefix` と同居している既存 UoW とは独立した read-only UoW として走らせる。

### 5. `loaders.ts` の `OwnedNoteSearchItem` を `OwnedNoteFilterItem` 同形に

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:**
  - `OwnedNoteSearchItem` を `OwnedNoteCommon & Readonly<{ directoryId: string; slug: string; updatedAt: string }>` の**明示拡張**に変更（`type OwnedNoteSearchItem = OwnedNoteFilterItem` alias は不採用 — 将来 search 専用フィールド score/snippet 等が増えたとき alias を壊さず拡張できるように、明示拡張形式に揃える）。
  - JSDoc コメント (L63-75) を「フィールドは filter と同形、`kind` discriminant はページネーション方式の違い (cursor vs page-offset) を表す」と更新。
  - search 分岐の map (L179-187) で `directoryId: hit.directoryId`, `slug: hit.slug`, `updatedAt: hit.updatedAt` を追加。
  - `count: result.hits.length` (L188) は**変更しない**。`searchOwnNotes` 戻り値の `hits` 自体が drop 後の配列になるため、`result.hits.length` を読むだけで描画件数と一致する（ADR-002 参照）。
  - `searchActive = kind === "search"` と見出し文言切替 (`NoteList.tsx` L53/L64) は ADR-004「`kind` discriminant 存続」に従い**温存**する（撤廃対象は `showVisibilityBadge` ガードと表示モード三項のみ）。
- **理由:** `kind` discriminant は pagination セマンティクス（cursor vs offset, `nextCursor` の有意性）の区別として存続させる。フィールド形だけ揃えて consumer の分岐を消す。

### 6. `NoteList.tsx` の ADR-013 / ADR-014 ガード撤廃

- **対象ファイル:** `app/components/note/list/NoteList.tsx`
- **変更内容:**
  - L54 `const showVisibilityBadge = kind === "filter";` を削除し、`ListView` / `TileView` へ `showVisibilityBadge={true}` を渡す（または props を撤廃して常時表示）。
  - L115-122 の `display === "calendar"` 分岐内の `kind === "filter"` 三項を `<CalendarView notes={notes} />` 1 形に統合。
  - L123-135 の `kind === "filter"` / `"search"` 三項を `<ListView notes={notes} showVisibilityBadge />` 1 形に統合。
  - L36-38 のヘッダコメント（visibility プレースホルダ言及）を Issue #48 で解消済みである旨に更新。
- **理由:** search 経路でも実 visibility / 実 updatedAt が届くため UI ガード不要 (ADR-013 / ADR-014 supersede)。バッジと updatedAt の**同時切替**で UX 破綻を防ぐ。

### 7. `CalendarView.tsx` の search 分岐撤廃

- **対象ファイル:** `app/components/note/list/CalendarView.tsx`
- **変更内容:**
  - Props discriminated union を撤廃し、`Readonly<{ notes: readonly OwnedNoteFilterItem[] }>` または `readonly (OwnedNoteFilterItem | OwnedNoteSearchItem)[]` の単一形に。
  - `props.kind === "search"` の早期 return とフォールバック文言ブロック (L52-60) を削除。
  - `useMemo` 内の `props.kind === "filter" ? ... : []` 三項を `groupNotesByDay(props.notes, tz)` に単純化。
  - JSDoc コメント (L31-34) を更新。
- **理由:** `updatedAt = new Date(0)` 問題が消滅したため、フォールバック UI は不要。

### 8. `ListView.tsx` の search 分岐統合

- **対象ファイル:** `app/components/note/list/ListView.tsx`
- **変更内容:**
  - Props を `Readonly<{ notes: readonly (OwnedNoteFilterItem | OwnedNoteSearchItem)[]; showVisibilityBadge: boolean }>` の単一形に。
  - `props.kind === "search"` 分岐 (L124-137) で `updatedAtDisplay="—"` していた箇所を削除し、`formatDate(note.updatedAt)` 単一経路に。
  - JSDoc コメント (L46-51) の「search hits don't carry `updatedAt`」を更新。
- **理由:** search でも `updatedAt` が実値で届くため、表示分岐が不要。

### 9. usecase unit test 更新

- **対象ファイル:** `app/core/application/search/__tests__/searchOwnNotes.test.ts`
- **変更内容:**
  - `makeContainer` の `unitOfWorkProvider.run` fake に `noteRepository.findByIds` の stub を追加。引数の id 群から fake `Note` を返す実装。
  - 新規ケース:
    1. `hit と note が揃ったとき DTO に directoryId/slug/updatedAt が hit 順で乗る`
    2. `findByIds が hit と逆順で返しても hit 順が維持される`
    3. `findByIds が一部欠落で返すと該当 hit は drop される`
    4. `hits 空時に findByIds が呼ばれない (vi.fn().mock.calls.length === 0)`
  - 既存ケース（visibility forwarding 等）は fake が「id 一致の Note を返す」実装になっていれば DTO 変換は通るため、追加 field の assertion 追記のみで通る想定。
- **理由:** 順序保持・N+1 抑止・競合時の保守的挙動を pin。

### 10. adapter integration test 追加

- **対象ファイル:** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
- **変更内容:** 新 `describe("D1NoteRepository.findByIds (integration)")` ブロックを追加:
  1. 空配列 → `[]` (DB 非アクセス検証)
  2. 既知 id 3 件 → 3 件返る（順序非保証なので `Set` 比較）、child tables hydrate 確認
  3. 未知 id 混入 → 該当行のみ欠落、エラーにならない
  4. SAFE_CHUNK_SIZE (90) を超える 91-100 件入力 → 全件返る（chunk 境界 SQL 実行の smoke test）
- **理由:** `inArray` の SQL 実挙動と `hydrateMany` 経由 child fetch を pin する。`.issue/29` ADR-005 (FTS join バグ) の教訓に従い、新規 port は adapter 層 integration test で SQL を固定。chunk 境界ケースは将来 `SEARCH_LIMIT_MAX` を上げたときの安全網。

### 11. `StubNoteRepository` への `findByIds` 追加

- **対象ファイル:** `app/core/domain/directory/__tests__/service.test.ts`
- **変更内容:** `StubNoteRepository implements NoteRepository` クラスに以下を追加:
  ```ts
  findByIds(_ids: readonly NoteId[]): Promise<readonly Note[]> {
    throw new Error("not implemented");
  }
  ```
- **補足:** 他の fake (`app/core/application/view/__tests__/fakes/container.ts`, `app/core/domain/view/__tests__/service.test.ts`) は `as unknown as NoteRepository` キャスト経由なので interface 追加では型エラーにならず、それらの経路で `findByIds` が呼ばれないなら実害なし。本 Issue では view 系テストは search 経路を通さないため追加スタブ不要。
- **理由:** `StubNoteRepository` は `implements NoteRepository` のため、interface に新メソッドを追加すると確実に compile error。`throw` スタブで既存テストが当該経路を踏まないことを担保する。

### 12. ADR ステータス更新

- **対象ファイル:** `.issue/1/adr.md`, `.issue/29/adr.md`
- **変更内容:**
  - `.issue/1/adr.md` の ADR-013 / ADR-014 の `Status` を `Superseded by Issue #48 (search 経路が directoryId/slug/updatedAt を実値化、バッジ＆カレンダーが両モードで動作)` に更新。
  - `.issue/29/adr.md` の ADR-003 / ADR-004 の `Status` も `Superseded by Issue #48` に更新（ADR-003 はフォロー Issue 切り出し、ADR-004 は同時切替の警告。本 Issue で両方解消）。
- **理由:** spec-sync 推奨。後段の Issue で参照されたとき経緯が辿れる。

## 設計判断

詳細は `.issue/48/adr.md` を参照。

- **ADR-001:** `NoteRepository.findByIds` を port に追加し `hydrateMany` 経由で完全な `Note` を返す（軽量版は作らない）
- **ADR-002:** search hit にあるが DB に無い id は throw / log せず結果から drop（eventual consistency 整合）
- **ADR-003:** 新 DTO `OwnedSearchHitDTO` を分離し、共有 DTO `SearchHitDTO` は触らない
- **ADR-004:** `OwnedNotesResult.kind` discriminant は pagination セマンティクス差異のために存続（フィールド形は同形になるが意味的に異なる）

## リスクと注意点

- **順序保持の必須性:** `findByIds` の戻り配列を直接 `map` してはいけない。必ず `Map<noteId, Note>` を介して `result.hits.flatMap` で hit 順を維持する。順序が崩れると cursor pagination の意味が破壊される。
- **drop による count 整合:** `loaders.ts` で `count: result.hits.length` を `count: searchOutput.hits.length` に変えるだけで、drop 後の描画件数と一致する。`nextCursor` は index 起点なので影響なし。
- **同時切替の厳守:** ステップ 5（projection 実値化）と ステップ 6-8（UI ガード撤廃）を**同一 PR**でマージする。`OwnedNoteSearchItem` の field 拡張だけ先にやって UI を残すと「データはあるが UI 非表示」、逆を先にやると「`new Date(0)` バッジ＋公開」UX 破綻。
- **port 追加の波及:** `NoteRepository` を実装/モックしている箇所は grep で全件特定。`findByIds` を追加していない mock があると型エラー。
- **search index lag による軽度の field skew:** `directoryId`/`slug`/`updatedAt` は最新の DB 値、`title`/`tagNames`/`visibility` は index 由来の eventually consistent な値。同一 hit 内で「タイトルは古い・ディレクトリは新しい」状態が稀に発生しうる。`.issue/29/adr.md` ADR-001 の温度感を踏襲し許容する（ADR-002 に明記）。
- **`hydrateMany` の余剰 I/O:** `findByIds` は child tables (`tagIds`/`internalLinkRefs`/`mediaIds`) もロードするため UI 側で未使用の child fetch コストが乗る。SEARCH_LIMIT_MAX=50 で並列 3 クエリ + max 50 host-vars と十分小さく、port の不変条件（完全な `Note` を返す）を優先（ADR-001）。

## テスト方針

### Unit test

- `searchOwnNotes.test.ts`:
  - `directoryId` / `slug` / `updatedAt` が DTO に乗る
  - hit 順保持（`findByIds` 逆順返却ケース）
  - 欠落 id の drop
  - hits 空時の `findByIds` 非呼出
  - 既存 visibility forwarding テスト（fake を id 一致で動かせばそのまま通る）

### Integration test

- `noteRepository.integration.test.ts`:
  - `findByIds` 空配列 → `[]`
  - 複数 id 返却 + child tables hydrate
  - 未知 id 混入の partial result

### Manual / E2E

- 手動テストドキュメント (`spec/manual-tests/` 該当があれば更新、無ければ本 Issue の `manual-test/` で実施)。確認シナリオ:
  1. ホームで検索クエリ実行 → list 表示で `updatedAt` が実日付、`公開/限定公開/非公開` バッジ表示
  2. 検索 + `display=calendar` → カレンダーに日付グルーピング、フォールバック文言が出ない
  3. 検索 + `display=tile` → バッジ表示確認
  4. 検索 0 件 → 「該当するノートがありません」表示（既存挙動維持）

### typecheck / lint / format

- `pnpm typecheck && pnpm lint:fix && pnpm format` を Definition of Done として完走させる
- `pnpm test:unit && pnpm test:integration`

## Issue 要件マッピング

Issue 本文の「設計上の注意」3 点と plan の対応:

| Issue 要件 | 対応ステップ | 検証手段 |
|------------|------------|----------|
| cursor pagination との整合（二次クエリの順序保持） | ステップ4（`Map.get` 経由で hit 順維持） | unit test (`searchOwnNotes.test.ts` 「逆順返却で hit 順保持」) |
| N+1 対策（`findByIds` で一括取得） | ステップ1-2（port 追加 + `selectInChunks`）、ステップ4（1 ページ 1 呼出） | adapter integration test + unit test |
| バッジ表示と `updatedAt` 表示を**同時に**有効化 | ステップ5-8 を**同一 PR**でマージ | manual test (検索結果でバッジ+実日付が同時に出る) |

Issue 本文の「スコープ」3 点と plan の対応:

| Issue スコープ | 対応ステップ |
|----------------|------------|
| `NoteRepository.findByIds` で実値化 | ステップ1-5 |
| `NoteList.tsx` の `showVisibilityBadge` ガード撤廃 | ステップ6 |
| `CalendarView.tsx` の `mode === "search"` フォールバック撤廃 | ステップ7 |

## レビュー反映

### 修正した点

- **P-001 (両レビュー共通)**: `toOwnedSearchHitView` の型変換（Date→ISO string、branded type のキャスト）が plan に明示されていなかった → ステップ3 に擬似コードを追加し、`.toISOString()` と `as unknown as string` キャストを明記
- **P-002 (実現可能性)**: `count` が drop 後の値になる旨を ADR-002 と plan ステップ5 に明記
- **P-003 (実現可能性)**: UoW を 2 回開く設計の根拠を ADR-001 の Consequences と本 plan「リスクと注意点」に追記
- **P-004 (実現可能性)**: ステップ11 を `StubNoteRepository` 具体修正に置換。他の fake は `as unknown as` キャストで型エラー出ないことも明記

### 取り込んだ改善提案

- **S-001 (要件)**: Issue 要件と plan のマッピング表を「Issue 要件マッピング」セクションとして追加
- **S-003 (要件)**: `.issue/29/adr.md` ADR-003/ADR-004 の Status 更新をステップ12 に追加
- **S-004 (要件)**: `searchActive` 文言切替の存続をステップ5 / ADR-004 で明示
- **S-001 (実現可能性)**: alias より明示拡張を推奨する旨をステップ5 に明記
- **S-004 (実現可能性)**: SAFE_CHUNK_SIZE 境界の integration test ケースをステップ10 に追加

### 見送った提案とその理由

- **P-002 (要件)** スコープ表記の「Issue 直接要件」と「派生判断」分離: ADR は既に 4 件で派生判断を明示しており、スコープ「含まれるもの」リストは plan 全体を読めば派生判断であることが文脈で明らかなため、追加分離は冗長と判断。ただし「Issue 要件マッピング」表を追加したことで対応関係は可視化された。
- **S-002 (要件)** `count` 取り違え防止の追記: ステップ5 に明示しなおしたことで包含。
- **S-002 (実現可能性)** テスト名「順序非保証の戻りに対しても」明記: 命名 nitpick として実装時に取り込む（ステップ9 のテストケース名で「`findByIds` の戻り順に関わらず hit 順を維持」と書く）。plan 修正不要。
- **S-003 (実現可能性)** observability 監視 hook: 本 Issue のスコープ外。purge worker 監視は別 Issue 候補（Phase 4 の起票判断対象）。ADR-002 に「将来 metric 追加の場所が決まるまで本 Issue では監視 hook を入れない」を明記。
- **S-005 (実現可能性)** `hits.length === 0` での UoW skip vs adapter 内部短絡: adapter 内 `if (ids.length === 0) return []` の早期 return で usecase 側は `unitOfWorkProvider.run` を毎回呼ぶ設計。D1 の read-only UoW 開始コストは無視できる（ADR-001 Consequences に追記済）ため、usecase 側で skip 分岐を増やすより単純な flow を優先。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ◯（中心構造） | ◯（DTO 分離案） | ◯（最小実装の確認） |
| 取り込んだ点 | UoW 分離・hydrateMany 経由・drop 方針・port 命名規約 | 新 `OwnedSearchHitDTO` 分離・既存 `SearchHitDTO` 不可侵・integration test 設計 | `selectInChunks` 雛形 (`findReferrers`) 引用・YAGNI に従った `kind` 存続判断・loaders 側変更の minimality |

3エージェント間で本質的な意見の相違は無く（DTO 拡張先のみエージェント1が「`SearchHitDTO` 直接拡張」を提案したが、エージェント2/3 が「分離」を推奨し、共有 DTO のため後者を採用）、統合は素直に行えた。
