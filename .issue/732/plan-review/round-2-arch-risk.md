# レビュー round-2 — アーキ整合性・実現可能性・リスク (Issue #732)

レビュー対象: `.issue/732/plan.md` / `.issue/732/adr.md`
前回指摘: `.issue/732/plan-review/round-1-arch-risk.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

---

## Round 1 指摘の解消確認

- **P-001（収束経路の言語化）→ 解消**。plan.md に「設計 > 収束経路」小節（行 71-81）が追加され、`appShellInvalidate` が `routeId === "/_app"` のみを invalidate → leaf loader（`renderHome`）非再走で `data.authenticated === false` 維持 → `AppLayout` 再 render で `shellUserDto` null 化 → フラグ `false` → `LandingPage` 収束、という依存連鎖が明記された。ADR-001 Consequences（行 42）・リスク欄「収束保証」（行 144）も同連鎖を参照する形に更新済み。実コードと突き合わせて正確であることを確認した（`appShellInvalidate` の filter は `match.routeId === APP_SHELL_ROUTE_ID` 厳密一致 = `routerInvalidate.ts:117`、`AppLayout` は `userDto === null` で `<Outlet />` のみ返却 = `_app/route.tsx:126-128`、leaf loader は `_app.loader` と別 route のため invalidate 対象外）。
- **S-001（true→false 遷移のユニット化）→ 解消**。実装ステップ 6（行 128-132）で `BoolProbe` を `shellUserDto` user→null に再 render してフラグ `true → false` 遷移を assert する方針が追加された。既存「id 変化で再発火」テスト（test.tsx:142-156）と同じ再 render パターンで実現可能であり妥当。
- **S-002（中立プレースホルダ null 化）→ 解消**。plan 行 67-69 / 104 / 111、ADR-001 行 18・41 のいずれも `null` に確定し、両論併記が消えた。「AppShell 未マウント（`<Outlet />` のみ）で frame chrome が無く、`aria-hidden` div はレイアウトシフト抑制効果が無くデッドコード」という根拠も実コード（`AppLayout` 行 124-138）と整合する。ステップ 3 はコード変更を伴わない手動目視のみと明言され、デッドコード追加の余地が排除された。
- **S-003（BoolProbe 分離）→ 解消**。実装ステップ 4（行 118-120）・テスト方針（行 152-154）で「既存 `Probe` は invalidate 契約用に無改修温存、戻り値検証は別ハーネス `BoolProbe`」と書き分けられた。既存 6 ケースが戻り値非依存（test.tsx の `Probe` は `return null`）であることを確認しており、無改修 green を保てる。

Round 1 の全指摘（P-001 / S-001 / S-002 / S-003）が plan・adr の双方に正しく反映されている。

---

#### 問題点（要修正）

問題点ゼロ。

依頼の主眼である「null 返しに確定したことで過渡フレームに本当に何も描かれず、かつ未認証訪問者の初回 LandingPage を誤抑制しないか」を再検証した結果、いずれも問題なし:

- **過渡フレームの無表示（null 返却）:** 不整合中（`shellUserId !== null && leafAuthenticated === false`）は ① `HomeRoute` が `null` を返し leaf 無表示、かつ ② 親 `AppLayout` も `userDto === null`（shell キャッシュは前ユーザーだが、invalidate 解決まで再評価されないため一見矛盾するが、過渡フレームでは shell はまだ前ユーザー = `userDto !== null` で `AppShellFrame` をマウントしている点に注意）。つまり過渡フレームは「前ユーザーの AppShellFrame chrome（Header/Sidebar）+ leaf 領域だけ `null`」になる。未認証 UI（`LandingPage`）は描かれず、情報露出は無い — これは AC-1 の目的（未認証 UI を 1 フレームも見せない）を満たす。chrome は前ユーザーのものが残るが、それは「前ユーザー情報の残存」であって「未認証 UI の露出」ではなく、Issue の症状（未認証ランディングのちらつき）とは別物。収束後に shell が null 化して chrome も消え `LandingPage` に落ちるため、最終状態も正しい。
- **fresh 未認証訪問者の誤抑制（AC-2）:** fresh 訪問者は `shellUserDto === null` のため `isAuthMismatch === false`、ガードは発動せず従来どおり即 `LandingPage`。SSR 初回は shell と leaf が同一 session 観測から生成されるため不整合が成立し得ず、誤抑制は構造的に起き得ない。判定式を hook 内 `isAuthMismatch` に一本化（SSOT 化）し `useEffect` 発火条件と戻り値を同一定数から導出する設計（ADR-002 (b)）により、式のズレによる誤抑制も原理的に防がれている。

#### 改善提案（検討推奨）

改善提案ゼロ。

念のため新たなリスク観点（不変条件 regression・rules-of-hooks・収束保証・過渡フレーム・既存テスト影響）を一通り当てたが、追加で書き起こすべき改善余地は見当たらなかった:

- **不変条件①（初回 1 RPC・以降 0 RPC・`staleTime: Infinity`）:** `useEffect` の発火条件は `isAuthMismatch` への等価変形のみで invalidate の回数・タイミングは不変。`routerInvalidate.ts` の 3 API・SSOT に一切手を入れない。regression なし。
- **rules-of-hooks:** `useAuthGuardEffect` は従来どおり条件分岐前に無条件呼び出し（`_app/index.tsx:162` のコメントどおり）。戻り値追加は純粋値返却で副作用は `useEffect` 内に閉じる。問題なし。
- **収束保証・振動/無限ループ:** 依存配列 `[shellUserId, leafAuthenticated, router]` は不変で、ガード中の再 render でも invalidate は再発火しない（既存「同一 id で非再発火」テストが担保）。invalidate 解決 → `_app` 再評価 → `shellUserId=null` で依存変化 → フラグ 1 回 `false` の単調収束。問題なし。
- **既存テスト影響:** `useAuthGuardEffect.test.tsx` の 6 ケースは戻り値非依存（`Probe` は `return null`）で無改修 green。`routerInvalidate.test.ts` は `appShellInvalidate` 不変のため無改修 green。plan のテスト方針（行 162）と整合。
- **ステップ 5 の純関数化フォールバック:** 純関数化が困難なら手動テスト主担当に倒す逃げ道が明記されており（行 125-126）、実現可能性のリスクヘッジとして妥当。

#### 良い点

- Round 1 指摘 4 件すべてを plan・adr の両ファイルに反映し、収束経路の依存連鎖を実コード（`appShellInvalidate` filter・`AppLayout` の `<Outlet />` 分岐・leaf loader 非再走）と一致する形で言語化できている。文書だけの辻褄合わせでなく実装の構造的根拠に基づいている点が良い。
- 中立プレースホルダを `null` に確定し、「AppShell 未マウントで chrome が無いため `aria-hidden` div はデッドコード」という根拠を添えてデッドコード追加を構造的に排除した。YAGNI と実コード根拠の両面で正しい。
- 撤退条件（ADR-001 行 45-49）が明文化され、優先度:低の Issue で「ゼロフレーム化 or 明示的再受容」の二択（Issue 本文）を尊重しつつ、実装段階の判断基準を一貫させている。
- 不整合判定の SSOT を hook に一本化（ADR-002 (b)）し、`HomeRoute` 側の式二重化を退けた設計により AC-2（fresh 未認証誤抑制）のリグレッションが原理的に起きない。本件で最も壊しやすい不変条件②を構造で守っている。
- 変更が `useAuthGuardEffect.ts` と唯一の呼び出し元 `HomeRoute` の 2 箇所に局所化され、presentation 層内部に閉じる（ドメイン/ユースケース/アダプター層に波及しない）ことが実コードでも確認できる。CLAUDE.md の依存方向（内向き）と整合。

---

## 返答

- 問題点: 0 / 改善提案: 0
- 一行リスト: なし（問題点ゼロ・改善提案ゼロ）
