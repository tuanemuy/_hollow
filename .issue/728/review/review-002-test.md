# レビュー — Issue #728 / PR #731（観点: Test / 2 周目）

対象: PR #731 / plan: `.issue/728/plan.md`（AC-7・テスト方針）
前回: `.issue/728/review/review-001-test.md`（W-001 = LoginForm mock 未追従, W-002 = 順序検証が UserMenu のみ）

検証実行:
- **コミット済み状態の確認**: `gh pr diff 731` の committed diff に `LoginForm.test.tsx` の変更が**含まれていない**ことを確認（`git diff main...HEAD --stat` に出てこない）。
- **working tree 状態の確認**: `git status` で `app/components/auth/__tests__/LoginForm.test.tsx` が `M`（modified, uncommitted）。round-1 の修正は **作業ツリーにしか存在せず、PR にコミットされていない**。
- コミット済み状態（W-001 修正を stash）で `pnpm vitest run LoginForm.test.tsx` → **3 passed**（=旧 mock のまま偶発的 green）。
- working tree 状態で 4 ファイル（helper / UserMenu / AccountDeleteForm / LoginForm）→ **21 passed**。

---

## Test

### Blockers

- **[B-001]** round-1 W-001 / W-002 の修正（LoginForm テストの clearCache 追従 + 成功パス順序 assert）が **コミットされておらず PR #731 に含まれていない**。`LoginForm.test.tsx` は working tree で modified のまま（uncommitted）。
  / 場所: `app/components/auth/__tests__/LoginForm.test.tsx`（committed HEAD は依然 `useRouter: () => ({ invalidate, navigate })`、`clearCache` mock 無し・`invalidate` mock が dead）。実装側 `app/components/auth/LoginForm/index.tsx:86` は committed で `clearAppShellCache(router)`（= `router.clearCache`）を呼ぶ。
  / 理由: PR がマージされる対象は **コミット済み diff**。コミット済みの LoginForm.test.tsx は round-1 W-001 とまったく同じ「実装は `router.clearCache` を呼ぶが mock router に `clearCache` が無い」状態。3 ケース全てが `login.mockRejectedValue(...)` の**失敗パスのみ**で成功パス（`clearAppShellCache → navigate`）に到達しないため `clearCache` が一度も呼ばれず、mock に `clearCache` が無くても偶発的に green になっているだけ（stash して実証済み: 3 passed）。これは round-1 が指摘した「偽陽性 green に依存・将来の成功パステスト追加で `TypeError: router.clearCache is not a function` の地雷」がそのまま残存していることを意味する。plan AC-7 / テスト方針が「LoginForm テストは存在するため mock 追従**必須**」と明記した要件が **PR には反映されていない**。working tree の修正内容自体は正しい（21 passed・後述 N-001）が、コミットされない限り PR の品質ゲートとしては未充足。
  / 提案: working tree の `LoginForm.test.tsx` の変更を**コミットして PR に含める**。これだけで B-001 は解消する（修正内容は既に正しい）。コミット後 `git diff main...HEAD --stat` に `LoginForm.test.tsx` が現れることを確認すること。

### Warnings

- **[W-001]** （round-1 W-002 の残件・低位）race 核心の順序不変条件（clearCache → navigate）を機械検証している経路が、コミット済み PR では **UserMenu の 1 経路のみ**。working tree の LoginForm 成功テストを足しても 2 経路。AccountDeleteForm / PasswordResetConfirmForm の成功パス順序検証は依然無し。
  / 場所: `UserMenu.test.tsx:129-153`（committed・カバー済）、`LoginForm.test.tsx:83-108`（working tree のみ・B-001 解消で 2 経路目）、`AccountDeleteForm/__tests__/index.test.tsx`（成功パス未テスト・`navigate` の `not.toHaveBeenCalled()` を見る失敗/キャンセルパスのみ）、`PasswordResetConfirmForm`（テスト無し）。
  / 理由: AC-4 の順序不変条件は本 Issue の修正の核心。plan のテスト方針上の最小担保（helper + UserMenu + AccountDeleteForm 既存）には収まるが、AccountDeleteForm は plan S-003 の「無改修 green」=負の確証（`navigate` が呼ばれないことの確認）に留まり、helper 経由で `clearCache` が正しく駆動されることの正の検証ではない。3 経路は同型コードで回帰リスクは低位だが、核心の不変条件の機械検証としては薄い。
  / 提案: B-001 解消（LoginForm 成功テストのコミット）で 2 経路に増えるのが最もコスパ良い。さらに AccountDeleteForm に成功パス（`deleteAccount.mockResolvedValue` → `const order=[]` push 方式で `expect(order).toEqual(["clearCache","navigate"])`）を 1 本足せば、helper 化で挙動が変わらないことの正の確証になる。必須ではないが Blocker 解消ついでに推奨。

### Notes

- **[N-001]** working tree の `LoginForm.test.tsx` 修正内容は要件を的確に満たしている（B-001 でコミットさえすれば良い）。hoisted mock を `{ login, resend, clearCache, navigate }` に置換、`useRouter: () => ({ clearCache, navigate })` へ追従、dead な `invalidate` を完全除去、`beforeEach` の `mockReset` も追従。追加した成功テスト（`83-108`）は `login.mockResolvedValue(undefined)` で成功パスへ到達させ、`order` 配列 push 方式（clearCache は同期 push / navigate は async だが mock 内で同期 push 後 resolve）で `expect(order).toEqual(["clearCache","navigate"])` を直接 assert、加えて `navigate` の引数を `{ to: "/", search: HOME_SEARCH }`（search 付き = ログイン経路特有）まで確認し、成功パスで error summary が出ないことも negative assert。UserMenu と同形で偽陽性リスクが低い。

- **[N-002]** UserMenu の順序テスト（`UserMenu.test.tsx:129-153`、committed）は堅実。`order` 配列 push + `expect(order).toEqual(["clearCache","navigate"])` で順序を直接 assert、`routerNavigate` の `toHaveBeenCalledWith({ to: "/login" })`（search 無し = ログアウト経路特有）も確認。mock 置換（`invalidate` → `clearCache`）と `beforeEach` の `mockClear` 追従も漏れなし。これは PR にコミット済み。

- **[N-003]** helper の単体テスト（`routerInvalidate.test.ts:155-186`、committed）は要件を的確に満たす。「`clearCache`（not invalidate）を駆動」「filter が `/_app` 厳密一致のみ true」「prefix-extension leaf（`/_app/notes` 等 5 種）を false」「無関係ルート（`__root__` / `/login` / `/`）を false」「戻り値 `undefined`（同期 void）」を網羅。既存 `appShellInvalidate` テストの `FakeMatch` / `take*Filter` パターンを忠実に流用し、`makeClearCacheRouter` / `takeClearCacheFilter` を別関数に分けて clearCache が同期 void（`Promise<void>` を返さない）点を型注釈とコメントで明示。AC-4 の「`/_app` 厳密一致のみ通す」を偽陽性なく検証。これは PR にコミット済み。

- **[N-004]** AccountDeleteForm 既存テスト（`index.test.tsx`）は mock 構造（`useRouter: () => ({ navigate, clearCache })`）を一切変えずに green 維持できており、plan S-003（呼ぶ router メソッドが clearCache / navigate のまま不変 → 無改修 green）の通り。ただし成功パス未テストに支えられた負の確証であり、helper 経由で `clearCache` が呼ばれることの正の検証ではない（W-001 で補強提案）。

- **[N-005]** PasswordResetConfirmForm にテストが存在しないことは plan（AC-7 / テスト方針）の「無ければ追加は任意（最小担保 = helper + UserMenu + AccountDeleteForm 既存）」に合致し妥当。search 付き navigate の型回帰は `pnpm typecheck`（per-call 推論）でカバーされる設計。ただし LoginForm はこれと異なり**テストが実在する**ため「存在すれば追従必須」側に該当し、その追従が PR にコミットされていないのが B-001。plan が両者を別扱いした根拠（存在有無）は成立している。

---

## サマリ

- **round-1 W-001 / W-002 の修正は内容としては正しく書かれているが、`LoginForm.test.tsx` が working tree に未コミットのまま PR #731 に含まれていない（B-001）。** コミット済みの PR は round-1 W-001 とまったく同じ「実装は `clearCache` を呼ぶが mock に `clearCache` が無く、失敗パスのみで偶発的 green」状態が残存している（stash 実証: 3 passed）。コミットすれば即解消。
- UserMenu 順序テスト・helper 単体テストは PR にコミット済みで要件を的確に満たす（N-002 / N-003）。
- 順序不変条件の機械検証は（B-001 解消後でも）2 経路に留まり、AccountDeleteForm 成功パス追加の余地（W-001）。

- Blockers: 1 / Warnings: 1 / Notes: 5
