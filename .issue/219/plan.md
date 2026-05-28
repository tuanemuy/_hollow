# 実装計画 — Issue #219: リスト／タイル／カレンダー切り替えのUI反映が遅くUXが悪い

**Issue:** #219
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

ホーム `/` のノート一覧で **リスト/タイル/カレンダー** を切り替えるたびに loader 再実行 → サーバー RSC 再生成 → ストリーム再到着、という流れが走っており、体感遅延・チラつき・無反応に見える瞬間が発生している。`display` は **ビューの形を変えるだけのクライアント表示状態** なので、loader 依存から外して URL 同期＋クライアント `useTransition` で即時切り替えに変更し、Issue 完了条件 3 点を同時に満たす。

## スコープ

### 含まれるもの

- ホーム `/` ルートの `display` を loader 依存から外す（`loaderDeps` から除外）
- `display` をクライアント `useSearch` 駆動に切り替え、3 ビュー分岐をクライアント境界で行う
- `DisplayModeSwitch` の切替挙動を「URL 反映のみ・loader 再走なし」に変更
- SavedView (`viewId`) 適用時の `display` を URL に反映するための redirect 追加
- `DisplayModeSwitch` の `disabled={isPending}` / `aria-busy` の取り扱い見直し
- 上記の自動テスト追加（最小限）

### 含まれないもの

- ホーム以外のルート（`/tags`, `/trash`, `/views`, `/search`）への変更（grep の結果、`display` URL 切替 UI はホームのみ）
- ノート取得 usecase の変更
- `staleTime: 0` の見直し（独立した別問題）
- 全画面共通のローディングデザイン刷新
- カレンダーや TileView の表示ロジック自体の改修
- Sidebar の `<Link to="/" search={HOME_SEARCH}>` 経由で `display` が消える挙動の修正（現状動作の踏襲。Issue は「切替トグル自体の応答性」が論点で、サイドバー経由のナビゲーション時の display 維持は別件）

## 実装ステップ

### 1. `display` を loader 依存から外す

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:**
  - `loaderDeps: ({ search }) => search` を **`display` を除外する形** に変える。テスト容易性のためモジュールトップに **`export const homeLoaderDeps`** として切り出し、`createFileRoute("/")({ loaderDeps: homeLoaderDeps, ... })` から参照する形にする:
    ```ts
    export const homeLoaderDeps = ({ search }: { search: NoteListSearch }) => {
      const { display, ...rest } = search;
      return rest;
    };
    ```
  - `renderHome` server function の `handler` が受け取る `search` 型から `display` が抜けるので、関連箇所（`HomePage` への prop 受け渡し）を調整する。SavedView 復元時に server 側で `displayMode` を計算している部分は **`redirect({ to: "/", search: { ...baseSearch, display: view.displayMode } })` で URL に反映** し、その後はクライアント側の `useSearch` から `display` を読む形に揃える。
- **理由:** `display` は usecase に到達しないクライアント表示状態。これを loader 依存に入れていると、ビュー切替のたびに `loadOwnedNotes` / `loadDirectoryTreeFlat` / `loadAllTags` / `loadSavedViewsByKind` が `Promise.all` で再実行され、サーバー RSC が再生成・ストリーム再送される。これが体感遅延の主因。

### 2. ビュー分岐をクライアント境界に切り出す

- **対象ファイル:** `app/components/note/list/NoteList.tsx`、新規 `app/components/note/list/NoteListViews.tsx`
- **変更内容:**
  - `NoteList` 本体は **server コンポーネントのまま維持**（`SelectionProvider`, `h1`, カウント表示, `NoteListToolbar`, `FilterBar`, `BulkActionBar`, 空ステート判定 + 3 ビュー分岐への委譲のみ）。
  - **新規 `NoteListViews.tsx` (`"use client"`)** に切り出す責務:
    1. `getRouteApi("/").useSearch({ select: (s) => s.display ?? "list" })` で `display` を読む（既存パターン `Route.useSearch()` と整合する型安全な形を採用）
    2. `display` の値に応じて `<ListView>` / `<TileView>` / `<CalendarView>` を分岐レンダリング
    3. `notes` 配列は props で受け取り、子ビューにそのまま渡す
  - `NoteList` 本体は `<NoteListViews notes={notes} />` を空ステート判定の後に呼ぶだけ。
  - `SaveViewDialog` / `FilterBar` 等が必要とする `search.display` は、`search` prop を引き続き渡す形を維持する（`SaveViewDialog` のロジックを保つため）。`NoteListViews` で `useSearch` から読む `display` と `search` prop の `display` は同じ URL を元にしているため整合する。
- **理由:** 「同じデータセットから 3 パターンの描画を切り替えるだけ」という Issue 要件を直接満たす。RSC モデル（データ取得=サーバー、表示形態=クライアント）と整合する。`NoteList` を全面クライアント化すると server のままで済むデータパスまでクライアント境界に押し出してしまうため、最小切り出しに留める。

### 3. `DisplayModeSwitch` をクライアント即時反映に変更

- **対象ファイル:** `app/components/note/list/DisplayModeSwitch.tsx`
- **変更内容:**
  - `router.navigate` 呼び出しを `startTransition` 内で `router.navigate({ search: prev => ({ ...prev, display: mode }), replace: true })` に変更。
  - ステップ 1 で `loaderDeps` から `display` を抜くので、これだけで loader は走らず URL だけ更新される。
  - `disabled={isPending}` / `aria-busy` は loader 再走前提の防御だったため外す。`useTransition` 自体は React のレンダリング優先度制御に使うため維持。
- **理由:** 「URL 反映してリロード／共有しても同じビューで開ける」+ 「同じデータならクライアント即時反映」の同時達成。`replace: true` は履歴汚染防止。

### 4. SavedView 復元との整合性確保

- **対象ファイル:** `app/routes/index.tsx`（`viewQueryToSearch` 呼び出し箇所周辺）
- **変更内容:**
  - 現状: `viewId` 適用時に server 側で `baseSearch.display = view.displayMode` を計算しているが URL には書き戻していない。クライアント化後は「URL の `display` が無い + ViewId 由来の `display` が prop で渡る」状態になり、その後ユーザーが手動で display を切替えると URL に `display` が乗って初期 prop と乖離する可能性がある。
  - 対応: server function `renderHome` の handler で `viewId` 適用時、**URL の `display` が未指定かつ SavedView の `view.displayMode` が定義されている場合に限り** `redirect` を行う。具体的には:
    ```ts
    if (search.viewId !== undefined && search.display === undefined && view !== null) {
      throw redirect({
        to: "/",
        search: { ...search, display: view.displayMode },
      });
    }
    ```
  - redirect 後は `search.display === view.displayMode` が URL に乗るため、再度この条件には入らず無限ループしない。ユーザーが手動で別 display に切替えた後 reload した場合（URL に `display` が明示的にある場合）は redirect されず、ユーザー操作が尊重される。
- **理由:** SavedView 復元という既存仕様を壊さない。クライアント側で URL を書き戻す副作用は flicker の温床になるため avoid。条件分岐により redirect ループと「ユーザーの手動切替が無効化される」UX 劣化の両方を回避。

### 5. 自動テスト追加

- **対象ファイル:**
  - `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`（新規 / 既存があれば加筆）
  - `app/routes/__tests__/index.loaderDeps.test.ts`（新規。`loaderDeps` 単体を export して検証する形に出来ない場合はテスト省略）
- **変更内容:**
  - **DisplayModeSwitch**: クリック時に `router.navigate` が `{ search: <function>, replace: true }` で呼ばれること。`search` 関数の戻り値に `display: mode` が含まれること。
  - **loaderDeps**: `loaderDeps({ search: { display: "tile", page: 1, limit: 30 } as any })` の戻り値に `display` が含まれず、他のフィールドは含まれることを検証。これにより将来 `loaderDeps: ({ search }) => search` に revert された場合の回帰を検知。
- **理由:** 回帰防止。loader 再走の不在は単体テストでは直接観測できないため、「`loaderDeps` の戻り値から `display` が除外されていること」を契約として固定する。

### 6. （任意・優先度低）チラつき対策

- **対象ファイル:** ステップ 2 で切り出すクライアントコンポーネント
- **変更内容:** 手動確認の結果、3 ビュー切替時の体感遅延が残っている場合のみ、`useDeferredValue(notes)` または `<View>` 切替時の軽量フェード CSS を追加。
- **発動基準:** Chrome DevTools の Performance タブで、display 切替ボタン押下から画面更新までの input delay が **16ms（1 frame @ 60fps）を超える場合**、または手動チェックで「目視で旧ビュー → 新ビューの瞬間に空白／チラつきが見える」場合に導入。100 件相当のノートで計測する。
- **理由:** ステップ 1〜3 で loader 再実行を完全に止めれば体感遅延は 1 フレーム以内に収まる想定。実測してから判断する。

## 設計判断

- **`display` をどのレイヤーで読むか:** クライアント側の `useSearch` 経由で読む（推奨案）。`loaderDeps` から完全に切り離せて理想形。RSC モデルとの整合性が良く、Issue の「クライアント即時反映」を素直に実現できる。
- **`router.navigate` で `replace: true` を使う理由:** 表示形式切替は履歴に積む価値が薄く、ブラウザバックで毎回 display 切替が戻るのは UX 上ノイズになるため。
- **SavedView 復元時の URL 正規化:** `redirect` で URL に書き戻す方式を採用。クライアント `useEffect` で URL を書き戻す副作用は flicker の温床になるため避ける。
- **`useDeferredValue` / フェード追加:** まずは追加処理なしで実装 → 実測で必要性を判断。

## リスクと注意点

- **SavedView 復元との競合:** ステップ 4 の redirect を入れない場合、初期表示後にユーザーが手動で display を切替えた瞬間に URL と SavedView 由来の `display` が乖離する。redirect での URL 正規化を必須化する。
- **`viewId` 指定だが SavedView が見つからない場合:** `view === null` のとき redirect は発動せず、`display` は URL から（未指定なら `"list"`）読まれる。これは既存挙動の踏襲。SavedView が削除済み・他人のもの等の場合に該当する。
- **`SaveViewDialog` への影響:** `searchToViewQuery(search)` が `search.display` を必要とする。`search` がクライアント `useSearch` 経由で最新値を持つことを確認する。
- **`staleTime: 0` の妥当性:** 本変更とは独立。display を loaderDeps から外しても他の search 変更時は即時 fresh 取得が必要なので維持。
- **`aria-busy` / `disabled` 撤去のアクセシビリティ:** クライアント切替化後は ms オーダーで切替完了するため不要。screen reader 体験を悪化させないよう外してよい。

## テスト方針

- **手動 (Issue 完了条件の検証):**
  1. `pnpm dev` 起動 → `/` でリスト/タイル/カレンダーを順次切替 → DevTools Network タブで `_serverFn` リクエストが発火しないことを確認（**完了条件 1**）。
  2. 各切替時の体感遅延が 1 フレーム以内であることを確認（**完了条件 1**）。
  3. 切替時に旧ビューが消えて空白になる瞬間が無いことを確認（**完了条件 2**）。
  4. リスト → タイル切替後にリロードしてタイル表示で開くこと、URL に `?display=tile` が反映されることを確認（**完了条件 3**）。
  5. 大量データ（100 件程度）でカレンダー切替がモタつかないか確認（必要なら `useDeferredValue` 追加）。
  6. SavedView でリスト保存 → タイル切替 → SavedView 再選択でリストに戻ることを確認（既存仕様の回帰なし）。
- **自動:**
  - ステップ 5 の `DisplayModeSwitch.test.tsx`
  - `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit` を変更後にすべて通す

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点 / アーキテクチャ・リスク視点の両方をマージ）**:

- **[arch-P-001 / coverage-S-001]** ステップ 4 / ADR-002 の `redirect` 条件分岐を明文化
  - 「`search.viewId !== undefined && search.display === undefined && view !== null`」を発動条件として plan.md ステップ 4 と adr.md ADR-002 に追記
  - 無限ループ回避とユーザー手動切替尊重の両方を担保する形に修正
- **[arch-P-002]** Sidebar Link 経由で `display` が消える挙動の扱いを明示
  - 「含まれないもの」に Sidebar `<Link to="/" search={HOME_SEARCH}>` の挙動踏襲を明記。Issue は「切替トグル自体の応答性」が論点のため、サイドバー経由のナビゲーション時の display 維持は別件として除外
- **[arch-P-003 / coverage-S-002]** ステップ 2 の `"use client"` 切り出し境界を具体化
  - 新規 `NoteListViews.tsx` (`"use client"`) に切り出す責務を 3 点（`useSearch` で display 取得 / 3 ビュー分岐 / `notes` を props 受け）として明記
  - `NoteList` 本体は server のまま維持し、`SaveViewDialog` / `FilterBar` は `search` prop を引き続き受け取る方針を明確化
- **[coverage-S-003]** ステップ 5 のテスト粒度を具体化
  - `DisplayModeSwitch` の `router.navigate` 引数検証（`replace: true` / `display: mode`）と、`loaderDeps` の戻り値から `display` が除外される単体テストの 2 本立てに整理

**取り込んだ改善提案**:

- **[arch-S-001]** ステップ 6 のチラつき対策の発動基準を「100 件で input delay 16ms 超」または「目視で空白／チラつき」と具体化

**見送った提案とその理由**:

- **[arch-S-003]** `aria-selected` の更新タイミングテスト追加: `TanStack Router` の `useSearch` 同期挙動はライブラリ側の契約なので追加テストは過剰。`DisplayModeSwitch` テスト内で挙動を間接的に確認するに留める。

### 2 周目

**両視点とも問題点ゼロで終了**。

**取り込んだ改善提案**:

- **[arch-S-001]** `useSearch({ strict: false, select })` を `getRouteApi("/").useSearch({ select })` に変更（既存プロジェクトの `Route.useSearch()` パターンと整合）。
- **[arch-S-002]** `view === null` ケース（SavedView 見つからない・削除済み等）の挙動を「リスクと注意点」に明記。
- **[arch-S-003]** `loaderDeps` をモジュールトップに `export const homeLoaderDeps` として切り出し、単体テスト可能な形にする方針をステップ 1 に追記。
