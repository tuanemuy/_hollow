# レビュー round-1 — アーキ整合性・実現可能性・リスク (Issue #732)

レビュー対象: `.issue/732/plan.md` / `.issue/732/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

---

#### 問題点（要修正）

- **[P-001]** 収束経路の核心的前提（`appShellInvalidate` の in-place 再評価が `HomeRoute` を再 render し、不整合フラグを `false` に落とす）が plan/ADR で「必ず収束する」と断定されているが、その再 render が何によって起きるかの明示が無く、検証なしに AC-5 達成と書いている。
  - 実コードを追うと収束は次の連鎖に依存する: `appShellInvalidate` は `routeId === "/_app"` **のみ** を invalidate する（`appShellInvalidate` の filter）。`_app.loader` が再走して `userDto: null` を返す → `AppLayout` が再 render → その子 `<Outlet />` 配下の `HomeRoute` も再 render → `shellUserDto` が `null` になり、hook の `isAuthMismatch` が `false` に落ちる。重要なのは **leaf（`/_app/`）の loader（`renderHome`）は invalidate されない** ため `data.authenticated` は元の `false` のまま残り、フラグが落ちた結果 `LandingPage` に収束する、という点。この「leaf loader が再走しないから `data.authenticated===false` が保たれる」ことが収束の必要条件であり、plan の AC-5 / リスク欄「収束保証」はこの依存を言語化していない。
  - 提案: plan の「収束保証」リスク欄と ADR-001 Consequences に「`appShellInvalidate` は `_app` のみを invalidate し leaf loader を再走させないため、再評価後 `shellUserDto=null × data.authenticated=false`（fresh 未認証と同形）に収束 → `LandingPage`」と収束連鎖を明記する。これは AC-2（fresh 未認証）の判定式と同形に落ちることの確認でもあり、ガード条件が SSOT 一致である限り構造的に保証される。手動テストだけに委ねず、根拠を文書化すべき。

#### 改善提案（検討推奨）

- **[S-001]** AC-5 の「不整合フラグが `false` に落ちる」をユニットテストでピン留めできる。 / 理由: plan のテスト方針は「不整合→`true` / fresh→`false` / 認証済み→`false`」の 3 ケースを追加するが、これは静的な入力に対する戻り値テストにすぎない。収束（`shellUserDto` を user→null に変化させた再 render で戻り値が `true→false` に遷移する）は `Probe` を再 render する形でユニットテスト可能（既存の「id 変化で再発火」テストと同じ再 render パターンが使える）。server component を含まない hook 単体で AC-5 の遷移を担保でき、手動テスト依存を減らせる。

- **[S-002]** 中立プレースホルダを `null` に倒す判断を plan 内で確定させた方がよい。 / 理由: plan/ADR は `null` か `<div aria-hidden />` かを「レイアウトシフトが要れば」と条件付きで両論併記している。だが過渡フレームは AppShell 未マウント（`AppLayout` が `userDto===null` で `<Outlet />` のみ）状態であり、そもそも frame chrome が無い。`LandingPage` を抑制した結果出るのは「親レイアウト無し＋leaf 無表示」= 実質的に背景のみで、`aria-hidden` div を置いてもレイアウトを占有する明示寸法が無ければシフト抑制効果は無い。YAGNI として `null` を既定とし、ステップ 3 の「任意」確認は手動目視のみに留める方針を plan で明言すると、実装者の迷いとデッドコード追加を防げる。

- **[S-003]** ステップ 4 のテスト方針で「`Probe` が戻り値を捨てている箇所はそのままでも可」とあるが、戻り値契約の追加テストは既存 `Probe` とは別の薄いラッパー（戻り値を DOM/ref に反映）が要る。plan に「既存 `Probe` は invalidate 呼び出し契約用に温存し、戻り値検証は別 Probe（例: `BoolProbe`）を追加」と書き分けておくと実装が明確。 / 理由: 既存 6 ケースは戻り値非依存で無改修 green を保つべき（plan も「維持」と書いている）。戻り値検証を既存 `Probe` に混ぜると無改修方針と衝突する。

#### 良い点

- 不整合判定の SSOT を hook に一本化し（ADR-002 (b)）、`useEffect` 発火条件と戻り値を同一定数 `isAuthMismatch` から導出する設計は、不変条件②（fresh 未認証の誤抑制防止）を「構造的に」担保しており妥当。`HomeRoute` 側で式を二重化する (a) 案を退けた判断は正しい。これにより AC-2 のリグレッションが原理的に起きない。

- 不変条件①（初回 1 RPC・以降 0 RPC・`staleTime: Infinity`）への非干渉が正しく担保されている。本変更は `useEffect` の発火条件・回数を一切変えず（`isAuthMismatch` への置換は等価変形）、`appShellInvalidate` / `clearAppShellCache` / `routerInvalidate` の 3 API・`routerInvalidate.ts` の SSOT に一切手を入れない。実コードでも hook の唯一の呼び出し元は `HomeRoute` 1 箇所のみと確認でき、波及局所化の主張は正確。

- rules-of-hooks / レンダリング純粋性の観点で問題なし。`useAuthGuardEffect` は従来どおり条件分岐前に無条件呼び出しされ（`HomeRoute` 既存コードのコメントどおり）、戻り値追加は純粋な値返却で副作用は `useEffect` 内に閉じたまま。render 中に副作用は走らない。SSR/RSC との整合も問題なし: 本 hook は client（`useEffect`/`useRouter`）でのみ実効的に動き、SSR 初回（hydration 前）では `useEffect` 未発火・戻り値は初期 props から純粋計算されるだけ。

- 不変条件④（過渡フレームの SSR 初回描画＝未認証訪問者の初回 LandingPage を誤抑制しない）が守られている。fresh 未認証訪問者は `shellUserDto===null` のため `isAuthMismatch===false` となり、ガードは発動せず従来どおり即 `LandingPage` を描画する。ガードが発動するのは「shell に前ユーザー残存 × leaf 未認証」の不整合時のみで、これは SSR 初回には起き得ない（初回は両者が同じ session 観測から生成される）構造であり、誤抑制リスクは無い。

- 設計案の棄却理由が妥当。(B) navigate 案を「失効観測 leaf が既に `/` におり、同一ルート navigate は `staleTime: Infinity` で `_app` を再評価しないため効かない」と退けた論証は、実コード（`_app/route.tsx` の `staleTime` と `loadAppShell`）と整合し正確。(C) redirect 再設計案を #300 ADR-001 (a)(b) で既に退けた構造（server fn から router 不可・middleware が `staleTime: Infinity` を崩す）への逆戻りとして、優先度:低の本 Issue にコスト過大と判断したのも妥当。(D) 現状受容より UX 改善で勝るとした比較も筋が通る。

- 無限ループ（収束保証）の懸念に対する設計が堅い。ガード中は `LandingPage` を中立 UI に差し替えるだけで `useEffect` の依存配列（`[shellUserId, leafAuthenticated, router]`）は不変のため、再 render で invalidate が再発火することはない（既存「同一 id で非再発火」テストが担保）。invalidate 解決 → `_app` 再評価 → `shellUserId=null` で依存変化 → フラグ `false` で 1 回収束、という単調収束で、振動・無限ループは構造的に発生しない。
