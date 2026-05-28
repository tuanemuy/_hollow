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

## ADR-007: `beforeLoad` の auth ガードを server fn でラップする

### Status
Accepted（実装フェーズで追加）

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
