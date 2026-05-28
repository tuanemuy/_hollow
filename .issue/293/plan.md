# 実装計画 — Issue #293: ページ遷移ごとに AppShell ごと全体が再描画される

**Issue:** #293
**作成日:** 2026-05-28
**複雑度:** 中〜大規模

---

## 目的

認証済みページ間の遷移で `AppShell`（Header / Sidebar / UploadDialogMount）が再マウントされず、メインコンテンツ領域だけが差し替わるようにする。これにより Header / Sidebar のクライアント状態（メニュー開閉・フォーカス・スクロール位置・Sidebar のディレクトリ展開状態）が遷移をまたいで保持され、ちらつき・体感レイテンシ・サーバー側の無駄なデータ取得が解消される。

## スコープ

### 含まれるもの
- 認証済みルート群を束ねる **pathless layout route** `app/routes/_app/route.tsx` の新設
- `_app.beforeLoad` での認証ガード（未ログイン → `/` + `HOME_SEARCH` redirect、`/` だけは例外で未認証許容）
- `_app.loader` での `userDto` 解決 + Header / Sidebar の RSC payload 生成（1 回だけ）
- `_app.component` で `<AppShellFrame header={...} sidebar={...}><Outlet /></AppShellFrame>` を 1 度だけマウント（未認証 `/` のときは `<Outlet />` のみ）
- 新規 `app/components/layout/AppShellFrame.tsx`（sync layout）の追加
- 該当する 9 ルートを `_app/` 配下に物理移動し、loader から `AppShell` ラップ／個別の redirect ガードを撤去
- `HomePage.tsx` の `AppShell` ラップ責務を外側へ移譲（中身だけ返す）
- ランディング（未ログイン `/`）の継続表示と、`<Link to="/" search={HOME_SEARCH}>` の互換性維持
- ルート単位の `<form action="/" method="get">`（Header 検索）が壊れないことの動作確認
- 各リーフ既存の `errorComponent` を保持（`_app.errorComponent` は最低限のみ）

### 含まれないもの
- **`app/routes/__root.tsx` の変更**（`loadAppContext` / `staleTime` / `RootDocument` を含め一切手を入れない）
- `app/components/layout/AppShell.tsx` 自体の削除（`AppShellFrame` を主流路として使うが、`AppShell.tsx` は他から参照がなくなったら別 PR で整理。本 Issue では削除しない）
- spec/ の同期更新（実装方針確定後に別途 spec-sync で対応）
- 既存ルート単体テストの新規作成（プロジェクトに既存パターンがないため）
- AppShell 内部 UI（Header / Sidebar / UploadDialogMount の構造）の変更
- 関連 Issue #13 / #1 ADR-026（search schema 統一）の追加変更
- 認証必須だが AppShell を使っていない `exports/*`, `views/*`, `search` ルートへの AppShell 導入
- スコープ外のリファクタリング（リーフが個別に持つ side-effect import の整理は最小限のみ）
- ログイン後のリダイレクト先保持（`?next=` / `redirectTo` パラメータ等）の新設

## 調査結果

### 関連ファイル

- `app/routes/__root.tsx:45-75` — `staleTime: Infinity`、`beforeLoad: loadAppContext`、component は `<RootDocument><Outlet /></RootDocument>` のみ。**本 Issue では触らない**
- `app/routes/settings/route.tsx:33-71` — path-based layout の参考。`<Outlet/>` 直書きパターン
- `app/routes/index.tsx` — `renderHome` で `authenticated` 分岐 + `validateSearch: noteListSearchSchema.parse`。side-effect import を多数抱える
- 各リーフルート — loader 内で `getCurrentUser` / `toUserDTO` / `<AppShell user={userDto}>...</AppShell>` ラップ
- `app/components/layout/AppShell.tsx` — `Header` + `Sidebar` + `UploadDialogMount` を組む。`ingestion/actions` の side-effect import を 1 つ持つ
- `app/components/layout/Header.tsx` — **sync** server component（`user: UserDTO`）。検索フォーム `<form action="/" method="get">` でフルページ遷移
- `app/components/layout/Sidebar.tsx` — **async** server component。内部で `loadDirectoryTree(user.id)`（`cache()` 付き serverData）
- `app/components/ingestion/UploadDialogMount.tsx` — `"use client"`。ハッシュベースで `useLocation` から pathname/hash のみ subscribe
- `app/components/note/HomePage.tsx:37-53` — 内部で `<AppShell>` を呼ぶ（撤去対象）
- `app/lib/server/currentUser.ts:51-70` — `getCurrentUser` / `requireCurrentUser` の `cache()` 化済み実装
- `app/components/auth/links.ts` — `HOME_SEARCH`, `TRASH_SEARCH`, `NOTE_HISTORY_SEARCH`

### あるべきアーキテクチャ

- **`docs/frontend_implementation_example.md`**: ルートの `loader` は server fn を呼んで RSC payload を返し、`component` は `Route.useLoaderData()` から RSC payload を取り出して返すのが canonical。async server component（Sidebar 等）は **loader 内で `renderServerComponent` 経由でしか取り込めない**（client tree から直接 JSX で `<async>` を書くと壊れる）
- **共通レイアウト・共通データは親 route に引き上げ**:`__root.tsx` の `beforeLoad: loadAppContext` パターンを踏襲。認証コンテキスト（`UserDTO`）も `_app` に引き上げる
- **既存リーフの redirect 先は `/` + `HOME_SEARCH`**（grep で 9 ルート全件確認）。`/login` ではない。本 Issue で挙動を変えない
- **side-effect import パターン**: `__root.tsx` が auth 系 action を、各リーフが必要な action を直接 `import` して RSC manifest に登録。`_app/route.tsx` を新設したら、現状 `index.tsx` が抱えている registration 群（note/directory/tag/view/media/publication/ingestion）はここに集約

### 既存実装の状態

- **乖離**: 全認証ページが `AppShell` をリーフ loader 内で個別ラップ → 本 Issue で解消
- **乖離（軽微）**: `HomePage.tsx` が UI コンテナとレイアウトを同居 → 本 Issue で責務分離
- **整合**: `__root.tsx` の context 駆動パターン、`settings/route.tsx` の layout-保持パターンを踏襲
- **整合**: redirect 先 `/` + `HOME_SEARCH`、各リーフの `errorComponent`、side-effect import パターンは現状維持

### 依存関係

- **影響ルート**: 9 ファイル + history の `route.tsx`
- **影響コンポーネント**: `HomePage.tsx`（AppShell ラップ撤去）、新規 `AppShellFrame.tsx`。Header / Sidebar / UploadDialogMount は内部変更なし
- **routeTree.gen.ts**: `_app/` 配下への物理移動で再生成発生
- **side-effect import**: `index.tsx` の registration 群（note/directory/tag/view/media/publication/ingestion）を `_app/route.tsx` に集約
- **関連 Issue**: #13 / #1 ADR-026（`HOME_SEARCH` 互換維持 → 変更なし）
- **spec/**: 実装後に spec-sync で別途追記（本 Issue 外）

---

## 実装ステップ

### 0. routeTree.gen.ts の dry-run

- **対象ファイル:** `app/routes/_app/__dry_run__.tsx`（dry-run 用一時ファイル）
- **変更内容:** `_app/route.tsx` の雛形と最小子ルート 1 つを追加 → `pnpm dev` 起動 → `routeTree.gen.ts` で `_app` 配下に子が正しく登録されるか、`createFileRoute("/some/")` のままで URL が `/some` に解決されるかを確認。確認後にダミーファイルは削除
- **理由:** 9 ファイル移動着手前に File-Based Routing の pathless 挙動を実機で検証。リスク #1 の事前潰し込み

### 1. `AppShellFrame.tsx`（sync layout）の新設

- **対象ファイル:** `app/components/layout/AppShellFrame.tsx`（新規）
- **変更内容:**
  - props: `{ header: ReactNode; sidebar: ReactNode; children: ReactNode }`
  - 既存 `AppShell.tsx` のレイアウト構造（`APP_LAYOUT_WITH_SIDEBAR`, `APP_MAIN`）を踏襲し、`{header}` / `{sidebar}` / `<main>{children}</main>` / `<UploadDialogMount/>` を並べる
  - `import "@/components/ingestion/actions"` を **保持**（`UploadDialogMount` の前提）
- **理由:** `_app.component`（client tree）で async Sidebar を直書きできないため、loader 側で RSC 化した Header / Sidebar payload を受け取って配置する sync layout が必要

### 2. pathless layout route `_app/route.tsx` を新設

- **対象ファイル:** `app/routes/_app/route.tsx`（新規）
- **変更内容:**
  - `createFileRoute("/_app")` で pathless layout を定義
  - `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY`（`__root.tsx` と同じ式）
  - `beforeLoad({ location })`:
    - `pathname` を正規化（小文字化 + 末尾スラッシュ除去のヘルパー `normalizeAuthGuardPathname` を `_app/route.tsx` 内に定義）
    - `getCurrentUser()` を呼ぶ
    - 正規化 pathname が `/` のとき、`user` が null でも redirect せず context へ `{ authState: "anon" | "auth" }` のシグナルを返さない（context は空、user の解決は loader に任せる）
    - 正規化 pathname が `/` 以外で `user === null` のとき `throw redirect({ to: "/", search: HOME_SEARCH })`
  - `loader` で `loadAppShellChrome` server fn を呼ぶ（後述）
  - `component` 関数:
    - `Route.useLoaderData()` で `{ userDto, header, sidebar }` を取得
    - `userDto === null` なら `<Outlet />` のみ（未認証 `/` ランディング経路）
    - 非 null なら `<AppShellFrame header={header} sidebar={sidebar}><Outlet /></AppShellFrame>` を返す
  - `errorComponent`: `_app.beforeLoad` / `_app.loader` 失敗時に AppShell なしの最低限エラー画面を表示（`errorComponent` は **`_app` 自身の throw 専用**。子の throw は子の `errorComponent` が `<Outlet />` 位置に出る前提）
  - side-effect imports を集約:
    - `@/components/auth/AdminSignUpForm/action`〜の auth 系は **`__root.tsx` 側で既に登録済み** なので重複登録しない
    - 認証必須の各コンポーネント action を集約: `@/components/note/actions`, `@/components/directory/actions`, `@/components/tag/actions`, `@/components/view/actions`, `@/components/media/actions`, `@/components/publication/PublishSettings/action`, `@/components/ingestion/actions`
- **理由:** pathless layout の component は遷移をまたいで保持される。`/` も `_app` 配下に置くことで主要シナリオ（`/` ⇄ 他認証ルート）の AppShell 保持を実現

### 3. `loadAppShellChrome` server fn の定義

- **対象ファイル:** `app/routes/_app/route.tsx` 内で定義
- **変更内容:**
  ```ts
  const loadAppShellChrome = createServerFn({ method: "GET" })
    .middleware([errorResponseMiddleware])
    .handler(async () => {
      const { getCurrentUser } = await import("@/lib/server/currentUser");
      const user = await getCurrentUser();
      if (user === null) {
        return { userDto: null, header: null, sidebar: null };
      }
      const [{ toUserDTO }, { Header }, { Sidebar }] = await Promise.all([
        import("@/core/application/dto/identity"),
        import("@/components/layout/Header"),
        import("@/components/layout/Sidebar"),
      ]);
      const userDto = toUserDTO(user);
      const [header, sidebar] = await Promise.all([
        renderServerComponent(<Header user={userDto} />),
        renderServerComponent(<Sidebar user={userDto} />),
      ]);
      return { userDto, header, sidebar };
    });
  ```
- **理由:** Header と Sidebar の RSC 取得を 1 か所に集約。Sidebar の async 取得（`loadDirectoryTree`）は `_app.loader` 1 回だけ走り、子ルート遷移時には再フェッチされない。`getCurrentUser` の `cache()` で `beforeLoad` と loader が同じ呼び出しを共有

### 4. 子ルートを `_app/` 配下に物理移動

- **対象ファイル:**
  - `app/routes/index.tsx` → `app/routes/_app/index.tsx`
  - `app/routes/trash/index.tsx` → `app/routes/_app/trash/index.tsx`
  - `app/routes/tags/index.tsx` → `app/routes/_app/tags/index.tsx`
  - `app/routes/notes/new.tsx` → `app/routes/_app/notes/new.tsx`
  - `app/routes/notes/$noteId/index.tsx` → `app/routes/_app/notes/$noteId/index.tsx`
  - `app/routes/notes/$noteId/edit.tsx` → `app/routes/_app/notes/$noteId/edit.tsx`
  - `app/routes/notes/$noteId/history/route.tsx` → `app/routes/_app/notes/$noteId/history/route.tsx`
  - `app/routes/notes/$noteId/history/index.tsx` → `app/routes/_app/notes/$noteId/history/index.tsx`
  - `app/routes/notes/$noteId/history/$revisionId.tsx` → `app/routes/_app/notes/$noteId/history/$revisionId.tsx`
  - `app/routes/upload/index.tsx` → `app/routes/_app/upload/index.tsx`
- **変更内容:**
  - `createFileRoute("/トップレベル/...")` の path 文字列は変更しない（pathless segment `_app` は URL に反映されない）
  - **補足**: routeId 文字列はファイル位置を反映する必要があるため、`pnpm dev` 起動時の auto-fix で `createFileRoute("/_app/trash/")` 形式に **書き換わる**。URL には `_app` が出ないが routeId には出る。手動編集はせず auto-fix 結果を受け入れる。ステップ 0 の dry-run でこの挙動も観察すること
- **理由:** TanStack Router File-Based Routing の規約（ファイル位置で親 / 子を表現）

### 5. 各子ルートの loader から `AppShell` ラップと redirect ガードを撤去

- **対象ファイル:** ステップ 4 で移動した 9 ルート（history の `route.tsx` は `<Outlet />` のみで変更不要）
- **変更内容:**
  - `renderServerComponent(<AppShell user={userDto}><X/></AppShell>)` → `renderServerComponent(<X user={userDto} .../>)`
  - `AppShell` の dynamic import を削除
  - `getCurrentUser() === null → throw redirect({ to: "/", search: HOME_SEARCH })` の redirect ガードを削除（`_app.beforeLoad` で集約済み）
  - `getCurrentUser()` 自体と `toUserDTO(user)` の呼び出しは **保持**（server fn 内なので `Route.useRouteContext` は使えない；`cache()` のお陰で `_app.loader` の `getCurrentUser` と同じ呼び出しを共有し、追加コストはほぼゼロ）
  - `user` が `null` のケースは `_app.beforeLoad` の保証で到達しないが、防御的に `requireCurrentUser`（throw 版）に置換するか、`if (user === null) throw redirect({ to: "/", search: HOME_SEARCH })` をフェイルセーフとして 1 行残す（実装者判断、コードベースで揺らがないようどちらか統一）
  - 各リーフの `errorComponent` は **保持**（`_app.errorComponent` は `_app` 自身の throw 専用なので、子の throw は子側で出す）
  - `notFoundComponent` も保持
- **理由:** 重複している `AppShell` ラップ・redirect ガードを集約し、ルート遷移時の AppShell 再マウントを止める。`getCurrentUser` 呼び出し自体は cache 経由でコスト無視できるため残す（`Route.useRouteContext` は server fn handler から呼べない制約への現実的対処）

### 6. `_app/index.tsx`（=`/`）の動作維持

- **対象ファイル:** `app/routes/_app/index.tsx`（ステップ 4 で移動）
- **変更内容:**
  - `renderHome` の `authenticated: false` → 既存どおり `{ authenticated: false as const }` を返す
  - `authenticated: true` のとき `renderServerComponent(<HomePage .../>)` を返す（HomePage は次ステップで AppShell ラップを外す）
  - `HomeRoute` 関数:
    - `data.authenticated === false` → `<LandingPage />` を返す（`_app.component` が `<Outlet />` のみで包んでいる経路）
    - `data.authenticated === true` → `data.Home` を返す（`_app.component` が `<AppShellFrame>` で包んでいる経路）
  - `validateSearch: noteListSearchSchema.parse` は **保持**
  - side-effect import 群は `_app/route.tsx` に集約済みなので、ここでは削除
- **理由:** ランディング表示と HomePage 表示を `/` で両立しつつ、`_app` の AppShell 共有経路に乗せる

### 7. `HomePage.tsx` を「AppShell を含まない」形に変える

- **対象ファイル:** `app/components/note/HomePage.tsx`
- **変更内容:**
  - `<AppShell user={user}>...</AppShell>` ラッパーを削除し、`<NoteList .../>` を直接返す
  - `user` prop は `NoteList` が必要としているので維持
- **理由:** AppShell マウントは親 route の責務。HomePage はメインコンテンツの責務だけを持つ

### 8. `app/components/layout/AppShell.tsx` の取り扱い

- **対象ファイル:** `app/components/layout/AppShell.tsx`
- **変更内容:** **本 Issue では削除しない**。`_app/route.tsx` 経由で `AppShellFrame` に置き換わるが、`AppShell.tsx` 自体は他から参照がなくなる時点で別 PR / 別タスクで整理。ingestion side-effect import は `AppShellFrame.tsx` に移植済みなので、`AppShell.tsx` 内の import は重複しても冪等
- **理由:** 不要コードの削除はスコープ外。typecheck / lint で未使用警告が出れば後続 Issue へ

### 9. `routeTree.gen.ts` の再生成と型整合確認

- **対象ファイル:** `app/routeTree.gen.ts`（自動生成）
- **変更内容:** `pnpm dev` または `pnpm build` で再生成
- **理由:** route 構造の変更を型に反映

### 10. 動作確認と manual test 追加

- **対象ファイル:** `.issue/293/testing.md`
- **変更内容:** Issue 本文の「期待挙動」と各レビューで上がったエッジケース（Header 検索フォーム、未認証 redirect 先、UploadDialogMount 抑制、Sidebar 再フェッチなし）をチェック項目化
- **理由:** 本 Issue の再現条件と修正検証を機械的に確認可能にする

---

## 設計判断

詳細は `.issue/293/adr.md` を参照。主要判断:

- **ADR-001: pathless layout のパス名** — `app/routes/_app/route.tsx`（`_app` で pathless segment）
- **ADR-002: ランディング `/` の扱い** — `/` も `_app` 配下に置き、`_app.beforeLoad` で `/` だけ未認証許容の例外を切る（Case B）。redirect 先は既存どおり `/` + `HOME_SEARCH`
- **ADR-003: `_app.loader` のデータ引き上げ範囲** — Header / Sidebar の RSC payload と `userDto` のみ。Sidebar 内部の `loadDirectoryTree` 呼び出しを `_app.loader` の `renderServerComponent(<Sidebar user/>)` 経由で 1 回に集約。各ページ固有データ（owned notes / tags / saved views）は子ルートに残す
- **ADR-004: `_app.component` の AppShell マウント方式** — `_app.loader` で Header/Sidebar を RSC 化 → `_app.component` で sync `AppShellFrame` に渡す方式（async server component を client tree に直書きしない canonical pattern）
- **ADR-005: 各リーフが `getCurrentUser` を呼び続ける選択** — `Route.useRouteContext()` は server fn handler から呼べないため、leaf server fn は `getCurrentUser` を呼ぶ（cache 共有でコスト無視可）。`_app.beforeLoad` は redirect ガードと side-effect-free な user 解決の集約にとどめる
- **ADR-006: 未認証 redirect 先** — 既存どおり `/` + `HOME_SEARCH`（`/login` ではない。`/login` への変更は別 Issue で `?next=` 設計と一緒に検討すべき）

---

## リスクと注意点

1. **TanStack Router File-Based Routing の pathless 挙動の検証**
   - ステップ 0 の dry-run で `_app` が pathless として認識され、`createFileRoute("/trash/")` のままで `/trash` に解決されることを確認

2. **`_app.beforeLoad` の `/` 例外ロジック**
   - `location.pathname` を `normalizeAuthGuardPathname`（小文字化 + 末尾スラッシュ除去）で正規化してから判定
   - 1 ルート分の局所例外なので、コメントで「`/` だけは未認証時にランディングを描画するため redirect しない」旨を明記

3. **Sidebar の `loadDirectoryTree` 呼び出し回数**
   - `_app.loader` が `staleTime: Infinity` でキャッシュされる前提。子ルート遷移時に `_app` loader が再実行されないことを Network タブで確認
   - profile / displayName 更新後は `router.invalidate({ filter: r => r.routeId === "/_app" })` を呼ぶ必要があるが、これは本 Issue ではスコープ外（既存 settings ページがどう invalidate しているか確認し、必要なら別 Issue 起票）
   - **将来 `_app.loader` を invalidate する経路を追加するときは、Header / Sidebar の RSC payload が差し替わることで AppShell 配下の client 状態（Sidebar 展開、Header 検索 input フォーカス）が失われる懸念がある**。invalidate API 設計時に「user 情報だけ差分更新」か「shell まるごと再生成」を分岐できる構造を別 Issue で検討する

4. **`UploadDialogMount` の動作**
   - `_app` で常時マウントされる構成下でも、`normalizePathname(pathname) !== "/upload"` 等の既存セレクタが正しく動くか確認

5. **`errorComponent` の階層**
   - `_app.errorComponent` は `_app.beforeLoad` / `_app.loader` 失敗時の最低限表示専用
   - 各リーフの `errorComponent` は **必ず保持**。リーフが throw すると `<Outlet />` 位置に出る（AppShell は描画され続ける）

6. **side-effect import の経路変更**
   - `index.tsx` が持っていた registration 群を `_app/route.tsx` に移す。`__root.tsx` の auth 系 import との重複はない（auth は `__root.tsx`、認証ページ系は `_app/route.tsx`）
   - 各リーフは個別 import を残しても冪等。ただし整理は最小限のスコープに留め、リーフからの撤去は今回行わない（safety-net として残す方が安全）

7. **`<form action="/" method="get">` 検索フォームの挙動**
   - Header の検索フォームはフルページ遷移する。`_app` 配下に `/` を入れた状態でも、`/` 着地時に `_app.beforeLoad` が走り `validateSearch: noteListSearchSchema.parse` が search を正しくパースすることを確認

8. **`/` ランディング表示時の `<html>` lang / head**
   - `__root.tsx` の `RootDocument` で `<html lang="ja">` は保証される

9. **`renderServerComponent` の JSON シリアライズ**
   - `_app.loader` から `{ header, sidebar }` を返すとき、RSC payload は TanStack Start の loader を通して client に届く
   - Header / Sidebar 内部の Link / Tailwind class 等は通常通り動作する（既存リーフでも同様の経路で渡している）

---

## テスト方針

### 自動テスト
- `pnpm typecheck` — `Route.useLoaderData()` 型整合、routeTree.gen.ts の再生成結果
- `pnpm lint:fix` / `pnpm format` — コード規約の遵守
- `pnpm test` — 既存テストへの影響なし確認

### 手動テスト（detail は `.issue/293/testing.md`）
- ログイン状態:
  - `/` → `/notes/$noteId/` → 戻る — Header 検索フォームへの入力 / Sidebar のディレクトリ展開状態 / Sidebar スクロール位置 / Header 検索 input フォーカスが遷移をまたいで保持
  - `/` → `/tags` → `/trash` → `/notes/new` の連続遷移で Header / Sidebar が React DevTools 上で同一 fiber
  - `/upload` 遷移時に UploadDialog が抑制
  - `/notes/$noteId/edit` ⇄ `/notes/$noteId/` 遷移でメインのみ差し替わり
  - Header 検索フォーム `<form action="/" method="get">` 経由で `/?q=...` 遷移しても AppShell 維持 + 検索結果反映
  - Network タブで Sidebar の `loadDirectoryTree` server fn が連続遷移時に **1 回しか呼ばれない** ことを確認
- 未ログイン:
  - `/` 直アクセス → ランディング表示（AppShell なし）
  - `/trash` 直アクセス → `/` + `HOME_SEARCH` リダイレクト（既存挙動維持）

---

## レビュー履歴

### 1周目（2026-05-28）

**修正した点（要件カバレッジレビュー反映）**:
- **[P-001]**: `_app.beforeLoad` の redirect 先を `/login` から既存どおり `/` + `HOME_SEARCH` に修正（ステップ 2 + ADR-006）
- **[P-002]**: leaf server fn 内で `Route.useRouteContext()` は使えない事実に基づき、leaf は `getCurrentUser` 呼び出しを保持する方針に修正（ステップ 5 + ADR-005）。`getCurrentUser` の `cache()` で重複コストは無視可
- **[P-003]**: スコープ節に `__root.tsx` 変更なしを明記

**修正した点（アーキテクチャ・リスクレビュー反映）**:
- **[P-001]**: `_app.component` で async Sidebar を JSX 直書きできない（client tree が壊れる）問題を、`_app.loader` で `renderServerComponent` 経由で Header / Sidebar の RSC payload を作り `AppShellFrame` で受ける方式に全面修正（ステップ 1〜3 + ADR-004）
- **[P-002]**: 同上（leaf の `getCurrentUser` 保持で対応、ADR-005 で明文化）
- **[P-003]**: redirect 先 `/` 維持（ADR-006 で別 Issue 化を明記）
- **[P-004]**: `_app.errorComponent` は `_app` 自身専用、各リーフの `errorComponent` は保持と明記（ステップ 2 / 5）
- **[P-005]**: pathname 正規化ヘルパー `normalizeAuthGuardPathname` を `_app/route.tsx` に定義（ステップ 2）
- **[P-006]**: side-effect import を `_app/route.tsx` に集約、`__root.tsx` との非重複を明文化（ステップ 2）

**取り込んだ改善提案**:
- **[S-001 要件側]**: side-effect import の取り扱いを `_app/route.tsx` 集約に確定
- **[S-002 要件側]**: HOME_SEARCH 経由の `/` 遷移（フォーム検索含む）を testing.md チェック項目に追加
- **[S-003 要件側]**: `errorComponent` の階層方針を明文化（リーフは保持）
- **[S-004 要件側]**: Sidebar 再フェッチなしの Network タブ確認手順を testing.md に追加
- **[S-001 アーキ側]**: `_app.loader` での RSC slot 方式を主案に格上げ（ADR-004）
- **[S-003 アーキ側]**: routeTree.gen.ts の dry-run をステップ 0 に追加
- **[S-004 アーキ側]**: `_app = 認証 + AppShell` の意味付けを ADR-001 で言及
- **[S-006 アーキ側]**: Header の `<form action="/" method="get">` 動作確認を testing.md に追加

**見送った提案とその理由**:
- **[S-002 アーキ側]** `staleTime` を短くして `user` 変化に追随する案: 本 Issue のスコープ（AppShell 再マウント抑止）を破壊するため見送り。profile 更新後の invalidate は別 Issue。`__root.tsx` の既存パターンと整合させる
- **[S-005 アーキ側]** `HomePage.tsx` 自体を削除し `_app/index.tsx` から直接 `<NoteList>` を呼ぶ案: `HomePage` は props 合成・コメント (`Promise.all` で `cache()` dedup を保つ説明) を持ち、薄いが意味のあるラッパー。削除は別 Issue で
- **[S-002 要件側]** `validateSearch` 検証は手動テスト項目で十分（追加コード不要）

### 2周目（2026-05-28）

**両視点とも問題点ゼロで終了**。改善提案のみ反映:

- **[S-001 要件側]**: leaf 内で `user === null` 到達時の防御的処理を 1 行明記（ステップ 5）
- **[S-002 要件側]**: 手動テストにスクロール位置・フォーカス保持を明記（テスト方針節）
- **[S-001 アーキ側]**: `createFileRoute` 文字列の auto-fix 挙動を補足（ステップ 4）
- **[S-002 アーキ側]**: 将来の invalidate 時の client 状態保持懸念を別 Issue 予告として追記（リスク #3）
- **[S-003 アーキ側]**: `AppShellFrame` 内の `UploadDialogMount` 配置理由を ADR-004 で言及済み（追加修正不要）
- **[S-004 アーキ側]**: server fn 命名 `loadAppShellChrome` を `renderAppShellChrome` に統一する案は、`renderHome` が「Home 1 つを描画」を意味するのに対し、`_app.loader` は user / header / sidebar をまとめて「Chrome データを読み込む」意味合いが強いので、`loadAppShellChrome` のまま維持（実装時の最終判断はサブエージェントに委ねる）
