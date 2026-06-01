# 実装計画 — Issue #385: ノート詳細: 存在しない noteId で notFoundComponent ではなく汎用エラー境界が表示される

**Issue:** #385
**作成日:** 2026-06-02
**複雑度:** 小規模

---

## 目的

ノート詳細 `/notes/$noteId` で存在しない（または権限のない）noteId にアクセスしたとき、汎用の `errorComponent`（「エラーが発生しました」）ではなく、notFound 表示（「ノートが見つかりません」）を出す。

## スコープ

### 含まれるもの
- `app/components/note/detail/NoteDetail.tsx` の notFound 処理を、`throw notFound()` から notFound 用 JSX の直接 return に変更する（確立パターンに準拠）。
- ルート `app/routes/_app/notes/$noteId/index.tsx` の、もはや到達不能になる `notFoundComponent` の扱いを整理する。
- 非存在 noteId で notFound JSX が返ることをロックするユニットテストの追加。

### 含まれないもの
- TanStack Start のバージョンアップによる `notFound()` 伝播挙動の修正（フレームワーク既知挙動。`.issue/12` ADR-004 / `ExportJobDetail/Page.tsx` JSDoc に文書化済み）。
- ルート構成の大幅な見直し（ローダー側 notFound 判定への移行）。確立パターンと乖離するため不採用。

## 実装ステップ

### 1. NoteDetail で notFound JSX を直接 return する

- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx`
- **変更内容:**
  - catch 節の `if (isNotFoundError(e)) throw notFound();` を、notFound 用 JSX の直接 return に置き換える。返す JSX は現行 `notFoundComponent` と同等（`role="alert"` / 「ノートが見つかりません」/「削除されているか、アクセス権限がありません。」）。
  - 不要になる `notFound`（`@tanstack/react-router`）の import を削除する。
  - RSC では `throw notFound()` が `notFoundComponent` に届かない既知挙動を JSDoc で明記する（`ExportJobDetail/Page.tsx` に倣う）。
- **理由:** `NoteDetail` は `renderServerComponent` 経由の RSC として描画され、その中の `throw notFound()` はルーターの `notFoundComponent` に伝播せず `errorComponent` に流れる。`ExportJobDetail` で確立済みの「JSX 直接 return」パターンに揃える。

### 2. ルートの notFoundComponent を整理する

- **対象ファイル:** `app/routes/_app/notes/$noteId/index.tsx`
- **変更内容:** notFound 表示が `NoteDetail` 内で完結するようになり、このルートの `notFoundComponent` は RSC ローダー経由では到達不能になる。`ExportJobDetail` ルート（`notFoundComponent` を持たない）と同じ構成に揃え、当該 `notFoundComponent` を削除する。
- **理由:** 到達不能な分岐を残すと「`notFound()` が伝播する」という誤解（=本 Issue の原因そのもの）を温存する。notFound UI を `NoteDetail` 側の単一の真実源に統一する。

### 3. ユニットテストの追加

- **対象ファイル:** `app/components/note/detail/__tests__/NoteDetail.test.tsx`（新規）
- **変更内容:** `../loaders` を mock し、`loadNoteDetail` が `NotFoundError` を reject した場合に `NoteDetail` が throw せず notFound JSX（「ノートが見つかりません」）を返すことを検証する。再現の起点（#379 EC-001）を回帰として固定する。
- **理由:** `throw notFound()` への退行を防ぐ。

## 設計判断

- notFound 表示は `NoteDetail` 内 JSX 直接 return に統一（ADR 参照）。ルートの `notFoundComponent` は削除し UI の二重定義を避ける。

## リスクと注意点

- `notFoundComponent` 削除により、仮に将来ローダーで直接 `notFound()` を throw する経路が増えた場合の受け皿が消える。ただし現状この経路は存在せず、`ExportJobDetail` も同構成のため許容。
- notFound と権限なし（forbidden 等）を画面上区別しない点は現行挙動（`loadNoteDetail` が両者を `NotFoundError` として返す）を踏襲する。

## テスト方針

- ユニット: 非存在 noteId で notFound JSX を返す（ステップ3）。
- ブラウザ: 存在しない noteId の URL に直接アクセスし「ノートが見つかりません」が表示され、汎用エラー境界が出ないことを確認（testing.md）。
