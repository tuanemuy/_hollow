# PR #653 レビュー — Adapter / Infrastructure 観点

**PR:** #653（Issue #619, ブランチ issue/619/p30-design-parity）  
**レビュー日:** 2026-06-12  
**観点:** Adapter / Infrastructure (D1 SQL)

---

## Blockers

なし

---

## Warnings

### [W-001] `listSortedWithinCandidates` での published_at 型ナローイング安全性

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:318`, 323-326

**説明:**
```typescript
// line 318
...publishedRangeConditions(opts.publishedRange),

// line 323-326 で型ナローイング
return chunkRows.map((r) => ({
  noteId: r.noteId,
  publishedAt: r.publishedAt as string,  // ← 型アサーション
}));
```

`publishedRangeConditions` で `publishedAt` 範囲フィルタを追加した際、`isNotNull(publicationStates.publishedAt)` は依然として（line 316）チャンク内の全行に対して成立しているため、`as string` アサーションは論理的には安全です。しかし、**範囲条件が NULL を排除しない可能性がある（例えば `to` が NULL の場合）** ことを考慮すると、アサーションの正当性がコード上から一瞥明白ではありません。

**理由:**
型安全性の観点から、ナローイング前提を明示的にコメント化すると、将来の保守時に誤った修正を防げます。

**提案:**
```typescript
// line 313-318
where(
  and(
    eq(publicationStates.ownerId, ownerId),
    eq(publicationStates.visibility, "public"),
    isNotNull(publicationStates.publishedAt),  // ← この行が前提
    inArray(publicationStates.noteId, [...chunk]),
    ...publishedRangeConditions(opts.publishedRange),
  ),
),
```

既存のコメント（line 320-322）で「`isNotNull` guarantees a non-null published_at」と明記されているため、**ワーニング相当の軽微な指摘** です。コード自体は正しく、読み手が一度確認すれば問題ありません。

---

## Notes

### [N-001] `publishedRangeConditions` の `null` 分岐ガード確認

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:54-66`

**説明:**
```typescript
function publishedRangeConditions(range: DateRange | undefined): SQL[] {
  if (range === undefined) return [];  // ← 呼び出し側がガード
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
- `range === undefined` で全フィルタ OFF（既存ユースケース互換）✓
- `range.from === null` と `range.to === null` は独立した OR ではなく独立したガード（両者が同時に null でも空配列返却） → 「from のみ」「to のみ」「同日 from=to」の境界ケース対応 ✓
- 範囲が指定されている場合でも `from === null && to === null` は可能（呼び出し側が作り得る）→ その場合は空配列を返す（フィルタ OFF と同等） ✓

**コメント:** 実装は plan の境界テスト要件（ステップ7）と合致しており、set-top-box 的に正しく動作します。

---

### [N-002] `listPublicNoteIdsByOwnerInRange` 新規メソッドの妥当性

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:348-374`

**説明:**
```typescript
listPublicNoteIdsByOwnerInRange(
  ownerId: UserId,
  publishedRange: DateRange,
  limit: number,
): Promise<readonly NoteId[]> {
  // ... owner + public + published_at NOT NULL + active + range filter
}
```

**分析:**
- `limit` パラメータを受け、host-variable 上限対策に組み込まれている ✓
- `notes` status JOIN（`active` filter）が含まれており、noteColumn path での trashed 行漏洩防止 ✓
- `publishedRangeConditions` を再利用して同じ範囲ロジックを共有 ✓
- ADR-005 の「専用列挙メソッド」採用方針に沿っている ✓

**コメント:** ドメインポート（`publicationStateRepository.ts:99-103`）の JSDoc も「`active`-note JOIN」を明記済み。設計と実装が整合しています。

---

### [N-003] `NoteOwnerFilters.noteIds` の candidateSets 統合

**対象:** `app/core/adapters/d1/repositories/noteRepository.ts:661-667`

**説明:**
```typescript
// Pre-resolved note-id candidate set (#619 ADR-005): an immediate value
// the caller computed elsewhere, joined into the same intersection /
// chunking machinery as the tag candidates. An empty set short-circuits
// to "match nothing" via the `intersectIdSets` result below.
if (opts.noteIds !== undefined) {
  candidateSets.push(new Set(opts.noteIds as readonly string[]));
}
```

**分析:**
- `candidateSets` への push により、既存の `intersectIdSets` 機構と `selectInChunks` 正規化に自動的に乗る ✓
- 空配列 `[]` は `intersectIdSets` で「match nothing」に短絡（line 671） ✓
- `items.length <= total` 不変条件（noteRepository.ts:546-552）が両候補セットに対して効く ✓
- `SAFE_CHUNK_SIZE=90` host-variable 予算と分離されており、D1 上限 overflow なし ✓

**コメント:** 設計（plan ステップ2・ADR-005）と実装が完全に一致しています。

---

### [N-004] `listUserPublicNotes` の path 別実装と共通後処理

**対象:** `app/core/application/publication/listUserPublicNotes.ts:138-160, 162-178`

**説明:**
```typescript
const { liveNotes, total } =
  sort === "publishedAt"
    ? await listByPublishedAt({ ..., publishedRange: input.publishedRange })
    : await listByNoteColumn({ ..., publishedRange: input.publishedRange });

// 共通後処理
const publishedAtById = new Map<string, string | null>();
if (liveNotes.length > 0) {
  const states = await publicationStateRepository.findByNoteIds(liveNotes.map((n) => n.id));
  for (const s of states) {
    publishedAtById.set(s.noteId as string, s.publishedAt !== null ? s.publishedAt.toISOString() : null);
  }
}
```

**分析:**
- `publishedAt` path（`listByPublishedAt`）: `publishedRange` を `PublicNoteSortedOpts` 経由で publication SQL に直接渡す → アダプター層で where 条件に統合 ✓
- `noteColumn` path（`listByNoteColumn`）: `publishedRange !== undefined` なら `listPublicNoteIdsByOwnerInRange` で解決 → `noteIds` 候補で noteRepository へ ✓
- 共通後処理で `findByNoteIds` を1回のみ呼び出す → N+1 回避 ✓
- `publishedAtById` map はどちらの path でも同じ lookup table として機能 ✓

**コメント:** ADR-001 の「path 非対称性を1点に集約」設計が正しく実装されています。

---

### [N-005] presentation 層との責務分離（DateRange 正規化）

**対象:** `app/core/application/publication/listUserPublicNotes.ts:44-52` （Input JSDoc）

**説明:**
```typescript
/**
 * Filter on the publication aggregate's `published_at` (公開日範囲). The
 * half-open `DateRange` VO; the P30 presentation boundary normalises the
 * user-chosen inclusive end date to the day-after-00:00 (#619 ADR-006).
 */
publishedRange?: DateRange;
```

**分析:**
- ユースケース入力が `DateRange` VO を受け取る → presentation 層で文字列→Date 変換済みであることを前提 ✓
- JSDoc で「P30 presentation boundary normalises to day-after-00:00」と明記 → アダプター・ユースケース層は `to` が既に inclusive に正規化されていることを信頼 ✓
- CLAUDE.md「入力検証は2点」規約（transport boundary + VO construction）を遵守 ✓

**コメント:** アーキテクチャルール通り、スカラ文字列をユースケースに流さず、VO 変換を presentation に集約しています。

---

### [N-006] ISO-8601 text 列の辞書順安全性

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:50-52`

**説明:**
```typescript
// `published_at` is stored as ISO-8601 text, so a lexicographic compare
// matches chronological order; the `DateRange` is the half-open `[from, to)`
// VO (the P30 boundary already pushed the inclusive end date to the
// day-after-00:00 — #619 ADR-006), so `from` is `gte` and `to` is `lt`.
```

**分析:**
- `publishedAt` は `PublicationState` エンティティで `Date.toISOString()` で保存（publicationStateRepository.ts:138） ✓
- ISO-8601 形式（`YYYY-MM-DDTHH:MM:SS.sssZ`）は**辞書順 = 時系列順**であることが保証される ✓
- `listSortedWithinCandidates` の in-memory sort（line 334-336）で `publishedAt < publishedAt` 比較が成立 ✓
- ニッチケース（秒単位が同じ複数ノート）は noteId tiebreaker で決定論的 ✓

**コメント:** timezone は UTC で統一されており、クライアント TZ による skew はありません（サーバーレンダリング層の配慮事項であって、adapter 層では問題なし）。

---

### [N-007] トランザクション境界と error handling

**対象:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:229-242, 353-373`

**説明:**

両メソッド（`listPublicNoteIdsByOwnerSorted` / `listPublicNoteIdsByOwnerInRange`）は `mapDbError` ラッパーで driver エラーを「ドメイン契約」エラーに変換しています：

```typescript
return mapDbError(
  "Failed to list public publication_states sorted by published_at",
  async () => { /* ... */ },
);
```

**分析:**
- D1 driver constraint violation（例：invalid date range、host-var overflow）は `mapDbError` で `SystemError` / `ApplicationError` に変換される ✓
- ユースケース層は driver-native エラー（`SqliteError` など）を見ない → CLAUDE.md「adapter catch policy」遵守 ✓
- OCC / conflict エラーは存在しない（read-only）→ exception class の選別が正しい ✓

**コメント:** 既存パターンに従っており、エラーハンドリング規約に違反なし。

---

## 総合評価

### 整合性確認

| 項目 | plan | ADR | 実装 | 整合 |
|---|---|---|---|---|
| 公開日範囲 SQL 条件（両 path） | ステップ2 | ADR-005 / ADR-006 | 261, 318 ✓ | ✅ |
| page と count で同一 where | ステップ2 | ADR-005 | 282, 344 ✓ | ✅ |
| `listPublicNoteIdsByOwnerInRange` 新規 | ステップ2 | ADR-005 | 348-374 ✓ | ✅ |
| `noteIds` candidate 統合 | ステップ2 | ADR-005 | 665-667 ✓ | ✅ |
| path 別 range 適用 | ステップ1・6 | ADR-001 / ADR-005 | 143, 153, 263, 324 ✓ | ✅ |
| 共通後処理 projection | ステップ1 | ADR-001 | 162-178 ✓ | ✅ |
| DateRange VO / presentation 変換 | ステップ3 | ADR-006 | 44-52 ✓ | ✅ |
| ISO-8601 辞書順=時系列 | plan 調査 | ADR-006 | 50-52 comment ✓ | ✅ |

---

### 重要な保証事項

✅ `items.length <= total` 不変条件が両 path で保持  
✅ N+1 回避（`findByNoteIds` 1回に集約）  
✅ D1 host-variable 上限対策（`selectInChunks` / `limit` CAP）  
✅ driver エラー変換（adapter catch policy）  
✅ ドメインポート JSDoc との整合  
✅ 既存呼び出しの回帰リスク なし（新規オプション項目のみ追加）

---

## レビュー結論

**Adapter / Infrastructure 層の実装は設計（plan / ADR-001〜007）と完全に整合しており、SQL 正確性・リソース管理・エラーハンドリングの観点で問題ありません。**

W-001 は型ナローイング前提の明示性向上に関する極めて軽微な改善提案であり、実装の正当性には影響しません。

---
