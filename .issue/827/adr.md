# ADR — Issue #827: RootDocument 二重描画の解消手段

## ADR-001: `shellComponent` によるシェル一元化を採用する

### Status
Proposed

### Context

root ルート（`app/routes/__root.tsx`）は現在、`component` / `errorComponent` / `notFoundComponent` の 3 つがそれぞれ独立に `RootDocument`（`html>head+body` シェル）を包む構造になっている。この構造は「error/notFound 画面でもシェル（`<html lang>`・head メタ・`Scripts`・`RouteProgressBar`）を必ず持たせる」という意図（Issue #293 / #819 由来）で作られた。

しかし TanStack Router (`@tanstack/react-router@1.170.15`) の `Match.js` を精査した結果、root の **`notFoundComponent` は component の `<Outlet/>` の内側**に描画されることが判明した（`globalNotFound` が立つと `Outlet` が子マッチではなく `renderRouteNotFound(rootRoute)` を返す。L282-283）。そのため `/notes` のような未定義 URL では `RootComponent` の `RootDocument` の内側にさらに `notFoundComponent` の `RootDocument` が入れ子で描画され、`html/head/body` が二重化 → `<meta charset>` / `<meta name="viewport">` / `RouteProgressBar` が各 2 個出力される（Issue #827 の症状）。一方 `errorComponent` は React error boundary（`CatchBoundary`）位置に描画されるため二重化しない。この非対称性が問題の核心。

選択肢：

- **A. `shellComponent` にシェルを一元化する（採用）** — TanStack Start が root 専用に提供する `shellComponent`（`route.d.ts` の `RootRouteOptionsExtensions.shellComponent`、`Match.js` L78 が root マッチのマッチツリー全体＝component・error 境界・notFound 境界の外側を一度だけラップ）にシェルを移す。component/error/notFound はシェル内側のコンテンツだけを返す。
- **B. `notFoundComponent` だけシェルラップを外す** — `notFoundComponent` は Outlet 内（＝既にシェルの内側）に出るのでラップ不要、という個別対症。`component`/`errorComponent` は現状維持。
- **C. `/notes` に専用ルート/リダイレクトを新設する** — `_app/notes/index.tsx` を作り `/` へ redirect し、`/notes` が notFound にならないようにする。

### Decision

**案 A（`shellComponent` 一元化）を採用する。**

- `createRootRoute` に `shellComponent: RootDocument` を追加し、`RootDocument` はマッチツリー全体を包む唯一の外殻とする。
- `component`（`RootComponent`）は `<Outlet/>` のみ、`errorComponent` は `<ErrorPage kind="system"/>` のみ、`notFoundComponent` は `<ErrorPage kind="notFound"/>` のみを返す。

理由：

- シェルの唯一性を**構造的に保証**する。`shellComponent` は component・error 境界・notFound 境界すべての外側にあるため、どの描画状態でもシェルは 1 組だけ。`globalNotFound` 経路の二重化が原理的に消える。
- 「error/notFound でもシェルを持つ」という既存意図を**維持・強化**する。シェルが常に error 境界の外側にあるため、root component が throw してもシェルは残る（現構造では errorComponent の RootDocument が別途描画されて担保していたのを、より堅い形に置き換える）。
- フレームワークが当該用途のために用意した公式 API を使う正攻法であり、`/notes` に限らず**あらゆる未定義 URL・root error 経路**を一括で正す。

### Consequences

- 良い点:
  - `/notes` を含む全 notFound/error 経路で charset/viewport/progressbar が単一化し、invalid HTML（重複 charset）が解消。RootDocument の二重描画も消えレンダリング効率が改善。
  - シェルカバレッジ（error/notFound でも `<html>`/head/Scripts を持つ）が構造的に保証され、意図が読み取りやすくなる。
  - 変更が `app/routes/__root.tsx` に閉じ、他レイヤ・他ルートに波及しない。
- トレードオフ:
  - SSR 出力の DOM ラップ位置が変わるため、hydration ミスマッチが出ないことを目視確認する必要がある（plan のテスト方針で担保）。
  - `shellComponent` は TanStack Start のバージョン依存 API。現行版で型・実装ともに確認済みだが、将来のメジャー更新時は追随が要る。

### 却下した案

- **案 B（notFoundComponent だけ外す）:** 症状（`/notes` の二重 charset）は消えるが、シェルの唯一性が「3 コンポーネントの手作業の一貫性」に依存したままで、`component` と `errorComponent` が各自シェルを持つ非対称構造が残る。将来 pending 状態などで同種の二重化を再発させるリスクがあり、根治にならない。
- **案 C（`/notes` リダイレクト新設）:** `/notes` 単体の 404 を回避するだけで、他の未定義 URL・root error の二重描画は放置される band-aid。Issue の主題である「RootDocument 二重描画」という構造欠陥を解決しない。`/notes` を UX 上どこへ誘導するかは本 Issue とは別問題（スコープ外）。

---
