# PR Review #002 — fix(issue/215): drop default page/limit from URL on paginated routes

**PR:** #310
**Date:** 2026-05-29
**Round:** 2

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 多数
- Verdict: **BLOCKED → 修正後 round 3 へ**

Frontend / Test レイヤーは APPROVED（0 / 0）。Routing / Schema レイヤーで 3 件の追加 Warning が出たため、SSOT 強化のため再度修正してから round 3 に進む。

---

## Frontend (Round 2)

#### Blockers
なし

#### Warnings
なし

#### Notes
- Round 1 の W-001 完全解消を確認。`NoteHistoryList.tsx` は `historyNavSearch` 経由、`UserPublicTop.tsx` は `PAGINATION_DEFAULT_*` 直接参照、`/u/$username/index.tsx` の loader も同定数を `??` で参照、3 か所すべて SSOT 化。
- 新規 `historyPagination.ts` の関数シグネチャ・JSDoc は CLAUDE.md 規約と整合。`(nextPage, limit)` の引数順は呼び出し側と自然対応。
- テスト網羅は 4 ケース（両デフォルト / page のみ / limit のみ / 両方非デフォルト）。
- 回帰なし、副作用なし、規約準拠。

**Verdict: APPROVED**

---

## Routing / Schema (Round 2)

#### Blockers
なし

#### Warnings
- **[W-001]** `_PaginationSearchSchemaIsPartial` を `paginationSearchSchema` だけに付けたが、`noteListSearchSchema` / `noteHistorySearchSchema` に対称的な構造ガードがない
  - 場所: `app/components/note/schema.ts:67-91, 158-173`（type guards 不在）
  - 理由: Issue #215 の対象である残りの 2 つのスキーマも同じ「output を optional に保つ」契約を持っているのに、それを型レベルで検証する仕掛けがない。runtime テストのみで `.default(...)` 復活への保護が弱い。
  - 提案: `_NoteListSearchSchemaIsPartial` / `_NoteHistorySearchSchemaIsPartial` を `Record<string, never> extends ...` パターンで追加。
  - **対応:** `schema.ts` 末尾に 2 つの型アサーションを追加。`noteListSearchSchema` は `Pick<NoteListSearch, "page" | "limit">` 経由でチェック（他フィールドが optional のため、フル extends だと無関係に通る）。

- **[W-002]** `/u/$username/index.tsx` のローカル `searchSchema` が `paginationSearchSchema` の重複定義になっており、`PAGINATION_MAX_PAGE/LIMIT` 定数も使わずリテラル `10_000`/`100` 直書き
  - 場所: `app/routes/u/$username/index.tsx:19-28`
  - 理由: SSOT が目的の PR なのに新たな drift point が残っている。`paginationSearchSchema` / `paginationSchema` がそのまま使える形なのに独自定義している。
  - 提案: `searchSchema` を撤廃して `paginationSearchSchema` を直接 `validateSearch` に渡す。`renderInputSchema` は `paginationSchema.shape` をスプレッドして `username` を加える形に。
  - **対応:** `searchSchema` を削除し `paginationSearchSchema` を流用。`renderInputSchema` は `z.object({ username: ... }).extend(paginationSchema.shape)` に変更。

- **[W-003]** `noteHistorySearchSchema.limit` の `max(100)` がリテラルハードコード
  - 場所: `app/components/note/schema.ts:165`
  - 理由: `PAGINATION_MAX_LIMIT` / `NOTE_LIST_LIMIT_MAX` と同じ値が 3 か所に独立散在。
  - 提案: `PAGINATION_MAX_LIMIT` を参照する。
  - **対応:** `import { PAGINATION_MAX_LIMIT } from "@/core/presentation/pagination"` を追加して参照。

#### Notes
- 前回 W-001 (`_PaginationSearchSchemaIsPartial`): `Record<string, never> extends ...` パターンが optional → pass / required → fail / `.default()` 復活 → fail と意図通り「default 復活を検出する」精度の高いガードであることを確認。
- 前回 W-002 (`NOTE_HISTORY_DEFAULT_*` SSOT): schema → historyPagination → loader の3点で参照。
- 前回 W-003 (`NOTE_LIST_PAGE_DEFAULT`): constants.ts → home loader で参照済み。

**Verdict: BLOCKED → 上記 3 件を修正**

---

## Test (Round 2)

#### Blockers
なし

#### Warnings
なし

#### Notes
- Round 1 で挙げた 3 つの Test Warning はすべて実質的な回帰検出力を備えた形で解消。
- `paginationSearchSchema` の 10 ケース、`historyNavSearch` の 4 ケース、`DisplayModeSwitch` の非空 prev ケースが追加され、新たに追加すべき重要テストは見当たらない。

**Verdict: APPROVED**

---

## Design Decisions

- **`_NoteListSearchSchemaIsPartial` は `Pick<>` 経由でチェック** — `noteListSearchSchema` の output は他にも optional fields を多数持つので、フル extends だと page/limit に関係なく `Record<string, never>` が `extends` を満たしてしまう。`Pick` で `page` / `limit` だけに絞ることで「これら2フィールドが空オブジェクトと互換である = optional」を厳密にチェックする。
- **`/u/$username` の `renderInputSchema` を `z.object({ ... }).extend(paginationSchema.shape)` で構成** — `username` だけ別フィールドを定義し、`paginationSchema` の `page` / `limit` を `.extend()` で組み合わせる。これでルート固有部分 (`username`) と shared なペジネーション部分が分離され、ペジネーション側を変更したときに自動追従する。
