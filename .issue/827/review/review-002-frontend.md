# レビュー (Round 2) — Issue #827 / PR #830（Frontend / Presentation 観点）

対象: `app/routes/__root.tsx`（アプリソースの変更はこの1ファイルのみ。他は `.issue/827/` の計画・ADR・manual-test ドキュメント）
基準: `origin/main` … `origin/issue/827/root-shell-dedup`（PR head）。`RouteProgressBar` は #819/#826 で既に main の `RootDocument` へ導入済みで、本 PR の差分には import 追加は無い。
前ラウンド: `review-001-frontend.md`（W-001 反映済み）。本レビューはゼロベースのフル再レビュー。

## 総評

`shellComponent` へのシェル一元化は ADR-001 / plan の設計判断に完全に忠実で、TanStack Router `1.170.15` の型・実装（`route.d.ts` L18-20 / `Match.js` L78）と厳密に整合する。`component` / `errorComponent` / `notFoundComponent` はいずれもシェル内側のコンテンツだけを返す構造へ変わり、`globalNotFound` 経路（`notFoundComponent` が root component の `<Outlet/>` 内に描画される）での `RootDocument` 二重ネストが原理的に解消されている。typecheck / lint（当該ファイル）パス、manual-test で AC-1〜AC-6 実測 PASS。Round 1 の W-001（コメント重複）は反映済みで、残る重複は無害な範囲。**新規の Blocker / Warning なし。**

### Frontend / Presentation

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** 型一致を再確認。`RootDocument({ children }: { children: ReactNode })` は `route.d.ts` の `RootRouteOptionsExtensions.shellComponent?: ({ children }: { children: React.ReactNode }) => React.ReactNode`（`node_modules/@tanstack/react-router/dist/esm/route.d.ts:18-20`）と厳密一致。JSX 返却も `ReactNode` に適合。`shellComponent: RootDocument` は関数参照として型整合。
- **[N-002]** 描画機序を実バージョンのソースで裏取り。`Match.js:78` は `route.isRoot ? route.options.shellComponent ?? SafeFragment : SafeFragment` で **root マッチのみ** shellComponent を消費し、その内側に `matchContext.Provider > Suspense > CatchBoundary(error) > CatchNotFound(notFound) > MatchInner(component)` を配置する。つまりシェルは component・error 境界・notFound 境界すべての外側に一度だけ位置し、シェルの唯一性が構造的に保証される。非 root マッチでは `SafeFragment` なので二重描画は起こらない。
- **[N-003]** シェルカバレッジは維持どころか強化。`shellComponent` は `CatchBoundary` の外側にあるため、root の `beforeLoad`（`resolveAppContext`）や component が throw して `errorComponent` に落ちてもシェルは必ず残る。静的な `RootDocument` は throw し得ず、旧構造（`errorComponent` 自身が `RootDocument` を再描画して担保）より堅い。manual-test AC-5（`loadAppContext` throw で html=1・progressbar=1）で実証。
- **[N-004]** `component` / `errorComponent` / `notFoundComponent` はいずれもシェル要素（`<html>/<head>/<body>/HeadContent/Scripts`）を一切描画せず、コンテンツのみを返す構造に統一されている。`RootComponent` は `<Outlet/>` のみ、error/notFound は `ErrorPage` のみ。`ErrorPage`（`app/components/public/ErrorPage.tsx`）→ `PublicLayout` もシェルを描画しない（grep でシェル要素なし）ため、シェルを二重に持たない前提が全経路で成立。
- **[N-005]** `HeadContent` / `Scripts` / `RouteProgressBar` / DEV `TanStackRouterDevtools` / `beforeLoad`（`resolveAppContext`）/ `head()`（`buildHead` + canonical 除去）は意味変更なしの移設のみ。`RootDocument` の body 構造（`RouteProgressBar → {children} → DEV Devtools → Scripts`）は旧版と同一で、変わったのはラップ位置（`component` 内 → `shellComponent`）とコメント文言だけ。これらは `useRouter` / `useRouterState`（router context）に依存し `matchContext` には依存しないため、`matchContext.Provider` の外側（shellComponent）へ移設しても正常動作する。manual-test（実在ルートで meta=1）で裏付け。
- **[N-006]** 未使用 import なし。`Outlet` は `RootComponent` の `<Outlet/>` で継続使用、`HeadContent`/`Scripts`/`ReactNode`/`createRootRoute` も継続使用。`RootDocument` は `shellComponent` から参照され続ける。arrow 化した error/notFound から `RootDocument` 参照が消えたが、`shellComponent` が参照するため未使用にならない。
- **[N-007]** Round 1 W-001（`shellComponent` コメントと `RouteProgressBar` コメントの重複）は反映済み。`RouteProgressBar` のコメントは「Placed in `RootDocument` (not `RootComponent`)」から「Lives in the shell so it also covers …」へ簡潔化された。残るのは「covers error/notFound screens」という語の軽微な重なりのみだが、shellComponent 側は「シェルの単一性＋error 境界外に位置する強い保証」、RouteProgressBar 側は「バーが再ナビゲーションをカバー＋idle 時は `opacity-0` で inert」と主題が異なり、それぞれ固有情報を持つ。過剰ではなく再指摘不要。
- **[N-008]** `shellComponent` 直上コメント（9行）は長めだが、`Match.js` の非自明な描画機序（notFound が `Outlet` 内に出て二重ネストする非対称性）という「なぜこの構造か」の WHY を記録しており、CLAUDE.md「WHY のみ」方針に適合。設計根拠ポインタ（#827 / ADR-001）も MEMORY 規約どおり保持。
- **[N-009]** manual-test の検証カバレッジ（`/notes`・一般未定義 URL `…xyz`・`/notes/` 正規化・実在 `/`・`/login`・root error の5系統）は AC-1〜AC-6 を過不足なく被覆。notFound 経路で `main`（app コンテナ）=0 なのは `PublicLayout` が `<main>` を描画しない**既存挙動**であり、旧構造でも同じ `ErrorPage` を使っていたため本 PR による回帰ではない。root error 経路で charset/viewport=0 なのは config ロード失敗時に `head()` が `if (!config) return { links: baseLinks }` で meta を出さない既存挙動（`head()` は本 PR 未変更）で、二重化（本件主題）とは別軸・スコープ外との整理は妥当。

## 検証ログ（このレビューで実施）
- `git diff origin/main...origin/issue/827/root-shell-dedup -- app/routes/__root.tsx`: アプリソース変更は当該1ファイルのみ、差分は shellComponent 追加・3コンポーネントの RootDocument ラップ除去・コメント2箇所更新に限られることを確認。
- `grep -rn "<html|shellComponent|RootDocument|createRootRoute" app/`: html シェルを描画するのは `__root.tsx` のみ（`htmlRenderer.ts` はノート export アダプターで無関係）。
- `node_modules/@tanstack/react-router/dist/esm/route.d.ts:18-20` の `shellComponent` 型と `RootDocument` シグネチャの一致を目視確認。
- `node_modules/@tanstack/react-router/dist/esm/Match.js:67-105` の `MatchView` 構造で shellComponent が matchツリー全体（matchContext.Provider / Suspense / CatchBoundary / CatchNotFound / MatchInner）の外側に一度だけ位置することを確認。
- `ErrorPage.tsx` / `PublicLayout` がシェル要素を描画しないことを確認。

## サマリー
Blockers: 0 / Warnings: 0 / Notes: 9
