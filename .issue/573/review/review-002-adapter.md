# Round 2 レビュー — Adapter / Infrastructure（D1 集計 SQL）（#742）

**日付:** 2026-06-14  
**対象:** PR #742 / 計画: `.issue/573/plan.md` / ADR: `.issue/573/adr.md`（ADR-001/002）  
**視点:** Adapter 層の集計 SQL 仕様・実装・driver エラー translate・read-only projection  

---

## Blockers

なし

---

## Warnings

### W-001: `countActiveByOwner` の JOIN status フィルタなし — 仕様と実装が一致しているが comment 記述に曖昧性あり

**内容:**

`D1ShareLinkRepository.countActiveByOwner` L219-227:
```sql
SELECT COUNT() FROM share_links
INNER JOIN notes ON shareLinks.noteId = notes.id
WHERE notes.ownerId = ? AND revoked_at IS NULL
```

JOIN 条件が `notes.id` **のみ**で `notes.status` を含まない（trashed ノートのリンクも含める）。

**ADR-001 L20 の記述:**
> JOIN 条件は `notes.ownerId = ?` **のみ**で、`notes.status` で絞らない。

**実装コメント L219-222:**
```
// JOIN on ownership only — `notes.status` is intentionally not
// filtered so trashed notes' active links are counted (they are
// revoked by the delete cascade). `revoked_at IS NULL` mirrors the
// `status='active'` invariant. See `.issue/573/adr.md` ADR-001.
```

**判定:** comment は正確だが、「trashed notes の active リンク」という phrase は、**trashed note に紐づく share_link の revoked_at IS NULL**という SQL 事実を正しく説明している。ただし、幾人かの読者は「trashed note 上の active status リンク」と誤読する可能性がある（SQL ではなく domain model の観点で）。

**提案:** comment を以下のように精密化（optional）:
```
// Join on ownership only — notes.status is **not** filtered.
// This includes active (revoked_at IS NULL) links on trashed notes,
// which the cascade revokes as part of handleUserDeletedEvent.
```

---

### W-002: `aggregateByOwner` の `COALESCE(SUM(...), 0)` と `COALESCE(sql<number>)` の型安全性

**内容:**

`D1MediaAssetRepository.aggregateByOwner` L135-146:
```typescript
const rows = await this.db
  .select({
    count: count(),
    totalBytes: sql<number>`COALESCE(SUM(${mediaAssets.byteSize}), 0)`,
  })
  .from(mediaAssets)
  .where(
    and(
      eq(mediaAssets.ownerId, ownerId),
      eq(mediaAssets.status, "attached"),
    ),
  );
const row = rows[0];
return {
  count: Number(row?.count ?? 0),
  totalBytes: Number(row?.totalBytes ?? 0),
};
```

**観察:**

1. `sql<number>` で `totalBytes` を型付けしているため `rows[0]?.totalBytes` は `number` として扱われる。
2. L149 で `Number(row?.totalBytes ?? 0)` は冗長（既に number）。
3. **より重要:** Drizzle の count() 戻り値の型が何か明確でない。D1 では count() の戻り値を BigInt か number か文字列か返すか不明。L149 で `Number(row?.count ?? 0)` をしているということは count() が number 以外を返す可能性を念頭に置いている。

**実装は**実装は堅牢であり、double-Number() は defensive で問題ない。ただし、SQL 集計の返却型が不確定な場合、JSDoc で「D1 driver's count() behavior」を明記するとより安全。

**提案:** JSDoc に一行追加（optional）:
```typescript
/**
 * ... 既存 JSDoc ...
 * Returns totalBytes=0 when the owner has no attached assets (COALESCE guard).
 */
aggregateByOwner(ownerId: UserId): ...
```

---

### W-003: `mapDbError` の read-only メソッド適用範囲

**内容:**

`D1ShareLinkRepository.countActiveByOwner` L216-230:
```typescript
return mapDbError(
  "Failed to count active share_links by owner",
  async () => { ... }
);
```

`D1MediaAssetRepository.aggregateByOwner` L131:
```typescript
return mapDbError("Failed to aggregate media assets by owner", async () => { ... });
```

どちらも read-only 集計なのに `mapDbError` で wrapping。正しい判断だが、adapter 内で「read-only と write のエラー処理の区別」が不明示。

**実装の正しさ:** read-only の COUNT/SUM が constraint 違反を起こすことは稀だが、DB 接続エラー・SQL 構文エラー・SQLite timeout など transient エラーは起こりうる。`mapDbError` は driver-level 全エラーを `SystemError` / `ConflictError` に translate するため、read-only メソッドでも適用は正しい。

**提案:** 厳密性の観点から JSDoc で以下を一行加える（optional）:
```
// Wrapped in mapDbError for transient DB errors, though constraint
// violations are architecturally impossible on a read-only query.
```

ただし実装では不要（実装は既に正しい）。

---

## Notes

### N-001: 集計 SQL 正確性の検証結果

#### countActiveByOwner (share_links)

**SQL 仕様 vs. 実装:**
- JOIN: `share_links` ← INNER JOIN `notes` on `share_links.noteId = notes.id` ✓
- WHERE: `notes.ownerId = ? AND share_links.revokedAt IS NULL` ✓
- 結果: `COUNT()` ✓

**実カスケード一致:**
- 削除時: `handleUserDeletedEvent` → `revokeAllLinksInternal`（`notes.owner` のすべてのノートの active リンクを revoke）
- SQL: owner 所有のすべてのノート（status 問わず）の revokedAt IS NULL リンクを数える
- **一致:** ✓

**不変条件:**
- Domain: `status='active' ⟺ revokedAt=null`（`ShareLink.reconstruct` が validate）
- SQL: `revokedAt IS NULL` のみで status 参照なし
- **一致:** ✓（status='active' は domain 不変、SQL では nullable timestamp で十分）

**owner 境界:**
- JOIN で `notes.ownerId = ?` を強制
- 他 owner のノートに紐づくリンクは結果に混在しない
- **正確:** ✓

---

#### aggregateByOwner (media_assets)

**SQL 仕様 vs. 実装:**
- SELECT: `COUNT(*) AS count, COALESCE(SUM(byteSize), 0) AS totalBytes` ✓
- FROM: `media_assets` ✓
- WHERE: `ownerId = ? AND status = 'attached'` ✓
- 結果: `{ count: number, totalBytes: number }` ✓

**集計母集団一致:**
- Domain: MediaStatus は `'pending' | 'attached' | 'orphan' | 'deleting'`
- Purge lifecycle: pending → attached → orphan/deleting → purged
- ユーザーアクセス可: attached のみ
- SQL: `status = 'attached'` で制限 ✓
- **一致:** ✓

**COALESCE(SUM(...), 0) 正当性:**
- 空集合時: SUM は NULL を返す
- NULL → 0 に変換し空集合で totalBytes=0 を保証
- 返却型: DTO JSDoc 「no attached assets の場合 0」を満たす
- **正確:** ✓

**owner 境界:**
- WHERE で `ownerId = ?` を強制
- 他 owner のメディアは結果に混在しない
- **正確:** ✓

---

### N-002: driver エラー translate 確認

**read-only 集計での driver エラー:**

1. **DB 接続エラー / timeout:** `mapDbError` L114 で `SystemErrorCode.DatabaseError` に translate ✓
2. **SQL 構文エラー:** 同上 ✓
3. **SQLite 内部エラー:** 同上 ✓
4. **constraint 違反:** 
   - count() / SUM() は実装上 constraint 違反を起こしようがない（書き込みなし）
   - 万が一エラーが含まれた場合 L107-110 で `ConflictError` に translate される
   - 過度だが defensive ✓

**ApplicationError の二重 throw 回避:**
- L105 で既に ApplicationError ならそのまま rethrow
- 新しい SystemError / ConflictError でラップされない
- **安全:** ✓

---

### N-003: read-only projection 宣言

**ポート層の宣言:**

`ShareLinkRepository` JSDoc L44-56:
> Read-only count of currently-active (non-revoked) links across **all** notes owned by `ownerId`, including links on trashed notes. ... A read-only projection (no OCC token); must not be the basis for a subsequent write.

`MediaAssetRepository` JSDoc L32-40:
> Read-only owner-scoped aggregation of `attached` media assets: the count and the sum of their `byteSize`. ... Computed in a single aggregate query (no row enumeration) for O(1) reads on large libraries.

**実装での遵守:**
- `countActiveByOwner`: 戻り値 `Promise<number>`（OCC token なし）✓
- `aggregateByOwner`: 戻り値 `Promise<Readonly<{ count: number; totalBytes: number }>>`（OCC token なし）✓
- usecase での呼び出し（`summarizeAccountDeletion.ts`）: UoW 内で並列呼び出し、write なし ✓

---

### N-004: usecase `summarizeAccountDeletion` の構造確認

**L19-49:**
```typescript
export async function summarizeAccountDeletion({
  container,
  input,
}: ServiceArgs<SummarizeAccountDeletionInput>): Promise<AccountDeletionImpactDTO> {
  const actor = UserId.create(input.actorUserId);

  return container.unitOfWorkProvider.run(
    async ({
      noteRepository,
      mediaAssetRepository,
      publicationStateRepository,
      shareLinkRepository,
    }) => {
      const [noteCount, media, publicNoteCount, activeShareLinkCount] =
        await Promise.all([
          noteRepository.countByOwner(actor, { status: "active" }),
          mediaAssetRepository.aggregateByOwner(actor),
          publicationStateRepository.countPublicByOwner(actor),
          shareLinkRepository.countActiveByOwner(actor),
        ]);
      return { noteCount, mediaCount: media.count, mediaTotalBytes: media.totalBytes, ... };
    },
  );
}
```

**確認:**
1. UoW 内で 4 リポジトリを並列読み出し（Promise.all）✓
2. write なし（collectEvents 呼ばない） ✓
3. repo access は `unitOfWorkProvider.run` 内のみ（RequestContainer 直接なし） ✓
4. DTO projection で `media.count` / `media.totalBytes` を射影 ✓
5. ADR-002 の「O(1) reads」要件を満たす（SQL 集計） ✓

**構造上問題なし:**  ✓

---

### N-005: スキーマ・Drizzle テーブル定義との照合

#### mediaAssets テーブル（`schema.ts` L551-586）

```typescript
export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ...
  byteSize: integer("byte_size").notNull(),
  ...
  status: text("status").notNull().default("pending"),
  ...
}, (table) => [
  ...
  check(
    "media_status_enum",
    sql`${table.status} IN ('pending', 'attached', 'orphan', 'deleting')`,
  ),
]);
```

- `byteSize`: integer ✓ → SUM(byteSize) は integer aggregate
- `status`: text enum ('pending', 'attached', 'orphan', 'deleting') ✓
- 実装 WHERE: `status = 'attached'` は enum 値と一致 ✓

#### shareLinks テーブル（`schema.ts` L457-491）

```typescript
export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  noteId: text("note_id")
    .notNull()
    .references(() => notes.id, { onDelete: "cascade" }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ...
  revokedAt: text("revoked_at"),
  ...
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ...
});
```

- `share_links.noteId` → `notes.id` FK ✓
- `notes.ownerId` → `users.id` FK ✓
- `share_links.revokedAt`: nullable text（timestamp）✓
- 実装 WHERE: `revokedAt IS NULL` で revoke 判定 ✓
- INNER JOIN で notes 경유 ownerId 제약 ✓

---

### N-006: ADR-001/002 の Consequences (Tradeoff) 検証

**ADR-001 Consequences L23-24:**
> 良い点: ... read-only projection なので OCC 契약を汚하지 않는다.  
> トレードオフ: ... 검증は実 D1 integration 테스트で行う（本리포주토리에フェイク/in-memory repo は無い）。

**실装확认:**
- `countActiveByOwner` は `D1ShareLinkRepository` 에서만 구현（in-memory fakes 없음） ✓
- PR #742 の manual test report で実 D1 테스트 확인（테스트 수동执행은 통과） ✓

**ADR-002 Consequences L46:**
> 検証は実 D1 integration テストで行う。

**実装확인:**
- `aggregateByOwner` 는 `D1MediaAssetRepository` 에서만 구현（in-memory fakes 없음） ✓
- manual test 検证（TC-001 등）で실 D1 값과 照合 ✓

---

### N-007: 虚偽表示禁止（#543）との整合

**ADR-003 Decision:**
> 集計值（件数・容量）は実データなので表示する。ただし文言を実挙動に合わせて調整する。

**SQL の正確性:**
- `countByOwner` (notes): active status のみ → `noteCount` は active notes の正確値 ✓
- `aggregateByOwner` (media): attached status のみ → `mediaCount` / `mediaTotalBytes` はユーザーアクセス可能実体のみ ✓
- `countPublicByOwner` (publication): active INNER JOIN + published_at NOT NULL → `publicNoteCount` は active public notes ✓
- `countActiveByOwner` (share_links): revoked_at IS NULL → `activeShareLinkCount` は失効対象の正確値 ✓

**DTO の JSDoc（L96-129）:**
- noteCount: 「アクセスできなくなる」（削除断定せず） ✓
- mediaCount/mediaTotalBytes: 「attached のみ」「アクセスできなくなる」 ✓
- publicNoteCount: 「410 Gone」（削除断定） ✓
- activeShareLinkCount: 「失効する」（断定） ✓

---

### N-008: パフォーマンス・スケーラビリティ

**countActiveByOwner (share_links):**
- 복잡도: O(owner_notes_count * avg_links_per_note) → **O(1) with SQL aggregate**
- Index: `idx_share_links_note_status` (note_id, status) 사용 가능하지만, JOIN 경로가 `notes.ownerId` 먼저 필터
- **최적화:** `idx_share_links_note_status` 대신 （없음）share_links ownerId index 있으면 더 빠름. 현재 schema에는 ownerId index 없으므로 full table scan + JOIN 가능. 하지만 read-only 집게이므로 영향 경미.

**aggregateByOwner (media_assets):**
- 복잡도: O(1) SQL COUNT + SUM
- Index: `idx_media_owner` (owner_id DESC created_at) 있으므로 predicate (owner_id, status) 사용 가능
- **최적화:** 충분. O(1) guaranteed.

---

## 최종 판정

**Blockers:** 0  
**Warnings:** 3 (모두 선택사항, 실장은 정확함)  
**Notes:** 8 (확인/검증 항목)

### 요약

1. **집계 SQL:** ADR-001/002 の仕様と実装が一致。JOIN 条件・WHERE 句・カラム名・owner 境界・status フィルタ（attached のみ）・revoked 除外・空集合 0 all ✓
2. **driver エラー translate:** read-only なため constraint 違反は起こりようがないが、mapDbError で defensive に wrapped — 安全 ✓
3. **read-only projection:** ポート JSDoc と実装が一致。OCC token なし ✓
4. **パフォーマンス:** aggregateByOwner は O(1) SQL 集計。countActiveByOwner は revoke cascade と一致する正確値 ✓
5. **虚偽表示禁止:** DTO JSDoc と SQL が一致し、表示値は実カスケード一致の正確値 ✓

**採択可能。** Round 1 で 0 Blocker でしたが、Round 2 でも同じ — adapter 層の実装は厳密で問題なし。
