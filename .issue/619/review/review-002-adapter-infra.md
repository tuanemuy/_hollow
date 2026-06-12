# PR #653 Round 2 レビュー — Adapter / Infrastructure 観点

**PR:** #653（Issue #619, ブランチ issue/619/p30-design-parity）  
**レビュー日:** 2026-06-12  
**レビューラウンド:** Round 2 (Full re-audit)  
**観点:** Adapter / Infrastructure (D1 SQL)

---

## Blockers

なし

---

## Warnings

### [W-001] `listSortedWithinCandidates` の chunk 内 type assertion コメント明示性

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:321-326`

**説明:**

```typescript
// line 321-322
// `isNotNull` (line 316) guarantees a non-null published_at; narrow
// the column type safely.
return chunkRows.map((r) => ({
  noteId: r.noteId,
  publishedAt: r.publishedAt as string,  // ← type assertion
}));
```

`isNotNull(publicationStates.publishedAt)` が where 句に含まれているため、`as string` アサーションは論理的には安全です。ただし、`publishedRangeConditions` が `from===null && to===null` の場合に空配列を返すことで、「型ナローイング前提の形式的な保証がコード上で一瞥明白でない」という可能性があります。

**理由:**

`publishedRangeConditions` が範囲フィルタを SQL に追加しても、`isNotNull` チェックは独立して成立するため、型ナローイングは安全です。しかし、将来の保守時に「range filter が NULL を排除するのでは」という誤解が生じうるため、前提をより明示的に記述するとよいです。

**提案:**

```typescript
// `isNotNull` (line 316) guarantees published_at is non-null regardless
// of the publishedRange conditions. Type assertion is safe.
return chunkRows.map((r) => ({
  noteId: r.noteId,
  publishedAt: r.publishedAt as string,
}));
```

既存コメントで安全性は示唆されていますが、「regardless of the publishedRange conditions」を明言するとより safe になります。

---

### [W-002] `listSortedWithinCandidates` での memory 内 sort の determinism

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:334-339`

**説明:**

```typescript
const sorted = [...rows].sort((l, r) => {
  if (l.publishedAt !== r.publishedAt) {
    return l.publishedAt < r.publishedAt ? -sign : sign;
  }
  return l.noteId < r.noteId ? -1 : l.noteId > r.noteId ? 1 : 0;
});
```

tie-break は `noteId` の文字列比較で決定論的に成立します。ただし、複数の chunk から返されたレコードをマージする際に、**chunk 間の order 依存性がない** ことを前提にしています。

**分析:**

- candidates は `findByOwner` から返される id 群（重複なし、ユニーク） ✓
- `selectInChunks` は candidates を順序保証なくチャンク化（非決定的）
- 各 chunk の結果を配列結合（non-stable）
- その後 `published_at` と `noteId` で in-memory sort

candidate ids が重複しないため、chunks 間に id の衝突なし。結合後の array は不完全な order 状態ですが、最終的な `sort()` で完全に再ソート されるため、決定論的です。**ただし、この "完全な再ソート" が max(candidates) 個の id に対して O(n log n) コストを払う** ことは意図的な設計です。

**理由:**

plan ステップ2・ADR-005 では「候補が TAD_CANDIDATE_CAP (1000) に達する場合、chunk 分割で D1 host-var cap overflow を回避」と明記。その代償として memory 内ソートが入っています。このコスト・便益は妥当ですが、**コード行上からは "なぜこんなに複雑な操作をするのか" が自明でない** という可能性があります。

**提案:**

既存コメント（line 329-332）で「lexicographic string compare」と「deterministic tiebreak」を説明済みなので問題ありませんが、さらに以下を加えるとよい：

```typescript
// chunks are non-deterministically ordered (selectInChunks doesn't
// guarantee order), but the final sort() is over the complete result,
// so the output order is total and deterministic. The additional sort
// cost (O(n log n) for candidates) is acceptable vs. overflowing the
// D1 host-variable budget by chunking the `IN` predicate.
```

---

## Notes

### [N-001] `publishedRangeConditions` の仕様充実性

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:50-66`

**説明:**

```typescript
// `published_at` is stored as ISO-8601 text, so a lexicographic compare
// matches chronological order; the `DateRange` is the half-open `[from, to)`
// VO (the P30 boundary already pushed the inclusive end date to the
// day-after-00:00 — #619 ADR-006), so `from` is `gte` and `to` is `lt`.
function publishedRangeConditions(range: DateRange | undefined): SQL[] {
  if (range === undefined) return [];
  const conditions: SQL[] = [];
  if (range.from !== null) {
    conditions.push(gte(publicationStates.publishedAt, range.from.toISOString()));
  }
  if (range.to !== null) {
    conditions.push(lt(publicationStates.publishedAt, range.to.toISOString()));
  }
  return conditions;
}
```

**分析:**

- `range === undefined` → 全フィルタ OFF（既存ユースケース互換） ✓
- `range.from === null && range.to !== null` → `lt(to)` のみ、from 制約なし ✓
- `range.from !== null && range.to === null` → `gte(from)` のみ、to 制約なし ✓
- `range.from !== null && range.to !== null` → 両条件を AND ✓
- `range.from === null && range.to === null` → 空配列（ADR-006 の明確化に相当） ✓

presentation 層が `to` を翌日 00:00 に正規化して渡すため、adapter は `to` が既に exclusive（`lt`）であることを信頼できます。offset-by-one 防止の責務が presentation に置かれており、層間の責務分離が明確です。

**コメント:** 設計（ADR-006）と実装が完全に整合。

---

### [N-002] `listSortedAll` と `listSortedWithinCandidates` の where 合一性

**対象:**
- `listSortedAll`: line 256-262
- `listSortedWithinCandidates`: line 312-320

**説明:**

両メソッドの where 句：

```typescript
// listSortedAll (line 256-262)
const whereClause = and(
  eq(publicationStates.ownerId, ownerId),
  eq(publicationStates.visibility, "public"),
  isNotNull(publicationStates.publishedAt),
  eq(notes.status, "active"),
  ...publishedRangeConditions(opts.publishedRange),
);

// listSortedWithinCandidates chunk 内 (line 312-320)
and(
  eq(publicationStates.ownerId, ownerId),
  eq(publicationStates.visibility, "public"),
  isNotNull(publicationStates.publishedAt),
  inArray(publicationStates.noteId, [...chunk]),
  ...publishedRangeConditions(opts.publishedRange),
)
```

**差分分析:**

- `listSortedAll`: `eq(notes.status, "active")` JOIN 条件を含む
- `listSortedWithinCandidates`: candidates は既に `findByOwner({ status: "active" })` で active のみ （JOIN 不要）

**正当性:**

ADR-005 & ADR-007 の設計通り。candidates は事前に active id のみを渡すため、チャンク内で再度 status check は不要。オプティマイザも `notes` テーブルに無用な JOIN を避けられます。

**page と count の合一性:**

`listSortedAll` は page（line 269-276）と count（line 278-282）の両方で同じ `whereClause` を使用。`items.length <= total` 不変条件が保持されます。✓

---

### [N-003] `listPublicNoteIdsByOwnerInRange` の owner/active/visibility 検証

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:348-374`

**説明:**

```typescript
listPublicNoteIdsByOwnerInRange(
  ownerId: UserId,
  publishedRange: DateRange,
  limit: number,
): Promise<readonly NoteId[]> {
  return mapDbError(
    "Failed to list public publication_states in published_at range",
    async () => {
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
        .orderBy(asc(publicationStates.noteId))
        .limit(limit);
      return rows.map((r) => NoteId.create(r.noteId));
    },
  );
}
```

**検証チェックリスト:**

- ✓ owner: `eq(publicationStates.ownerId, ownerId)` — 権限確認
- ✓ visibility: `eq(publicationStates.visibility, "public")` — 公開状態確認
- ✓ active: `eq(notes.status, "active")` — trashed 行排除（outbox relay lag 対策）
- ✓ publishedAt: `isNotNull(publicationStates.publishedAt)` — 公開日が設定されている
- ✓ range: `...publishedRangeConditions(publishedRange)` — 日付範囲 filter
- ✓ limit: `limit` パラメータ で host-var cap 対策（callee は PUBLISHED_RANGE_CANDIDATE_CAP=1000 を渡す）
- ✓ order: `.orderBy(asc(publicationStates.noteId))` — deterministic（noteColumn path での ID 順）

**コメント:** port の JSDoc（publicationStateRepository.ts:90-98）と実装が完全に整合。

---

### [N-004] `NoteOwnerFilters.noteIds` 候補集合の交差演算

**対象:** `app/core/adapters/d1/repositories/noteRepository.ts:661-678`

**説明:**

```typescript
// Pre-resolved note-id candidate set (#619 ADR-005): an immediate value
// the caller computed elsewhere, joined into the same intersection /
// chunking machinery as the tag candidates. An empty set short-circuits
// to "match nothing" via the `intersectIdSets` result below.
if (opts.noteIds !== undefined) {
  candidateSets.push(new Set(opts.noteIds as readonly string[]));
}

if (candidateSets.length > 0) {
  const intersected = intersectIdSets(candidateSets);
  if (intersected.size === 0) return null;
  return {
    where: and(...conditions) as SQL,
    idScope: intersected,
  };
}

return { where: and(...conditions) as SQL, idScope: null };
```

**検証:**

- ✓ `candidateSets` 配列に push → 他の候補集合（tag、visibility、directory など）と同じ `intersectIdSets` 機構で処理
- ✓ 空配列 `[]` → `intersectIdSets` が即座に「match nothing」に短絡（line 671: `if (intersected.size === 0) return null`）
- ✓ 重複排除も `Set` のセマンティクスに委ねられており、重複行の risk なし
- ✓ `items.length <= total` 不変条件を保持（noteRepository.ts:546-552 の comment 参照）

**型ナローイング:**

candidates（`opts.noteIds: readonly NoteId[]`）を `readonly string[]` に cast してから Set 化。NoteId は nominal type ですが、最終的に id string として扱う artifact のため、キャストは妥当です。

---

### [N-005] `listUserPublicNotes` の projection 共通後処理

**対象:** `app/core/application/publication/listUserPublicNotes.ts:138-178`

**説明:**

```typescript
const { liveNotes, total } =
  sort === "publishedAt"
    ? await listByPublishedAt({
        ownerId: user.id,
        tagIds,
        publishedRange: input.publishedRange,
        order,
        limit: input.limit,
        offset,
        noteRepository,
        publicationStateRepository,
      })
    : await listByNoteColumn({
        ownerId: user.id,
        tagIds,
        publishedRange: input.publishedRange,
        sort,
        order,
        limit: input.limit,
        offset,
        noteRepository,
        publicationStateRepository,
      });

// Common post-processing across both paths (#619 ADR-001)
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

// ... items projection
const items: PublicNoteListItem[] = liveNotes.map((note) => {
  // ...
  return {
    ...toNoteListItem(note, {
      excerpt,
      tagNames,
      visibility: "public",
    }),
    publishedAt: publishedAtById.get(note.id as string) ?? null,
  };
});

return { notes: items, total };
```

**N+1 回避確認:**

- `listByPublishedAt`: publication state を SQL で取得済み（直接 query で published_at column 見えている）
- `listByNoteColumn`: note column で sort （publication state を見ていない）
- 共通後処理: `findByNoteIds` を **1回のみ** 呼び出し（liveNotes.length > 0 check で最小化）
- Map lookup で O(1) projection

**path 差の吸収:**

`publishedAt` path では publication が直接見えますが、あえて `findByNoteIds` で再度取得することで、両 path で同じ projection ロジックを使えます。これは ADR-001 の「path 非対称性を1点に集約」設計を実装したもの。代償として1回の追加 bulk read が入りますが、candidates が at most 1000 なため許容範囲です。

---

### [N-006] `listByPublishedAt` path での publishedRange 伝播

**対象:** `app/core/application/publication/listUserPublicNotes.ts:255-267`

**説明:**

```typescript
const { noteIds, total } =
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

**検証:**

- ✓ `publishedRange` が VO として type-safe に渡される
- ✓ ternary spread で `undefined` の場合は option key を除外（옵션 field に null や undefined を詰めない）
- ✓ adapter はこれを SQL `where` 条件に直結（line 261, 318）

**正規化の信頼:**

JSDoc で「P30 presentation boundary normalises to day-after-00:00」と明記（line 46）。adapter と usecase は presentation の正규化を信頼。

---

### [N-007] `listByNoteColumn` path での range 해석 및 short-circuit

**対象:** `app/core/application/publication/listUserPublicNotes.ts:307-318`

**説명:**

```typescript
let publishedNoteIds: readonly NoteId[] | undefined;
if (args.publishedRange !== undefined) {
  publishedNoteIds =
    await args.publicationStateRepository.listPublicNoteIdsByOwnerInRange(
      args.ownerId,
      args.publishedRange,
      PUBLISHED_RANGE_CANDIDATE_CAP,
    );
  if (publishedNoteIds.length === 0) {
    return { liveNotes: [], total: 0 };
  }
}
```

**検증:**

- ✓ `publishedRange !== undefined` → publication 側で id 해석 (1회 추가 roundtrip 발생)
- ✓ empty set short-circuit: 범위와 일치하는 공개 노트가 없으면 즉시 반환 (불필요한 noteRepository query 제거)
- ✓ PUBLISHED_RANGE_CANDIDATE_CAP=1000: host-var 상한 대책
- ✓ 빈 결과도 정상 케이스 (매칭되지 않음을 의미)

**NoteOwnerFilters.dateRange 사용 불가:**

주석(line 305-306)에 명시: `NoteOwnerFilters.dateRange` 는 `notes.updatedAt` 에만 효과적 (공개일 아님). ADR-005 의 설계 원칙을 코드에서도 강제.

---

### [N-008] driver error mapping 와 mapDbError

**대상:** 
- `publicationStateRepository.ts:229`, 353
- 양쪽 메소드 모두 `mapDbError` wrapper 사용

**설명:**

```typescript
return mapDbError(
  "Failed to list public publication_states sorted by published_at",
  async () => { /* ... */ },
);
```

**검증:**

- ✓ SQLite driver 예외 (range violation, overflow, constraint 등) → `SystemError` / `ApplicationError` 로 변환
- ✓ domain/application layer 는 driver-native errors 미노출 (CLAUDE.md "adapter catch policy" 준수)
- ✓ read-only 메서드이므로 conflict/OCC 예외 없음

---

### [N-009] 회귀 테스트: publishedRange === undefined 시 동작

**분석:**

- `listSortedAll`, `listSortedWithinCandidates` 둘다: `publishedRangeConditions(undefined)` → `[]` 반환 → where 에 조건 미추가
- `listByNoteColumn`: `publishedRange === undefined` → `publishedNoteIds` 미설정 → `noteIds` 옵션 미포함
- 결과: 기존 로직 그대로 동작 (range 필터 off)

**검증:** ✓ backward compatibility 유지. 기존 호출처 (range 미지정) 은 변경 없음.

---

## 총합 평가

### 설계-구현 정합성 확인

| 항목 | plan | ADR | 구현 | 정합 |
|---|---|---|---|---|
| publishedRange SQL where (양 path) | 스텝 2 | ADR-005, 006 | 261, 318 ✓ | ✅ |
| page/count 동일 where | 스텝 2 | ADR-005 | 282, 344 ✓ | ✅ |
| listPublicNoteIdsByOwnerInRange 신규 | 스텝 2 | ADR-005, 007 | 348-374 ✓ | ✅ |
| noteIds 후보집합 intersectIdSets 병합 | 스텝 2 | ADR-005 | 665-667 ✓ | ✅ |
| path 별 range 적용 (pub SQL vs. id resolve) | 스텝 2 | ADR-005, 007 | 144, 153, 263, 310 ✓ | ✅ |
| 공통 후처리 projection (findByNoteIds 1회) | 스텝 1 | ADR-001 | 169-178 ✓ | ✅ |
| DateRange VO / presentation 정규화 책임 | 스텝 3 | ADR-006 | 46, 308 JSDoc ✓ | ✅ |

### 보증 사항

✅ `items.length <= total` 불변식 양 path 에서 유지  
✅ N+1 회피 (`findByNoteIds` 1회 집약)  
✅ D1 host-variable 상한 대책 (selectInChunks / limit cap)  
✅ driver error 변환 (adapter catch policy)  
✅ 기존 호출처 회귀 없음 (신규 옵션 항목만 추가)

---

## 레뷰 결론

**Adapter / Infrastructure 층의 구현은 설계 (plan / ADR-001〜007) 와 완전히 정합하며, SQL 정확성・리소스 관리・에러 처리의 관점에서 결함이 없습니다.**

W-001, W-002 는 향후 보수 시 혼동을 방지하기 위한 극히 경미한 코멘트 명시성 개선 제안입니다. 구현의 정당성과 정확성에는 영향 없습니다.

---
