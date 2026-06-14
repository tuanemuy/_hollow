# ADR — Issue #728: 認証状態の遷移でランディングが一瞬表示される race の解消

## ADR-001: 破棄手段を `clearCache → navigate` に統一し、clearCache のみを共通ヘルパー化する

### Status
Proposed

### Context
認証状態を変える mutation（ログイン・ログアウト・パスワードリセット確認）の直後、`_app.loader` の `staleTime: Infinity`（#293）でキャッシュされた `userDto` を破棄するため、各フォームは `await router.invalidate()` → `await router.navigate(...)` を逐次 await している。`router.invalidate()` は **現在マウント中の `_app` 配下ルートをその場で再評価** するため、session cookie が既に変わった状態で `loadAppShell` が走り、未認証 UI（ランディング）を navigate 完了前に 1 フレーム描画してしまう。

破棄手段の選択肢:

- **(A) `clearCache({ filter: _app }) → navigate` に統一**（`AccountDeleteForm` の確立済みパターン）。clearCache は cached match を破棄するが in-place 再評価を起こさないため、navigate と race しない。`router.clearCache` は同期 `void`（`(opts?) => void`、router-core v1.170.15 で確認）であり await 対象でない。navigate のみ await する。
- **(B) 順序入れ替え（navigate を先 / invalidate を後）**。navigate 中の遷移と invalidate の評価タイミングが router 実装依存で、in-place 再評価のリスクが残る。実績なし。
- **(C) navigate と AppShell 破棄をアトミックに行う独自機構**。抽象化コストが大きく、本 Issue の race 1 点に対して過剰。

さらに、各フォームが手順をインラインで書くと再発しやすい（実際 3 箇所で旧パターンが残存）ため、共通の公開 API に集約するかが論点。当初は「破棄 + navigate を 1 関数 `clearAppShellAndNavigate(router, to)` に集約」を検討したが、ヘルパーの `to` 引数を `Parameters<AnyRouter["navigate"]>[0]` で受けると `{ to: "/", search: HOME_SEARCH }` が `TS2322` で **型エラーになる**（arch-risk レビュー P-001、型プローブ再現済み）。`router.navigate` は `NavigateFn` という呼び出しごとに `TTo`/`TFrom`/search スキーマを推論する generic で、引数を単一インスタンス型に落とすと per-call 推論が失われ、`HOME_SEARCH = {}` が home ルートの厳密 search スキーマに代入できなくなる。直書きの `router.navigate({ to: "/", search: HOME_SEARCH })` は per-call 推論が効くため通る。

### Decision
**(A) を採用する。ただし共通ヘルパーは clearCache のみに絞り、navigate は各呼び出し側に残す。** `clearAppShellCache(router): void` を `app/components/common/routerInvalidate.ts` に追加する。内部は `router.clearCache({ filter: m => m.routeId === APP_SHELL_ROUTE_ID })` のみ（同期 `void`）。各フォームは `clearAppShellCache(router); await router.navigate({ to, search? });` の形で、navigate をリテラル引数のまま呼び出し側に書く（per-call 推論が保たれ全 search 形が通る）。

`routerInvalidate.ts` は既に `_app` 系制御の SSOT（`routerInvalidate` / `appShellInvalidate`、#293 ADR-010）なので、同じ `APP_SHELL_ROUTE_ID` 定数を再利用して同居させる。`AccountDeleteForm` は既に `clearCache(...) + navigate(...)` であり、clearCache 行のみ `clearAppShellCache(router)` に寄せる（navigate 行はそのまま＝呼ぶ router メソッドが変わらず挙動完全等価）。

「破棄 + navigate を 1 関数に」という形は P-001 の型制約で断念したが、「clearCache 述語を各フォームに直書きさせず SSOT に集約」「invalidate → clearCache へ統一」という Issue の本質（再発防止と race 解消）は満たす。

### Consequences
- 良い点:
  - コードベース内に実績のあるパターン（退会フローはチラつき無し）への統一で、未検証の新方式を導入しない。
  - rule 1 mutation（認証状態変化）の clearCache 述語が 1 関数に集約され、各フォームが述語を書かないため再発しない。
  - navigate を呼び出し側に残すことで per-call 型推論が保たれ、search 付き navigate（`/` への `HOME_SEARCH`）が型エラーにならず、search スキーマ不整合は `pnpm typecheck` が検知する。
  - `clearAppShellCache` は clearCache のみのため navigate 引数型の回帰源にならない。AccountDeleteForm は呼ぶ router メソッドが不変で既存テスト無改修 green（S-003）。
  - routeId のリネームに `routerInvalidate.ts` 1 ファイルで追従する既存設計を踏襲。
- トレードオフ:
  - `appShellInvalidate`（invalidate ベース）と `clearAppShellCache`（clearCache ベース）の 2 系統が並立する。前者は「navigate を伴わず AppShell を再評価したい」場面（errorComponent retry 等）、後者は「mutation 直後に AppShell を破棄して別ルートへ遷移する直前」の場面、と意味分担を JSDoc で明記して使い分けを誤らせない。モジュール冒頭の JSDoc も責務（invalidate 制御 → AppShell キャッシュ制御）と公開 API 数（2 → 3）を更新する。
  - **rule 1 の JSDoc 線引きを clearCache 化に合わせて更新する（P-001 round-2）。** `routerInvalidate.ts` の関数レベル JSDoc 2 箇所（`routerInvalidate` の rule 列挙、`appShellInvalidate` の「3 rule 例外は引き続き生 invalidate」）は現状「rule 1 = 生 invalidate」と明示しており、本決定の「rule 1 を clearCache へ統一」と矛盾する。SSOT モジュール内部に旧規約と新実装が併存する自己矛盾を残さないため、これら 2 箇所も「**navigate を伴う auth 遷移 = `clearAppShellCache` + navigate / navigate を伴わない AppShell 再評価（rule 2/3・errorComponent retry・`useAuthGuardEffect`）= 生 invalidate・`appShellInvalidate`**」という一貫した線引きへ改訂する（モジュール冒頭含め計 3 箇所）。なお invalidate-only 4 フォーム（SignUpForm 等）は認証状態を変えないため生 invalidate のまま線引きの外（`EmailChangeConfirm` の `rule 1` コメントも email キャッシュ破棄目的であり auth 遷移ではない）。
  - navigate がヘルパーに含まれないため、呼び出し側で「clearCache を先に呼ぶ」順序を守る責務が残る。helper/UserMenu テストで順序を assert し、レビューで担保する。

---

## ADR-002: `useAuthGuardEffect` の fire-and-forget 経路は本 Issue スコープ外とする

### Status
Proposed

### Context
`useAuthGuardEffect`（`app/components/common/useAuthGuardEffect.ts`）は、leaf 側で session 失効（`shellUserDto !== null && leafAuthenticated === false`）を観測したとき `appShellInvalidate(router)` を `useEffect` 内で fire-and-forget する。`.issue/300/adr.md` ADR-001 で「ランディング描画 → effect 発火 → invalidate の間に最大 1 フレーム未認証 UI が見える」トレードオフとして既に受容・記録済み。Issue #728 はこれも「同方針で詰められるか」検討を求めている。

しかし両者は構造が異なる:
- 本 Issue の race は **mutation 直後に navigate と invalidate を逐次 await する** 競合。解法は「navigate 前に clearCache」。
- `useAuthGuardEffect` は **navigate を伴わず**、現在ルートに留まったまま AppShell だけ再評価する経路。clearCache に置き換えても navigate が無いので「現在ルートを新しい認証状態で再描画する」目的自体が達成できない。clearCache 解法はそのままでは適用できない。

`useAuthGuardEffect` を改善するなら「leaf 観測時に `/` 等へ明示 navigate する」別設計が必要で、これは #300 で採った client hook 方式（leaf に留まり redirect は defensive に任せる）の再設計に踏み込む。

### Decision
**本 Issue では `useAuthGuardEffect` 経路を変更しない（スコープ外）。** 理由を plan のスコープと本 ADR に明記し、必要なら別 Issue 化する。

### Consequences
- 良い点:
  - 本 Issue は「mutation 直後の navigate race」という単一の問題に集中でき、変更範囲が clearCache ヘルパー + 3〜4 フォームに収まる。
  - #300 ADR-001 で受容済みのトレードオフ（最大 1 フレーム、機密は leaf 側 fail-closed）を蒸し返さない。
- トレードオフ:
  - session 失効シナリオの 1 フレームちらつきは残置される。ただし発生条件（cookie 手動削除等）が限定的で、#300 で意図的に受容済み。
  - 「認証状態遷移時のちらつき」を完全にゼロにするには別 Issue で `useAuthGuardEffect` 側の navigate 設計を検討する余地が残る。

---
