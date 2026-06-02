# 実装計画 — Issue #74: refactor: extract a shared updater helper

**Issue:** #74
**作成日:** 2026-06-03
**複雑度:** 小規模

---

## 目的

`router.navigate({ to: "/" })` の `search` updater 関数で各 callsite に散らばっている
`...(prev as Partial<NoteListSearch>)` の **キャスト＋スプレッド** パターンを共有ヘルパに集約し、
重複と将来の追従コストを減らす。

## 背景（Issue 本文との差分）

Issue 本文の例は `homeSearchUpdater` が `page: current.page ?? HOME_SEARCH.page` の
**デフォルト補完**を持つ前提で書かれている。しかし Issue #74 起票後にマージされた **Issue #215** で

- `HOME_SEARCH` は `{} as const` に空化され（`page` / `limit` を URL から落とす）
- `noteListSearchSchema` の `page` / `limit` は `.default(...)` を外して output でも optional 化

された。その結果、現在の callsite に `page: prev.page ?? HOME_SEARCH.page` 形のフォールバックは
**存在しない**。実際に重複しているのは `...(prev as Partial<NoteListSearch>)` のキャスト＋スプレッドのみ。

したがって本Issueでは、Issue 本文の「page/limit デフォルト補完」ロジックは**実装しない**（現状の設計では不要・有害）。
キャスト＋スプレッドの集約という**意図**だけを満たす、より単純なヘルパを実装する。

## スコープ

### 含まれるもの

- 新規ヘルパ `homeSearchUpdater(prev, patch)` の追加（1 ファイル）
- 「prev をスプレッドして patch を重ねる」パターンの 7 callsite を置換
  - `FilterBar.tsx`: `toggleTag` / `updateDate` / `updateVisibility` / `clearReferencingNoteId` / `clearDirectory` / `handlePick`（6）
  - `DisplayModeSwitch.tsx`: `select`（1）
- `pnpm typecheck` グリーン確認、lint / format

### 含まれないもの

- **リセット系 callsite はヘルパ化しない**（意味論が異なる）:
  - `FilterBar.tsx` `clearAll` — `{ display, q? }` だけ残して他フィールドを**捨てる**
  - `NoteListToolbar.tsx` `onSelectView` の空選択時 — `{ display }` だけ残して**捨てる**
  これらは prev をスプレッドすると逆に壊れる（viewId/フィルタが残ってしまう）。
  「prev をスプレッド＋patch」ヘルパには適合しないため対象外。
- `NoteListToolbar.tsx` `onSelectView` の非空選択時（`() => ({ viewId })`）— prev を使わずキャストもないため対象外。
- Issue 本文が示した page/limit デフォルト補完ロジック（Issue #215 で不要化済み）。

## 実装ステップ

### 1. ヘルパ追加

- **対象ファイル:** `app/components/note/list/homeSearch.ts`（新規）
- **変更内容:**

  ```ts
  import type { NoteListSearch } from "../schema";

  export function homeSearchUpdater(
    prev: unknown,
    patch: Partial<NoteListSearch>,
  ): Partial<NoteListSearch> {
    return { ...(prev as Partial<NoteListSearch>), ...patch };
  }
  ```

  `prev` が `unknown` なのは、`validateSearch` を
  `(search) => noteListSearchSchema.parse(search)` に統一した結果、TanStack Router が updater 引数を
  cross-route search union に広げるため（Issue #13 CQ-W-005）。唯一回避不能なこのキャストを
  この 1 箇所に集約し、WHY コメントもここだけに置く。

- **理由:** キャスト＋スプレッドの重複を 1 箇所へ。将来 `noteListSearchSchema` にフィールドが
  追加されても、各 callsite は `patch` だけ渡せばよく、追従不要。

### 2. callsite 置換（FilterBar.tsx）

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:** `(prev) => ({ ...(prev as Partial<NoteListSearch>), ...patch })` 形の 6 箇所を
  `(prev) => homeSearchUpdater(prev, { ...patch })` に置換。
  `handlePick` の `page: undefined`（フィルタ追加でページリセット）も `patch` に含めるだけで挙動維持。
  `NoteListSearch` 型インポートが他で使われなくなれば削除（`run` の引数型でまだ使うため残る見込み）。
- **理由:** 重複削減。

### 3. callsite 置換（DisplayModeSwitch.tsx）

- **対象ファイル:** `app/components/note/list/DisplayModeSwitch.tsx`
- **変更内容:** `select` 内の `search: (prev) => ({ ...(prev as Partial<NoteListSearch>), display: mode })` を
  `search: (prev) => homeSearchUpdater(prev, { display: mode })` に置換。
  既存の Issue #215 WHY コメント（page/limit を URL に出さない理由）は文脈として残す。

### 4. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- ブラウザでフィルタ操作・表示モード切替の URL 反映を確認（testing.md 参照）

## 設計判断

ヘルパの置き場所を Issue 本文の提案（`app/components/auth/links.ts`）ではなく
`app/components/note/list/homeSearch.ts` にする。詳細は adr.md（ADR-001）参照。

## リスクと注意点

- **挙動の同一性:** ヘルパは `{ ...(prev as Partial<NoteListSearch>), ...patch }` と完全に等価。
  `patch` を後勝ちにすることで `handlePick` の `page: undefined` 上書きや
  `toggleTag` の `tagNames: undefined` 上書きが従来どおり効く。順序を逆にしないこと。
- **リセット系を巻き込まない:** `clearAll` / `onSelectView` 空選択をヘルパ化すると
  捨てるべきフィールドが残り回帰する。対象から除外する。
- 型エラーが出るとすれば `homeSearchUpdater` の戻り値型。`router.navigate` の updater は
  `Partial<NoteListSearch>` を受け入れる（既存 callsite が同型を返している）ため問題ない見込み。

## テスト方針

- 自動: `pnpm typecheck`（リファクタの主ゲート）、`pnpm lint` / `format:check`
- 手動: home 画面でタグ/期間/公開状態/内部リンク参照フィルタの付与・解除、表示モード切替を行い、
  URL の search パラメータが従来と同じく更新されることを確認（testing.md）。
