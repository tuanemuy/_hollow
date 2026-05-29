# PR Review #003 — fix(issue/215): drop default page/limit from URL on paginated routes

**PR:** #310
**Date:** 2026-05-29
**Round:** 3

---

## Summary

- Blockers: 1（修正済み）
- Warnings: 0
- Notes: 多数
- Verdict: **BLOCKED → 修正後 round 4 へ**

Routing / Schema レイヤーは APPROVED。一方、Cross-cutting レビューで初出の Blocker C-001（`PublicNoteDetail.tsx` の `<Link to="/u/$username" search={{ page: 1, limit: 20 }}>` ハードコード）が発見されたため、修正してから round 4 に進む。

---

## Routing / Schema (Round 3)

#### Blockers
なし

#### Warnings
なし

#### Notes
- Round 2 の W-001（型ガード対称化）: `_NoteListSearchSchemaIsPartial` は `Pick<NoteListSearch, "page" | "limit">` で 2 フィールドだけに絞り、`_NoteHistorySearchSchemaIsPartial` は noteHistory がそもそも `page` / `limit` のみで構成されるため Pick 不要。両ガード共に `.default(...)` 復活で typecheck 失敗する設計として機能する。
- Round 2 の W-002（`/u/$username` SSOT 化）: ローカル `searchSchema` 撤廃 → `paginationSearchSchema` 直接利用。`renderInputSchema` の `z.object({ username: ... }).extend(paginationSchema.shape)` も Zod 4 で正常動作。
- Round 2 の W-003（`PAGINATION_MAX_LIMIT` 参照化）: `noteHistorySearchSchema.limit.max` のリテラル撤廃を確認。
- `/search` ルートの `max(50)` `max(200)` 等は別の DoS guard 用途で Issue #215 のスコープ外。

**Verdict: APPROVED**

---

## Cross-cutting (Round 3)

#### Blockers
- **[C-001]** `<Link to="/u/$username">` の `search` プロップが `{ page: 1, limit: 20 }` をハードコードしたまま残っている
  - 場所: `app/components/public/PublicNoteDetail.tsx:45, 59`
  - 理由: `/u/$username` ルートは plan.md・Issue 本文の対象。`paginationSearchSchema` を input-optional にした効果が、明示的にデフォルト値を渡している以上発動しない（TanStack Router は与えられた値をそのまま URL に出す）。未ログインでも踏める「public ノート → 著者ページ」遷移で `?page=1&limit=20` が残る。
  - 提案: 両 Link の `search` を `{}` に変更する。
  - **対応:** 両箇所を `search={{}}` に置き換え。`paginationSearchSchema` が input/output 共に optional になっているので型エラーにならず、URL が綺麗になる。
  - 既知のハードコード残箇所のチェック (`grep -rn 'search={{.*page' app/`) で `app/components/public/ErrorPage.tsx:101` の `search={{ q: "", limit: 20 }}` も検出したが、これは `/search` ルート用で Issue #215 のスコープ外（`/search` の schema はそもそも input-required を意図したまま）。

#### Warnings
なし

#### Notes
- plan.md の 9 ステップは全て実装済み。Round 1/2 の Warning も解消。
- `redirect({ to: "/", search: HOME_SEARCH })` 系は `HOME_SEARCH = {}` 化により新挙動と整合。
- 3 種スキーマすべてに `Record<string, never> extends ...` 型ガード適用。
- SSOT 集約（`PAGINATION_MAX_LIMIT` / `NOTE_HISTORY_DEFAULT_*` / `NOTE_LIST_PAGE_DEFAULT`）も完了。
- コミット履歴は論理的に 3 分割され、打ち消し変更なし。スコープ外混入なし。
- Issue #13・#158・#219 と無矛盾。
- 未検証項目は PR Test plan に透明性をもって記載。

**Verdict: BLOCKED → 上記 C-001 を修正**

---

## Design Decisions

- **`PublicNoteDetail` の Link は `search={{}}` を採用** — `search` プロップ自体を省略する選択肢もあるが、TanStack Router の cross-route navigation で「相対 search を上書きしない」明示性のために `{}` を渡す方が望ましい。`HOME_SEARCH` / `TRASH_SEARCH` と同じ「定数経由」ではなく直接 `{}` リテラルなのは、`/u/$username` ルート専用の定数が存在しないため（必要なら `U_PUBLIC_SEARCH = {}` 等を `links.ts` に追加する選択肢もあるが、現時点ではシングルユースなので最小修正にとどめる）。
