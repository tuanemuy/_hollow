# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #827）

対象: `.issue/827/plan.md` / `.issue/827/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

## 裏取り結果（`shellComponent` API の実在確認）

計画の中核主張（`shellComponent` に一元化すれば二重描画が消える）を、インストール済みの実バージョンでソース確認した。**すべて事実として正しい**。

- **API 実在:** `@tanstack/react-router@1.170.15` の `dist/esm/route.d.ts` L17-20 に
  `RootRouteOptionsExtensions.shellComponent?: ({ children }: { children: React.ReactNode }) => React.ReactNode`
  が確かに存在。plan が主張するシグネチャ（`({children}) => ReactNode`）と一致し、現行 `RootDocument({ children }: { children: ReactNode })` と型互換。`react-start@1.168.25` 同梱。
- **消費経路:** `Match.js` L78 は root マッチのみ
  `route.isRoot ? route.options.shellComponent ?? SafeFragment : SafeFragment`
  で `shellComponent` を **`matchContext.Provider > Suspense > CatchBoundary > CatchNotFound > MatchInner` の最外側**に一度だけラップする。plan の「component・error 境界・notFound 境界すべての外側」記述は正確。
- **二重化の機序:** `Outlet`（`Match.js` L277-283）は `parentGlobalNotFound === true` のとき `renderRouteNotFound(router, route, void 0)` を返す（L283）。`renderRouteNotFound.js` はそれで root の `notFoundComponent` を描画する。現構造では `RootComponent` の `RootDocument` の内側で `notFoundComponent` の `RootDocument` が入れ子になり二重化する、という plan の描画木は正しい。
- **error 経路の非対称性:** `errorComponent` は `Match.js` L76 の `CatchBoundary`（`shellComponent` の内側）で捕捉されるため、root component/loader throw 時も shell は残り単一。plan / ADR の「error は単一、notFound だけ二重」という非対称性の分析は正しい。
- **SSR 特殊経路なし:** サーバーエントリは `@tanstack/react-start/server-entry` の default をそのまま使い、SSR も client も同じ `Matches.js → Match → MatchView` 経路を通る。root の `<html>` を「RootComponent が返す」ことに依存する別個の document 描画は存在しない。よって `<html>` 生成位置は shellComponent へ移しても SSR/CSR で一貫し、hydration の観点でも整合する。
- **router context の可用性（plan が明示していない要確認点を検証済み）:** `HeadContent` / `Scripts` は `useRouter()`（router context）に依存し `matchContext` には依存しない。`RouteProgressBar` の `useRouterState` も同様。`shellComponent` は `matchContext.Provider` の外側だが、`Matches.js` の RouterProvider ツリー内で描画されるため router context は利用可能。**移設後も `HeadContent`/`Scripts`/`RouteProgressBar` は正常動作する**（これは致命的になり得たので検証したが問題なし）。

結論: `shellComponent` は実在し、計画どおりに機能する。しかも `shellComponent: RootDocument` は現行 TanStack Start scaffold の `__root.tsx` 標準形そのものであり、**フレームワークの正準パターン**。案 A は正攻法。

---

#### 問題点（要修正）

**問題点ゼロ。**

致命的問題（`shellComponent` 不在・挙動相違）は無い。API はインストール済み版に実在し、描画木・SSR 消費経路・二重化機序のいずれも plan の記述がソースと一致した。案 A の採用、案 B/C の却下理由、スコープ限定（`/notes` リダイレクトを band-aid として排除）も設計判断として妥当。ドメイン/アプリ/アダプター層に一切触れず presentation 層（root ルート描画木）に閉じる点はレイヤー方向（内向き依存）とも整合。

#### 改善提案（検討推奨）

- **[S-001]** AC-5（root error 経路の検証）の「一時的に throw を仕込む」手順を具体化する。
  - 理由: リーフ loader/component で throw しても、それはリーフの error 境界（`_app` の `AppErrorFallback` 等）で捕捉され、root の `errorComponent`（`ErrorPage kind="system"`）には到達しない。root の `CatchBoundary` に到達させるには **root の `beforeLoad`（=`resolveAppContext`/`loadAppContext`）を reject させるか、root `component`（`RootComponent`）自体を throw させる**必要がある。plan の手順のままだと「root error のシェル維持」を実際には検証できず、AC-5 が空振りするおそれ。検証手段として「`loadAppContext` を一時的に throw させて root `errorComponent` を発火」を明記すると確実。

- **[S-002]** リスク欄「`shellComponent` の版依存」の位置づけを一段和らげる（削除まではしない）。
  - 理由: `shellComponent` は experimental フラグ付き API ではなく、`router-core` の `RootRouteOptionsExtensions` に定義された安定コア API であり、現行 scaffold の標準 root 構成。将来のメジャー更新で追随が要る点は残す価値があるが、「特別に脆い賭け」ではないことを一言添えると、案 A のリスク評価がより正確になる。

- **[S-003]** 「router context は shellComponent 内で利用可能」である旨を plan（またはリスク欄）に一文追記する。
  - 理由: `RootDocument` の子（`HeadContent`/`Scripts`/`RouteProgressBar`）はいずれも `useRouter`/`useRouterState` に依存する。`shellComponent` は `matchContext.Provider` の外側に描画されるため「context が切れてクラッシュするのでは」というレビュー時の懸念が起きやすい。実際は RouterProvider ツリー内なので router context は生きており問題ないが（本レビューで検証済み）、その根拠を残しておくと実装者・後続レビュアーの手戻りを防げる。

#### 良い点

- **中核 API の裏取りが正確。** `Match.js` L78 / `route.d.ts` / `Outlet` L283 / `renderRouteNotFound` の参照行と挙動が、インストール済み実バージョン（1.170.15 / 1.168.25）と完全に一致。行番号引用も実物と符合しており、机上の推測ではなくソース確定に基づく。
- **根本原因の非対称性（notFound=Outlet 内 / error=CatchBoundary 位置）を正しく特定**し、それに対して「シェルを両境界の外側へ出す」という原理的に正しい解を選んでいる。対症療法（案 B/C）を退けた判断は根治として妥当。
- **正準パターンへの回帰。** `shellComponent: RootDocument` は現行 TanStack Start の標準 root 構成であり、独自の変則構造から公式サポート形へ寄せる方向。保守性・可読性の面でも良い。
- **スコープ規律が明確。** `/notes` 個別リダイレクトやリーフ/`_app` の error/notFound を意図的にスコープ外とし、「Outlet 位置描画のリーフ error/notFound は無影響」という影響範囲の切り分けが正確。変更が `app/routes/__root.tsx` 1 ファイルに閉じる点も回帰リスクを最小化。
- **シェルカバレッジがむしろ強化される**という副次効果（shell が常に error 境界の外側 → root component throw 時もシェル消失リスクが現構造より低い）を正しく捉えている。
