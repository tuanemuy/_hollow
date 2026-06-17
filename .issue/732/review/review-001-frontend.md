# PR #733 レビュー — Frontend 観点（Issue #732）

対象: セッション失効の leaf 観測時に未認証 UI が 1 フレーム見える問題のゼロフレーム化（レンダリングガード方式）。

## Frontend

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001] ガード条件の SSOT 一致が構造的に担保されている（AC-2 最重要リスクの防御）**
  場所: `app/components/common/useAuthGuardEffect.ts:62-72`
  戻り値用の `isAuthMismatch = shellUserId !== null && leafAuthenticated === false` と `useEffect` 内の発火条件が同一の生入力（`shellUserId` / `leafAuthenticated`）から導出されており、式がズレる余地がない。`HomeRoute` は `if (!data.authenticated)` の内側でのみフラグを参照する（`index.tsx:189-191`）ため、その分岐内ではフラグは実質 `shellUserId !== null` に縮約される。fresh 未認証訪問者（`shellUserId === null × leafAuthenticated === false`）はフラグ `false` → `LandingPage` が確実に描画され、誤抑制は起きない。ADR-002 の「SSOT を hook に置く」判断がコードで正しく実現されている。

- **[N-002] 依存配列を生入力のまま据え置いた判断が正しく、#300 の per-id 再発火契約を保持**
  場所: `useAuthGuardEffect.ts:63-72`
  `useEffect` の依存配列を `[isAuthMismatch, router]` ではなく `[shellUserId, leafAuthenticated, router]` のまま維持し、本体の発火条件も従来式（変更前と byte 等価）に保っている。これにより u1→u2 の不整合→不整合切替で派生 boolean が `true` のまま据え置かれて invalidate がスキップされる事故を回避している。ADR-002 の実装メモと完全に整合。インラインコメント（`64-68`）が「なぜ派生 boolean を closure せず生入力から再計算するか」という why を簡潔に記述しており、CLAUDE.md「why のみ」方針に沿う。既存テスト「id 変化で再発火（invalidate 2 回）」が無改修で green であることが回帰を担保している。

- **[N-003] 副作用 + 表示フラグの 2 役を持つ hook 設計は妥当**
  場所: `useAuthGuardEffect.ts:56-74`
  hook が「副作用（invalidate fire-and-forget）」と「表示判定フラグ返却」の 2 役を兼ねるが、両者は同一の不整合式から導出される密結合な関心事であり、分離すると `HomeRoute` 側に同式が二重化して fresh 未認証の誤抑制リスク（不変条件 2）を招く。同居が整合性維持上むしろ正しい（ADR-002 トレードオフ欄の判断どおり）。rules-of-hooks も `HomeRoute` 側で条件分岐の前に無条件呼び出ししており（`index.tsx:185-188`）準拠。

- **[N-004] 収束経路が実コードと整合し、無限ループ・振動が起きない**
  場所: `routerInvalidate.ts:115-119`（`appShellInvalidate` の `routeId === "/_app"` 厳密一致 filter）／ `_app/route.tsx:124-128`（`userDto === null` で `<Outlet />` のみ）
  `appShellInvalidate` は `_app` のみを invalidate するため leaf loader（`renderHome`）は再走せず `data.authenticated === false` が保たれる。shell が `userDto: null` で再評価されると `shellUserDto` が null 化 → フラグが `false` に落ちて `LandingPage` に収束する。依存配列は不変なので再 render で invalidate が再発火せず（既存「同一 id で非再発火」テストが担保）、単調収束で振動・無限ループはない。plan「収束経路」と実コードが一致している。`selectUnauthenticatedView.test.tsx` の `true→false` 遷移テストおよび `useAuthGuardEffect.test.tsx:434-451` の収束テストがこの遷移をピン留めしている。

- **[N-005] 過渡フレームの `null` 返却は SSR/RSC・レイアウトシフトの観点でも妥当**
  場所: `index.tsx:170-177`
  過渡フレームは `AppLayout` が `userDto === null` で `<Outlet />` のみを返す＝AppShell（frame chrome）未マウント状態であり、`aria-hidden` div を置いてもレイアウト占有寸法がないため CLS 抑制効果がない。`null` 返却が最小かつ正しく、デッドコードを足さない判断（ADR-001 / arch-risk S-002）に従っている。この過渡は client 側の `useEffect` 発火後にのみ成立し（不整合フラグは shell キャッシュに前ユーザーが残る SPA 遷移時にしか立たない）、fresh 未認証の初回 SSR/RSC 描画には影響しない（その経路はフラグ `false` で `LandingPage` を描く）。

- **[N-006] テスト分割が方針どおりで、戻り値契約・分岐の向きを自動担保**
  場所: `useAuthGuardEffect.test.tsx:69-78, 404-452`（`BoolProbe`）／ `selectUnauthenticatedView.test.tsx`
  既存 invalidate 契約用 `Probe` を無改修で温存し（arch-risk S-003）、戻り値契約を別ハーネス `BoolProbe` で検証。さらに分岐の向き（最重要 AC-2）を純関数 `selectUnauthenticatedView` のユニットでピン留めしている。`selectUnauthenticatedView` を `export` して純関数化した切り出しは plan ステップ 5「原則必須」を満たす。両テストファイルは green（合計 12 ケース）。

- **[N-007] 純関数化に伴う `ReactNode` import と JSDoc が適切**
  場所: `index.tsx:4, 157-177`
  `selectUnauthenticatedView` の戻り型を `ReactNode` で明示し、`import type { ReactNode }` を type-only import している（型安全・bundle 非肥大）。JSDoc は「なぜ純関数として切り出したか（unit-pinnable without rendering server component）」「各分岐の why」を記述し、本体の 1 行 inline コメント（`173-174`）と内容が重複していない点も CLAUDE.md のコメント方針に沿う（JSDoc は API 契約、inline は分岐内の why で役割分担できている）。

## 総評

レンダリングガード方式が plan / ADR の設計どおりに、最小・局所（`useAuthGuardEffect.ts` と唯一の呼び出し元 `HomeRoute` の 2 箇所）で正しく実装されている。最重要リスク（fresh 未認証の誤抑制）は SSOT を hook に置く構造で防がれ、#300 の per-id 再発火契約・#293 の `staleTime: Infinity`（invalidate 発火条件・回数を一切変えない）も保持されている。収束経路・過渡フレーム `null` 返却・テスト分割いずれも設計判断と整合。Frontend 観点で阻害要因なし。
