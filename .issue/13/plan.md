# 実装計画 — Issue #13: PR #7 残 Warning まとめ (リファクタ・規約統一)

**Issue:** #13
**作成日:** 2026-05-19
**複雑度:** 中〜大規模

---

## 目的

Issue #1 (PR #7) のレビューで先送りされた軽微 Warning（A〜F の 6 スコープ）を解消し、コード規約と UI パターンを統一する。

- A: `window.confirm` を共通 `ConfirmDialog` に置換し、既存ダイアログパターンに揃える
- B: `useAutosave` の `setTimeout` 再帰 + `mountedRef` を `AbortController` ベースに再構築
- C: `useAutosave` の `useEffect` deps を最小化し、`snapshotForSubmit` を `useMemo` 化
- D: `validateSearch` を全ルートで `(search) => schema.parse(search)` 形式に統一（ADR-026 の divergence 解消）
- E: `bulkVisibilitySchema` を server-fn と同居する `publication/schema.ts` に移動
- F: `OwnedNotesResult` を `kind: "filter" | "search"` の discriminated union に再定義し、search 経路のセンチネル値を廃止

## スコープ

### 含まれるもの

- A〜F すべて（Issue 本文に明記された 6 スコープ）
- D に伴う `<Link to="/">` / `redirect({ to: "/" })` の型エラー修正（8〜10 ファイル）
- F に伴う `OwnedNotesResult` 消費側 5 ファイルの型 narrowing 修正
- E に伴うテストファイルの移動
- A スコープに付随する `window.confirm` / `confirm()` の全残存箇所の置換（Issue 本文に明記された `BulkActionBar` / `NoteActions` に加えて `SavedViewsList/index.tsx`, `IngestionJobRow.tsx`, `TrashRowActions.tsx`, `TagActions.tsx` の計 6 ファイル。「規約統一」スコープに自然に含まれる）
- 関連 ADR (Issue #1 の ADR-012, ADR-013, ADR-014, ADR-026) のステータス更新

### 含まれないもの

- ドメイン層 / ユースケース層の変更（F は presentation 層内で完結）
- `searchOwnNotes` の projection 拡張（search 経路で `updatedAt` を実値化するなど。ADR-012 の本丸は別 Issue）
- spec/ 配下のドキュメント更新（spec-sync は別 Issue）
- 既存ダイアログ群への Esc キー / focus trap 追加（既存パターンに揃える）

## 実装ステップ

### スコープ A: ConfirmDialog 共通コンポーネント

#### A-0. 事前 grep で全 `window.confirm` / `confirm()` 箇所を確定

- **対象ファイル:** `app/` 全体
- **変更内容:** `grep -rn "window\.confirm\|^\s*if (!confirm\| confirm(" app/` で全残存箇所を確認。現時点で判明している対象 (6 ファイル):
  1. `app/components/note/list/BulkActionBar.tsx:39`
  2. `app/components/note/detail/NoteActions.tsx:58`
  3. `app/components/view/SavedViewsList/index.tsx:48`
  4. `app/components/ingestion/IngestionJobRow.tsx:86`
  5. `app/components/trash/TrashRowActions.tsx:39`
  6. `app/components/tag/TagActions.tsx:52`
- **理由:** 実装前にスコープを確定。一覧から漏れたものを A-9（grep 0 件確認）で検出。

#### A-1. `ConfirmDialog` を新規作成

- **対象ファイル:** `app/components/common/ConfirmDialog.tsx`（新規）
- **変更内容:** `"use client"` ファイルを作成。Props:
  ```ts
  export type ConfirmDialogProps = Readonly<{
    open: boolean;
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;        // 既定: "OK"
    cancelLabel?: string;         // 既定: "キャンセル"
    variant?: "default" | "danger"; // 既定: "default"
    isPending?: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }>;
  ```
  `note/styles.ts` の `dialogBackdrop` / `dialog` / `dialogTitle` / `dialogActions` / `pillBtn` / `pillBtnPrimary` / `pillBtnDanger` を再利用（styles の出自は note 配下のまま、`ConfirmDialog` 側から import）。`open === false` で `null` を返す。`role="alertdialog" aria-modal="true" aria-labelledby={titleId}` を付与。`useId` で `titleId` を生成。`variant="danger"` で確定ボタンに `pillBtnDanger`、それ以外で `pillBtnPrimary`。`isPending` 中は両ボタン `disabled`。`<form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>` 構造で Enter キー確定を担保。
- **理由:** 既存 4 ダイアログ（`MoveNoteDialog` / `BulkVisibilityDialog` / `BulkExportDialog` / `SaveViewDialog`）と同じ装飾・aria パターンに揃え、`window.confirm` のブラウザネイティブダイアログを廃止。配置先は note / view / ingestion / trash / tag の **5 ドメイン**で参照されるため `app/components/common/` に置く（ADR-005）。

#### A-2. `BulkActionBar.tsx` の `confirm()` 置換

- **対象ファイル:** `app/components/note/list/BulkActionBar.tsx`
- **変更内容:** `onTrash` の `if (!confirm(...)) return;` を削除し、実 trash 処理を `runTrash` に切り出す。新規 state `const [confirmTrashOpen, setConfirmTrashOpen] = useState(false);` を追加（既存 `OpenDialog` 型に混ぜず分離）。`onTrash` は `setConfirmTrashOpen(true)` に変更。JSX 末尾に `<ConfirmDialog open={confirmTrashOpen} title="一括ゴミ箱移動" description={...} variant="danger" confirmLabel="ゴミ箱へ" isPending={isPending} onConfirm={() => { setConfirmTrashOpen(false); runTrash(); }} onClose={() => setConfirmTrashOpen(false)} />` を追加。
- **理由:** 既存ダイアログの起動フロー（state 駆動）に揃え、`confirm()` ブロッキング呼び出しを排除。

#### A-3. `NoteActions.tsx` の `confirm()` 置換

- **対象ファイル:** `app/components/note/detail/NoteActions.tsx`
- **変更内容:** `onDelete` の `confirm(...)` を削除し `runDelete` に分離。state `[confirmDeleteOpen, setConfirmDeleteOpen]` を追加。JSX に `<ConfirmDialog open={confirmDeleteOpen} title="このノートをゴミ箱に移動" variant="danger" confirmLabel="ゴミ箱へ" isPending={isPending} onConfirm={() => { setConfirmDeleteOpen(false); runDelete(); }} onClose={() => setConfirmDeleteOpen(false)} />` を追加。
- **理由:** A-2 と同じ統一。

#### A-4. `SavedViewsList/index.tsx` の `window.confirm` 置換

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`
- **変更内容:** `window.confirm(...)` 呼び出しを `ConfirmDialog` 起動 state に置換。
- **理由:** `window.confirm` 唯一の `window.` 接頭辞付き箇所。同 PR で規約統一を完遂。

#### A-5. `IngestionJobRow.tsx` の `confirm()` 置換

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** 「このジョブを破棄しますか？」の `confirm()` を `ConfirmDialog` 起動 state に置換。`variant="danger"`。
- **理由:** 規約統一スコープに含まれる残存箇所。

#### A-6. `TrashRowActions.tsx` の `confirm()` 置換

- **対象ファイル:** `app/components/trash/TrashRowActions.tsx`
- **変更内容:** 「このノートを完全に削除しますか？この操作は取り消せません。」の `confirm()` を `ConfirmDialog` 起動 state に置換。`variant="danger"`。
- **理由:** 同上。

#### A-7. `TagActions.tsx` の `confirm()` 置換

- **対象ファイル:** `app/components/tag/TagActions.tsx`
- **変更内容:** タグ削除確認の `confirm()` を `ConfirmDialog` 起動 state に置換。`variant="danger"`。
- **理由:** 同上。

#### A-8. 確認: 全 `window.confirm` / `confirm()` 排除

- **対象ファイル:** `app/` 全体
- **変更内容:** A-0 と同じ grep を再実行し残存 0 件を確認。
- **理由:** 規約統一の完遂を担保。

---

### スコープ B: useAutosave AbortController refactor

#### B-1. `flush()` の `AbortSignal` 受け取りと早期 return 統一

- **対象ファイル:** `app/components/note/editor/useAutosave.ts`
- **変更内容:** `flush()` を `flush(signal: AbortSignal)` に変更。先頭で `if (signal.aborted) return;` を追加。既存の `mountedRef.current` ベース早期 return をすべて `signal.aborted` チェックに置換。
- **理由:** 「mount 状態」と「現在の effect ライフサイクル」を分離。Strict Mode のダブルマウント時に古い effect の継続実行を確実に止める。

#### B-2. `AbortController` を effect スコープに導入

- **対象ファイル:** 同上
- **変更内容:** `useEffect` 内冒頭で `const controller = new AbortController();` を生成。cleanup で `controller.abort()` を呼ぶ。`schedule()` / `flush()` 内で `controller.signal` を引き回す。
- **理由:** `setTimeout` 起動・retry 待機・in-flight save の中断をひとつの `signal` で一括キャンセル可能にする。

#### B-3. `abortableSleep` ヘルパー追加と retry 待機の置換

- **対象ファイル:** 同上
- **変更内容:** ファイル内に `abortableSleep(ms, signal): Promise<void>` を定義:
  ```ts
  function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      const t = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    });
  }
  ```
  既存の `await new Promise((r) => setTimeout(r, wait))` を `await abortableSleep(wait, signal)` に置換。`flush` の catch 節は **AbortError を最初に分岐させる** ことで attempt カウントが進まないようにする:
  ```ts
  try {
    // ... save 本体
  } catch (e) {
    if (signal.aborted) return;                              // unmount/再起動でキャンセルされた場合
    if (e instanceof DOMException && e.name === "AbortError") return;  // abortableSleep 由来
    // ここから既存の attempt インクリメント + retry 判定
    attemptRef.current += 1;
    // ...
  }
  ```
- **理由:** backoff 中の unmount で `setTimeout` が宙に浮かないようにする。`AbortError` は意図的キャンセルなので autosave 状態（attempt カウント・dispatch）を変化させない。catch 直後で AbortError をガードしないと「キャンセル直後に attempt が進む」リスクがある。

#### B-4. `reRunRef` / `inFlightRef` ロジックの整理

- **対象ファイル:** 同上
- **変更内容:** `reRunRef` / `inFlightRef` の責務は維持。`inFlightRef.current = p` の `.finally` で `if (reRunRef.current && !signal.aborted) { reRunRef.current = false; schedule(signal); }` に変更。`signal.aborted` チェックを追加して unmount 後の自動 reschedule を防ぐ。
- **理由:** in-flight 完了後の reschedule が unmount 後に走らないように `signal` で守る。

#### B-5. `mountedRef` の削除

- **対象ファイル:** 同上
- **変更内容:** `mountedRef` と最初の `useEffect` ブロック（mount 検知用）を削除。すべて `signal.aborted` に統一。
- **理由:** `mountedRef` と `AbortSignal` の二重管理は冗長。`AbortSignal` のほうが effect ライフサイクルに密結合で正確。

---

### スコープ C: useAutosave 依存配列最適化

**前提:** B が完了した後に着手（同一ファイル変更のため逐次化）。

#### C-1. `snapshot` を `useMemo` 化

- **対象ファイル:** `app/components/note/editor/useAutosave.ts`
- **変更内容:** hook 内冒頭で `const snapshot = useMemo(() => snapshotForSubmit(state), [state.title, state.contentHtml, state.frontMatter, state.tagInput, state.directoryId]);` を追加。`flush` 内で `snapshotForSubmit(state)` ではなく外側 `snapshot` 変数を参照する。
- **理由:** `EditorState` 全体が変わるたび（autosave status 変化や editLock 更新でも）snapshot 再生成が走るのを防ぐ。送信フィールドが変わったときだけ snapshot を再生成。

#### C-2. `useEffect` の deps 最小化

- **対象ファイル:** 同上
- **変更内容:** `[noteId, state, dispatch, saveDraft]` を `[noteId, snapshot, state.dirtyKeys, state.frontMatterJsonError, state.mode, state.wysiwygUnsupportedTags, state.wysiwygUnsupportedAck, dispatch, saveDraft]` に変更。`shouldFlushAutosave` が参照する `state` フィールドのみを deps に列挙。
- **理由:** `state.autosave` や `state.editLock` の変化で autosave effect が再起動するのを防止。debounce タイマーが頻繁にリセットされる現状の問題を解消。

#### C-3. `flush` 内の state 参照を snapshot 経由に切替

- **対象ファイル:** 同上
- **変更内容:** `flush` 内で `state` を直接読まず、外側 `snapshot` 変数を使う。`dispatch` 経由の状態更新は closure に依存しないので問題なし。
- **理由:** `flush` の closure 依存を `snapshot` だけに絞り、deps narrowing と整合させる。

#### C-4. stale closure チェック

- **対象ファイル:** 同上
- **変更内容:** `flush` 内が以下のみを参照することをコードレビューで確認:
  - `snapshot`（送信値）
  - `noteId`（送信先）
  - `saveDraft`（server-fn）
  - `dispatch`（reducer 通知 — closure 経路で stale にならない）
  - `controller.signal` / `inFlightRef` / `reRunRef`（hook 内 ref / 安定参照）
  `state.dirtyKeys` 等は effect 先頭の `shouldFlushAutosave(state, noteId)` 判定にのみ使う。
- **理由:** deps narrowing による stale closure バグの予防。

#### C-5. `shouldFlushAutosave` のシグネチャは維持

- **対象ファイル:** 同上 + `editorState.ts`
- **変更内容:** `shouldFlushAutosave(state, noteId)` は pure 関数として現契約のまま維持。effect 先頭の判定にのみ使い、deps narrowing は呼び出しサイトで担保。
- **理由:** ADR-005 で「pure 関数として export」と決まった API を変更しない。既存テスト (`autosaveLogic.test.ts`) が現契約に依存するため。

---

### スコープ D: validateSearch ルート群統一

**方針:** ホームの `validateInput(noteListSearchSchema)` を `(search) => noteListSearchSchema.parse(search)` に統一し、ADR-026 の意図的 divergence を解消。波及する `<Link to="/">` / `redirect({ to: "/" })` の型エラーを `HOME_SEARCH` 定数経由で修正。

#### D-1. `routes/index.tsx` の validateSearch 統一

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:** `validateSearch: validateInput(noteListSearchSchema)` を `validateSearch: (search) => noteListSearchSchema.parse(search)` に置換。ADR-026 を引用していたコメントブロックを「ADR-026 は Issue #13 で解消」と簡潔に書き換える（または削除）。
- **理由:** 統一規約に揃え、divergence を解消する。

#### D-2. `HOME_SEARCH` の型整合確認

- **対象ファイル:** `app/components/auth/links.ts`
- **変更内容:** `HOME_SEARCH` の値が `noteListSearchSchema.parse({})` の戻り型と互換であることを確認。`HOME_SEARCH` を `satisfies NoteListSearch` 等で型担保。`page: PAGINATION_DEFAULT_PAGE` と `limit: PAGINATION_DEFAULT_LIMIT` が `noteListSearchSchema` のデフォルト (`page: 1`, `limit: NOTE_LIST_LIMIT_DEFAULT`) と一致するか確認し、必要なら値を合わせる。
- **理由:** 統一後は `<Link to="/">` で `search` 省略時に型が `MakeRequiredSearchParams` 違反になるため、`HOME_SEARCH` を常に明示する規約に統一する。

#### D-3. `<Link to="/">` の `search` プロパティ網羅追加（grep + typecheck 駆動）

- **対象ファイル:** `grep -rn 'to="/"\|to: "/"' app/` の結果を**完全網羅**する。実装時に `pnpm typecheck` のエラーリストも参考にする。事前 grep で判明している対象（既に `search={HOME_SEARCH}` 付きのものは除く）:
  - `app/components/landing/LandingPage.tsx`（10 箇所 — 2 箇所は既に `search={HOME_SEARCH}` 付き、残りに追加）
  - `app/components/auth/AdminSignUpForm/index.tsx`, `SignUpForm/index.tsx`, `AuthHeader/index.tsx`
  - `app/components/layout/Header.tsx`, `layout/Sidebar.tsx`
  - `app/components/trash/TrashList.tsx`
  - `app/components/note/detail/NoteMetaPanel.tsx`
  - `app/components/public/PublicLayout.tsx`（既存 `search={{ page: 1, limit: 20 }}` リテラルを `HOME_SEARCH` に置換も含む）
  - `app/routes/settings/route.tsx`
  - `app/routes/admin/route.tsx`（4 箇所）
  - `app/components/public/ErrorPage.tsx`
- **変更内容:** `search` プロパティを持たない `<Link to="/">` に `search={HOME_SEARCH}` を付加。**既存で `search={{ page: 1, limit: 20 }}` リテラルを持つ箇所も `HOME_SEARCH` に集約**（PublicLayout.tsx 2 箇所、authMiddleware.ts 1 箇所）。Sidebar の「ディレクトリフィルタ付き `<Link to="/" search={{ directoryId: ... }}>`」は ADR-015（フィルタリセット意図）を維持するため**そのまま**。`activeOptions={{ exact: true }}` のホームリンクは `search={HOME_SEARCH}` を追加。
- **理由:** 統一後の型整合確保。ADR-015 のセマンティクスは保持。

#### D-4. `redirect({ to: "/" })` / `router.navigate({ to: "/" })` の `search` 付加

- **対象ファイル:**
  - `app/core/presentation/authMiddleware.ts:77`（既存 `search: { page: 1, limit: 20 }` を `HOME_SEARCH` に集約）
  - `app/routes/trash/index.tsx`, `tags/index.tsx`, `notes/new.tsx`, `notes/$noteId/index.tsx`, `notes/$noteId/edit.tsx`, `upload/index.tsx`, `login.tsx`, `signup.tsx`（grep で `redirect.*to: "/"` を確認）
  - `app/components/note/detail/NoteActions.tsx:62`（`router.navigate({ to: "/" })`）
  - `app/components/identity/AccountDeleteForm/index.tsx:34`（`router.navigate({ to: "/" })`）
- **変更内容:** `redirect({ to: "/" })` / `router.navigate({ to: "/" })` を `... { to: "/", search: HOME_SEARCH }` に変更。既存の auth/LoginForm / PasswordResetConfirmForm は既に `search: HOME_SEARCH` 付きであることが grep で確認済み（変更不要）。
- **理由:** 統一後の型整合確保 + 二重定義の `HOME_SEARCH` への集約。

#### D-5. `router.navigate({ to: "/", search: (prev) => ... })` の型整合

- **対象ファイル:**
  - `app/components/note/list/NoteListToolbar.tsx`（2 箇所 — 33, 45）
  - `app/components/note/list/FilterBar.tsx`（5 箇所 — 52, 64, 76, 89, 101）
  - `app/components/note/list/DisplayModeSwitch.tsx`（1 箇所 — 27）
- **変更内容:** updater 関数 `search: (prev: NoteListSearch) => ...` の戻り値型が完全な `NoteListSearch` であることを TypeScript エラーで検出。`page`/`limit` が `prev` から維持される（`...prev` スプレッドまたは明示）よう確認。型エラーが出たもののみ修正。
- **理由:** ADR-026 で挙げられた具体的型エラー箇所。`parse()` 統一後に `MakeRequiredSearchParams` の制約が効くため確認必須。

#### D-6. `HOME_SEARCH` の値検証

- **対象ファイル:** `app/components/auth/links.ts`
- **変更内容:** `HOME_SEARCH = { page: PAGINATION_DEFAULT_PAGE, limit: PAGINATION_DEFAULT_LIMIT }` が `noteListSearchSchema.parse({})` の戻り値と論理的に一致するか確認。`PAGINATION_DEFAULT_LIMIT` と `NOTE_LIST_LIMIT_DEFAULT` が異なる値なら、`HOME_SEARCH` を `noteListSearchSchema` のデフォルトに揃える（`{ page: 1, limit: NOTE_LIST_LIMIT_DEFAULT }`）。`satisfies` でデフォルトを保証する型担保を追加: `export const HOME_SEARCH = { ... } satisfies Pick<NoteListSearch, "page" | "limit">;`
- **理由:** 統一後は `<Link to="/" search={HOME_SEARCH}>` を実行時パースした結果が「ホームに表示されるノートのフィルタ初期値」になるため、定数と schema デフォルトのズレは UX バグになる。

#### D-7. 検証: typecheck と grep 検索

- **対象ファイル:** プロジェクト全体
- **変更内容:** `pnpm typecheck` を実行し、`<Link to="/">` / `redirect({ to: "/" })` / `router.navigate({ to: "/" })` 修正漏れがないことを確認。`grep -rn 'to="/"\|to: "/"' app/` の結果と `HOME_SEARCH` 付与箇所を突合する。
- **理由:** D は型エラー連鎖が広範囲なので最終ゲートを置く。

---

### スコープ E: bulkVisibilitySchema の配置整理

**方針:** `bulkVisibilitySchema` を `app/components/publication/schema.ts` に移動。server-fn (`bulkChangeVisibilityFn`) と同居させる。

#### E-1. `publication/schema.ts` への移植

- **対象ファイル:** `app/components/publication/schema.ts`
- **変更内容:** 末尾に `bulkVisibilitySchema` を追加。`BULK_NOTE_IDS_MAX` は `@/components/note/constants` から import。`visibilitySchema` は **publication/schema.ts の既存定義（5 行目の `z.enum(["private", "unlisted", "public"])`）を流用** する。cross-domain import は発生しない。
- **理由:** server-fn と schema を同じドメインモジュールに集約。`bulkChangeVisibilityFn` の handler が publication 側にあるため。publication 側に同等の `visibilitySchema` が既に存在するため、note からの import は不要。

#### E-2. `note/schema.ts` からの削除

- **対象ファイル:** `app/components/note/schema.ts`
- **変更内容:** `bulkVisibilitySchema` の定義（行 99 付近）を削除。
- **理由:** 移動先と二重定義にしない。

#### E-3. `action.ts` の import 修正

- **対象ファイル:** `app/components/publication/PublishSettings/action.ts`
- **変更内容:** `import { bulkVisibilitySchema } from "@/components/note/schema";` を `from "@/components/publication/schema";` に書き換え。
- **理由:** 移動先からの import に切替。

#### E-4. テスト移動

- **対象ファイル:**
  - `app/components/note/__tests__/schema.test.ts`（削除元）
  - `app/components/publication/__tests__/schema.test.ts`（移動先 — **新規作成**。`app/components/publication/__tests__/` ディレクトリも新規作成）
- **変更内容:** `bulkVisibilitySchema` を扱う `describe` ブロック（行 194 以降の 4 ケース）を切り出して新規ファイルに移動。`note/__tests__/schema.test.ts` の冒頭 import から `bulkVisibilitySchema` を削除。
- **理由:** schema 移動に伴うテストの追随。publication ドメインのテストディレクトリは未存在のため新規作成。

#### E-5. 全参照網羅確認

- **対象ファイル:** プロジェクト全体
- **変更内容:** `grep -rn "bulkVisibilitySchema" app/` で全参照を確認し、修正漏れがないことを担保。
- **理由:** 参照漏れの早期検出。

---

### スコープ F: OwnedNotesResult discriminated union 化

**方針:** `OwnedNotesResult` を `{ kind: "filter", ... } | { kind: "search", ... }` の discriminated union に再定義。search 経路で `directoryId` / `slug` / `updatedAt` のセンチネル値を廃止し、型から該当フィールドを除外。**presentation 層に閉じる**変更で domain / usecase / DTO は無変更。

#### F-1. `OwnedNotesResult` 型の再定義

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:**
  ```ts
  /** filter / search 両モードに共通するノートメタデータ。
   *  thumbnailUrl は search 経路では常に null だが、将来 search index が thumbnail を取り込んだ場合に
   *  両モードで利用できるよう common に置く。 */
  export type OwnedNoteCommon = Readonly<{
    id: string;
    ownerId: string;
    title: string;
    excerpt: string;
    thumbnailUrl: string | null;
    tagNames: readonly string[];
    visibility: "private" | "unlisted" | "public";
  }>;

  /** filter 経路のノート。directoryId / slug / updatedAt を持つ。 */
  export type OwnedNoteFilterItem = OwnedNoteCommon & Readonly<{
    directoryId: string;
    slug: string;
    updatedAt: string;
  }>;

  /** search 経路のノート。directoryId / slug / updatedAt は持たない（ADR-012 sentinel 廃止）。 */
  export type OwnedNoteSearchItem = OwnedNoteCommon;

  export type OwnedNotesResult =
    | Readonly<{
        kind: "filter";
        notes: readonly OwnedNoteFilterItem[];
        count: number;
        nextCursor: string | null;
      }>
    | Readonly<{
        kind: "search";
        notes: readonly OwnedNoteSearchItem[];
        count: number;
        nextCursor: string | null;
      }>;
  ```
  既存の `mode` フィールドを `kind` にリネーム。`OwnedNoteCommon` / `OwnedNoteFilterItem` / `OwnedNoteSearchItem` をすべて export し、consumer 側で利用可能にする。`nextCursor` の型は両モード共通の `string | null` で揃える（実値は filter 経路で現状常に null だが、将来 cursor 化された場合に型変更不要にする YAGNI 配慮）。
- **理由:** discriminated union 標準慣習（`SerializedError.kind` / `EditorState.autosave.kind` と一貫）。型から sentinel 専用フィールドを除外することで UI 側の誤用を型で防止。

#### F-2. `loadOwnedNotes` の戻り値構築修正

- **対象ファイル:** 同上
- **変更内容:**
  - search 経路: `return { kind: "search", notes: result.hits.map(hit => ({ id, ownerId, title, excerpt, thumbnailUrl: null, tagNames, visibility })), count, nextCursor };` セ ンチネル値 `directoryId: ""`, `slug: ""`, `updatedAt: new Date(0).toISOString()` を**すべて削除**。`thumbnailUrl` は search 結果にないため `null` を common に明示。
  - filter 経路: `return { kind: "filter", notes: notes.map(n => ({ ...全フィールド })), count, nextCursor: filter 経路で現状 null を返す };`
- **理由:** ADR-012 のトレードオフ（センチネル値 = 誤情報源）を完全解消。

#### F-3. `NoteList.tsx` の consumer 修正

- **対象ファイル:** `app/components/note/list/NoteList.tsx`
- **変更内容:** `const { notes, count, mode } = data;` を `const { notes, count, kind } = data;` に変更。`mode === "search"` / `mode === "filter"` の参照をすべて `kind` に置換。`showVisibilityBadge = kind === "filter"`, `searchActive = kind === "search"`。consumer に渡す props で `kind` discriminator も渡す。
- **理由:** 型 narrowing を活用。

#### F-4. `ListView.tsx` / `TileView.tsx` の Props 型修正

- **対象ファイル:** `app/components/note/list/ListView.tsx`, `TileView.tsx`
- **事前調査:** 両ファイルが現状 `note.directoryId` / `note.slug` を参照しているかを grep で確認。`<Link to="/notes/$noteId" params={{ noteId: note.id }}>` で `slug` を使っていないなら、`OwnedNoteCommon` 型で受けて問題なし。
- **変更内容:** `type Note = OwnedNotesResult["notes"][number]` を撤廃し、Props 型を以下のように discriminated union で受ける:
  ```ts
  type Props =
    | Readonly<{
        kind: "filter";
        notes: readonly OwnedNoteFilterItem[];
        showVisibilityBadge: boolean;
        // ... existing props
      }>
    | Readonly<{
        kind: "search";
        notes: readonly OwnedNoteSearchItem[];
        showVisibilityBadge: boolean;
        // ... existing props
      }>;
  ```
  関数本体で `if (props.kind === "search") { /* updatedAt 列を出さない */ }` で分岐。search 経路では `updatedAt` 列を非表示にする（プレースホルダ `—` ではなく列ごと省略）か、現状のレイアウトを維持するために `—` プレースホルダ表示にするかを実装時に判断（既存の epoch 1970-01-01 表示よりは明確にいずれかが望ましい — 推奨は **`—` プレースホルダ**でレイアウト維持）。
- **理由:** search 経路で `updatedAt` / `directoryId` / `slug` がセンチネルだった現状の暗黙仕様を、型レベルで明示。`—` プレースホルダで日付列のレイアウトを保持しつつ、誤った日付表示（1970-01-01）を防ぐ。

#### F-5. `CalendarView.tsx` の修正

- **対象ファイル:** `app/components/note/list/CalendarView.tsx`
- **変更内容:** `mode: "filter" | "search"` props を `kind` に rename。`kind === "search"` の場合は既存のフォールバック文言（ADR-014 維持）。filter 経路の `notes` 型を `OwnedNoteFilterItem[]` に narrow。`groupNotesByDay(notes, ...)` の引数型も filter 限定にする。
- **理由:** `groupNotesByDay` が `updatedAt: string` を要求するため、filter 経路の型でアクセスする。ADR-014 のフォールバック挙動は維持。

#### F-6. `HomePage.tsx` の整合性

- **対象ファイル:** `app/components/note/HomePage.tsx`
- **変更内容:** `owned: OwnedNotesResult` 型は変わらず透過的に通す。`NoteList` への props 受け渡しで `kind` discriminator も渡す。
- **理由:** 影響を NoteList 配下に閉じ込める。

#### F-6b. `TrashList.tsx` の整合性確認

- **対象ファイル:** `app/components/trash/TrashList.tsx`
- **事前調査:** `loadOwnedNotes` 呼び出しと結果消費を確認。`note.updatedAt` / `note.id` / `note.title` / `note.excerpt` を参照しているか grep する。trash 経路は filter モードで `loadOwnedNotes` を呼ぶ想定だが、戻り値型は `OwnedNotesResult`（union）として narrowing が必要。
- **変更内容:** TrashList も `OwnedNotesResult` を消費するなら、消費前に `if (data.kind === "filter") { /* ... */ }` で narrowing するか、trash 専用の loader を分離する。最小変更として、TrashList が `loadOwnedNotes` 経由でデータを得ているなら narrowing で対応（trash 経路では search を使わないため `assert data.kind === "filter"` のような形でも可）。
- **理由:** F-1 の型変更で TrashList も影響を受ける消費側。レビュー P-005 で指摘された漏れ。

#### F-7. 関連 ADR の更新

- **対象ファイル:** `.issue/1/adr.md`（または本 Issue 13 の `adr.md` で「Issue #1 ADR-012 を Superseded」と記録）
- **変更内容:** ADR-012 / ADR-013 / ADR-014 の Status に「Superseded by Issue #13 — discriminated union 化により sentinel 廃止」を追記。
- **理由:** ADR の歴史を保ちつつ現状との整合を取る。

#### F-8. 検証: typecheck と grep 検索

- **対象ファイル:** プロジェクト全体
- **変更内容:** `pnpm typecheck` を実行。`grep -rn "note\.directoryId\|note\.slug\|note\.updatedAt" app/components/note/` で search 経路で参照されていないか確認。
- **理由:** 型 narrowing が機能していることの確認。

---

## 順序と依存関係

```
A (ConfirmDialog) ───┐
B (Autosave Abort) → C (Autosave deps) ─┐
D (validateSearch)                       ├─→ 統合: typecheck + lint + format + test
E (Schema move) ─────────────────────────┤
F (Discriminated union) ─────────────────┘
```

- **B → C**: 同一ファイル変更のため逐次必須
- **A / D / E / F は独立**: コミット単位を分けて段階的に進める
- 全完了後に `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit` を実行

## 設計判断

詳細は `.issue/13/adr.md` を参照。

- **ADR-001:** D は ADR-026 の divergence を解消する方向で統一（実施）
- **ADR-002:** E は schema を server-fn 側（publication）に移動
- **ADR-003:** F は完全 discriminated union 化（presentation 層内に閉じる）
- **ADR-004:** discriminant フィールド名は `kind`（既存規約と一貫）
- **ADR-005:** ConfirmDialog の配置先は `app/components/note/list/`（YAGNI、再利用要望時に昇格）

## リスクと注意点

- **A: 既存 `confirm()` の UX 損失** — Esc キーやフォーカス管理の手動テストを実施。既存 4 ダイアログ群もこの観点は未実装なので、新 `ConfirmDialog` も同じレベルに揃える。
- **B: AbortError の握りつぶし漏れ** — `AbortError` は意図的キャンセルなので catch 内で必ず無視。再 throw すると unhandled rejection で React 警告が出る。
- **C: stale closure** — `flush` 内の参照を `snapshot` / `dispatch` / `noteId` / `saveDraft` に限定することで stale closure を回避。コードレビューで網羅チェック。
- **D: 型エラー連鎖の広さ** — `<Link to="/">` / `redirect` の修正対象が 10 ファイル前後。`pnpm typecheck` を頻繁に流して検出。Sidebar の「ディレクトリフィルタ付き Link」は ADR-015 のセマンティクスを保持。
- **E: `visibilitySchema` の cross-domain import** — publication が note から import する向きが生まれる。frontend 層内の cross-domain import なので問題なし。
- **F: 消費側 5 ファイルの広範な型変更** — Props 型を overload にすると複雑化するため、必要最小限の narrowing にとどめる。`ListView` / `TileView` の Props は `OwnedNoteFilterItem | OwnedNoteSearchItem` の union で受け、内部で `showDate` フラグでガードする方針を優先。
- **F: ADR-012 の本丸（search projection 拡張）は別 Issue** — `searchOwnNotes` を変更しないため、search 経路で `updatedAt` を実値表示することは依然不可。型から外す（不存在にする）ことで「正しい仕様」を表現するに留める。

## テスト方針

1. **`pnpm typecheck`**: D / F の型変更が全層に正しく波及することを確認。`<Link to="/">` / `redirect({ to: "/" })` の修正漏れ、`OwnedNoteFilterItem` narrowing 漏れを検出。
2. **`pnpm lint:fix && pnpm format`**: Biome 規約準拠を確認。
3. **`pnpm test:unit`**:
   - `app/components/note/__tests__/schema.test.ts`（E でテスト移動後も green）
   - `app/components/publication/__tests__/schema.test.ts`（E でテスト追加先が green）
   - `app/components/note/editor/__tests__/autosaveLogic.test.ts`（B/C で破壊しない）
4. **手動テスト** (`testing.md` に詳細):
   - A: ゴミ箱移動 / 削除の `ConfirmDialog` 表示・キャンセル・確定
   - B/C: ノート編集中の autosave 動作、unmount 時の警告非発生
   - D: `<Link to="/">` 経路の home 遷移と Sidebar のフィルタリセット
   - E: `BulkVisibilityDialog` 経由の一括公開設定変更
   - F: `?q=...` 検索結果のカレンダー切替フォールバック、リスト/タイル切替で `updatedAt` 列の挙動
5. **回帰検証**: `git diff main..HEAD` で D の `<Link to="/">` 修正漏れがないかを `grep -rn 'to=\"/\"' app/` の結果と突合。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | 部分採用 | 部分採用 |
| A: ConfirmDialog 配置 | `note/list/` | `common/` ○ | `note/list/` |
| A: API 設計 | 基本 | `variant`/`isPending` ○ | 最小 |
| B: AbortController 化 | ○ | 別ファイル分離 (autosaveLoop.ts) | ○ |
| C: useMemo 化 | ○ | hook API 再設計 | useMemo or stateRef |
| D: 統一実施 | ○ | ○ | 見送り推奨 |
| E: publication 移動 | ○ | ○ | ○ |
| F: 完全 union 化 | ○ | ○（Props overload） | 見送り（JSDoc のみ） |
| 取り込んだ点 | 全体構造とステップの具体性 | `variant`/`isPending` API、F の `OwnedNoteCommon` 切り出し、`common/` 配置案 | `SavedViewsList` 追加、YAGNI ベースの過剰抽象回避 |

## レビュー反映

### 修正した点

- **[R1-P-001 / R2-P-004]** D の `<Link to="/">` / `redirect` / `router.navigate` 対象ファイル網羅を大幅追加。`settings/route.tsx`, `admin/route.tsx`（4 箇所）, `ErrorPage.tsx`, `NoteMetaPanel.tsx`, `AccountDeleteForm`, `DisplayModeSwitch`, `FilterBar`（5 箇所）, `NoteListToolbar`, `NoteActions` の `router.navigate` を D-3〜D-5 に明記
- **[R1-P-002]** D-3 で既存 `search={{ page: 1, limit: 20 }}` リテラル（`PublicLayout`, `authMiddleware`）も `HOME_SEARCH` に集約するよう追記
- **[R1-P-003]** D-2 に `HOME_SEARCH` の値検証手順を D-6 として独立化。`satisfies Pick<NoteListSearch, "page" | "limit">` で型担保
- **[R1-P-004 / R2-P-003]** E-1 で `visibilitySchema` は publication 側の既存定義（`schema.ts:5`）を流用すると明記。cross-domain import を廃止し、ADR-002 のトレードオフから該当記述を削除
- **[R1-P-005]** F-1 の `nextCursor` 型を `filter: string | null` / `search: string | null` の共通形に統一（YAGNI で型分離見送り）。`OwnedNoteCommon` / `OwnedNoteFilterItem` / `OwnedNoteSearchItem` をすべて export し、JSDoc を追加
- **[R1-S-001]** ADR-001 Consequences に「Issue #1 ADR-026 を Superseded に更新」を追記
- **[R2-P-001]** A スコープに `IngestionJobRow.tsx`, `TrashRowActions.tsx`, `TagActions.tsx` を追加。A-0 で grep 確定 → A-2〜A-7 で個別置換 → A-8 で grep 0 件確認の流れに整理
- **[R2-P-002]** ConfirmDialog 配置を `app/components/common/ConfirmDialog.tsx` に変更（ADR-005 改訂）。5 ドメインからの参照を cross-domain import なしで受ける
- **[R2-P-005]** F-6b を追加し `TrashList.tsx` の `kind === "filter"` narrowing を明記
- **[R2-P-006]** F-1 で `thumbnailUrl` を common に置く判断を JSDoc で明示（「search 経路では常に null だが、将来 search index が thumbnail を取り込んだ場合に共通化できる」）
- **[R2-P-008]** B-3 に AbortError catch のコード例を明示。`signal.aborted` チェック → `AbortError` チェックの順で catch 冒頭にガードを置く
- **[R2-S-001]** ADR-006 Consequences に `controller`/`signal` の closure 関係注意点を追記
- **[R2-S-002]** E-4 に `publication/__tests__/` ディレクトリの**新規作成**を明示

### 取り込んだ改善提案

- F-4 で ListView search 経路の日付列表示として `—` プレースホルダを推奨（既存 epoch 1970-01-01 表示の問題を確実に解消）
- A-0 を新設して grep ベースでスコープ確定の流れを明示
- F-3〜F-6b の影響範囲を「消費側 5 ファイル → 6 ファイル（TrashList 追加）」に更新

### 見送った提案とその理由

- **[R1-S-002]** ADR-005 の昇格基準明文化 → ADR-005 自体を `common/` 配置に改訂したため不要
- **[R1-S-005]** `mountedRef` 削除後の他 hook への影響確認 → `useAutosave.ts` 内部 ref のため他 hook 共有なし（即時確認できる範囲）
- **[R2-P-007]** `state.dirtyKeys` を `dirtyKeys.size` プリミティブ化 → `Set` 参照同一性は reducer の `withDirty` で正しく管理されており、現状で問題ない。stale closure 観点で deps に含めるのは必要なので C-2 はそのまま維持
- **[R2-S-003]** `HOME_SEARCH` の structural compatibility テスト → D-6 で `satisfies` 型担保するため runtime テストは不要
- **[R2-S-005]** ListView 日付列の UX 詳細 → 実装時に判断する旨を F-4 に追記済み
