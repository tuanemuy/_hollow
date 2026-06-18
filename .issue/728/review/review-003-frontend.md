# PR #731 レビュー (Issue #728) — Frontend 観点（3 周目フルレビュー）

対象: ルーター制御・コンポーネント挙動・race 修正の正しさ

## 検証済みの事実

- PR head commit = ローカル HEAD = `3e46fd43`（`gh pr view 731 --json headRefOid` と `git rev-parse HEAD` で一致確認）。`git status` に `M`（未コミットの working-tree 変更）は **無い**。
- **2 周目 B-001（LoginForm.test.tsx コミット漏れ）は解消済み**。`gh pr diff 731 --name-only` に `app/components/auth/__tests__/LoginForm.test.tsx` が含まれ、コミット `3e46fd43`（"test(ui): #728 ログイン/退会の成功パスで clearCache→navigate 順序を検証"）に反映されている。コミット済み版が clearCache mock 追従 + 成功パス順序 assert を持つ。
- LoginForm.test.tsx（committed）の mock は `useRouter: () => ({ clearCache, navigate })` に更新済み（旧 `invalidate` は除去）。成功パステスト（83-108 行）が `login.mockResolvedValue(undefined)` で成功経路を踏み、`order.push` 方式で `expect(order).toEqual(["clearCache", "navigate"])` を assert。`navigate` が `{ to: "/", search: HOME_SEARCH }` で 1 回呼ばれること、成功時 `role=alert` 不在も検証。既存 3 ケース（失敗サマリ・unverified status・validation field error の回帰）は温存。
- AccountDeleteForm.test.tsx（committed）に成功パステスト（161-185 行）を追加。`clearCache.mock.invocationCallOrder[0] < navigate.mock.invocationCallOrder[0]` で破棄 → 遷移順序を検証。`navigate` 引数 `{ to: "/", search: HOME_SEARCH }`、成功時 `role=alert` 不在も検証。既存テスト（validation / server error / cancel）は無改修で温存。
- helper 実装（`routerInvalidate.ts:135-139`）は `router.clearCache({ filter: m => m.routeId === APP_SHELL_ROUTE_ID })` の同期 void。await されていない。生 `.clearCache(` 呼び出しは helper 内部のみ、call site 4 箇所（LoginForm:86 / PasswordResetConfirmForm:100 / UserMenu:71 / AccountDeleteForm:51）はすべて `clearAppShellCache(router)` 経由。`await clearAppShellCache` は 0 件。
- 4 箇所すべてで `clearAppShellCache(router);` が `await router.navigate({...})` に **先行**（AC-4 の破棄 → 遷移順序不変条件を満たす）。navigate 引数はリテラルのまま呼び出し側に残り per-call 推論を保つ。
- JSDoc 3 箇所（モジュール冒頭 1-21 / `routerInvalidate` rule 列挙 62-74 / `appShellInvalidate` 105-113）が clearCache 化に一貫追従。errorComponent retry / `useAuthGuardEffect` は引き続き `appShellInvalidate`（navigate を伴わない再評価）で JSDoc の線引きと実装が一致。
- ユニット: `LoginForm` / `AccountDeleteForm` / `UserMenu` / `routerInvalidate` の 4 ファイル 23 テスト green（`pnpm vitest run` で実行確認）。

## Frontend

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** 2 周目 B-001（LoginForm.test.tsx の未コミット）が**コミット済み diff で完全に解消**。committed `3e46fd43` の LoginForm.test.tsx は (a) `invalidate` mock 除去 + `clearCache` mock 追加、(b) 成功パスで `order.push` による `["clearCache","navigate"]` 順序 assert、(c) 既存 3 回帰ケース温存、を満たす。タスク前提（W-001=未コミットは push 済みで解消したはず）は正しく、コミット済み内容で再現確認した（23 テスト green）。

- **[N-002]** race 回避の不変条件（clearCache → navigate）の機械検証が **UserMenu 1 経路から 3 経路（UserMenu / LoginForm / AccountDeleteForm）へ拡大**。LoginForm は `order.push` 方式、AccountDeleteForm は `invocationCallOrder` 方式と実装が異なるが、いずれも「破棄が遷移に先行」を確実に検出する。PasswordResetConfirmForm のみ専用テストは無いが、helper 共通化により呼び出し形が 3 経路と同一・typecheck で navigate 引数を担保しており、plan の「最小担保」設計上は許容範囲（AC-7）。

- **[N-003]** helper 本体・4 call site・JSDoc 3 箇所はいずれも plan / ADR-001 と一致。clearCache→navigate 順序、navigate のリテラル引数 per-call 推論、同期 void で await しない設計、`APP_SHELL_ROUTE_ID` 厳密一致 filter、すべて整合。AccountDeleteForm は呼ぶ router メソッド（clearCache / navigate）不変で挙動完全等価、routeId リネーム追従点が `APP_SHELL_ROUTE_ID` 1 定数に集約（AC-5）。

- **[N-004]** JSDoc の線引き「navigate を伴わない AppShell 再評価 = `appShellInvalidate` / navigate を伴う auth 遷移 = `clearAppShellCache`」が、残存 `appShellInvalidate` 利用箇所（errorComponent retry・`useAuthGuardEffect` の session 失効観測）と矛盾なく一致。SSOT モジュール内の「rule 1 = 生 invalidate」旧規約と新実装の自己矛盾は解消済み。`EmailChangeConfirm` の `rule 1` コメント（認証状態を変えないメールキャッシュ破棄）が線引きの外という整理も plan に記録され記述ぶれ無し。

- **[N-005]** 「ランディング 1 フレーム挟まらない」の最終確証は瞬間表示ゆえユニットでは取り切れず、testing.md の手動目視（各パスからのログアウト・ログイン・リセット確認・退会）に依存する点は構造上の限界（実装の問題ではない）。ログアウトのみ `_app` 外（`/login`）遷移で経路が異なるが、clearCache 済み `_app` match がアンマウントされる経路で race 構造はむしろ単純（安全側）。
