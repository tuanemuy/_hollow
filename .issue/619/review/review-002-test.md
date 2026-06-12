# Test Round 2 Review — Issue #619: ユーザー公開ページ（P30）のデザインモック整合

**PR:** #653  
**Date:** 2026-06-12  
**Round:** 2回目（Round 1 指摘対応版）  
**Reviewer:** Claude Code (Test perspective)

---

## Verdict

**Blockers:** 0  
**Warnings:** 4  
**Notes:** 8  
**Overall:** ✅ **PASS** — Round 1 指摘が十分に対応されている。すべての主要テスト軸（期間境界、両 path 一貫性、後方互換性、TZ 決定性）がカバーされ、新たな懸念点は軽微。

---

## Blockers

なし

---

## Warnings

### [W-001] `PublicNoteViews.test.tsx` — `publishedAt: null` フォールバックテストが欠落
- **場所:** `app/components/public/__tests__/PublicNoteViews.test.tsx:42-88`
- **理由:** テスト fixture（line 42-52）は `publishedAt: "2026-02-10T00:00:00.000Z"` で非 null に固定。`PublicNoteItem` の JSDoc（line 39-44）で「Always non-null... null only for defensive relay-lag tolerance」と明記されているが、その防御的 fallback（`noteDate()` の `note.publishedAt ?? note.updatedAt`）をテストしていない。実装は防御的に設計されているが、テストで「その防御が必要かつ機能する」ことを示すと信頼度が上がる。
- **影響:** 低〜中（実装側で publish lag 時は確実に null になるため、テスト coverage としては補強すると ideal）。
- **提案:** `PublicNoteItem` に `publishedAt: null` を設定した fixture を追加し、「列 view で updatedAt が fallback として表示される」「カレンダー view で publishedAt 代わりに updatedAt でグループ化される」テストケースを追加。例：
  ```typescript
  it("falls back to updatedAt when publishedAt is null (relay lag tolerance)", () => {
    const notesWithNull = [{
      ...notes[0],
      publishedAt: null,
      updatedAt: "2026-03-01T00:00:00.000Z"
    }];
    const html = renderToStaticMarkup(
      <PublicNoteViews username="tuanemuy" notes={notesWithNull} />
    );
    expect(html).toContain("2026年3月1日 更新"); // fallback label
  });
  ```

### [W-002] `listSelectors.test.ts` — `groupNotesByDay` 第3引数テストで `PublicNoteItem` type 適合性が未検証
- **場所:** `app/components/note/list/__tests__/listSelectors.test.ts:264-296`
- **理由:** line 289-296 の「auth 側後方互換テスト」（第3引数なし）では `updatedAt` 軸でグループ化されることを確認しているが、**public 側のテスト（line 264-276）で渡す `PublicNoteItem` が`groupNotesByDay<T extends { id: string; updatedAt: string }>` の制約をすべて満たす**か（特に `id` と `updatedAt` の存在）を明示的に assert していない。JSDoc コメント（line 169）で「`PublicNoteItem` は `id` を持つ前提」と記されているが、plan のリスク欄（plan.md line 154）でも確認するよう指摘があるため、テストで一度 touch すると安心度が上がる。
- **影響:** 低（実装は `id: string` を持つので問題ないが、将来の type refactor で誤りうる）。
- **提案:** line 276 後に以下の test case を追加：
  ```typescript
  it("PublicNoteItem type compatibility: includes required id and updatedAt fields", () => {
    const item: PublicNoteItem = {
      id: "test-id",
      slug: "slug",
      title: "title",
      excerpt: "excerpt",
      tagNames: [],
      updatedAt: "2024-03-01T00:00:00Z",
      publishedAt: "2024-02-01T00:00:00Z",
    };
    // Compile-time constraint; this assert just documents the runtime instance.
    expect(item.id).toBeDefined();
    expect(item.updatedAt).toBeDefined();
  });
  ```

### [W-003] `normalizePublicDateRange.ts` — 無効日付文字列の normalization が暗黙的
- **場所:** `app/components/public/publicDateRange.ts:28-40` + `app/components/public/__tests__/publicDateRange.test.ts:15-20`
- **理由:** line 31 で `Number.isNaN(d.getTime()) ? null : d` による invalid string → null 変換が実装されており、テスト（line 18-20）で「両端 invalid → undefined」も検査しているが、**実装コメント**が「invalid/absent input → null」の意図を明示していない。presentation boundary で invalid 文字列を normalize する設計は intentional だが、将来の保守者に向けてコメント行があると自明度が上がる。
- **影響:** 低（テストで十分カバーされており、実装の振る舞いは正しい）。
- **提案:** line 28-32 に JSDoc を追加：
  ```typescript
  // `YYYY-MM-DD` → that day's UTC 00:00. Invalid format (e.g. "2026-13-01",
  // "not-a-date") → null. Presentation boundary validates transport shape
  // (route schema), so only ISO-format violations (not range out-of-bounds) are
  // caught here; the route validator rejects "not-a-date" earlier (#619
  // ADR-006, CLAUDE.md validation policy).
  ```

### [W-004] Integration test — 「期間フィルター後のノートが確実に published」という不変条件の検証が間接的
- **場所:** `app/core/application/publication/__tests__/listUserPublicNotes.integration.test.ts:653-676`
- **理由:** line 653-676 の「noteColumn path with period filter」テストで「返される notes の `publishedAt` が non-null」を assert している（line 671）のは良いが、**同じテストで「そもそも returned notes が `visibility=public` のみであること」を直接 assert していない**。期間フィルター後の id 解決（`listPublicNoteIdsByOwnerInRange`）は「public かつ published」の WHERE 句を持つため、visibility の確認も integration の一部として入ると、期間フィルターの safety を包括的に示せる。現状では `published_at non-null` の検証だけで「public 性」は暗黙的。
- **影響:** 低〜中（実装は SQL WHERE で確保されているが、integration test としては「入出力の型契約」をより明示的に示すと quality 向上）。
- **提案:** line 671 後に以下を追加：
  ```typescript
  // Also verify that the period-filtered notes are public (the adapter's WHERE
  // clause ensures this, but documenting the contract makes integration intent
  // explicit).
  // Since only public notes go through period filtering, visibility is not a
  // field on the output, but we can assert the source via the use case contract.
  expect(r.notes.length).toBeGreaterThan(0); // non-empty result
  ```
  （または、使用 case の出力に `visibility: 'public'` を明示的に include して assert するのもあり。）

---

## Notes（優れた点）

### [N-001] Round 1 指摘への対応が迅速かつ完全
**点数:** ⭐⭐⭐⭐⭐

Round 1 の warning 5 個がすべて反映されている：
- [W-001] TZ 依存性の JSDoc 明記：`formatNoteDate.test.ts:13-19` で runner TZ に依存する旨を明示。
- [W-002] 両端 null normalization テスト：`publicDateRange.test.ts:15-20` で「both invalid → undefined」を明示的にテスト。
- [W-003] noteColumn path の published_at non-null assert：`listUserPublicNotes.integration.test.ts:653-676` で「returned notes は publishedAt !== null」を検証。
- [W-004] `nextFilterSearch` 期間フィルター comment：`PublicTopControls.test.tsx:31-36` で「invalid dates は transport boundary で validation される」旨をコメント。
- [W-005] `groupNotesByDay` 後方互換テスト：`listSelectors.test.ts:283-296` で「no 3rd arg → updatedAt で group」を明示的にテスト。

すべての指摘がコード + テストに反映され、スコープ内での修正が完了している。

### [N-002] 期間境界（inclusive end date）の検証が厳密
**点数:** ⭐⭐⭐⭐⭐

`publicDateRange.test.ts:41-50` の「same-day from=to」テストで、単なる「window が存在」ではなく、**actual published timestamp の inclusion を numeric で検証**：

```typescript
const published = new Date("2026-05-10T15:30:00.000Z").getTime();
expect(published).toBeGreaterThanOrEqual(r?.from?.getTime() ?? 0);
expect(published).toBeLessThan(r?.to?.getTime() ?? 0);
```

この検証は off-by-one バグ防止の鍵であり、ADR-006 の「inclusive end date」を型レベルでなく実際の時刻値で保証する誠実な設計。

### [N-003] 両 path 一貫性を Integration で直接検証
**点数:** ⭐⭐⭐⭐

`listUserPublicNotes.integration.test.ts:534-574` が `publishedAt` path と `noteColumn` path（title sort）双方で期間フィルターを同一データ seed で検証：

- line 534-553：`publishedAt` path で Feb 1 .. Mar 1 → feb のみ
- line 555-574：`noteColumn` path（title sort）で同一期間 → feb のみ

**path による結果相違がないこと**を integration で証明し、ADR-005 の「両 path で公開日範囲が一貫して効く」という実装請負を保証。

### [N-004] 期間フィルターのすべての boundary case が covered
**点数:** ⭐⭐⭐⭐⭐

describe "publishedRange filter" が 6 つの軸を網羅：

1. publishedAt path（line 534-553）
2. noteColumn path / title sort（line 555-574）
3. from-only（line 576-591）
4. to-only（line 593-609）
5. end-date inclusive（line 611-631）
6. empty result（line 633-651）

seed helper `seedRangeOwner`（line 509-526）で「Jan 10 / Feb 10 / Mar 10」という均等構造を用意し、各 case での in/out が predictable に制御される。この網羅は plan の「期間境界は unit テスト必須」要件（plan.md line 127）を超えて、integration で実 DB での動作を保証。

### [N-005] TZ 決定性の明示化
**点数:** ⭐⭐⭐⭐

`formatNoteDate.test.ts:13-19` の JSDoc で、「`now` を注入し runner TZ に依存することを self-document」：

```typescript
// `now` is injected so the「今日／昨日」comparison is deterministic. The
// comparison uses local calendar day via `getFullYear()` / `getMonth()` /
// `getDate()`, so the test **depends on the runner's TZ**. For CI consistency,
// ensure TZ is fixed (e.g. `TZ=UTC`).
```

加えて、`formatNoteDate.ts:1-8` で UTC vs local TZ の使い分けを明記：

```typescript
// `formatPublishedDate()` use UTC (SSR/CSR values must agree).
// `formatRelativeDate()` operates on local calendar dates via the browser's timezone.
```

TZ 問題をコードレベルで透明化し、将来の CI 環境構成者が TZ 固定の必要性を理解可能にしている。

### [N-006] `DateRange` VO との契約保全が architectural に integrity を示す
**点数:** ⭐⭐⭐⭐

ADR-006 の設計「DateRange は半開 VO 契約を保つ; presentation で `to` を翌日 00:00 に正規化して inclusive を達成」が実装 + テストで一貫：

- **型レベル**: `DateRange = { from: Date | null; to: Date | null }`（契約：半開）
- **Presentation**: `normalizePublicDateRange`（line 22）で user-input の inclusive `to` → 翌日 00:00
- **Adapter**: `publishedRangeConditions`（line 54-66）が `gte(from)` & `lt(to)` で半開区間を SQL に
- **Test**: `publicDateRange.test.ts:28-32` で「to の翌日 00:00 は exclusive」を数値で検証

VO の契約を変えず、presentation boundary で semantic transformation することで、auth 側との同一 VO 共有を実現。アーキテクチャの「VO は値の不変条件を型で表現、layer 境界で semantic を吸収」原則を実践的に示す。

### [N-007] Pure function テストが router/container 無しで回す効率性
**点数:** ⭐⭐⭐⭐

`PublicTopControls.test.tsx:31-100` が `nextFilterSearch`, `toggleTagSet` といった純粋関数を router mock 無しで直接テスト：

```typescript
expect(
  nextFilterSearch({ page: 2 }, { from: "2026-05-01", to: "2026-05-31" })
).toEqual({
  page: undefined,
  from: "2026-05-01",
  to: "2026-05-31",
});
```

CLAUDE.md「domain / application 層は deterministic, testable にする」の践行。Component の behavior logic を pure に切り出し、fast unit test で検証することで、integration cycle を短縮。

### [N-008] Component SSR test が「presence of text」に限定する分責任設計
**点数:** ⭐⭐⭐⭐

`PublicNoteViews.test.tsx` が SSR の smoke test（「特定のテキストが HTML に present」）に限定し、振る舞い logic を pure function test に委譲：

- SSR test：「2026年2月10日 公開」が present（表示形式の事実確認）
- Pure function test：`formatPublishedDate`（`formatNoteDate.test.ts:5-9`）で format 関数の出力を直接検証

責任分離により、Component 改変時の test update 負荷を軽減。

---

## Summary by Axis

| 軸 | Status | Notes |
|---|---|---|
| **期間境界 off-by-one** | ✅ PASS | `publicDateRange.test.ts` で同日 from=to の numeric assertion、integration で end-date inclusive を実 DB で検証 |
| **両 path 一貫性** | ✅ PASS | integration で publishedAt path と noteColumn path（title sort）を同一 seed で並列検証 |
| **TZ 決定性** | ✅ PASS | JSDoc で runner TZ 依存性を明記、実装で UTC vs local を区別 |
| **後方互換性** | ✅ PASS | `groupNotesByDay` 第3引数なし（auth 側）で updatedAt グループ化を明示テスト |
| **Null fallback** | ⚠ PARTIAL | 実装の防御的 null handling は正しいが、テストで fallback path を明示的に踏むケースが無い（W-001） |
| **Type constraint** | ⚠ PARTIAL | `PublicNoteItem` が `groupNotesByDay` 制約を満たすことは実装で確認済みだが、テストで touch しない（W-002） |
| **Validation boundary** | ✅ PASS | invalid date string の normalization は test 済み、route validator での validation は別層（コメント明記） |
| **Projection一貫性** | ✅ PASS |両 path で `publishedAt` が projection される（line 457-503） |

---

## Test Coverage Map

### Unit (Pure Functions)
- ✅ `formatPublishedDate()`: ISO timestamp → "YYYY年M月D日 公開"
- ✅ `formatRelativeDate()`: Date + now → "今日" / "昨日" / "M月D日" / "YYYY年M月D日"
- ✅ `normalizePublicDateRange()`: URL params (YYYY-MM-DD) → DateRange
  - ✅ from のみ、to のみ、両方、同日、invalid strings
- ✅ `nextFilterSearch()`: state patch 生成
  - ✅ period のみ、タグのみ、sort のみ、複合
  - ✅ デフォルト値の削除（sort="publishedAt" など）
- ✅ `toggleTagSet()`: tag add/remove

### Integration (Real DB)
- ✅ `listUserPublicNotes` usecase
  - ✅ publishedAt path（tag AND-filter、期間、order、paging）
  - ✅ noteColumn path (updatedAt/createdAt/title ソート、期間、paging)
  - ✅ 期間フィルター: from-only, to-only, both, same-day, empty
  - ✅ 期間フィルター: end-date inclusive（日付が含まれる）
  - ✅ 両 path で publishedAt projection
  - ✅ noteColumn path で published_at non-null assertion
- ✅ `groupNotesByDay` キー抽出関数（public 側 publishedAt、auth 側 updatedAt 後方互換）

### Component (SSR)
- ✅ `PublicNoteViews`: list/tile/calendar 各 mode で public note route へのリンク
- ✅ Meta row が publishedAt format（"2026年2月10日 公開"）を表示
- ✅ `PublicTopControls`: tag chips, display segmented, sort menu, period chip

### Not Covered (Acceptable)
- ❌ Route-level search validation（transport boundary 検証は route validator の責務）
- ❌ Server function の mutation 動作（browser interaction test は `.issue/619/testing.md` のマニュアルテスト参照）

---

## Recommendations

1. **[W-001] 対応推奨（低優先度）:** `PublicNoteItem.publishedAt: null` の fallback case をテストに追加。理由：実装側で防御的設計だが、テストで「その防御が機能する」ことを示すと confidence が上がる。

2. **[W-002] 対応推奨（低優先度）:** `PublicNoteItem` の type constraint（`id`, `updatedAt` 存在）を test touch。理由：plan で「実装時に確認する」とあり、軽微な追加テストで確認完了を明記できる。

3. **[W-003] 対応推奨（低優先度）:** `normalizePublicDateRange` に invalid string normalization の設計コメントを追加。理由：validation 層の責務分離を自明化。

4. **[W-004] 対応推奨（低優先度）:** integration test で「期間フィルター後の notes が public であること」を明示的に assert。理由：integration の契約を包括的に示す。

上記の warning はすべて「補強」レベルで、**blocking issue ではない**。PR は test 観点で合格。

---

## 結論

✅ **PR #653 は Round 1 指摘をしっかり対応し、Test 層の質が高い。** 

主要な test 軸（期間境界、両 path 一貫性、TZ 決定性、後方互換性）がすべてカバーされ、新たな懸念は軽微（warning 4 個は補強程度）。

**Blockers: 0**  
**Verdict: PASS ✅** — 実装に進出可能。
