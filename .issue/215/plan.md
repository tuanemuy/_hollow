# 実装計画 — Issue #215: URLにデフォルトの page=1&limit=20 が常に付与されてしまう

**Issue:** #215
**作成日:** 2026-05-29
**複雑度:** 中規模

---

## 目的

ホーム (`/`) / `/trash` / `/u/$username` / `/notes/$noteId/history` などのページネーション付きルートに**初期遷移したとき**、URL に `?page=1&limit=20` のようなデフォルト値クエリが付与されないようにする。ユーザーが明示的にページ送りや limit 変更を行ったときだけクエリが付く挙動にする。

## スコープ

### 含まれるもの

- `HOME_SEARCH` / `TRASH_SEARCH` / `NOTE_HISTORY_SEARCH` から `page` / `limit` を取り除き、これらの定数を `<Link>` / `router.navigate({ search })` に渡してもデフォルト値が URL にシリアライズされないようにする。
- 上記定数の `.page` / `.limit` を**直接参照**しているコールサイト（`DisplayModeSwitch` / `FilterBar` / `NoteListToolbar`）を、URL クエリを生成しない形に書き換える。
- TanStack Router の `MakeRequiredSearchParams` で `page` / `limit` が required にならないよう、`paginationSearchSchema`（`/trash`）と `/u/$username/` ルートの `searchSchema` を、`noteListSearchSchema` / `noteHistorySearchSchema` と同じ `.optional().catch(undefined).default(N)` パターンに揃える（input 側を optional にする）。
- ページネーションコンポーネント（`NoteHistoryList`, `UserPublicTop`）のページ送り Link で、デフォルト値（`page=1` または `limit=PAGINATION_DEFAULT_LIMIT`）と一致する場合はクエリから省く正規化を行う。
- `DisplayModeSwitch.test.tsx` で `page: 1, limit: 20` を期待しているアサーションを、新しい挙動（page/limit を URL に出さない）に合わせて更新する。

### 含まれないもの

- 既存のサーバー fn 側スキーマ（`paginationSchema` の strict 版 RPC）には手を入れない — RPC payload には依然として `page` / `limit` を必須にする（呼び出し側は loader 経由で値を渡す）。
- `searchSchema`（`/search`）, `viewsSearchSchema`, `exportsSearchSchema` 等の他のルート search schema はそもそも `page` / `limit` を含まないので対象外。
- ペジネーションコンポーネント自体のリファクタ・抽象化（`Pagination` 共通コンポーネント化など）は範囲外。

## 実装ステップ

### 1. `app/components/auth/links.ts` — `HOME_SEARCH` / `TRASH_SEARCH` / `NOTE_HISTORY_SEARCH` から `page` / `limit` を削除

- **対象ファイル:** `app/components/auth/links.ts`
- **変更内容:** 3つの定数いずれも空オブジェクト `{}` に置き換える。型注釈は `Partial<Pick<NoteListSearch, "page" | "limit">>` 等の最小範囲にし、JSDoc は「スキーマの `.default()` 側にデフォルトを委ねる方針に切り替わった」旨を反映。
- **理由:** これらの値がそのまま URL にシリアライズされて Issue で報告された冗長クエリの原因になっているため。`noteListSearchSchema` / `noteHistorySearchSchema` 側は既に `.optional().catch(undefined).default(...)` を持っており、リンク側で明示的にデフォルトを渡す必要がない。

### 2. `app/core/presentation/pagination.ts` — `paginationSearchSchema` を optional 化

- **対象ファイル:** `app/core/presentation/pagination.ts`
- **変更内容:** `paginationSearchSchema` の `page` / `limit` を `noteHistorySearchSchema` と同じ `z.coerce.number().pipe(field).optional().catch(undefined).default(PAGINATION_DEFAULT_*)` パターンに変更。`paginationSchema`（strict 版 RPC）は触らない。
- **理由:** TanStack Router は Zod の **input** 型を `<Link search>` の許容シェイプに使う。input optional にしないと `TRASH_SEARCH = {}` を `<Link to="/trash" search={TRASH_SEARCH}>` に渡したときに型エラーになる。`noteListSearchSchema` / `noteHistorySearchSchema` で既に同じパターンが採用されているので、`paginationSearchSchema` も揃える。

### 3. `app/routes/u/$username/index.tsx` — ルート内ローカル `searchSchema` を optional 化

- **対象ファイル:** `app/routes/u/$username/index.tsx`
- **変更内容:** `searchSchema` の `page` / `limit` を `.optional().catch(undefined).default(...)` パターンに変更。`renderInputSchema`（loader → server fn の RPC）はそのまま（loader 側で deps から実値を渡すため）。
- **理由:** `/u/$username/` も Issue の対象ルート。初期遷移で `?page=1&limit=20` が付くのを防ぐには、こちらのスキーマも input optional にする必要がある。

### 4. `app/components/note/list/DisplayModeSwitch.tsx` — `HOME_SEARCH.page` / `HOME_SEARCH.limit` 参照を撤廃

- **対象ファイル:** `app/components/note/list/DisplayModeSwitch.tsx`
- **変更内容:** `select` の `router.navigate` 呼び出しで、`page: p.page ?? HOME_SEARCH.page` / `limit: ...` の行を削除し、`prev` をそのままスプレッドして `display` だけ上書きする形に簡略化する。`HOME_SEARCH` の import も削除。
- **理由:** スキーマ側で input optional になるので、戻り値で page/limit を埋める必要がなくなる。これにより、ユーザーがページ送りしていない初期状態で display を切り替えても、URL に `?page=1&limit=20` が付かなくなる。

### 5. `app/components/note/list/FilterBar.tsx` — `withDefaults` ヘルパー撤廃

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** ヘルパー `withDefaults` を削除し、各 `router.navigate({ search })` で `prev` をスプレッドしてフィルター部分だけ差し替える形に書き換える。`handlePick` の `page: 1` も「明示的にページを 1 へ戻す」意図なので**残す**（ただし `?page=1` を URL に出さないため、スキーマ側で `1 === default` のときに省略されるよう、対応 6 の正規化と整合させる）。`clearAll` も同様に `display` / `q` のみ残して page/limit は省く形に。
- **理由:** `withDefaults` が `HOME_SEARCH.page` / `HOME_SEARCH.limit` に依存しているのを解消するため。フィルター変更時にページが 1 にリセットされる挙動は維持する（後段の `handlePick` 等で意図して 1 を渡している箇所はある）。

### 6. `app/components/note/list/NoteListToolbar.tsx` — `HOME_SEARCH.page` / `HOME_SEARCH.limit` 参照を撤廃

- **対象ファイル:** `app/components/note/list/NoteListToolbar.tsx`
- **変更内容:** `onSelectView` 内の `page: p.page ?? HOME_SEARCH.page` / `limit: ...` を削除し、`display` のみを残す形に書き換える。`HOME_SEARCH` の import も削除。
- **理由:** 同上。

### 7. `app/components/note/history/NoteHistoryList.tsx` — ページ送りリンクの正規化

- **対象ファイル:** `app/components/note/history/NoteHistoryList.tsx`
- **変更内容:** `search={{ page: page - 1, limit }}` / `search={{ page: page + 1, limit }}` の Link を、「`limit === noteHistory のデフォルト` ならクエリから省く / `page === 1` ならクエリから省く」形に整える。具体的には `search` 値を構築するヘルパーで `{ page: nextPage === 1 ? undefined : nextPage, limit: limit === 20 ? undefined : limit }` のように組み立てる（`20` は `noteHistorySearchSchema` のデフォルト）。
- **理由:** デフォルト値（`page=1`）に戻すページ送りリンクからも `?page=1` が出ないようにするため。

### 8. `app/components/public/UserPublicTop.tsx` — ページ送りリンクの正規化

- **対象ファイル:** `app/components/public/UserPublicTop.tsx`
- **変更内容:** 同様に内部の `Pagination` コンポーネントの `search` 値を正規化する。`PAGINATION_DEFAULT_PAGE` / `PAGINATION_DEFAULT_LIMIT` と一致するなら省く。
- **理由:** 同上。`/u/$username` のページ送りでも `?page=1` を出さないため。

### 9. `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx` — テスト期待値の更新

- **対象ファイル:** `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`
- **変更内容:** `forwards the calendar mode through the search function` テストで `expect(next).toMatchObject({ display: "calendar", page: 1, limit: 20 })` となっている部分を、新しい挙動（page/limit は埋めない）に合わせて `expect(next).toMatchObject({ display: "calendar" })` かつ `expect(next).not.toHaveProperty("page")` / `not.toHaveProperty("limit")` に修正する。コメントも実装に合わせて更新。
- **理由:** ステップ 4 の挙動変更に伴い、テストの期待値も追従させる必要があるため。

## 設計判断

- **input optional / output required の Zod パターンを継承** — `noteListSearchSchema` / `noteHistorySearchSchema` の `.optional().catch(undefined).default(N)` パターンを `paginationSearchSchema` / `/u/$username/` にも揃える。これにより、リンク側でデフォルト値を渡さなくても URL がパースされ、output 側では従来通り `page: number` / `limit: number` を保証する。Issue 本文の対応方針 1 にも合致。
- **`HOME_SEARCH` 等の定数を削除せず空オブジェクトに残す** — 利用箇所が広範（30 か所以上）で、削除すると影響範囲が膨らむため、定数自体は残し中身を空にする最小修正に留める。`<Link search={HOME_SEARCH}>` のままでも URL に何も足さなくなる。

## リスクと注意点

- **TanStack Router の `<Link search>` 型互換性** — `HOME_SEARCH = {}` にすると `Pick<NoteListSearch, "page" | "limit">` を満たさなくなる。型注釈を `Partial<Pick<NoteListSearch, "page" | "limit">>` に変えるか、`as const satisfies` を外して受け入れシェイプを緩める必要がある。スキーマ side を input optional にすれば、`<Link search={{}}>` 自体は valid なので問題なく通る。
- **`FilterBar.handlePick` の `page: 1` の意図** — フィルターをかけたときにページを 1 にリセットしたい場面で `page: 1` を明示しているが、これも URL には出したくない。`page: 1` を `page: undefined` に置き換えて「prev の page を上書きして消す」セマンティクスに変える。スキーマ側 default で 1 が埋まる。
- **既存テスト** — `DisplayModeSwitch.test.tsx` で page/limit の値を直接アサートしている箇所がある。挙動変更に合わせて更新する。他に router.navigate の戻り値を検証している箇所があれば併せて修正。
- **bookmark 互換性** — 既に `?page=1&limit=20` 付きで貼られた既存リンクは、スキーマ側の `.catch().default()` で吸収されるので壊れない（観測可能な動作は変わらない）。逆に新しい挙動では URL がクリーンになる。

## テスト方針

- **typecheck** — `pnpm typecheck` で型エラーが出ないこと。
- **unit test** — `pnpm test:unit` で既存テストが通ること（`DisplayModeSwitch.test.tsx` は期待値の更新が必要）。
- **手動ブラウザ検証** — `/`, `/trash`, `/u/$username`, `/notes/$noteId/history` への初期遷移で URL にクエリが付かないこと、フィルター変更や表示モード切替でもデフォルト値クエリが出ないこと、ページ送りした場合のみ `?page=2` のようなクエリが付くこと、デフォルトページ（page=1）へ戻ったらクエリが消えることを実機で確認する。
