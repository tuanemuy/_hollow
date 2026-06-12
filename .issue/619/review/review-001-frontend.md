# Frontend Review — Issue #619: ユーザー公開ページ（P30）デザインモック整合

**PR:** #653  
**ブランチ:** issue/619/p30-design-parity  
**レビュー対象:** Frontend（React 19 / TanStack Router / Tailwind）

---

## Blockers

なし

---

## Warnings

### [W-001] PROFILE_NAME margin 値のモック不一致

**場所:** `app/components/public/styles.ts:91`

**現状:**
```typescript
export const PROFILE_NAME =
  "text-3xl font-normal tracking-tightest leading-tight text-ink mb-1 max-sm:text-[26px]";
```

**指摘:**
- `mb-1` = 4px（Tailwind default）
- モック（`P30-user-public-top.html:305`）は `margin-bottom: 4px` なので数値は一致する
- しかし **plan.md（ステップ4）の記述** — `PROFILE_NAME` の下マージンを「`mb-1.5`(6px) → `mb-1`(4px)」に変更 — は過去の state を参照している可能性がある
- 実装では既に正しく `mb-1` が設定されているため、plan の記述自体が古い / 既に修正済みの可能性あり
- **品質上は OK、記録管理上のみ注意:** ADR・plan の「変更前の値」が実装時点の状態を反映していることを確認推奨（将来レビュー時の混乱防止）

**理由:** plan の「`mb-1.5` → `mb-1`」という相対的な修正記述と、実装の絶対値 `mb-1` が矛盾していないが、意図した state 遷移を明確にすべき

**提案:** なし（実装は正しい）

---

### [W-002] `formatPublishedDate()` 実装で UTC 基準の旧コメント生存

**場所:** `app/components/public/formatNoteDate.ts:1-8`

**現状:**
```typescript
/**
 * Date formatting shared by the public surfaces (P30 listing / P32 search)
 * so the「更新」表記 and the right-rail short date stay consistent.
 *
 * 公開面の日付は UTC 基準で表示する（SSR/CSR・実行環境間で値を一致させるため）。
 */
export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 更新`;
}
```

**指摘:**
- ファイルの冒頭の JSDoc は `formatDate()` の「更新」表記を想定している
- 新規関数 `formatPublishedDate()`（ステップ6で追加）も同じモジュールに生存し、コメント「公開面の日付は UTC 基準」は両関数に適用される
- しかし `formatRelativeDate(date, now)`（相対表現）は **クライアント側のローカル TZ で計算** し、相対判定も local calendar 日で行う（現実装 line 32-40 で `date.getFullYear()`・`date.getMonth()` = local TZ 使用）
- つまり、**同一モジュール内で UTC 基準と local TZ 基準が混在**している（`formatPublishedDate` / `formatDate` は UTC、`formatRelativeDate` は local）
- コメント「公開面の日付は UTC 基準で表示」は正確ではない

**理由:** 将来保守時にモジュール全体の time zone 意識を誤解する可能性。`formatRelativeDate` の TZ は intentional（client island なので client TZ が正しい）が、コメント（冒頭）が UTC のみ言及して混乱を招く

**提案:** 
```typescript
/**
 * Date formatting for the public surfaces (P30 listing / P32 search).
 *
 * `formatDate()` / `formatPublishedDate()` は UTC 基準で表示し、SSR/CSR・実行環境間で値を
 * 一致させる。`formatRelativeDate()` はクライアント island 内でローカル TZ を使用し、
 * 相対判定（今日／昨日）をユーザーの clock と一致させる（intentional）。
 */
```

---

### [W-003] `PublicNoteItem` 型定義の `publishedAt: null` 契約が実装と乖離

**場所:** `app/components/public/PublicNoteViews.tsx:32-42`

**現状:**
```typescript
export type PublicNoteItem = Readonly<{
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tagNames: readonly string[];
  updatedAt: string;
  // Publication `published_at` (公開日). `null` only in the defensive
  // relay-lag case; the views fall back to `updatedAt` for grouping.
  publishedAt: string | null;
}>;

function noteDate(note: PublicNoteItem): string {
  return note.publishedAt ?? note.updatedAt;
}
```

**指摘:**
- JSDoc は「defensive relay-lag case」を想定している（公開ノートが transient に公開日を持たない可能性）
- しかし **projection 生成点** （`UserPublicTop.tsx:124-132`）では `publishedAt` を直接マッピング：
  ```typescript
  const items: PublicNoteItem[] = notes.map((note) => ({
    ...
    publishedAt: note.publishedAt,
  }));
  ```
- サーバーから来る `notes` の `publishedAt` が `null` を含む可能性は、backendレイヤーの保証（ADR-001: public note list のみを返す）に依存
- 実装時にこの null case が実際に発生するのか、単なる防御的設計か、明文がない
- plan.md（ステップ6）・ADR-001 に「公開ノートのみ一覧」と明記されているが、 **「だから `publishedAt` は非 null」とは明示されていない**（ドメイン不変条件の文書化不足）

**理由:** 型安全性（「公開ノートなら `publishedAt` は non-null」を型で表現できるか）・defensive programming（null case をテストするか）の方針が不明確

**提案:**
- A案（型安全）: `PublicNoteItem` の `publishedAt` を `string` に（非 optional）、projection で `publishedAt: note.publishedAt!` と assert。ドメイン不変「public note = has publishedAt」をコメントで明記
- B案（防御的）: 現状維持。null case の unit test（`CalendarView` の `noteDate()` fallback）を追加し、「これは望まない edge case だが defensive に処理」を明記

現実装は B案 を暗黙的に取っているが、plan / ADR に「なぜ null を許容するのか」を書く

---

### [W-004] `formatRelativeDate()` で new Date() のタイムゾーン仕様が曖昧

**場所:** `app/components/public/formatNoteDate.ts:29-41`

**現状:**
```typescript
/**
 * P30 ノート行右列の相対日付表記。今日は「今日」、昨日は「昨日」、それ以外は
 * 同年なら「M月D日」、年跨ぎは「YYYY年M月D日」。`now` を注入する純粋関数なので
 * クライアント TZ の `new Date()` を渡してテスト可能にする。「今日／昨日」判定は
 * `now` のローカルカレンダー日と `date` のローカルカレンダー日を比較する。
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
- JSDoc（line 25-27）は「`now` を注入する純粋関数なので...クライアント TZ の `new Date()` を渡してテスト可能」と述べている
- しかし **実装内部** の `startOfDay()` は `new Date(year, month, date)` で「**local TZ で その日 00:00**」を構築している（JS の Date constructor 仕様）
- 問題：入力の `date` / `now` が **UTC ISO string から `new Date(noteDate(note))` で parse された Date** の場合、内部的に UTC 値を local TZ で `getFullYear()` / `getMonth()` に変換している
- つまり、注入者側（`PublicNoteViews.tsx:90` で `const now = new Date()`、`ListView.tsx:113` で `new Date(noteDate(note))`）が UTC timestamp を渡しても、`startOfDay()` の計算が local TZ に依存している
- **結果的には OK（相対計算は local TZ 日で統一されるので）だが、「注入する `Date` の意味論」が曖昧**
  - 呼び出し側：`new Date(utcIsoString)` を渡す（UTC time point）
  - 関数側：`d.getFullYear()` で local calendar 日に変換して計算
  - 両者の契約（「何を注入するのか」「関数が何を計算しているのか」）が implicit

**理由:** 
- テスト時（UTC 基準の固定 Date を渡す）と runtime（client TZ の Date）の計算が一致するのか？
- 例：UTC 2025-06-12 の深夜（UTC 16:00）、日本時間だと 2025-06-13 01:00 
  - 呼び出し側が UTC timestamp を渡す →関数内で `getFullYear()` が local TZ 読み → 異なる日付
  - 相対計算は両 Date とも local TZ で読まれるので、相対値は正しいが、「startOfDay の絶対値」は UTC との off-by-one リスク

**提案:** JSDoc を明確に：
```typescript
/**
 * 相対日付表現。引数 `date` / `now` は任意の time point（UTC・local 関わらず）で、
 * ローカルカレンダー日で「今日」「昨日」判定する。つまり、タイムゾーン情報は無視し、
 * `date.getFullYear()` 等で local TZ に見立てた日付を計算する。単位テスト時は
 * client TZ に相当する固定 offset の Date を作成して検証（`new Date(2025, 5, 12)`）。
 */
```
あるいは、time point（ISO string）と local calendar 日を分離：
```typescript
export function formatRelativeDate(dateIso: string, nowIso: string): string {
  // ISO → local calendar date に明示的に変換
  const dateLocal = new Date(dateIso);
  const nowLocal = new Date(nowIso);
  // ... 計算は local TZ に統一
}
```

---

### [W-005] `groupNotesByDay` 第3引数のデフォルト値が型制約と矛盾

**場所:** `app/components/note/list/listSelectors.ts:164-168`

**現状:**
```typescript
export function groupNotesByDay<T extends { id: string; updatedAt: string }>(
  notes: readonly T[],
  tz: string,
  getDate: (note: T) => string = (note) => note.updatedAt,
): ReadonlyArray<Readonly<{ dateKey: string; notes: readonly T[] }>> {
```

**指摘:**
- 型制約 `T extends { id: string; updatedAt: string }` は `updatedAt` field を要求
- デフォルト値 `(note) => note.updatedAt` も `updatedAt` を使用
- しかし、`PublicNoteViews.tsx:171` で呼び出し時に `(n) => n.publishedAt ?? n.updatedAt` を渡す
- つまり、**デフォルト値は `auth` 側の `CalendarView`（`updatedAt` で統一したい）を想定しており、`public` 側は override している**
- PR 実装では問題なく動作している（`PublicNoteItem` は `publishedAt` field を持つ）
- 型安全性としては OK だが、**デフォルト値の「意味」が後方互換性の都合で曖昧**
  - 「`getDate` default = `updatedAt` は base case（auth 側）」なのか
  - 「generic param が `publishedAt` を持つなら override すべき」なのか
  - plan.md ステップ6 のコメント「デフォルト `updatedAt`」が intentional だが、JSDoc に明記されていない

**理由:** 将来別の view が `groupNotesByDay` を使う際、「第3引数を省略できるのか」「省略すると何が起こるのか」が不透明

**提案:** JSDoc 追加：
```typescript
/**
 * Group notes by local-calendar date. By default, groups by `updatedAt` (auth-side
 * calendar view). Public listing passes a custom `getDate` override to group by
 * `publishedAt` instead. The generic constraint ensures at least `{ id, updatedAt }`
 * to avoid requiring the default to fail at runtime; callers MUST override
 * `getDate` if the type carries a different date field to use for grouping.
 */
export function groupNotesByDay<T extends { id: string; updatedAt: string }>(
  notes: readonly T[],
  tz: string,
  getDate: (note: T) => string = (note) => note.updatedAt,
): ...
```

---

## Notes

### [N-001] `PublicTopControls` の `aria-busy` ラッパ の `display: contents` 実装は妥当

**場所:** `app/components/public/PublicTopControls.tsx:297`

```typescript
<div className="contents" aria-busy={isPending}>
  <div className={FILTER_ROW}>
    ...
  </div>
  <div className={TOOLBAR}>
    ...
  </div>
</div>
```

**所見:** 
- `display: contents` で DOM 構造を flatten（wrapper 要素が寄与しない）→ `.user-tools` の flex レイアウト gap が preserved
- `aria-busy={isPending}` で screen reader に pending state を通知（accessibility OK）
- loaderDeps 再フェッチ時に wrapper だけ mount/unmount されず、children が re-render される
- **実装と plan.md（ステップ5・ADR-002 / S-004）が一致** → 二重ソース回避（`display: contents` + `aria-busy` pattern）が正しく採用されている

**評価:** ◎ 実装推奨パターン通り。CLAUDE.md の utility-first・data-state 規約も守られている

---

### [N-002] `formatPublishedDate()` / `formatRelativeDate()` の UTC vs local TZ 分離は intentional

**場所:** `app/components/public/formatNoteDate.ts` 全体

**所見:**
- `formatPublishedDate()`（メタ行「YYYY年M月D日 公開」）は UTC で統一 → SSR/CSR 値の一貫性確保（site-wide 方針通り）
- `formatRelativeDate()`（右列「今日」「M月D日」）は local TZ で計算 → client-side island なのでユーザー clock と一致（correct）
- plan.md ステップ6・ADR-006・ADR-007 で明記されているが、実装コメントが「UTC 基準」と broad に述べているため混乱しやすい（← W-002）

**評価:** ◎ 実装は正しい。コメント整理（W-002）で clarity を上げるべき

---

### [N-003] `normalizePublicDateRange()` の inclusive 正規化は正確

**場所:** `app/components/public/publicDateRange.ts:17-40`

**所見:**
- ユーザーが終了日「2025-06-12」を選ぶ → `normalizePublicDateRange(from, "2025-06-12")` 
- 内部で `nextDayUtc("2025-06-12")` → `2025-06-13T00:00:00Z`
- `DateRange VO` の contract は半開 `[from, to)` だが、実装側で `to` フィールドに「翌日 00:00」を詰める
- アダプター層で `lt(published_at, to)` で半開区間 `[from, to)` = 終了日を含む
- plan.md ステップ2・ADR-006 と一致 → **off-by-one 防止が intentional に実装されている**
- **後方互換性も確保：** auth 側 `normalizeListDateRange` は `to` を同日 00:00 のまま使用（更新日除外）。public 用 `normalizePublicDateRange` は翌日 00:00 に足す（公開日を含む）。両者は異なる VO 値を詰めるため衝突なし

**評価:** ◎ VO 契約（半開）を保ちながら inclusive semantics を実現。ADR-006 通り

---

### [N-004] `nextFilterSearch()` の期間パッチ生成が loaderDeps 再フェッチを正しく trigger

**場所:** `app/components/public/PublicTopControls.tsx:52-76`

```typescript
export function nextFilterSearch(
  prev: Record<string, unknown>,
  patch: {
    tags?: readonly string[];
    sort?: SortAxis;
    from?: string | undefined;
    to?: string | undefined;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev };
  next.page = undefined;  // loaderDeps に含まれるため reset
  if ("tags" in patch) {
    next.tags = patch.tags && patch.tags.length > 0 ? patch.tags : undefined;
  }
  if ("sort" in patch) {
    next.sort = patch.sort === "publishedAt" ? undefined : patch.sort;
  }
  if ("from" in patch) {
    next.from = patch.from;
  }
  if ("to" in patch) {
    next.to = patch.to;
  }
  return next;
}
```

**所見:**
- `tags` / `sort` / `from` / `to` の変更は `next.page = undefined` で pagination reset
- `from` / `to` を `if ("from" in patch)` で conditional に update（undefined を明示的に set）
- route loader `loaderDeps: ({ search }) => ({ ..., from: search.from, to: search.to })` で検知して server re-fetch
- **デフォルト値（`publishedAt` sort、empty tags、no period）を URL から削除** → clean URL（spec 準拠）
- ユニットテスト必須な項目（plan.md ステップ7）だが、実装ロジック自体は unit test 可能な pure function

**評価:** ◎ URL state management が正確。loaderDeps trigger も正しい

---

### [N-005] `useOptimistic` + `useTransition` の await pattern が `FilterBar` 踏襲

**場所:** `app/components/public/PublicTopControls.tsx:210-232`

```typescript
const run = (
  action: FilterAction,
  patch: {
    tags?: readonly string[];
    sort?: SortAxis;
    from?: string | undefined;
    to?: string | undefined;
  },
) => {
  startTransition(async () => {
    applyOptimistic(action);
    try {
      await router.navigate({
        to: "/u/$username",
        params: { username },
        search: (prev: Record<string, unknown>) =>
          nextFilterSearch(prev, patch),
      });
    } catch {
      // Reverting to baseline is the correct fallback for a filter toggle.
    }
  });
};
```

**所見:**
- `applyOptimistic(action)` で即座に state 反映
- `startTransition(async () => { ... await router.navigate(...) })`で navigation を awaited transition に wrap
- navigation キャンセルされた場合は catch で fallback （baseline 復帰）
- **plan.md ステップ5・リスク欄の注記と一致：** `navigation を await しないと `useOptimistic` が確定前に baseline へ戻る」を正しく実装
- issue #478 コメント参照も正しい （auth 側 `FilterBar` との consistency）

**評価:** ◎ 楽観 state synchronization が正確

---

### [N-006] `PublicNoteViews` の 3 view（list/tile/calendar）が `noteDate()` helper で統一

**場所:** `app/components/public/PublicNoteViews.tsx:49-51`

```typescript
function noteDate(note: PublicNoteItem): string {
  return note.publishedAt ?? note.updatedAt;
}
```

**所見:**
- `ListView`（line 113）/ `TileView`（line 152）/ `CalendarView`（line 171）が共通の date source を使用
- `publishedAt ?? updatedAt` fallback で defensive、かつ3ビュー間で日付軸を統一
- calendarView では `groupNotesByDay(..., noteDate)` で第3引数 override
- **all view の日付が公開日ベースに揃う** → モック完全一致の前提条件 satisfied

**評価:** ◎ 3 view の日付軸統一が実装されている

---

### [N-007] route schema の `from` / `to` が auth 側 `z.string().date()` 規約に統一

**場所:** `app/routes/u/$username/index.tsx:36-44`

```typescript
const publicTopSearchSchema = paginationSearchSchema.extend({
  tags: z.array(z.string().min(1).max(64)).max(8).optional().catch(undefined),
  sort: z.enum(PUBLIC_SORTS).optional().catch(undefined),
  display: z.enum(DISPLAY_MODES).optional().catch(undefined),
  // 公開日範囲フィルタ (#619). `YYYY-MM-DD` — same `z.string().date()` contract
  // as the auth-side `noteListSearchSchema`. Server-driven (loader dep).
  from: z.string().date().optional().catch(undefined),
  to: z.string().date().optional().catch(undefined),
});
```

**所見:**
- Zod `z.string().date()` で `YYYY-MM-DD` format を validate（transport boundary）
- `.catch(undefined)` で hand-typed junk をsilent に filter
- auth 側 `noteListSearchSchema` と同じ contract → one-off regex 回避（CLAUDE.md 規約通り）
- `loaderDeps` に `from` / `to` を含める（server-driven）

**評価:** ◎ transport boundary validation が正確

---

### [N-008] `groupNotesByDay` デフォルト param の後方互換性確保

**場所:** `app/components/note/list/listSelectors.ts:167`

```typescript
getDate: (note: T) => string = (note) => note.updatedAt,
```

**所見:**
- default は `updatedAt` → auth 側 `CalendarView` が無改変で動作（existing call sites에서 backward compatible）
- public 側は override `(n) => n.publishedAt ?? n.updatedAt`
- auth 側 regression 回避を plan.md ステップ7で要求しており、実装は後方互換性を保っている

**評価:** ◎ breaking change 回避

---

### [N-009] `PublicTopControls` の sort menu が accessibility pattern に従う

**場所:** `app/components/public/PublicTopControls.tsx` 全文（diff 参照）

**パターン:**
- `Popover` の `haspopup="menu"` 
- `useRovingMenu` で `itemRole="menuitemradio"`
- 4軸（published / updated / created / title）の radio button menu
- `FilterBar.tsx` の `VisibilityPopover` パターン踏襲

**所見:**
- WAI-ARIA menu button pattern に準拠
- roving tabindex で keyboard nav enabled
- radio buttons で exclusive selection（複数選択不可）

**評価:** ◎ accessibility pattern correct

---

### [N-010] 期間フィルター Popover が `DatePopover` 再利用

**場所:** `app/components/public/PublicTopControls.tsx`（diff で確認）

**パターン:**
- `DATE_RANGE_PRESETS` / `resolveDateRangePreset` / `matchDateRangePreset` / `formatDateRangeChipLabel` を `listSelectors` から再利用
- public 専用複製なし → DRY 原則 respected

**所見:**
- auth 側の確立済み期間ロジック再利用（ADR-002 通り）
- プリセット（「今月」「先月」等）の公開面への移植可能か未確認だが（モックに explicit な preset UI がなく）、実装側では再利用できる体制
- spec（plan.md ステップ5）では「プリセット・範囲解決・チップラベル整形は既存 `listSelectors` の ... を再利用」と明記されているため、実装が仕様を満たしている

**評価:** ◎ code reuse が正確

---

### [N-011] モック div 構造（gap / margin 数値）の token reference

**場所:** `spec/design/pages/P30-user-public-top.html:273-325` vs `app/components/public/styles.ts:78-96`

**gap 対応:**
| 要素 | モック | 実装 | token |
|---|---|---|---|
| `.profile-hero` gap | `var(--space-5)` = 20px | `gap-5` | ◎ |
| `.profile-head` gap | `var(--space-6)` = 24px | `gap-6` | ◎ |
| `.profile-head` mobile gap | `var(--space-4)` = 16px | `gap-4` | ◎ |
| `.profile-hero` mobile gap | `var(--space-3)` = 12px | `gap-3` | ◎ |
| `.profile-stats` gap | `18px` (literal) | `gap-4.5` = 18px | ◎ |

**margin 対応:**
| 要素 | モック | 実装 |
|---|---|---|
| `.profile-name` mb | `margin-bottom: 4px` | `mb-1` = 4px | ◎ |

**所見:**
- token mapping が正確
- 「4.5」utility（18px）の使用（`gap-4.5`）は Tailwind arbitrary value ではなく predefined（tokens.css から）
- モック・実装・tokens.md の3点 consistency 確認推奨（browser 検証段階で念のため再確認）

**評価:** ◎ spacing token mapping correct

---

