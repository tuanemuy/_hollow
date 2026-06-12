# PR #653 Full Review — Use Case / Domain Perspective (Round 2)

**PR**: #653 (Issue #619)
**レビュー日**: 2026-06-12
**レビュー視点**: Use Case / Domain（厳格レビュー）
**計画・ADR参照**: `.issue/619/plan.md`, `.issue/619/adr.md` (ADR-001〜007)

---

## ### Use Case / Domain

### 概要

PR #653 は Issue #619（P30 ユーザー公開ページのデザインモック整合）の実装。

**コア要件:**
- ステップ1: `listUserPublicNotes` projection に公開日を追加（ADR-001）
- ステップ2: 期間フィルター（公開日範囲）をポート・ユースケース・アダプターに貫通（ADR-005・006・007）
- ステップ3: ルート schema / loaderDeps に from / to を追加（日付正規化 presentation 境界）
- ステップ4・5・6: フロント構造修正・楽観更新・日付表示（本レビュー対象外）
- ステップ7: テスト（本レビュー対象外）

---

## #### Blockers/Warnings/Notes

### 見つかった指摘 — なし

---

## #### 詳細レビュー

### [N-001] 公開日 projection 設計 — 両 path 共通後処理への集約は正確

**場所**: `app/core/application/publication/listUserPublicNotes.ts:162-178`

**評価**: ✅ 正確・計画通り

- **plan ADR-001 の要求**: 
  > page 確定後の `liveNotes` の id 群に対し `publicationStateRepository.findByNoteIds(noteIds)` を1回呼び、`PublicationState.publishedAt` を id→公開日の Map に詰めて projection に流し込む

- **実装状況**:
  ```typescript
  const publishedAtById = new Map<string, string | null>();
  if (liveNotes.length > 0) {
    const states = await publicationStateRepository.findByNoteIds(
      liveNotes.map((n) => n.id),
    );
    for (const s of states) {
      publishedAtById.set(
        s.noteId as string,
        s.publishedAt !== null ? s.publishedAt.toISOString() : null,
      );
    }
  }
  ```
  両 path（`listByPublishedAt` / `listByNoteColumn`）を通過後に1度だけ呼び出す共通後処理。

- **N+1 回避**: ✅ 
  - `findByNoteIds` は bulk read ポート（既存）
  - `selectInChunks` で D1 host-var 上限を吸収（アダプター `publicationStateRepository.ts:379`）

- **path 非対称性の吸収**: ✅
  - `publishedAt` path は publication を直接見るが、最終的には `liveNotes.map((n) => n.id)` で均一化
  - `noteColumn` path は publication を見ないが、後処理で map を引く
  - 両 path に無関係に同じ map lookup で projection が決まる

- **出力型の責務分離**: ✅
  - `PublicNoteListItem = NoteListItemDTO & { publishedAt: string | null }`（ADR-001 通り）
  - 汎用 DTO を拡張せず、専用出力型で公開ドメイン固有の `publishedAt` を返す

**対応セクション**: ステップ1, ADR-001

---

### [N-002] 期間フィルター（公開日範囲）— `publishedAt` path 実装は正確

**場所**: `app/core/application/publication/listUserPublicNotes.ts:140-149`, `app/core/adapters/d1/repositories/publicationStateRepository.ts:256-262, 318`

**評価**: ✅ 正確・計画通り

- **plan ADR-005 の要求（`publishedAt` path）**:
  > `PublicNoteSortedOpts` に `publishedRange?: DateRange` を追加し、アダプターの `listSortedAll` / `listSortedWithinCandidates` 双方の `whereClause` に `gte(publishedStates.publishedAt, from)` / `lt(publishedStates.publishedAt, toExclusive)` を追加（page と count で同一 where を使うため両方に効く）

- **ユースケース実装**:
  ```typescript
  await args.publicationStateRepository.listPublicNoteIdsByOwnerSorted(
    args.ownerId,
    {
      order: args.order,
      limit: args.limit,
      offset: args.offset,
      ...(candidateIds !== undefined ? { noteIds: candidateIds } : {}),
      ...(args.publishedRange !== undefined
        ? { publishedRange: args.publishedRange }
        : {}),
    },
  );
  ```
  `publishedRange` を `PublicNoteSortedOpts` 経由でポートへ渡す。

- **アダプター実装**:
  ```typescript
  const whereClause = and(
    eq(publicationStates.ownerId, ownerId),
    eq(publicationStates.visibility, "public"),
    isNotNull(publicationStates.publishedAt),
    eq(notes.status, "active"),
    ...publishedRangeConditions(opts.publishedRange),
  );
  // この where が page (`limit`/`offset`) と count (`countRows`) の両方に効く
  ```
  `publishedRangeConditions` helper が page と count 双方の SQL に展開される。

- **`items.length <= total` 不変条件の維持**: ✅
  - page と count が同じ `whereClause` を使う（line 256 定義、line 282 の count で再利用）
  - candidate path でも両方に適用（line 318 の chunked query）

**対応セクション**: ステップ2, ADR-005

---

### [N-003] 期間フィルター（`noteColumn` path）— 公開日範囲 id 解決メソッドは正確

**場所**: `app/core/application/publication/listUserPublicNotes.ts:288-335`, `app/core/adapters/d1/repositories/publicationStateRepository.ts:348-374`

**評価**: ✅ 正確・計画通り（ADR-007 実装時判断に従う）

- **plan / ADR-005 の背景**:
  - `noteColumn` path（updatedAt / createdAt / title ソート時）は `noteRepository.listWithCount` で note 列を見る
  - publication aggregate を見ないため、期間フィルターを SQL に直接付与できない
  - **解決方法**: publication 側で期間に合致する note id 群を先に列挙し、`noteRepository.listWithCount` の候補集合として渡す

- **ADR-007 実装時判断**:
  > `noteColumn` path の公開日範囲解決は専用メソッド `listPublicNoteIdsByOwnerInRange` を新設（ADR-005 が示唆した「専用列挙メソッド or `candidateSets` 合流」のうち、列挙メソッド側を採用）

- **ユースケース実装**:
  ```typescript
  let publishedNoteIds: readonly NoteId[] | undefined;
  if (args.publishedRange !== undefined) {
    publishedNoteIds =
      await args.publicationStateRepository.listPublicNoteIdsByOwnerInRange(
        args.ownerId,
        args.publishedRange,
        PUBLISHED_RANGE_CANDIDATE_CAP,  // = 1000 (TAG_CANDIDATE_CAP 相当)
      );
    if (publishedNoteIds.length === 0) {
      return { liveNotes: [], total: 0 };  // 期間内ノート0件 → 短絡
    }
  }

  const opts: NoteOwnerListOpts = {
    visibility: ["public"],
    status: "active",
    ...(args.tagIds !== undefined ? { tagIds: args.tagIds } : {}),
    ...(publishedNoteIds !== undefined ? { noteIds: publishedNoteIds } : {}),
    // ...
  };
  ```
  **重要な点**:
  - 期間内の note id を解決
  - それを `noteIds` 候補フィルタとして `listWithCount` へ渡す（既存の `candidateSets` 機構に乗る）
  - 0件なら短絡（無駄なクエリ回避）

- **アダプター実装**:
  ```typescript
  async listPublicNoteIdsByOwnerInRange(
    ownerId: UserId,
    publishedRange: DateRange,
    limit: number,
  ): Promise<readonly NoteId[]> {
    const rows = await this.db
      .select({ noteId: publicationStates.noteId })
      .from(publicationStates)
      .innerJoin(notes, eq(notes.id, publicationStates.noteId))
      .where(
        and(
          eq(publicationStates.ownerId, ownerId),
          eq(publicationStates.visibility, "public"),
          isNotNull(publicationStates.publishedAt),
          eq(notes.status, "active"),
          ...publishedRangeConditions(publishedRange),
        ),
      )
      .orderBy(asc(publicationStates.noteId))  // 安定した順序
      .limit(limit);
    return rows.map((r) => NoteId.create(r.noteId));
  }
  ```
  - `active` note のみ（trash lag を吸収）
  - `limit` で cap （D1 host-var上限への対策）
  - `publishedRangeConditions` で `gte/lt` を適用

- **`items.length <= total` 不変条件の維持**: ✅
  - `noteRepository.listWithCount` の既存機構（`buildOwnerListWhere` の `candidateSets` 交差）に乗る（plan ADR-005 実装方針参照）
  - `noteIds` フィルタは既存（line 67 の JSDoc参照）
  - 両 path（tag 候補・公開日範囲）が同じ `intersectIdSets` で交差

- **レーンの役割分離（経路マトリクス ADR-005）**: ✅
  | 解決対象 | `publishedAt` path | `noteColumn` path |
  |---|---|---|
  | タグ候補 | note 側で解決 → noteIds で publication へ | note 側で解決 → candidateSets へ |
  | 公開日範囲 | publication SQL に gte/lt を直接付与 | **publication 側で id 解決** → noteIds 候補集合として note へ |

**対応セクション**: ステップ2, ADR-005・007

---

### [N-004] ポート定義（`PublicNoteSortedOpts`）— contract は正確

**場所**: `app/core/domain/publication/ports/publicationStateRepository.ts:29-35`

**評価**: ✅ 正確

```typescript
export type PublicNoteSortedOpts = Readonly<{
  order: "asc" | "desc";
  limit: number;
  offset: number;
  noteIds?: readonly NoteId[];
  publishedRange?: DateRange;
}>;
```

- `publishedRange?: DateRange` を新規追加（ADR-006 通り）
- `noteIds` は既存（tag AND-filter 候補用）で、本設計ではそれの別用途（非競合）
- JSDoc が半開契約 + presentation 境界での inclusive 正規化を明記（line 24-26）
  > `to` maps to a `lt(published_at, to)`. The range is the same `DateRange` half-open VO the note-list filter uses; the P30 presentation boundary pre-normalises `to` to the day-after-00:00 so the user-chosen end date is inclusive (#619 ADR-006).

**対応セクション**: ステップ2, ADR-005・006

---

### [N-005] NoteOwnerFilters に `noteIds` フィルタが追加 — 既存設計との整合

**場所**: `app/core/domain/note/ports/noteRepository.ts:60-68`

**評価**: ✅ 正確

```typescript
export type NoteOwnerFilters = Readonly<{
  // ...既存フィルタ...
  noteIds?: readonly NoteId[];
}>;
```

- **JSDoc (line 50-58)**:
  > `noteIds` restricts to notes whose id is **any** of the supplied ids — a pre-resolved note-id candidate set the caller computed elsewhere (e.g. the P30 public listing resolves the公開日範囲 filter on the publication aggregate and passes the matching ids here so a note-column-sorted page still honours that filter — #619 ADR-005). It is intersected with the other candidate sets (tag AND etc.) on the adapter side, so `items.length <= count` is preserved.

  **正確性**: P30 の period-filtering 用途をそのまま明記。設計意図が明示的。

- **既存インターフェースとの互換**: ✅
  - 空配列は "match nothing"（既存の `intersectIdSets` 動作）
  - `undefined` は "no filter"
  - tag `tagIds` 等との交差に自動的に乗る

**対応セクション**: ステップ2, ADR-005・007

---

### [N-006] DateRange VO 契約 — 半開 `[from, to)` の意味論を保持

**場所**: `app/core/domain/note/valueObject.ts:444-446`（参考）, `app/components/public/publicDateRange.ts`, `app/core/adapters/d1/repositories/publicationStateRepository.ts:50-66`

**評価**: ✅ 正確・ADR-006 通り

- **VO の契約（valueObject.ts の既存 JSDoc）**:
  > `DateRange` は半開 `[from, to)`

- **presentation 境界での正規化（`publicDateRange.ts:17-40`）**:
  ```typescript
  export function normalizePublicDateRange(
    from: string | undefined,
    to: string | undefined,
  ): DateRange | undefined {
    const fromDate = parseDateOnly(from);
    const toExclusive = to !== undefined ? nextDayUtc(to) : null;  // ← 翌日 00:00 に正規化
    if (fromDate === null && toExclusive === null) return undefined;
    return { from: fromDate, to: toExclusive };
  }
  ```
  **関鍵**: ユーザーが「2026-06-12」を選ぶ → `to` に「2026-06-13 00:00:00Z」を詰める → アダプターで `lt(published_at, to)` 適用 → 06-12 23:59:59Z までが含まれる（inclusive）

- **アダプター実装（`publicationStateRepository.ts:54-66`）**:
  ```typescript
  function publishedRangeConditions(range: DateRange | undefined): SQL[] {
    if (range === undefined) return [];
    const conditions: SQL[] = [];
    if (range.from !== null) {
      conditions.push(
        gte(publicationStates.publishedAt, range.from.toISOString()),
      );
    }
    if (range.to !== null) {
      conditions.push(lt(publicationStates.publishedAt, range.to.toISOString()));  // ← lt で半開
    }
    return conditions;
  }
  ```

- **off-by-one の防止**: ✅
  - VO 契約は変わらない（半開のまま）
  - presentation 側で `to` を翌日に正規化
  - アダプターは `gte/lt` で半開を実装
  - 意図的な差分（auth 側の `to` 当日除外 vs P30 の `to` 当日包含）を ADR-006 に明記

**対応セクション**: ステップ3, ADR-006・007

---

### [N-007] ルート schema & loaderDeps — 文字列→Date 変換層の規約に従う

**場所**: `app/routes/u/$username/index.tsx:36-44, 115-122`

**評価**: ✅ 正確・CLAUDE.md 規約に従う

- **ルート search schema（validateSearch）**:
  ```typescript
  const publicTopSearchSchema = paginationSearchSchema.extend({
    // ...
    from: z.string().date().optional().catch(undefined),
    to: z.string().date().optional().catch(undefined),
  });
  ```
  - `z.string().date()` は既存規約（auth 側 `noteListSearchSchema` と同じ）
  - `.catch(undefined)` で不正値は無視（transport 形状検証）
  - **transport 境界** = URL param 検証

- **loaderDeps**:
  ```typescript
  loaderDeps: ({ search }) => ({
    page: search.page,
    limit: search.limit,
    tags: search.tags,
    sort: search.sort,
    from: search.from,      // ← 文字列のまま server-driven
    to: search.to,
  }),
  ```
  - `from` / `to` は server-driven（loaderDeps に含まれる）→ 値の変更時に loader 再実行
  - `display` は除外（ADR-004、client-only）

- **server fn 入力 schema**:
  ```typescript
  const renderInputSchema = z
    .object({
      username: z.string().min(1).max(64),
      // ...
      from: z.string().date().optional(),
      to: z.string().date().optional(),
    })
    .extend(paginationSchema.shape);
  ```
  - server fn 内でも `YYYY-MM-DD` 文字列のまま受け取る

- **presentation 境界での Date 変換（`UserPublicTop.tsx:101-102`）**:
  ```typescript
  const publishedRange = normalizePublicDateRange(from, to);
  ```
  - **正確性**: server component（RSC）内で string→DateRange 変換
  - ユースケースは `DateRange` VO を受ける（CLAUDE.md「ユースケースは VO を受ける」に従う）

**対応セクション**: ステップ3, ADR-006

---

### [N-008] Presentation 層の正規化ヘルパ — `normalizePublicDateRange` の実装は堅実

**場所**: `app/components/public/publicDateRange.ts`

**評価**: ✅ 実装が堅実、テスト対象候補

- **実装の要点**:
  - `parseDateOnly(date: string | undefined): Date | null` → `YYYY-MM-DD` → その日の UTC 00:00
  - `nextDayUtc(date: string): Date | null` → `YYYY-MM-DD` → 翌日の UTC 00:00
  - 不正値（NaN 日付）は `null` で返す（defensive）
  - 両方 null なら全体を `undefined` で返す（フィルタ未設定）

- **テスト対象となるべき境界** (plan ステップ7):
  > **期間境界（from のみ / to のみ / 同日 from=to / 終了日当日が含まれること）を必ずカバー**（ADR-006 の off-by-one 防止）

  実装は正しいが、PR の差分範囲では unit test が見当たらない（※本レビュー範囲外）

**対応セクション**: ステップ3, ADR-006・007

---

### [N-009] イ usecase 入出力型の責務分離 — 正確

**場所**: `app/core/application/publication/listUserPublicNotes.ts:23-68`

**評価**: ✅ 正確・ドメインロジック漏出なし

- **入力型（`ListUserPublicNotesInput`）**:
  - `publishedRange?: DateRange` ← VO を受ける（string ではない）
  - JSDoc が「half-open VO」「presentation 側で正規化」を明記（line 44-50）

- **出力型（`ListUserPublicNotesOutput`）**:
  ```typescript
  export type ListUserPublicNotesOutput = Readonly<{
    notes: readonly PublicNoteListItem[];
    total: number;
  }>;
  ```
  - `PublicNoteListItem = NoteListItemDTO & { publishedAt: string | null }`
  - 公開日が ISO-8601 文字列（serializable）

- **ドメインロジック漏出なし**: ✅
  - 日付境界調整（翌日 00:00 化）は presentation 層が責任
  - アダプターは受け取った VO を `toISOString()` で SQL に流す（VO の意味を変えない）

**対応セクション**: ADR-001・006・007

---

## まとめ

### 指摘サマリー

| 視点 | 件数 | 詳細 |
|---|---|---|
| Blockers | 0 | なし |
| Warnings | 0 | なし |
| Notes（情報） | 9 | 正確性確認 + ADR 整合性確認 |

### Use Case / Domain 層の所見

**完成度**: ✅ **優秀**

1. **公開日 projection（ADR-001）**
   - 両 path の非対称性を共通後処理で吸収 → N+1 回避
   - 汎用 DTO を汚さず専用出力型で返す → 責務分離

2. **期間フィルター（ADR-005・006・007）**
   - `publishedAt` path: publication SQL に範囲条件を直接付与
   - `noteColumn` path: publication 側で id 解決 → note 側の candidateSets に乗る（既存機構の正しい活用）
   - 両 path 共存で user 自由度を損なわない

3. **off-by-one 防止（ADR-006）**
   - VO 契約（半開）は保つ
   - presentation 層で `to` を翌日に正規化 → inclusive な UX
   - アダプターは `gte/lt` で半開を実装（VO の意味を変えない）

4. **不変条件（`items.length <= total`）**
   - page と count が同じ where に従う
   - candidate 交差が両 path で共通（`candidateSets` 機構）
   - 構造的に破綻なし

5. **ドメイン漏出なし**
   - 日付正規化は presentation 層が責任
   - ユースケースは VO のみ
   - アダプターは query 実装に専念

### PR 推奨結論

**承認可** — Use Case / Domain 層は計画・ADR を正確に実装。アーキテクチャ上の懸念事項なし。

---

**レビュワー**: Claude Code  
**レビュー完了日**: 2026-06-12
