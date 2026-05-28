# ADR — Issue #293: ページ遷移ごとに AppShell ごと全体が再描画される

## ADR-001: pathless layout のパス名

### Status
Accepted

### Context
認証済みルート群を束ねる pathless layout を新設するにあたり、ディレクトリ名（=routeId 接頭辞）の候補が複数:

- `_app`、`_authenticated`、`_personal`、`_main`

既存の path-based layout として `settings/route.tsx`（`/settings/*`）、`admin/route.tsx`（`/admin/*`）がある。`_app` は「認証済みかつ AppShell を持つ個人領域」を意味し、`exports/*` / `views/*` / `search` のような「認証必須だが AppShell を使わないルート」とは別系統。

### Decision
**`app/routes/_app/route.tsx`** を採用。

### Consequences
- **良い点:**
  - 短く、TanStack Router の慣習（pathless segment は `_` プレフィックス）に沿う
  - settings / admin との対比で「アプリ全体のメインシェル」を直感的に表す
  - URL に出ないため `<Link>` 互換性に影響なし
- **トレードオフ:**
  - `_authenticated` ほど「認証必須」を明示しない
  - `_app` 配下に入らない `exports/*` / `views/*` のような認証必須ルートは「`_app` の外」に取り残される構造。将来的にそれらを `_app` に取り込むかどうかは別 Issue で議論
  - routeTree.gen.ts の差分が `_app/` 配下分大きくなる

---

## ADR-002: ランディング `/` の扱い

### Status
Accepted

### Context
`/` は URL として 2 モード:
- **未ログイン**: `<LandingPage />`（AppShell なし）
- **ログイン**: HomePage（NoteList）を AppShell 内で表示

Issue の主目的「`/` ⇄ 他認証ルート間で AppShell を保持」を達成するには、`/` を `_app` 配下に置く必要がある。一方で Issue 本文では「ランディングは認証済みグループに含めず別ルート構成に」とも示唆されている。

選択肢:
- **案 A**: `/` を `_app` の外に残し、authenticated 時のみ `index.tsx` 内で `<AppShell>` ラップを残す
  - 問題: `/` ⇄ 他認証ルート間で AppShell が再マウントされる（Issue の主目的を達成できない）
- **案 B**: `/` を `_app` 配下に置き、`_app.beforeLoad` で `/` だけ未認証許容、`_app.component` で `userDto === null` なら `<Outlet />` のみ、非 null なら `<AppShellFrame>...<Outlet/>...</AppShellFrame>`
  - 利点: `/` ⇄ 他認証ルート間で AppShell が完全保持される
  - 欠点: `_app.beforeLoad` のロジックが「`/` だけ例外」を持つ。`_app.component` も `userDto` null 分岐を持つ
- **案 C**: 認証済み HomePage を `/home` 等に分け、`/` をランディング専用に
  - 問題: URL 体験変更（`/` 訪問時に `<Link to="/" search={HOME_SEARCH}>` の遷移先が変わる）。`HOME_SEARCH` 互換性破壊

### Decision
**案 B** を採用。

`/` を `_app/index.tsx` として `_app` 配下に置く。`_app.beforeLoad` で `location.pathname` を正規化し、`/` のときだけ `user === null` を許容（redirect しない）。`_app.component` で `userDto === null` のとき `<Outlet />` のみ返す。

### Consequences
- **良い点:**
  - `/` ⇄ 他認証ルート間の遷移で AppShell が完全に保持され、Issue の主目的を達成
  - `HOME_SEARCH` / `<Link to="/">` 互換性が完全に維持される
  - ランディング表示時に AppShell が出ないという既存 UX も維持
- **トレードオフ:**
  - `_app.beforeLoad` に「`/` だけ例外」のロジック（コメント必須）
  - `_app.component` が `userDto` null 分岐を持つ
  - 案 A より複雑だが、1 ルートのための局所例外として吸収

---

## ADR-003: `_app.loader` でのデータ引き上げ範囲

### Status
Accepted

### Context
`_app.loader` に引き上げ可能なデータ:
- `userDto`（`UserDTO | null`）
- Header の RSC payload（sync server component、user を元にレンダリング）
- Sidebar の RSC payload（async server component、内部で `loadDirectoryTree(user.id)` を呼ぶ）
- その他の共通データ（appContext、savedViews 等）

引き上げ範囲のトレードオフ:
- 引き上げない → 子コンポーネントで重複 fetch、AppShell 再マウント時に再フェッチ
- 引き上げすぎ → `_app.loader` が重くなり、`_app` 自体が再評価される時のコストが上がる

### Decision
- **`_app.loader` で引き上げるもの**: `userDto` と Header / Sidebar の RSC payload のみ
- **Sidebar 内部の `loadDirectoryTree` 呼び出し** は Sidebar の async server component として保持。`_app.loader` の `renderServerComponent(<Sidebar user/>)` 経由で 1 回だけ走る形になる
- **引き上げない**: 各ページ固有のデータ（`loadOwnedNotes`, `loadAllTags`, `loadSavedViewsByKind` 等）。子ルート loader に残す
- **引き上げない**: `appContext`（`__root.tsx` で既に取得済み）

### Consequences
- **良い点:**
  - `_app.loader` が「shell の RSC payload を作る」責務に集中
  - Sidebar の内部 fetch ロジックを Sidebar 内に閉じたまま保てる（責務分離）
  - `_app.loader` が `staleTime: Infinity` でキャッシュされる前提のもと、子ルート遷移時に Sidebar の `loadDirectoryTree` も再フェッチされない
- **トレードオフ:**
  - `_app.loader` の return 型が `{ userDto, header, sidebar }` の RSC payload 含みとなり、JSON シリアライズの想定が必要
  - profile / displayName 更新後は `router.invalidate({ filter: r => r.routeId === "/_app" })` を明示的に呼ぶ必要がある（本 Issue では扱わず、必要なら別 Issue）

---

## ADR-004: `_app.component` の AppShell マウント方式

### Status
Accepted

### Context
`_app.component` で AppShell をどう描画するかの選択肢:

- **案 1**: `_app.component` で `<AppShell user={user}><Outlet /></AppShell>` を JSX 直書き
  - 問題: `AppShell` 内の `Sidebar` が async server component。`_app.component` は client tree で評価されるため、React renderer が async function component を直接処理できず壊れる。`docs/frontend_implementation_example.md` の canonical pattern「server component は `renderServerComponent` 経由で取り込む」にも反する
- **案 2**: `_app.loader` で `renderServerComponent(<AppShell user={user}><PlaceholderForOutlet /></AppShell>)` を作る
  - 問題: `<Outlet />` は TanStack Router の client side concept。RSC payload に組み込めない
- **案 3**: `_app.loader` で Header / Sidebar の RSC payload を **個別に** 作り、`_app.component` で sync layout コンポーネント `AppShellFrame` に渡して `{header}{sidebar}<main>{children}</main>` をレイアウトする
  - 利点: async server component（Sidebar）は loader 内の `renderServerComponent` で server-rendered → 既存パターンと整合。`<Outlet />` は client tree の `AppShellFrame.children` に流せる
  - 欠点: 新規 layout コンポーネント `AppShellFrame` の追加が必要

### Decision
**案 3** を採用。

- `_app.loader` (server fn) で `{ userDto, header: renderServerComponent(<Header user/>), sidebar: renderServerComponent(<Sidebar user/>) }` を返す
- 新規 `app/components/layout/AppShellFrame.tsx`（sync layout、props: `{ header: ReactNode; sidebar: ReactNode; children: ReactNode }`）を `app/components/layout/AppShell.tsx` のレイアウト構造を踏襲して作成
- `_app.component` で `<AppShellFrame header={header} sidebar={sidebar}><Outlet /></AppShellFrame>` を返す（`userDto === null` なら `<Outlet />` のみ）

既存の `app/components/layout/AppShell.tsx` は本 Issue では削除しない（リファレンスが残らなくなったら別 Issue で整理）。

### Consequences
- **良い点:**
  - canonical pattern（async server component を `renderServerComponent` で取り込む）と整合
  - Header / Sidebar の内部実装に手を加えない（responsibility 維持）
  - `AppShellFrame` は sync で client/server 中立なので、`_app.component` から JSX で安全に使える
  - `UploadDialogMount`（`"use client"`）は `AppShellFrame` 内に組み込むか `_app.component` に直接書くかどちらでも可（実装上は `AppShellFrame` 内に置き、既存 `AppShell.tsx` のレイアウトを完全模倣）
- **トレードオフ:**
  - 新規ファイル `AppShellFrame.tsx` の追加
  - 旧 `AppShell.tsx` が dangling（誰も使わなくなる可能性。本 Issue では削除しない）
  - `_app.loader` で Header / Sidebar 双方の `renderServerComponent` を呼ぶため、初回マウント時の RSC 生成コストが 2 つ並列で走る（`Promise.all` で並列化済み）

---

## ADR-005: 各リーフが `getCurrentUser` を呼び続ける選択

### Status
Accepted

### Context
当初計画では「各リーフから `getCurrentUser` 呼び出しを撤去し、`_app` context から `userDto` を受け取る」としていた。しかし詳細を詰めると以下の制約:

- TanStack Router の `Route.useRouteContext()` は **route component（client tree）でしか呼べない**
- 各リーフの実装は `createServerFn` の handler（server tree）で `userDto` を生成し `renderServerComponent(<X user={userDto}/>)` に渡す
- server fn handler から `Route.useRouteContext()` は使えない
- TanStack Router の `loader: async ({ context }) => ...` で `_app.beforeLoad` の context が降りる方法もあるが、context は client-side state（serializable）で、server fn handler に直接届くわけではない

選択肢:
- (a) leaf の route component から `Route.useRouteContext()` で `userDto` を取り、`createServerFn` の `inputValidator` 経由で `userId` を渡し、server fn 内で `requireCurrentUser` を再度呼ぶ
- (b) leaf 側は引き続き `getCurrentUser` を呼ぶが、`/` への redirect ガードだけ撤去する（`_app` で集約）
- (c) すべての leaf を `renderServerComponent` から脱却し client-side data fetching に書き換える

### Decision
**案 (b)** を採用。

leaf の server fn handler は `getCurrentUser()` + `toUserDTO()` を呼び続ける（redirect ガードのみ削除）。`getCurrentUser` は `cache()` 付きなので、同一リクエスト内で `_app.beforeLoad` / `_app.loader` / 各 leaf がすべて同じ呼び出しを共有し、追加コストはほぼゼロ。

### Consequences
- **良い点:**
  - 実装変更が最小（各 leaf の loader から redirect ガード行を削除するだけ）
  - `cache()` のお陰でパフォーマンス劣化なし
  - server fn handler の独立性が保たれる（独自に `getCurrentUser` を呼べる = テスタブル）
- **トレードオフ:**
  - 「`_app` に user 解決を集約」の理想からは一歩引いた形
  - 名目上の重複は残るが、`cache()` で実体は単一呼び出し

---

## ADR-007: `beforeLoad` の auth ガードを server fn でラップする → 後に loader 統合へ統合

### Status
Superseded by ADR-008（実装フェーズ → レビュー対応で再設計）

### Context
初期実装では `_app.beforeLoad` が `@/lib/server/currentUser` を直接動的 import していた:

```ts
beforeLoad: async ({ location }) => {
  const { getCurrentUser } = await import("@/lib/server/currentUser");
  const user = await getCurrentUser();
  ...
}
```

ブラウザ検証で `<Link>` 経由の SPA 遷移時に `TypeError: getCurrentUser is not a function` が発生。TanStack Router の `beforeLoad` は **SSR 時はサーバー、SPA 遷移時はクライアント** で実行される。`@/lib/server/currentUser` は冒頭で `import "@tanstack/react-start/server-only"` しており、クライアントバンドルでは中身が削除され stub になる。`loadAppShellChrome` 側は `createServerFn` 経由で RPC として呼ばれるため server-only に安全だが、`beforeLoad` 直接 import はその保護を失っていた。

結果: SPA 遷移で `_app.errorComponent` が AppShell ごと画面全体を置き換え、Issue 本来の目的（AppShell 再マウント抑制）と真逆の挙動になる。

### Decision
auth ガードを `createServerFn` でラップした `resolveAppAuth` に切り出し、`beforeLoad` からは RPC として呼ぶ。

```ts
const resolveAppAuth = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ pathname: z.string() })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    return {
      isAuthenticated: user !== null,
      normalized: normalizeAuthGuardPathname(data.pathname),
    };
  });

beforeLoad: async ({ location }) => {
  const { isAuthenticated, normalized } = await resolveAppAuth({ data: { pathname: location.pathname } });
  if (normalized !== "/" && !isAuthenticated) {
    throw redirect({ to: "/", search: HOME_SEARCH });
  }
},
```

### Consequences
- **良い点:**
  - SSR / SPA 遷移どちらでも RPC として実行され、server-only モジュールに安全にアクセスできる
  - `__root.tsx` の `beforeLoad: () => loadAppContext()` パターンと整合（auth context も同じ流路）
  - `pathname` を server fn 引数として明示的に渡すことで、client → server 境界が型レベルで明確
- **トレードオフ:**
  - SPA 遷移時に 2 つ目のラウンドトリップが発生（`resolveAppAuth` と `loadAppShellChrome`）
  - 将来余裕があれば 1 つの server fn に統合できるが、責務分離（auth guard vs chrome 取得）を優先して別 fn のまま運用
- **教訓 / プロジェクトルール候補:**
  - **`beforeLoad` / `loader` から `server-only` モジュールを直接 import しない**。必ず `createServerFn` でラップする
  - 既存ルートを参考にする時は `__root.tsx` の `loadAppContext` パターンを基準にする

---

## ADR-006: 未認証 redirect 先

### Status
Accepted

### Context
現状の 9 ルートすべて（grep 確認済）が `throw redirect({ to: "/", search: HOME_SEARCH })` で `/` ランディングに戻している。`/login` ではない。

初稿では `_app.beforeLoad` で「`user === null` → `/login` へ redirect」と書いていたが、これは既存挙動の破壊的変更になる:
- ログイン後に元のページに戻れない（`?next=` 等の保持機構なし）
- URL 共有時に常にログインフォームが直接出る

### Decision
既存どおり **`/` + `HOME_SEARCH`** に redirect する。`/login` への変更は本 Issue ではスコープ外。`/login` への切り替えは別 Issue で「ログイン後リダイレクト先の保持（`?next=` / `redirectTo` パラメータ）」の設計と一緒に検討すべき。

### Consequences
- **良い点:**
  - 既存挙動の保持（破壊的変更なし）
  - `/` 着地時にランディングが出る → そこからログインへ進む既存 UX を保つ
- **トレードオフ:**
  - 未認証 URL を踏んだ際に直接 `/login` に行く UX が欲しい場合は別 Issue で対応

---

## ADR-008: auth ガードと chrome ロードを 1 つの loader server fn に統合

### Status
Accepted（レビューフェーズで追加。ADR-007 を置き換え）

### Context
ADR-007 で `beforeLoad` を `resolveAppAuth` server fn でラップし、`loader` の `loadAppShellChrome` と並列に 2 つの server fn を持つ構造にした。これで SPA 遷移時の server-only モジュール参照は安全になったが、レビュー (W-P-001) で「`beforeLoad` は `staleTime` の影響を受けず毎回実行されるため、SPA 遷移ごとに `resolveAppAuth` の RPC が 1 ラウンドトリップ走り、`_app.loader` の `staleTime: Infinity` 恩恵が半減する」と指摘された。

加えて W-P-005 で「`pathname` を毎回 server fn 引数として送るのは過剰（判定はクライアント実行可能）」、W-P-004 で「`getCurrentUser` の `cache()` 共有は server fn 境界をまたぐと保証なし」も指摘された。

### Decision
`beforeLoad` を **同期のクライアント側 helper** に絞り、`isLandingPath` を `context` に積むだけにする。auth check + chrome 取得 + redirect を 1 つの server fn `loadAppShell` に集約し、`loader` から呼ぶ。

```ts
const loadAppShell = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ isLandingPath: z.boolean() })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) {
      if (!data.isLandingPath) {
        throw redirect({ to: "/", search: HOME_SEARCH });
      }
      return { userDto: null, header: null, sidebar: null };
    }
    // ... render Header/Sidebar
  });

beforeLoad: ({ location }) => ({
  isLandingPath: normalizeAuthGuardPathname(location.pathname) === "/",
}),
loader: ({ context }) => loadAppShell({ data: { isLandingPath: context.isLandingPath } }),
```

### Consequences
- **良い点（W-P-001 解消）:**
  - 初回 `_app` 進入時に 1 RPC、`staleTime: Infinity` のおかげで以降の SPA 遷移は 0 RPC
  - `beforeLoad` はクライアント実行可能な軽い計算のみ。`server-only` モジュール参照なし
- **W-P-005 解消:**
  - `pathname` 文字列を server fn 引数に送らず、`isLandingPath: boolean` のみ
- **W-P-004 解消:**
  - `getCurrentUser` は `_app.loader` 内で 1 回。リーフ側との重複は ADR-009 で扱う
- **トレードオフ:**
  - redirect が loader フェーズ判定になる（`beforeLoad` redirect の即時性は失われる）が、`_app.loader` は初回 nav で 1 回しか走らないため実害なし
  - `_app.beforeLoad` の context (`isLandingPath`) と `_app.loader` の deps が独立する設計。`loaderDeps` を使わず `context` 経由で渡すことで、loader の再評価を防ぎつつ最新の `isLandingPath` を伝える

### 教訓 / プロジェクトルール候補
- ルートの `beforeLoad` / `loader` から `server-only` モジュールを直接 import しない（ADR-007 から継続）
- `beforeLoad` はクライアントでも走ることを前提に、auth 等の重い処理は `loader` 経由 server fn に寄せる
- `staleTime` の効果を最大化したい layout route では `beforeLoad` を context 計算のみに留める

---

## ADR-009: リーフ側の defensive `getCurrentUser` + 1 行 redirect を意図的に残す

### Status
Accepted（レビューフェーズで追加）

### Context
ADR-005 では「leaf の server fn handler は `getCurrentUser` + `toUserDTO` を呼び続ける（redirect ガードのみ削除）」としていた。実装では W-A-003 の指摘どおり「`if (user === null) throw redirect({ to: "/", search: HOME_SEARCH })` を 1 行 defensive ガードとして残す」形になっており、ADR-005 の文言と乖離していた。

このガードは:
- `_app.beforeLoad`（同期 helper）と `_app.loader` が初回 1 回しか走らないため、セッション失効時（例: 別タブでログアウト）に `_app.loader` の cached `userDto` が stale になっても、リーフ側で fail-closed する唯一の保証
- セキュリティレビュー (W-A-001) でも「leaf 側 1 行 defensive guard は意図的に残す方向で正しい」と判断

### Decision
リーフの defensive guard を **意図的に残す**。コードコメントは「Defensive: `_app.beforeLoad` guarantees a user here, but keep a 1-line fail-safe so a future routing change cannot leak through」と既存どおり保持。

### Consequences
- **良い点:**
  - セッション失効時に leaf 単位で fail-closed
  - `_app.loader` の cache が stale になる W-A-001 シナリオでも、機密 RPC へのアクセスは leaf 段階で遮断される
  - 将来 `_app` 構造を変えた場合の safety net
- **トレードオフ:**
  - 各 leaf で `getCurrentUser` が呼ばれる（同一リクエスト内で `cache()` が効くケースは安く、効かないケースは DB ヒット 1 回）。`_app.loader` 統合（ADR-008）後も leaf 側は変更しない
  - ADR-005 が更新前なので、本 ADR で上書きする位置付け

---

## ADR-010: `router.invalidate()` ノーフィルター呼び出しの整理を別 Issue 化する

### Status
Accepted（レビューフェーズで追加。本 Issue ではスコープ外）

### Context
レビュー B-P-001 で、コードベース内に `router.invalidate()` のノーフィルター呼び出しが 30+ 箇所残っており、これが TanStack Router の `staleTime: Infinity` を上書きして全マッチを invalid 化することが指摘された。結果として:

- DirectoryTree rename、note bulk action、publish settings、identity プロフィール更新等の mutation 後に `_app` も invalidate される
- `_app.loader` が再評価され、Sidebar の `loadDirectoryTree` が DB ヒット
- 「リーフ遷移時に AppShell が保持される」という Issue #293 の主目的は達成されているが、「mutation 後も保持される」というさらに強い不変条件は満たせない

### Decision
本 Issue のスコープ「ページ遷移時の AppShell 再マウント抑止」は manual-test で確認済み。30+ 箇所の機械的置換 + ヘルパー新設は本 Issue とは別の問題（mutation キャッシュ管理戦略）として切り出す。

別 Issue「`router.invalidate()` のフィルタ化で AppShell 持続化を強化する」を起票し、以下のスコープで継続検討する:
- `router.invalidate({ filter: r => r.routeId !== "/_app" })` の薄いラッパーを `app/components/common/` に追加
- 30+ 箇所の call site を Sidebar 表示に影響する mutation（directory/tag 関連）と影響しない mutation で分類
- 後者をラッパー経由に置換

### Consequences
- **良い点:**
  - 本 PR のレビュー粒度を保つ（30+ ファイル差分を 1 PR に含めない）
  - mutation キャッシュ管理戦略として独立に議論できる
- **トレードオフ:**
  - mutation 後の AppShell 再評価コストは継続する（Issue #293 の主目的は満たしているが、フォローアップ Issue 解消まで実体験は中途半端）

---
