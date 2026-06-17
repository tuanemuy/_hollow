# PR #731 レビュー (Issue #728) — Frontend 観点（2 周目フルレビュー）

対象: ルーター制御・コンポーネント挙動・race 修正の正しさ

## 検証済みの事実

- PR head commit = ローカル HEAD = `80b56cdb`（`gh pr view 731 --json headRefOid` で一致確認）。
- PR が含むファイルは 10 ファイル。`gh pr diff 731 --name-only` で確認。
- `clearAppShellCache` 実装は `routerInvalidate.ts:135-139` で `router.clearCache({ filter: m => m.routeId === APP_SHELL_ROUTE_ID })` の同期 void。await されていない。
- 生 `.clearCache(` 呼び出しは helper 内部（`routerInvalidate.ts:136`）のみ。call site 4 箇所（AccountDeleteForm:51 / LoginForm:86 / PasswordResetConfirmForm:100 / UserMenu:71）はすべて `clearAppShellCache(router)` 経由。`await clearAppShellCache` は 0 件。
- 4 箇所すべてで `clearAppShellCache(router);` が `await router.navigate({...})` に **先行**（破棄 → 遷移の AC-4 順序不変条件を満たす）。navigate 引数はリテラルのまま呼び出し側に残り per-call 推論が保たれている。
- JSDoc 3 箇所（モジュール冒頭 1-21 / `routerInvalidate` rule 列挙 62-74 / `appShellInvalidate` 105-113）が clearCache 化に一貫追従。`_app/route.tsx` errorComponent retry と `useAuthGuardEffect` は引き続き `appShellInvalidate`（navigate を伴わない再評価）で、JSDoc の線引きと実装が一致。
- ユニット: 委員会の committed PR 状態（LoginForm.test の working-tree 変更を stash した状態）で `routerInvalidate` / `UserMenu` / `AccountDeleteForm` 計 18 テスト green。

## Frontend

### Blockers

- **[B-001]** 1 周目 W-001 の LoginForm.test.tsx 修正が **コミットされておらず PR に含まれていない** / 場所: `app/components/auth/__tests__/LoginForm.test.tsx`（`git status` で ` M` = 未コミットの working-tree 変更）/ 理由: ディスク上のファイルは clearCache/navigate mock 追従 + 成功パスの `order: ["clearCache","navigate"]` 順序 assert を持つ正しい状態だが、これは **作業ツリーの未コミット変更**であり、PR head commit `80b56cdb` には反映されていない。`gh pr diff 731 --name-only` に LoginForm.test.tsx は現れず、その最終コミットは無関係 PR（#546/#592）由来の `10a44eea`。コミット済み HEAD 版は依然として旧 mock（`useRouter: () => ({ invalidate, navigate })`、`clearCache` 不在）で、1 周目 W-001 が指摘した「実装は `clearCache` を呼ぶのに mock は `invalidate` を提供し `clearCache` を欠く misleading な mock」「成功経路を踏まないため green-but-misleading」という状態がそのまま残っている。stash して committed 版を実行 → 3 テスト green（成功パス未到達ゆえ clearCache 不在でも落ちない）、working-tree 版 → 4 テスト green（成功パスで clearCache→navigate 順序を assert）と再現確認済み。**PR レビューはコミット済み内容に対して行われるべきで、ローカル未コミットの修正は「修正済み」と見なせない。** タスク前提（「W-001=LoginForm test 未追従は修正済みのはず」）は **誤り**で、修正は commit/push されていない。/ 提案: `git add app/components/auth/__tests__/LoginForm.test.tsx && git commit` でこの修正をブランチに乗せて push する。working-tree 版の内容自体は正しい（clearCache mock 追従 + 成功パス順序 assert + 既存 3 ケース維持で 4 テスト green）ので、コミットして PR に含めれば B-001 は解消する。

### Warnings

なし

### Notes

- **[N-001]** working-tree の LoginForm.test.tsx 修正内容（未コミットだが）は質の高い追従。`invalidate` mock を `clearCache` に置換し、UserMenu test と同形の成功パス順序 assert（`expect(order).toEqual(["clearCache","navigate"])` + `navigate` が `{ to: "/", search: HOME_SEARCH }` で呼ばれる検証 + 成功時 `role=alert` 不在）を追加。既存 3 ケース（失敗サマリ・unverified status・validation field error の回帰）を温存しており、コミットされさえすれば LoginForm の race 回帰も機械的に担保される。B-001 はあくまで「コミット漏れ」であって修正内容の問題ではない。

- **[N-002]** helper 実装（`routerInvalidate.ts:135-139`）・4 call site・JSDoc 3 箇所は committed PR 内で完結しており正しい。clearCache→navigate の順序、navigate のリテラル引数 per-call 推論、同期 void で await しない設計、`APP_SHELL_ROUTE_ID` 厳密一致 filter、いずれも plan / ADR-001 と一致。UserMenu test の `order` 順序 assert（`UserMenu.test.tsx:126-152`）と helper test の prefix-extension 弾き検証（`/_app/notes` 等を false）も committed 済みで AC-4/AC-5/AC-7 の核心を担保。LoginForm test のコミット漏れ 1 点を除けば実装本体は完成度が高い。

- **[N-003]** AccountDeleteForm のコメントが旧インライン文字列リテラル `{ filter: routeId === "/_app" }` から helper 経由（`APP_SHELL_ROUTE_ID` 定数）に寄り、routeId リネーム時の追従点が 1 定数に集約。呼ぶ router メソッド（clearCache / navigate）不変で挙動完全等価、既存 test 無改修 green（AC-5）。

- **[N-004]** JSDoc の線引き「navigate を伴わない AppShell 再評価 = `appShellInvalidate` / navigate を伴う auth 遷移 = `clearAppShellCache`」が、実コードの残存 `appShellInvalidate` 利用箇所（errorComponent retry・`useAuthGuardEffect` の session 失効観測）と矛盾なく一致。SSOT モジュール内の「rule 1 = 生 invalidate」旧規約と新実装の自己矛盾は committed 内で解消されている。`EmailChangeConfirm` の `rule 1` コメント（認証状態を変えないメールキャッシュ破棄）も線引きの外という整理が plan に記録されており記述ぶれ無し。
