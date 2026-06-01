# 実装計画 — Issue #409: ノート履歴ルートの到達不能な notFoundComponent を削除する（#385 と同根の不整合）

**Issue:** #409
**作成日:** 2026-06-02
**複雑度:** 小規模

---

## 目的

ノート履歴系 3 ルートに残る到達不能（デッドコード）な `notFoundComponent` を削除し、notFound 表示を RSC コンポーネント側のインライン JSX という単一の真実源に統一する。#385（PR #408）で `notes/$noteId/index.tsx` に施したのと同じ整理。

## 背景

`renderServerComponent` 経由で描画される RSC（`NoteHistoryList` / `NoteRevisionDetail`）内で投げた `throw notFound()` は、route の `notFoundComponent` に伝播せず汎用 `errorComponent` に流れる（TanStack Start の既知挙動。`.issue/12/adr.md` ADR-004 / `ExportJobDetail` JSDoc 参照）。

そのため両 RSC は `throw notFound()` を行わず、`isNotFoundError(e)` を捕捉して **NotFound 用のインライン JSX を直接 return** している。よって各ルートの `notFoundComponent` は到達不能なデッドコードであり、残すと「`notFound()` が伝播する」という誤解（#385 の原因そのもの）を温存する。

## スコープ

### 含まれるもの

- 以下 3 ルートの到達不能な `notFoundComponent` を削除する。
  - `app/routes/_app/notes/$noteId/history/route.tsx`
  - `app/routes/_app/notes/$noteId/history/index.tsx`
  - `app/routes/_app/notes/$noteId/history/$revisionId.tsx`
- #385 と同様、RSC 側 notFound JSX が単一の真実源であることをユニットテストで担保する（`NoteHistoryList` / `NoteRevisionDetail`）。

### 含まれないもの

- `errorComponent` の変更（汎用エラー境界はそのまま維持）。
- RSC コンポーネント（`NoteHistoryList` / `NoteRevisionDetail`）のロジック変更。挙動は現状で正しい。
- 他ルート（`__root` / `setup` / `admin` / `u/*` / `notes/public/*` / `notes/$noteId/publish` 等）の `notFoundComponent`。これらは RSC 経由ではない、または別途の notFound 伝播経路を持つため対象外。

## 実装ステップ

### 1. `history/route.tsx` の notFoundComponent 削除

- **対象ファイル:** `app/routes/_app/notes/$noteId/history/route.tsx`
- **変更内容:** `Route` 定義から `notFoundComponent: () => (...)` プロパティ全体を削除する。`errorComponent` は残す。
- **理由:** このレイアウトルートは `<Outlet />` を返すだけで `notFound()` を投げず、子ルートの notFound も RSC 内インライン JSX で表示されるため到達不能。

### 2. `history/index.tsx` の notFoundComponent 削除

- **対象ファイル:** `app/routes/_app/notes/$noteId/history/index.tsx`
- **変更内容:** `Route` 定義から `notFoundComponent: () => (...)` プロパティ全体を削除する。`errorComponent` は残す。
- **理由:** loader が呼ぶ `NoteHistoryList`（RSC）が notFound をインライン JSX で返すため、route の `notFoundComponent` は到達不能。

### 3. `history/$revisionId.tsx` の notFoundComponent 削除

- **対象ファイル:** `app/routes/_app/notes/$noteId/history/$revisionId.tsx`
- **変更内容:** `Route` 定義から `notFoundComponent: () => (...)` プロパティ全体を削除する。`errorComponent` は残す。
- **理由:** loader が呼ぶ `NoteRevisionDetail`（RSC）が notFound をインライン JSX で返すため、route の `notFoundComponent` は到達不能。

### 4. RSC 側 notFound 挙動のユニットテスト追加

- **対象ファイル:**
  - `app/components/note/history/__tests__/NoteHistoryList.test.tsx`（新規）
  - `app/components/note/history/__tests__/NoteRevisionDetail.test.tsx`（新規）
- **変更内容:** `NoteDetail.test.tsx`（#385）と同じ構成で、loader が `NotFoundError` を投げたとき notFound JSX（`role="alert"` + 該当文言）を返し、無関係なエラーは再 throw することを担保する。
- **理由:** route から `notFoundComponent` を消すことで notFound 表示の責務が完全に RSC 側へ一本化される。その単一の真実源を回帰テストで固定する。

## 設計判断

特になし（#385 で確立済みのパターンを踏襲）。`.issue/409/adr.md` は作成しない。

## リスクと注意点

- 削除する `notFoundComponent` が本当に到達不能であることは、両 RSC が `throw notFound()` を持たずインライン JSX を返すことで確認済み。機能挙動は変わらない。
- `route.tsx`（レイアウト）は loader を持たないが、子の notFound 伝播も RSC 経由で表示されるため `notFoundComponent` は不要。

## テスト方針

- `pnpm test:unit` で新規ユニットテストが通ること。
- `pnpm typecheck && pnpm lint:fix && pnpm format` で型・整形が通ること。
- ブラウザで履歴一覧・過去版詳細に非存在 ID でアクセスし、「ノートが見つかりません」「過去版が見つかりません」が表示され、汎用エラー境界（「エラーが発生しました」）が出ないことを確認する。
