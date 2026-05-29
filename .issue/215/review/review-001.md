# PR Review #001 — fix(issue/215): drop default page/limit from URL on paginated routes

**PR:** #310
**Date:** 2026-05-29
**Round:** 1

---

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 16
- Verdict: **BLOCKED** (Warning 修正のため round 2 へ)

レイヤー別レビュー結果は以下にまとめる。各 Warning は次のラウンドまでに修正済み。

---

## Frontend

#### Blockers
なし

#### Warnings
- **[W-001]** ペジネーション正規化のデフォルト値がリテラルでハードコードされ、SSOT から外れている
  - 場所: `app/components/note/history/NoteHistoryList.tsx:72-73`、`app/components/public/UserPublicTop.tsx:188-189`、`app/routes/u/$username/index.tsx:48-49`
  - 理由: `HISTORY_DEFAULT_PAGE/LIMIT = 1/20` と `USER_PUBLIC_DEFAULT_PAGE/LIMIT = 1/20`、および `/u/$username/` ローダーの `?? 1` / `?? 20` がマジックナンバー。Issue #215 自身が「リンク側と schema 側の SSOT 一致」を目的としているのに新たな drift point を作っている。
  - 提案: 両ファイルで `PAGINATION_DEFAULT_PAGE` / `PAGINATION_DEFAULT_LIMIT` を取り込み、`navSearch` の比較対象と `/u/$username/` loader の `??` 右辺をその定数に揃える。
  - **対応:** `NoteHistoryList` 側は `noteHistorySearchSchema` の隣に `NOTE_HISTORY_DEFAULT_PAGE/LIMIT` を export し、`historyNavSearch` ヘルパーを `historyPagination.ts` に切り出して参照。`UserPublicTop` と `/u/$username/` loader は `PAGINATION_DEFAULT_*` を直接 import するよう修正。

#### Notes
- [N-001] `HOME_SEARCH = {} as const` 等は型注釈を外した最小実装で、`<Link search={HOME_SEARCH}>` の型推論はスキーマ input-optional 化により通る。plan.md のリスク欄通り意図と整合。
- [N-002] `FilterBar.handlePick` の `page: undefined` 上書きは spread した `prev.page` を消すために必要。WHY コメントも適切。
- [N-003] `FilterBar.clearAll` で `display` / `q` を残し `page` / `limit` を落とすのは Issue #215 の意図 + 「クリアでページネーションも初期化」UX で合理的。
- [N-004] `NoteListToolbar.onSelectView` の `search: () => ({ viewId })` は Issue #219 ADR-002 と整合（pre-PR も viewId 以外のフィルターは捨てていた）。
- [N-005] `_PaginationSearchSchemaMatches` の構造アサーションを `Partial`-like に緩めた変更は妥当。
- [N-006] Utility-first / `data-*` 規約、コメント記述ルール（WHY のみ）から逸脱なし。

---

## Routing / Schema

#### Blockers
なし

#### Warnings
- **[W-001]** `_PaginationSearchSchemaMatches` の構造アサーションが「optional であること」を担保していない
  - 場所: `app/core/presentation/pagination.ts:43-49`
  - 理由: `extends { page?: number; limit?: number }` は output が `{ page: number; limit: number }` (required 復活) になっても通る。Issue #215 の核となる「output を optional に保つ」契約が回帰検出できない。
  - 提案: 双方向 `extends` または `Required<>` 反転で「optional 保証」アサーションに差し替える。
  - **対応:** `Record<string, never> extends z.infer<typeof paginationSearchSchema>` で空オブジェクトが output シェイプを満たすことをチェック。`.default(...)` 復活で fail するように矯正。

- **[W-002]** `noteHistorySearchSchema` のデフォルト値が `NoteHistoryList.tsx` 側でハードコードされている
  - 場所: `app/components/note/history/NoteHistoryList.tsx:72-77`、`app/routes/_app/notes/$noteId/history/index.tsx:59-60`
  - 理由: `.default(20)` 撤去後、`1` / `20` がコンポーネント内 / loader / schema コメントの3か所に重複。`paginationSearchSchema` 側との SSOT 不整合。
  - 提案: `noteHistorySearchSchema` の隣に `NOTE_HISTORY_DEFAULT_PAGE` / `NOTE_HISTORY_DEFAULT_LIMIT` を export し、3 か所すべてで参照する。
  - **対応:** `schema.ts` で 2 定数を export、`historyPagination.ts` ヘルパーと loader で参照する形に修正。

- **[W-003]** `noteListSearchSchema` のデフォルトが loader 側で `NOTE_LIST_LIMIT_DEFAULT` と `1` に分かれている
  - 場所: `app/routes/_app/index.tsx:104-105`
  - 理由: `pageForLoad = baseSearch.page ?? 1` が素のリテラルで、`limit` だけ定数参照。page の SSOT が不在。
  - 提案: `NOTE_LIST_PAGE_DEFAULT = 1` を `app/components/note/constants.ts` に追加。
  - **対応:** 追加して home loader で参照するよう修正。

#### Notes
- [N-001] Zod 4 + `z.coerce.number().pipe(field).optional().catch(undefined)` の経路は意図通り。`?page=abc` → `coerce(NaN) → pipe 失敗 → catch(undefined)`、`?page=2` → 数値。`.optional()` は `catch` の前で「キー欠落を許可する」入力契約として効いており、output が required にならない点が `MakeRequiredSearchParams` 回避の本質。
- [N-002] `FilterBar.handlePick` で `page: undefined` を明示的に上書きしてクエリを落とすパターンは正しい。
- [N-003] `/u/$username/` の `renderInputSchema` が required を維持しており、loader 側の `?? ...` で矛盾なく成立。
- [N-004] `viewQueryToSearch` は `page` / `limit` をセットしないため、SavedView 復元と Issue #215 修正は競合しない。
- [N-005] `redirect({ to: "/", search: { ...search, display: view?.displayMode } })` も `search.page === undefined` のときクエリに出ないため、SavedView リダイレクトのクリーンさが保たれる。

---

## Test

#### Blockers
なし

#### Warnings
- **[W-001]** `paginationSearchSchema` 自体の挙動を直接ピン留めする単体テストが存在しない
  - 場所: `app/core/presentation/pagination.ts:31-34`（テスト不在）
  - 理由: Issue #215 の中核は `paginationSearchSchema` を `.optional().catch(undefined)` 化したことだが、PR の差分には直接検証するテストがない。`noteListSearchSchema` のテストでは退化を捕捉できない。
  - 提案: `app/core/presentation/__tests__/pagination.test.ts` を新設し、`parse({})` で undefined / max+1 で undefined / `paginationSchema` は throw 等を検証。
  - **対応:** ファイル新設、10 件のテストケースを追加。

- **[W-002]** ペジネーションリンクが page=1 のとき URL を空にする挙動の単体テストがない
  - 場所: `app/components/note/history/NoteHistoryList.tsx`（テスト不在）、`app/components/public/UserPublicTop.tsx`（同上）
  - 理由: plan ステップ 7・8 で導入された `navSearch` ヘルパーが Issue の挙動を支える要だが、リグレッションしたときに気付けない。手動テストでは認証が必要なためカバーされていない。
  - 提案: `navSearch` 相当の純粋関数を公開してテストする。
  - **対応:** `historyNavSearch` を `historyPagination.ts` に切り出し、`__tests__/historyPagination.test.ts` で 4 件のテストを追加。`UserPublicTop` 側の `Pagination` 内 `navSearch` は `PAGINATION_DEFAULT_*` を直接参照する形にして `paginationSearchSchema` のスキーマテストでの担保とした（ヘルパー切り出しまでは行わない — `Pagination` は局所化された private function）。

- **[W-003]** `DisplayModeSwitch` の「現在モードと同じなら navigate しない」テストとの整合性が薄い
  - 場所: `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx:113-132`
  - 理由: `toEqual({ display: "calendar" })` への切替は良いが、`prev` を `{}` ではなく `{ page: 2, q: "x" }` のような非空ケースでも検証していない。
  - 提案: 非空 prev での pass-through を検証するテストを追加。
  - **対応:** `preserves non-default prev while swapping display` テストを追加。

#### Notes
- [N-001] `schema.test.ts` の名称変更は意味的に正確。loader 側で `?? PAGINATION_DEFAULT_*` で再 default する設計を 1 行コメントで残す改善を反映済み。
- [N-002] `NOTE_LIST_LIMIT_DEFAULT` import を削除した一方 `NOTE_LIST_LIMIT_MAX` は残してる。クリーンアップは妥当。
- [N-003] PR の Test plan の手動検証残項目について、W-003 と合わせて補強済み。

---

## Design Decisions

- **`Record<string, never> extends z.infer<...>` パターンを採用**（pagination.ts:43-49）— `{}` extends `T` のみを使うと「any non-nullish」もマッチして弱くなるが、`Record<string, never>` は厳密な空オブジェクトを表し、required field の追加で fail する。Issue #215 の output-optional 契約をより強く保証する。
- **`historyPagination.ts` を別ファイルに切り出した** — `NoteHistoryList.tsx` は async server component なので、render 不要でユニットテストするには関数を独立 module に分けるのが最も軽量。
- **`UserPublicTop` の `Pagination.navSearch` は切り出さない** — `paginationSearchSchema` 側でテストを書いたので、コンポーネント内 closure のままにして変更スコープを抑える。Issue #215 のスコープ内に留めるため。
