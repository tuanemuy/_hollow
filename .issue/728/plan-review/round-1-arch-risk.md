# Plan Review — Issue #728 (round-1: アーキテクチャ整合性・実現可能性・リスク)

レビュー対象: `.issue/728/plan.md` / `.issue/728/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

---

#### 問題点（要修正）

- **[P-001]** ヘルパーのシグネチャ `to: Parameters<AnyRouter["navigate"]>[0]` は `{ to: "/", search: HOME_SEARCH }` を **型エラーにする**。3 つの呼び出し（LoginForm / PasswordResetConfirmForm / AccountDeleteForm）がコンパイルできず、計画どおりには実装できない。
  - 理由: 実際に型プローブで確認した。`router.navigate` は `NavigateFn`（呼び出しごとに `TTo` / `TFrom` を推論する generic）で、`{ to: "/" }` を渡すと search が home ルートの厳密スキーマ（`true | ParamsReducerFn<...>`）に pin され、`HOME_SEARCH = {}` がそこに構造的に代入できない。直書きの `router.navigate({ to: "/", search: HOME_SEARCH })` は per-call 推論が効くため通るが、引数を `Parameters<AnyRouter["navigate"]>[0]` という **単一インスタンス化された型** に落とし込むとその推論が失われる。プローブ結果:
    - `clearAppShellAndNavigate(router, { to: "/login" })` → OK（`/login` は search 不要）
    - `clearAppShellAndNavigate(router, { to: "/", search: HOME_SEARCH })` → `TS2322: Type '{}' is not assignable to type 'true | ParamsReducerFn<...>'`
    - 同一スコープで `router.navigate({ to: "/", search: HOME_SEARCH })` 直書きは **通る**（=ヘルパー化が回帰を生む）。
    - generic 化（`<R extends AnyRouter>(router: R, to: Parameters<R["navigate"]>[0])`）でも同じく失敗する。
  - 提案: ヘルパーの責務を「破棄（clearCache）のみ」に絞り、navigate は呼び出し側に残すのが最も型安全で確実。例:
    ```ts
    export function clearAppShellCache(router: AnyRouter): void {
      router.clearCache({ filter: (m) => m.routeId === APP_SHELL_ROUTE_ID });
    }
    ```
    呼び出し側は `clearAppShellCache(router); await router.navigate({ to: "/", search: HOME_SEARCH });` とする（per-call 推論が保たれ全 search 形が通る）。「破棄+遷移を 1 関数に集約」という AC-4 の文言は満たさなくなるが、「clearCache を各フォームに直書きさせず SSOT に集約」「invalidate→clearCache へ統一」という Issue の本質（再発防止と race 解消）は満たせる。どうしても navigate まで含めたい場合は、`to` を `unknown` で受けて内部で `router.navigate(to as never)` とアサートする手もあるが、これは型補完を完全に失い ADR-001 の「型透過」意図に反するため非推奨。**いずれにせよ現状の `Parameters<AnyRouter["navigate"]>[0]` のままでは `pnpm typecheck` が落ちる。**

- **[P-002]** ヘルパーの戻り値・`clearCache` の戻り値型の前提が誤っている。計画は「戻り値が Promise でいいか」を論点に挙げているが、`router.clearCache` は **同期 `void`**（`ClearCacheFn<TRouter> = (opts?) => void`、router-core v1.170.15 で確認）であり await 対象ではない。
  - 理由: 計画コード `router.clearCache(...); return router.navigate(to);` 自体は（P-001 の型問題を別にすれば）動作上は正しいが、ADR/plan の「clearCache→navigate の評価順序が race を起こさないか」という議論は「clearCache が同期的に cached match を捨てる → 直後に navigate が走る」という前提に立つ必要がある。clearCache を await できると誤読すると順序保証の根拠が揺らぐ。
  - 提案: plan / JSDoc に「`clearCache` は同期 void。await せず、戻り値の Promise は navigate のものだけ」と明記する。`AccountDeleteForm` の既存実装（`clearCache(...)` を await せず直後に `await navigate(...)`）が同期前提で正しく動いている実績を根拠として引く。

#### 改善提案（検討推奨）

- **[S-001]** `appShellInvalidate` と新ヘルパーの「使い分け」を JSDoc だけでなく、`routerInvalidate.ts` 冒頭のモジュール JSDoc（現状「公開 API は 2 つ」と明記）にも 3 つ目として追記すべき。
  - 理由: 既存モジュール JSDoc は「`routerInvalidate` / `appShellInvalidate` の 2 つ、補完関係」と数を明示して締めている。3 つ目を足すならこの導入文も更新しないと、ファイル先頭の契約説明と実体が乖離する（ADR-005 が `appShellInvalidate` 追加時に懸念した「ファイル名と中身の対応」と同じ問題の再来）。新ヘルパーが invalidate ベースでない（clearCache ベース）点も、モジュール冒頭の「`router.invalidate()` 制御を集約するモジュール」という責務記述と整合させる必要がある（責務が「invalidate 制御」から「AppShell キャッシュ制御」へ広がる）。

- **[S-002]** AC-7 / ステップ7 のテスト方針で、`UserMenu.test.tsx` の mock router を `clearCache` 込みに差し替える点は妥当だが、`LoginForm` / `PasswordResetConfirmForm` には現状テストが無い可能性が高い（リポジトリ確認の価値あり）。「無ければ追加は任意」で済ませると、3 フォームのうち 2 つが回帰検知ゼロになる。
  - 理由: P-001 で示したとおり、search を伴う navigate 引数こそが壊れやすい箇所。helper の単体テスト（`routerInvalidate.test.ts`）で「navigate が渡した引数で呼ばれる」ことを assert すれば、引数透過の回帰は helper test 1 本で広くカバーできる。フォーム個別テストを増やすより helper test の充実を優先するのが費用対効果が高い。
  - 補足: helper test は既存 `routerInvalidate.test.ts` の `FakeMatch` / `takeFilter` パターンを踏襲でき、`clearCache` mock を足すだけで書ける。filter が `/_app` 厳密一致のみ通すことの検証は、`appShellInvalidate` の既存テスト（prefix-extension を弾く）をそのまま流用できる。

- **[S-003]** ステップ5（AccountDeleteForm をヘルパーへ寄せる）で、もし P-001 の提案どおり「clearCache のみのヘルパー」に倒す場合、AccountDeleteForm の既存挙動（`clearCache(...); await navigate(...)`）は完全に等価のまま `clearCache` 呼び出しだけがヘルパー経由になる。これは最も安全な寄せ方であり、既存テスト（`clearCache` / `navigate` を別々に mock 済み）も無改修で green を維持できる点を plan に明記しておくと、AC-5 の回帰リスクがゼロであることが読み手に伝わる。
  - 理由: 現行 AccountDeleteForm テストは `useRouter: () => ({ navigate, clearCache })` で両方を個別 mock し、`navigate` 未呼び出し（失敗時）まで検証している。clearCache のみヘルパー化なら navigate は引き続き呼び出し側に残り、mock 構造を一切変えずに済む。

#### 良い点

- **[G-001]** 根本原因の分析が正確。`_app.loader` の `staleTime: Infinity`（#293 ADR-008）と「invalidate は現在マウント中ルートを in-place 再評価する／clearCache は破棄のみで再評価しない」という差分を正しく捉え、AccountDeleteForm の実績パターンへ統一する方向は、コードベース内の確立済み回避策に寄せる点でアーキテクチャ的に最も妥当。新方式を発明していない（ADR-001 で選択肢 B/C を実績・コストで退けている）のが良い。

- **[G-002]** スコープ境界の判断が的確。`useAuthGuardEffect` の fire-and-forget 経路を「navigate を伴わない別構造で clearCache 解法が適用できない」と正しく切り分け（ADR-002）、#300 ADR-001 で受容済みのトレードオフを蒸し返さない判断は、Issue の主症状に集中する観点で正しい。invalidate-only 4 フォーム（SignUp / AdminSignUp / VerifyEmail / EmailChangeConfirm）を「navigate を伴わない＝本 race と無関係」として確認のみに留めた切り分けも妥当。

- **[G-003]** ヘルパーの配置（`routerInvalidate.ts` に同居、`APP_SHELL_ROUTE_ID` 定数を再利用）は #293 ADR-010 / #300 ADR-005 の「`_app` 系制御を 1 ファイル 1 定数に集約し routeId リネームに追従する」設計と完全に整合。新規ファイルを作らない判断も既存規約どおり。

- **[G-004]** 遷移先の `_app` 内外の違い（ログアウト→`/login` は `_app` 外、ログイン/リセット→`/` は `_app` 内で navigate 後 fresh load）をリスク欄で明示し、`HOME_SEARCH` 維持にも言及している。エッジケースの見通しが立っている。

- **[G-005]** SignUpForm が将来セッションを張る設計になった場合に guard（`redirectAuthenticatedRoute`）と invalidate が干渉しうる点を PR 注意書きとして残す方針（ステップ6 / リスク欄）は、現状無害な副作用を将来の落とし穴として記録する good practice。

---

## 総評

方向性（clearCache パターンへの統一・SSOT 集約・スコープ切り分け）はアーキテクチャ的に正しく、ADR の判断も妥当。ただし **ヘルパーの型シグネチャ `Parameters<AnyRouter["navigate"]>[0]` は実際に typecheck を落とす**（search を伴う 3 フォームでコンパイルエラー）ため、このままでは実装不能。型プローブで再現確認済み。修正案は「navigate を呼び出し側に残し、ヘルパーは clearCache（同期 void）に絞る」のが最も確実。P-001 を解消すれば残りは軽微。
