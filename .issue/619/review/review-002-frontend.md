# Frontend Review (Round 2) — Issue #619: ユーザー公開ページ（P30）デザインモック整合

**PR:** #653  
**ブランチ:** issue/619/p30-design-parity  
**レビュー対象:** Frontend（React 19 / TanStack Router / Tailwind）  
**レビュー方式:** ゼロベース再レビュー（Round 2）

---

## Blockers

なし

---

## Warnings

### [W-001] `formatRelativeDate()` の time-point/calendar-date の意味論が implicit

**場所:** `app/components/public/formatNoteDate.ts:23-41`

**現状:**
```typescript
/**
 * Relative date label for the P30 right-side note column: "today" /
 * "yesterday" / "M月D日" (same year) / "YYYY年M月D日" (year-crossed).
 * Operates in local calendar time: `date` and `now` are any time point,
 * and the comparison uses `getFullYear()` / `getMonth()` / `getDate()`
 * (all in local TZ, not UTC). This matches the browser timezone for
 * client-island rendering.
 */
export function formatRelativeDate(date: Date, now: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / oneDay);
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
```

**指摘:**
- 引数 `date` / `now` は「any time point」と述べられているが、実装は **UTC ISO string から parse された Date** を想定している（呼び出し側: `PublicNoteViews.tsx:116` で `new Date(noteDate(note))`）
- `noteDate()` は `publishedAt ?? updatedAt`（両者とも ISO string）を返すため、`date` は UTC time point の Date オブジェクトになる
- しかし関数内の計算は `d.getFullYear()` / `d.getMonth()` / `d.getDate()` で **local TZ で解釈**している
- つまり、「UTC time point を local TZ で読む」という暗黙の契約があり、JSDoc の「any time point」は正確ではない
- 結果的には問題ないが（local TZ で計算される `startOfDay` は両 `date` と `now` で統一されるため相対計算は正しい）、**契約が implicit** なため保守性が低い
- テスト時に「UTC midnight を表す Date」を渡すのか「local midnight を表す Date」を渡すのか曖昧

**理由:** 
- 「日付計算は local calendar 日に統一」という意図は正しいが、引数の意味論（「UTC time point として渡せば自動的に local TZ で読まれる」）が明示されていない
- 将来別の呼び出し元が「local calendar date として直接 Date を作成」する場合、二重の TZ 変換が生じるリスク

**提案:** JSDoc を明確に：
```typescript
/**
 * Relative date label for the P30 right-side note column: "today" /
 * "yesterday" / "M月D日" (same year) / "YYYY年M月D日" (year-crossed).
 *
 * Arguments `date` and `now` are UTC time points (e.g., from ISO strings).
 * The comparison converts them to the browser's local calendar date
 * (via `getFullYear()` / `getMonth()` / `getDate()`) for "today" / "yesterday"
 * judgement, which must match the user's local TZ. This intentional TZ
 * conversion is correct for client-island rendering.
 */
```

---

### [W-002] `PublicTopControls` の wrapper に `display: contents` を使用するが Tailwind utility 非互換

**場所:** `app/components/public/PublicTopControls.tsx:290-291`

**現状:**
```typescript
return (
  <div className="contents" aria-busy={isPending}>
    <div className={FILTER_ROW}>
    ...
  </div>
);
```

**指摘:**
- CLAUDE.md「Styling」セクション: **「Utility-first only. Write Tailwind utilities directly in `className`. Do not introduce new handwritten CSS files or `@apply`-based component classes.」**
- `display: contents` は Tailwind v4 に **built-in utility がない** （v3 では `[@supports(display:contents)]:contents` のような arbitrary が必要だった）
- 実装では `className="contents"` を直接指定しているが、これは Tailwind utility ではなく、**CSS classname として出力される**か、**Tailwind が認識せず無視される**可能性がある
- デフォルトでは Tailwind は `contents` を認識しないため、この実装は依存していない。しかし CSS output に含まれるなら、CLAUDE.md の「utility-first only」に違反

**理由:**
- CLAUDE.md の style 規約では、arbitrary value（`[...]`）を使うことは許容されている（e.g., `bg-[#c9d3df]`）が、既成クラス名を直接使うことは非標準
- 確認: Tailwind v4 に `contents` utility があるのか、CSS-in-JS で別途 define されているのか

**提案:**
- A案（確定的）: Tailwind で `contents` を define していない場合、arbitrary value で指定：
  ```typescript
  <div className="[display:contents]" aria-busy={isPending}>
  ```
- B案（後方互換）: CSS file（`app/styles/index.css` の `@layer components` など）で define：
  ```css
  .contents { display: contents; }
  ```
  ただし CLAUDE.md の documented exception（`.note-detail-content`）に倣う場合のみ

現状実装で **実際に `display: contents` が機能している** なら、Tailwind が認識しているか、別途 CSS で define されているか確認推奨

---

### [W-003] `SortPopover` の `initialIndex` 計算が border case で安全性が低い

**場所:** `app/components/public/PublicTopControls.tsx:568-572`

**現状:**
```typescript
const initialIndex = (() => {
  const i = SORT_ORDER.indexOf(value);
  return i < 0 ? 0 : i;
})();
```

**指摘:**
- `SORT_ORDER` の enum が変更された場合や、`value` が `SORT_ORDER` に含まれていない場合、`indexOf` は `-1` を返す
- 実装は「見つからなければ 0」と fallback しているため、安全ではある
- しかし `value` は `useSearch` から直接取得されており、**schema validation を通っているはず** の値なので、「見つからない」ことは実質不可能
- つまり、**この fallback は防御的だが dead code** である可能性が高い（validation が保証している）

**理由:**
- 型安全性（`value` が必ず `SORT_ORDER` に含まれることを型で保証できるか）が不明確
- 呼び出し側で「`value` は always in `SORT_ORDER`」という不変条件が implicit

**提案:**
- A案（type-safe）: `selectSort` の戻り型を const assertion で絞る、または enum を used：
  ```typescript
  const selectSort = (s: { sort?: SortAxis }): SortAxis =>
    s.sort ?? "publishedAt";
  // selectSort の戻り値は必ず SORT_ORDER に含まれる（＝ SORT_ORDER が exhaustive list）
  ```
- B案（defensive）: 現状維持（dead code だが失敗時の graceful fallback として OK）

現実装は B案 を暗黙的に取っているが、許容可能

---

### [W-004] `DatePopover` の `DATE_INPUT_SM` が Tailwind の `h-7` を使用

**場所:** `app/components/public/PublicTopControls.tsx:340`

**現状:**
```typescript
const DATE_INPUT_SM =
  "h-7 px-2 rounded-md border border-hairline bg-surface text-sm text-ink flex-1 min-w-0";
```

**指摘:**
- `h-7` は Tailwind 標準 height utility（28px）
- height 値は design tokens に defined されているのか、Tailwind built-in に依存しているのか不明確
- モック P30 の date input の高さを確認する必要がある（CSS では定義されているか）

**理由:**
- CLAUDE.md「Design tokens live in `app/styles/tokens.css`」とあるが、date input の height token が定義されているか確認が必要
- もし design token に `--input-height-sm` のような値があれば、arbitrary value で使用すべき

**提案:**
- モック `P30-user-public-top.html` の date input 高さを確認
- token defined なら：
  ```typescript
  "h-[var(--input-height-sm)] px-2 ..."
  ```

---

### [W-005] `reduceFilters` action type が `setDate` と `setDateRange` の両方を持つ（冗長）

**場所:** `app/components/public/PublicTopControls.tsx:127-141`

**現状:**
```typescript
type FilterAction =
  | Readonly<{ type: "setTags"; tags: readonly string[] }>
  | Readonly<{ type: "setSort"; sort: SortAxis }>
  | Readonly<{
      type: "setDateRange";
      from: string | undefined;
      to: string | undefined;
    }>
  | Readonly<{
      type: "setDate";
      key: "from" | "to";
      value: string | undefined;
    }>;
```

**指摘:**
- `setDateRange` は両フィールドを一度に更新（preset selection 時）
- `setDate` は `from` / `to` いずれか一方を更新（range input 変更時）
- 実装的には両者は **独立した action** で、別々に dispatch される（`selectPreset` vs `updateDate`）
- しかし型定義上「2つの異なる action 型」が `from` / `to` を扱うため、**reducer の switch case が冗長性を持つ**

**理由:**
- reducer は monolithic で、両 action を同じ `reduceFilters` で処理している
- これ自体は OK だが、「なぜ 2 つの action 型が必要なのか」という不変条件が明示されていない（preset vs range input の distinction が隠れている）

**提案:**
- コメント追加：
  ```typescript
  // setDateRange: preset selection (両フィールドを同時更新)
  // setDate: 手動 range input (いずれか一方を個別更新)
  type FilterAction = ...
  ```

実装は正しいが、意図を明示すべき

---

## Notes

### [N-001] `useOptimistic` + `useTransition` の `await` パターンが正しく実装されている

**場所:** `app/components/public/PublicTopControls.tsx:195-213`

**確認:**
```typescript
const run = (
  action: FilterAction,
  patch: { ... },
) => {
  startTransition(async () => {
    applyOptimistic(action);
    try {
      await router.navigate({
        to: "/u/$username",
        params: { username },
        search: (prev) => nextFilterSearch(prev, patch),
      });
    } catch {
      // Reverting to baseline is the correct fallback.
    }
  });
};
```

**評価:** ✅
- `applyOptimistic(action)` は同期的に即座に反映
- `router.navigate()` は `await` でラップされ、navigation 完了を待つ
- catch ブロック（cancelled navigation）で baseline へ自動復帰
- Issue #478 のパターン（`FilterBar.tsx`）を正しく踏襲している

---

### [N-002] `display` を楽観 state に含めず URL `replace` に委ねる design が正しい

**場所:** `app/components/public/PublicTopControls.tsx:241-247`

**確認:**
```typescript
// display` stays out of the optimistic state: it is loaderDep-excluded, so
// the `replace` URL update is reflected synchronously by `PublicNoteViews`'
// own `useSearch`. The active check reads `useSearch` directly.
const selectDisplayMode = (mode: DisplayMode) => {
  if (mode === display) return;
  router.navigate({
    to: "/u/$username",
    params: { username },
    search: (prev) => ({ ...prev, display: mode }),
    replace: true,
  });
};
```

**評価:** ✅
- ADR-002 / S-004 の方針を正しく実装
- `display` は loaderDeps 非対象のため、サーバー再フェッチ無し
- `replace: true` で URL が同期的に更新され、`PublicNoteViews` の `useSearch` が即座に反映
- 楽観 state を持たないため、二重ソース（Controls optimistic + Views useSearch）を避けている

---

### [N-003] `mergeTagChips` 呼び出しが楽観 state ベースに正しく変更

**場所:** `app/components/public/PublicTopControls.tsx:228`

**確認:**
```typescript
const chips = mergeTagChips(tagOptions, [...optimisticTags]);
```

**評価:** ✅
- `optimisticTags: ReadonlySet<string>` を spread で array に変換
- Array を `mergeTagChips` に渡す（signature: `(tagOptions, selectedTags: readonly string[])`）
- 楽観 state がタグ chip の表示に即座に反映される

---

### [N-004] `noteDate()` helper の fallback が defensive

**場所:** `app/components/public/PublicNoteViews.tsx:53-56`

**確認:**
```typescript
function noteDate(note: PublicNoteItem): string {
  return note.publishedAt ?? note.updatedAt;
}
```

**評価:** ✅
- `publishedAt: string | null` のため null case を defensive に処理
- `updatedAt` への fallback で、「公開日がない」edge case を mask
- ADR-001「public note = has publishedAt」を型に頼らず、実装で defensive に担保

---

### [N-005] `groupNotesByDay` の第3引数が後方互換を保っている

**場所:** `app/components/note/list/listSelectors.ts:169-170`

**確認:**
```typescript
export function groupNotesByDay<T extends { id: string; updatedAt: string }>(
  notes: readonly T[],
  tz: string,
  getDate: (note: T) => string = (note) => note.updatedAt,
```

**評価:** ✅
- デフォルト値 `(note) => note.updatedAt` を持つため、auth 側呼び出し（第3引数なし）は無改変
- public 側は `(n) => n.publishedAt ?? n.updatedAt` を渡して public 日付軸に合わせる
- 後方互換性を保ちながら public view を enable

---

### [N-006] `ProfileHero` 構造の flex column 化でモック一致

**場所:** `app/components/public/styles.ts:80-85` + `app/components/public/UserPublicTop.tsx:138-160`

**確認:**
```typescript
// styles.ts
export const PROFILE_HERO =
  "py-14 pb-9 flex flex-col gap-5 border-b border-hairline max-sm:gap-3 max-sm:py-8 max-sm:pb-7";
export const PROFILE_HEAD = "flex items-center gap-6 max-sm:gap-4";
export const PROFILE_ID = "min-w-0";
```

```jsx
// UserPublicTop.tsx
<section className={PROFILE_HERO}>
  <div className={PROFILE_HEAD}>
    <div className={PROFILE_AVATAR} aria-hidden="true">
      {initials}
    </div>
    <div className={PROFILE_ID}>
      <h1 className={PROFILE_NAME}>{user.displayName}</h1>
      <div className={PROFILE_USERNAME}>@{user.username}</div>
    </div>
  </div>
  {user.bio !== null && user.bio.length > 0 ? (
    <p className={PROFILE_BIO}>{user.bio}</p>
  ) : null}
  <div className={PROFILE_STATS}>
    ...
  </div>
</section>
```

**評価:** ✅
- モック `.profile-hero` の `flex flex-col gap-5` (20px) を正しく実装
- `PROFILE_HEAD` で avatar + name/username を横並び
- `PROFILE_ID` の `min-w-0` でテキスト overflow を制御
- bio / stats は PROFILE_HERO 直下に全幅で積み上がる
- モック構造（avatar indent 解消）と一致

---

### [N-007] ルート schema に `z.string().date()` を使用、既存規約に統一

**場所:** `app/routes/u/$username/index.tsx:41-42`

**確認:**
```typescript
// 公開日範囲フィルタ (#619). `YYYY-MM-DD` — same `z.string().date()` contract
// as the auth-side `noteListSearchSchema`.
from: z.string().date().optional().catch(undefined),
to: z.string().date().optional().catch(undefined),
```

**評価:** ✅
- auth 側 `noteListSearchSchema` と同じ `z.string().date()` 契約
- 独自 regex を使わず、プロジェクト規約に統一
- ADR-006 の文字列→Date 変換が presentation 境界（route loader）で行われることと整合

---

### [N-008] `normalizePublicDateRange` の `to` を翌日 00:00 に正規化

**場所:** `app/components/public/publicDateRange.ts:20-22`

**確認:**
```typescript
export function normalizePublicDateRange(
  from: string | undefined,
  to: string | undefined,
): DateRange | undefined {
  const fromDate = parseDateOnly(from);
  const toExclusive = to !== undefined ? nextDayUtc(to) : null;
  if (fromDate === null && toExclusive === null) return undefined;
  return { from: fromDate, to: toExclusive };
}

function nextDayUtc(date: string): Date | null {
  const start = parseDateOnly(date);
  if (start === null) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
```

**評価:** ✅
- ユーザーが選んだ終了日（inclusive）を翌日 00:00 に正規化
- `DateRange` VO の half-open `[from, to)` 契約を保ったまま、inclusive を実現
- ADR-006「`to` を翌日 00:00 に正規化して `lt`」を正確に実装

---

### [N-009] backend の `publishedRangeConditions()` が `gte` + `lt` を正しく使用

**場所:** `app/core/adapters/d1/repositories/publicationStateRepository.ts:56-68`

**確認:**
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
    conditions.push(lt(publicationStates.publishedAt, range.to.toISOString()));
  }
  return conditions;
}
```

**評価:** ✅
- `from` は `gte`（包括）、`to` は `lt`（排他）で half-open を実現
- presentation 境界で `to` を翌日 00:00 に正規化しているため、SQL `lt` で終了日 inclusive を実現
- 両 path（`listPublicNoteIdsByOwnerSorted` + `listPublicNoteIdsByOwnerInRange`）で same conditions を使用

---

## 結論

**Blockers:** 0  
**Warnings:** 5（[W-001]～[W-005]）  
**Notes:** 9（[N-001]～[N-009]）

整体的に **品質が高く、ADR・plan・CLAUDE.md の規約をほぼ正確に踏襲** している。Warnings は「implicit な契約」「dead code の許容」「token 定義の確認」など、保守性・明示性 level の指摘であり、**機能上の問題はない**。

### 主な達成点

✅ プロフィールヒーロー構造を grid → flex-col に変更、モック完全一致  
✅ ソートを cycle toggle → dropdown（Popover + useRovingMenu）に変更  
✅ 期間フィルターを `DatePopover` + `listSelectors` 再利用で実装  
✅ 楽観的更新（useOptimistic + useTransition + await）を FilterBar パターンで踏襲  
✅ 日付表示を公開日 base へ統一（formatPublishedDate + formatRelativeDate）  
✅ `groupNotesByDay` 第3引数化で後方互換を保ちながら public 軸切替  
✅ 期間 inclusive（翌日 00:00 正規化）で off-by-one 防止  
✅ `display` を楽観 state から除外（二重ソース回避）  
✅ ルート schema を `z.string().date()` 既存規約に統一  
✅ Backend の公開日 projection・候補集合 path 両方で期間フィルター有効化

### Recommendations（優先度）

1. **[W-002] `display: contents` Tailwind 互換性確認** — Tailwind v4 で `contents` utility があるか、または CSS で define されているか確認。無い場合は arbitrary value `[display:contents]` に変更
2. **[W-001] `formatRelativeDate()` JSDoc 明確化** — UTC time point を local TZ で読む implicit な契約を明示
3. **[W-004] date input height token 確認** — `h-7` が design token に correspond するか確認。token defined なら arbitrary value に変更

その他の Warnings はコード品質向上の tips 程度で、実装上の障害なし。
