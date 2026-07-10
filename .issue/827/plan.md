# 実装計画 — Issue #827: RootDocument が特定ルート（/notes）で二重描画され head メタ（charset/viewport）が重複する

**Issue:** #827
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

root ルート（`app/routes/__root.tsx`）の `component` / `errorComponent` / `notFoundComponent` が各自 `RootDocument`（`html>head+body` シェル）を包む現構造をやめ、シェルを TanStack Start の `shellComponent`（root 専用のマッチツリー外殻）に一元化することで、notFound・error 到達時に `RootDocument` が二重描画されて `<meta charset>` / `<meta viewport>` などが 2 個出力される問題を根本から解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 認証済みで `/notes` を開いたとき、クライアント DOM 上で `<meta charset>` = 1、`<meta name="viewport">` = 1、`RouteProgressBar` = 1、ErrorPage（notFound）コンテナ = 1 になる | Issue 本文の再現表 | 1, 4 |
| AC-2 | `/notes` は従来どおり notFound 画面（`<ErrorPage kind="notFound">`）を単一シェル内に表示する（機能退行なし） | Issue 本文（notFound 経路の維持）+ ADR 意図 | 1, 4 |
| AC-3 | 実在ルート（`/`、`/notes/$noteId`、`/notes/$noteId/edit` 等）で charset/viewport/progressbar/アプリコンテナが従来どおり各 1 個のまま（回帰なし） | Issue 本文の対照表 | 1, 4 |
| AC-4 | 任意の未定義 URL（`/notes` に限らず）で root notFound がシェルを保ったまま単一描画される（`/notes` はその一例に過ぎないため一般ケースを検証） | 原因分析（globalNotFound 一般） | 1, 4 |
| AC-5 | root の `component` / loader が throw した場合でも、error 画面（`<ErrorPage kind="system">`）が `html>head>body` シェル内に表示される（error/notFound シェルカバレッジの維持） | ADR 意図（シェルを持つ error/notFound 画面） | 1, 4 |
| AC-6 | `<html lang="ja">`、favicon/manifest リンク、stylesheet、`HeadContent`、`Scripts`、`RouteProgressBar` が全ルートで従来どおり 1 組出力され、SSR→hydration でミスマッチが出ない | 既存挙動の維持 | 1, 4 |
| AC-7 | `pnpm typecheck && pnpm lint && pnpm test` が通る | 常設品質ゲート | 4 |

## スコープ

### 含まれないもの
- `/notes` に対する専用ルート（`_app/notes/index.tsx`）やリダイレクトの新設。これは `/notes` 単体の 404 を「意図した画面」に変えるだけで、他の未定義 URL・root error 経路の二重描画は残す band-aid になる。本 Issue の主題は「RootDocument 二重描画」という構造欠陥であり、`shellComponent` 化で `/notes` を含む全 notFound/error 経路を一括で正すため、リダイレクト新設は不要（ADR-001 の「却下案」参照）。`/notes` を UX 上どこかへ誘導したいかは別 Issue。
- `_app` レイヤやリーフルート個別の `errorComponent` / `notFoundComponent` の構造変更。これらは Outlet 位置に描画されるためシェル二重化とは無関係で、現状維持。
- head メタ生成ロジック（`buildHead` / `app/core/presentation/head.ts`）や canonical 除去ロジックの変更。重複の原因はシェルの二重描画であってメタ生成ではないため触らない。
- `RouteProgressBar` 自体の挙動・配置意図（#819 / ADR）の変更。シェル一元化で自然に単一化されるだけ。

## 調査結果

### 真の原因（ソースで確定）

`/notes` に一致する leaf ルートは存在しない（`_app/notes/` 配下は `new.tsx`・`$noteId/*` のみで `index.tsx` が無い。ノート一覧は `/`＝`_app/index.tsx`）。よって `/notes` は router がどの子にもマッチできず、root マッチに `globalNotFound` が立つ。

TanStack Router `@tanstack/react-router@1.170.15` の `dist/esm/Match.js` を読んで描画機序を確定した：

- `MatchView`（同ファイル L67-105）は root マッチを **`shellComponent`（無ければ `SafeFragment`）でラップ**し、その内側に `matchContext.Provider > Suspense > CatchBoundary > CatchNotFound > MatchInner` を配置する。つまり `shellComponent` は component・error 境界・notFound 境界の**すべての外側**に一度だけ描画される。
- `MatchInner`（同 L128-）は root の `component`（＝`RootComponent`）を描画。`RootComponent` は `<RootDocument><Outlet/></RootDocument>`。
- `Outlet`（同 L256-）は `parentGlobalNotFound` を読み、root マッチで `globalNotFound === true` のとき **子マッチではなく `renderRouteNotFound(router, rootRoute)` を返す**（L282-283）。これは root の `notFoundComponent`＝`<RootDocument><ErrorPage/></RootDocument>` を描画する。

結果、`/notes` の描画木は次のように **`RootDocument` が入れ子で 2 回**現れる：

```
shellComponent(なし=SafeFragment)
└ RootComponent
  └ RootDocument#1  (html/head[charset,viewport]/body[RouteProgressBar, Scripts])
    └ Outlet (globalNotFound)
      └ notFoundComponent
        └ RootDocument#2  (html/head[charset,viewport]/body[RouteProgressBar, Scripts])
          └ ErrorPage kind="notFound"   ← アプリコンテナは 1 個
```

ブラウザは入れ子 `html/head/body` をフラット化するため、**charset=2 / viewport=2 / progressbar=2、ErrorPage=1** となり、Issue の計測（`.issue/819/manual-test/results/analysis.md`）と完全に一致する。実在ルート（`/notes/$noteId` 等）は `globalNotFound` が立たず Outlet が実マッチを描画するため `RootDocument` は 1 個。**メインエージェントの仮説は正しい**ことをソースで裏付けた。

対して root の **`errorComponent`** は `CatchBoundary`（React error boundary、`shellComponent` の内側 L83-105）が捕捉して Outlet 位置ではなく境界位置に描画する。root component が throw してもシェルを保ちたい、という現構造の意図（error/notFound でもシェルを持つ）はこの `errorComponent` 経路に由来する。`notFoundComponent` は「Outlet 内（＝component の内側）に描画される」点が `errorComponent` と決定的に異なり、ここに二重化の非対称性がある。

### あるべきアーキテクチャ

- 本件は presentation 層（TanStack ルート）の描画木の問題。プロジェクトは TanStack Start / RSC を採用（CLAUDE.md「Frontend」）。
- `<html><head><body>` シェルは概念的に「マッチツリー全体を包む唯一の外殻」であり、component / error / notFound のいずれの状態でも 1 組だけ存在すべき。TanStack Start はまさにこの用途に root 専用オプション **`shellComponent`** を提供している（`node_modules/@tanstack/react-router/dist/esm/route.d.ts` L17-20 で `RootRouteOptionsExtensions.shellComponent?: ({children}) => ReactNode` として型定義。`Match.js` L78 が root マッチのみで消費）。
- したがって「あるべき姿」は、シェルを `shellComponent` に一元化し、`component`/`errorComponent`/`notFoundComponent` はシェル内側のコンテンツ（`Outlet` / `ErrorPage`）だけを返すこと。これにより error/notFound のシェルカバレッジは**維持されつつ**（むしろシェルが常に error 境界の外側にあるため保証が強くなる）、二重描画が消える。

### 既存実装の状態

- `app/routes/__root.tsx` のみが `RootDocument` / `RootComponent` を定義・使用（`grep` で他参照なし）。`__root` 構造を直接検証するテストは無い（`_app/__tests__/AppErrorFallback.test.tsx` は `_app` レイヤ対象で無関係）。影響は当該ファイルに閉じる。
- あるべき姿（単一シェル）との乖離：現在は 3 コンポーネントが各自シェルを包む重複構造。本 Issue で `shellComponent` へ寄せて解消する。

### 依存関係

- 変更は `app/routes/__root.tsx` に閉じる。`HeadContent` / `Scripts` / `RouteProgressBar` / `buildHead` / side-effect import 群・`beforeLoad`・`head()` はいずれも移設のみで意味変更なし。
- SSR 出力の DOM 構造が僅かに変わる（シェルのラップ位置）ため hydration の目視確認が必要。

## 設計

### ドメインモデルへの影響
なし。純粋に presentation 層（ルート描画木）の構造変更で、ドメイン・アプリケーション・アダプターには一切触れない。

### ユースケース / アプリケーションロジック
なし。`loadAppContext`（config 取得 server fn）と `resolveAppContext` のキャッシュ戦略（#296）は現状のまま維持する。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

`app/routes/__root.tsx` の root ルート定義を次の構造へ変更する（シェルの一元化）。

- **`shellComponent: RootDocument`** を `createRootRoute` に追加。`RootDocument` は `{ children }` を受け取り、`<html lang="ja"><head><HeadContent/></head><body><RouteProgressBar/>{children}{DEV?<Devtools/>:null}<Scripts/></body></html>` を返す（＝現行 `RootDocument` の中身をそのまま流用。props は現行と同じ `{ children: ReactNode }`）。
- **`component`**: `RootComponent` は `<Outlet />` のみを返す（`RootDocument` ラップを外す）。
- **`errorComponent`**: `<ErrorPage kind="system" message={sanitizeRouteError(error)} />` のみを返す（`RootDocument` ラップを外す）。
- **`notFoundComponent`**: `<ErrorPage kind="notFound" />` のみを返す（`RootDocument` ラップを外す）。

描画木は次の単一シェル構造になる（notFound の例）：

```
shellComponent = RootDocument  (html/head[charset,viewport 各1]/body[RouteProgressBar×1, Scripts×1])
└ CatchBoundary
  └ RootComponent → Outlet (globalNotFound)
    └ notFoundComponent → ErrorPage kind="notFound"   ← すべて 1 個
```

error 経路でも、`errorComponent` は `shellComponent` の内側の `CatchBoundary` に描画されるため、シェルは保たれたまま `ErrorPage kind="system"` が単一表示される（AC-5）。

`shellComponent` は `matchContext.Provider` の外側に描画されるが、`Matches.js` の RouterProvider ツリー内で描画されるため router context は生きている。`HeadContent` / `Scripts` / `RouteProgressBar` はいずれも `useRouter` / `useRouterState`（＝router context）に依存し `matchContext` には依存しないため、移設後も正常動作する（実バージョンのソースで確認済み）。

## 実装ステップ

### 1. root ルートのシェルを `shellComponent` に一元化する

- **対象ファイル:** `app/routes/__root.tsx`
- **変更内容:**
  - `createRootRoute({...})` に `shellComponent: RootDocument` を追加する。
  - `RootDocument` の実装は現行のまま（`html>head[HeadContent]>body[RouteProgressBar, {children}, DEV Devtools, Scripts]`）。`{ children }: { children: ReactNode }` シグネチャは `shellComponent` の型（`({children}) => ReactNode`）と一致するので変更不要。
  - `RootComponent` を `return <Outlet />;` のみに変更（`RootDocument` ラップ除去）。
  - `errorComponent` を `({ error }) => <ErrorPage kind="system" message={sanitizeRouteError(error)} />` に変更（`RootDocument` ラップ除去）。
  - `notFoundComponent` を `() => <ErrorPage kind="notFound" />` に変更（`RootDocument` ラップ除去）。
  - `RouteProgressBar` 配置意図のコメント（現 L118-121）は「`RootDocument`（=`shellComponent`、`RootComponent` ではない）に置くことで error/notFound 画面もカバーする」旨に更新する（参照する Issue 番号は #819 のまま。加えて #827 の shellComponent 化を一言添える）。
- **理由:** `shellComponent` はマッチツリー全体（component・error 境界・notFound 境界の外側）を一度だけ包む root 専用フックであり（`Match.js` L78）、シェルの唯一性を構造的に保証する。これにより `globalNotFound` 経路（root component の Outlet が notFoundComponent を描画する L282-283）でシェルが二重化する現象が消える。

### 2. `import { Outlet }` の使用箇所を確認（既存 import の維持）

- **対象ファイル:** `app/routes/__root.tsx`
- **変更内容:** `Outlet` は既に import 済み（現 L4）。`RootComponent` が `<Outlet/>` を返す変更後も import は不要変更のまま。未使用 import（もし発生すれば）を整理。
- **理由:** lint（Biome）の未使用検出を通すため。実際には既存 import 構成で過不足なし。

### 3. コメント・ADR 参照の整合

- **対象ファイル:** `app/routes/__root.tsx`
- **変更内容:** `errorComponent`/`notFoundComponent` がシェルを持つ意図の根拠を、コメントで「`shellComponent` によりシェルは常に error/notFound の外側に存在」と表現し直す（過剰コメントは避け、WHY のみ）。#827 と ADR-001 への参照ポインタを残す（MEMORY: Issue/ADR 参照は設計根拠なので残す）。
- **理由:** 「error/notFound でもシェルを持つ」既存意図が新構造でどう担保されるかを次の読者に明示するため。

### 4. 品質ゲートと動作検証

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。加えて `pnpm dev` 起動後にブラウザ（agent-browser / manual）で以下を計測：
  - `/notes`（未定義 URL 例）→ charset=1, viewport=1, progressbar=1, ErrorPage(notFound)=1
  - `/` および `/notes/$noteId`・`/notes/$noteId/edit`（実在ルート）→ すべて各 1 個・機能退行なし
  - root error 経路 → ErrorPage(system) がシェル内に単一表示。リーフの loader/component で throw してもリーフ／`_app` の `errorComponent`（`AppErrorFallback` 等）で捕捉され root の `errorComponent` には届かないため、**root の `errorComponent`（`CatchBoundary`）を発火させるには root の `beforeLoad`／loader 段（`resolveAppContext`／`loadAppContext`）を reject させる必要がある**。検証時は `loadAppContext` を一時的に throw させて root error を誘発し、シェルが保たれたまま `ErrorPage kind="system"` が単一表示されることを確認したうえで、確認後に必ず元へ戻す。
- **理由:** SSR→hydration の構造変化に伴うミスマッチが無いこと、AC-1〜AC-7 の充足を確認するため。`.issue/819/manual-test/results/analysis.md` の計測手順を踏襲する。

## 設計判断

シェルの一元化手段として、root 専用の `shellComponent` を採用する（`/notes` 個別リダイレクトや「notFoundComponent だけシェルを外す」対症療法は不採用）。詳細は `adr.md` ADR-001 を参照。

## リスクと注意点

- **hydration ミスマッチ:** SSR 出力の DOM ラップ位置が変わる。`shellComponent` は Start の SSR ドキュメント描画で `Match.js` の共有経路を通るため理屈上は整合するが、`<html>`/`<head>`/`<Scripts>` の位置ずれによる hydration warning が出ないか要目視（AC-6）。
- **全 notFound/error 経路への波及:** 変更は root に閉じるが、影響は「あらゆる未定義 URL の 404」と「root レベル error」全体に及ぶ。`/notes` だけでなく複数の未定義 URL・error 経路で回帰確認する（AC-4/AC-5）。リーフ・`_app` の error/notFound は Outlet 位置描画のため無影響。
- **`shellComponent` の版依存:** 当該オプションは導入済み版（`react-router@1.170.15` / `react-start@1.168.25`）の型・実装で確認済み。将来の TanStack 更新で API が変わる可能性はあるが、現行では公式サポート API であり、TanStack Start の標準 root 構成でも用いられる安定コア API（experimental フラグ付きではない）。
- **`RouteProgressBar` の単一化:** 従来 `/notes` で 2 個だったバーが 1 個になる。#819 の「decorative・完全重なりで実害なし」という評価どおり、単一化は純粋な改善で UX 退行なし。
- **root component/loader が throw した最悪ケース:** `errorComponent` は `shellComponent` 内側の `CatchBoundary` に描画されるためシェルは残る。`shellComponent`（＝静的 `RootDocument`）自体は throw し得ないので、シェル消失リスクは現構造より低い（むしろ堅くなる）。

## テスト方針

- **typecheck / lint / format:** `shellComponent` の型（`({children}) => ReactNode`）と `RootDocument` シグネチャ一致、未使用 import なしを確認。
- **ブラウザ計測（手動 / agent-browser）:** AC-1〜AC-6 を `.issue/819/manual-test` の計測方式（クライアント DOM で charset/viewport/progressbar/アプリコンテナ数を数える）で検証。`/notes`（notFound）・実在ルート・root error の 3 系統を必ず確認。root error 系統は、リーフの throw では root の `errorComponent` に届かない（リーフ／`_app` の error 境界で捕捉される）ため、`loadAppContext`（root `beforeLoad`／loader 段）を一時的に throw させて root error を誘発し、シェルが保たれたまま `ErrorPage kind="system"` が単一表示されることを確認する。確認後は throw の仕込みを必ず元へ戻す。
- **既存ユニットテスト:** `pnpm test` 全通過（`__root` を直接検証するテストは無いが、レンダリング前提に依存する周辺テストが壊れないことを確認）。
- **回帰確認の網羅:** 未定義 URL を `/notes` 以外にも 1〜2 個試し、root notFound の一般ケースが単一シェルになることを確認（AC-4）。

## レビュー履歴

- 1周目: coverage=問題1・提案1 / arch-risk=問題0・提案3。P-001（AC対応ステップ整合）を反映、arch S-001（AC-5検証手順具体化）・S-003（router context 可用性追記）を反映、S-002 を軽微反映。coverage S-001 は AC-1 プロキシで代替のため見送り。両視点とも致命的ブロッカーなしで収束。
