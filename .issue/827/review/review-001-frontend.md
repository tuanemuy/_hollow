# レビュー — Issue #827 / PR #830（Frontend / Presentation 観点）

対象: `app/routes/__root.tsx`（アプリソースの変更はこの1ファイルのみ）
基準: `origin/main`（`RouteProgressBar` は #819/#826 で既に main の `RootDocument` に導入済み。本 PR での新規 import 追加は無い）

## 総評

`shellComponent` へのシェル一元化は ADR-001 / plan の設計判断に忠実で、TanStack Router `1.170.15` の型・実装と整合している。`component` / `errorComponent` / `notFoundComponent` はいずれもシェル内側のコンテンツだけを返す構造に変わり、`RootDocument` の二重ネストが原理的に解消されている。typecheck・lint（当該ファイル）ともにパス、manual-test で AC-1〜AC-6 が実測 PASS。Blocker なし。

### Frontend / Presentation

#### Blockers
- なし

#### Warnings
- **[W-001]** `shellComponent` コメント（9行）と `RouteProgressBar` コメント（5行）で説明が一部重複している（両者とも「shellComponent が component/error/notFound 境界の外側に一度だけ位置する」旨を再説）。
  - 場所: `app/routes/__root.tsx:90-98`（shellComponent 直上）および `app/routes/__root.tsx:118-122`（RouteProgressBar 直上）
  - 理由: プロジェクト方針は「default to no comments / WHY のみ / 過剰にしない」。ここは Match.js の非自明な描画機序（notFound が Outlet 内に出て二重ネストする）を記録する価値があり、コメント自体は正当。ただし同じ「境界の外側」説明が二箇所にあり、片方は圧縮できる余地がある。
  - 提案: shellComponent 側に構造理由（二重ネスト解消の WHY）を集約し、RouteProgressBar 側は「配置理由は shellComponent のコメント参照」程度に短縮すると重複が消える。設計根拠として #827/#819/ADR-001 の参照ポインタは両方残してよい（MEMORY 規約）。任意対応でよく、マージ阻害要因ではない。

#### Notes
- **[N-001]** `RootDocument({ children }: { children: ReactNode })` のシグネチャは `route.d.ts` の `RootRouteOptionsExtensions.shellComponent?: ({ children }: { children: React.ReactNode }) => React.ReactNode`（`node_modules/@tanstack/react-router/dist/esm/route.d.ts:18-20`）と厳密に一致。`ReactNode` 返却も適合。`pnpm typecheck`（tsgo）はエラーなしで通過。
- **[N-002]** シェルカバレッジは維持どころか強化されている。`shellComponent` は `Match.js` の `CatchBoundary`（error 境界）の外側に位置するため、root component/loader が throw して `errorComponent` に落ちてもシェルは必ず残る。旧構造は `errorComponent` 自身が `RootDocument` を再描画して担保していたが、静的シェルが常に error 境界外にある新構造の方が堅い。manual-test AC-5（`loadAppContext` を throw させた root error 経路で html=1・progressbar=1）で実証済み。
- **[N-003]** `HeadContent` / `Scripts` / `RouteProgressBar` / DEV `TanStackRouterDevtools` / `beforeLoad`（`resolveAppContext`）/ `head()`（`buildHead` + canonical 除去）はいずれも意味変更なしの移設のみ。`RootDocument` の body 構造は旧版と同一で、変わったのはラップ位置（component → shellComponent）とコメントだけ。`beforeLoad`/`head()` は無変更。
- **[N-004]** 未使用 import なし。`Outlet` は `RootComponent` が `return <Outlet />` で引き続き使用、`HeadContent`/`Scripts`/`ReactNode` も継続使用。`app/routes/__root.tsx` の Biome lint は「No fixes applied」。
- **[N-005]** `errorComponent` / `notFoundComponent` が返す `ErrorPage`（`app/components/public/ErrorPage.tsx`）は `<html>/<head>/<body>/Scripts/HeadContent` を一切描画せず（grep 一致は `htmlFor` のみ）、コンテンツのみを返す。シェルを二重に持たない前提が成立している。
- **[N-006]** SSR ドキュメント描画のエントリが `component`（旧 `RootComponent → RootDocument`）から `shellComponent` へ移った点は DOM ラップ位置の変化を伴うが、manual-test AC-6 で hydration mismatch / text content mismatch のコンソールエラーが無いことを確認済み（残る warning は `_app/route.tsx` の code-split 由来で本件無関係）。実在ルート（`/`・`/login`・`/notes/$noteId` 系）でも各要素 1 個で回帰なし（AC-3 PASS）。
- **[N-007]** manual-test 報告の「root error 経路で charset/viewport=0」は、config ロード失敗時に `head()` が `if (!config) return { links: baseLinks }` で meta を出さない既存挙動によるもの。本 PR は `head()` 未変更でありスコープ外との整理は妥当。検証カバレッジ（`/notes`・一般未定義 URL・`/notes/` 正規化・実在ルート・root error の5系統）は AC-1〜AC-6 を過不足なく被覆している。

## 検証ログ（このレビューで実施）
- `git diff origin/main..origin/issue/827/root-shell-dedup -- app/routes/__root.tsx`: アプリソース変更は当該1ファイルのみを確認。
- `pnpm typecheck`（tsgo）: エラーなし。
- `npx biome lint app/routes/__root.tsx`: 修正・警告なし。
- `route.d.ts` の `shellComponent` 型と `RootDocument` シグネチャの一致を目視確認。
- `ErrorPage.tsx` がシェルを描画しないことを確認。

## サマリー
Blockers: 0 / Warnings: 1 / Notes: 7
