# レビュー — Issue #728 / PR #731（観点: Test / 3 周目フルレビュー）

対象: PR #731 / plan: `.issue/728/plan.md`（AC-7・テスト方針）
前回: `.issue/728/review/review-001-test.md` / `review-002-test.md`
- round-2 B-001 = LoginForm テストが working tree に未コミットで PR に含まれていない（偽陽性 green の地雷が残存）
- round-2 W-001 = 順序不変条件（clearCache → navigate）の機械検証が UserMenu 1 経路のみ。AccountDeleteForm 成功パス追加の余地

## 検証実行

- **PR コミット構成**: PR #731 は 2 コミット。
  - `80b56cd` feat: helper 追加 + 3 フォーム + 退会フロー統一（実装 + helper/UserMenu test）
  - `3e46fd4` test: `#728 ログイン/退会の成功パスで clearCache→navigate 順序を検証`（**B-001 / W-001 の修正コミット**）
- **コミット済み diff の確認**: `git show 3e46fd4 --stat` に `app/components/auth/__tests__/LoginForm.test.tsx`（+40）と `app/components/identity/AccountDeleteForm/__tests__/index.test.tsx`（+27/+0）が **コミット済みで含まれている**ことを確認。
- **working tree の確認**: `git status --short` に test 系の `M`（modified）は**無し**。round-2 で working tree のみに存在した LoginForm 修正が**コミットされた**ことを確認（B-001 解消の決定的証拠）。
- **テスト実行（コミット済み HEAD）**: `pnpm vitest run LoginForm / AccountDeleteForm / UserMenu / routerInvalidate` → **4 files / 23 passed**。
- **実装との突き合わせ**: コミット済み `LoginForm/index.tsx:86` / `AccountDeleteForm/index.tsx:51` / `UserMenu.tsx:71` / `PasswordResetConfirmForm/index.tsx:100` が `clearAppShellCache(router)`（= `router.clearCache`）→ `await router.navigate(...)` を呼ぶことを確認。テスト mock（`useRouter: () => ({ clearCache, navigate })`）と整合。
- **移行網羅の確認**: `grep clearAppShellCache` で migration 対象 4 フォーム（Login/Reset/UserMenu/AccountDelete）のみが helper を使い、invalidate-only 4 フォーム（VerifyEmail/EmailChangeConfirm/SignUp/AdminSignUp）は `router.invalidate()` のまま（AC-6 スコープ・無改修）であることを確認。ProfileForm の invalidate は rule 3（displayName）で無関係。

---

## Test

### Blockers

- なし。round-2 B-001（LoginForm テストのコミット漏れ）は**完全に解消**した。コミット `3e46fd4` で `LoginForm.test.tsx` が PR に含まれ、router mock が `{ login, resend, clearCache, navigate }` へ追従、dead だった `invalidate` mock を除去、`beforeEach` の reset も追従済み。working tree に未コミットの test 差分は残っていない。コミット済み HEAD 単体で 23 passed。

### Warnings

- なし。round-2 W-001（順序検証が 1 経路）は**解消**した。順序不変条件（clearCache → navigate）の機械検証はコミット済みで **3 経路**に拡張された:
  - `UserMenu.test.tsx:129-153` — `order` 配列 push 方式で `expect(order).toEqual(["clearCache","navigate"])`、`navigate` 引数 `{ to: "/login" }`（ログアウト経路特有）も検証。
  - `LoginForm.test.tsx:83-110` — `order` 配列 push 方式で `["clearCache","navigate"]`、`navigate` 引数 `{ to: "/", search: HOME_SEARCH }`（search 付き = ログイン経路特有）、成功時に error summary が出ない negative assert も。
  - `AccountDeleteForm/__tests__/index.test.tsx:161-183` — `clearCache.mock.invocationCallOrder[0] < navigate.mock.invocationCallOrder[0]` で順序を直接 assert（push 方式と等価な正の確証）、`navigate` 引数 `{ to: "/", search: HOME_SEARCH }`、成功時に `[role="alert"]` が 0 件も確認。round-2 で「負の確証（navigate not called）に留まる」と指摘した AccountDeleteForm が、helper 経由で `clearCache` が実際に駆動されることの**正の検証**に格上げされた。
- 偽陽性チェック: 3 経路とも成功パス（`*.mockResolvedValue(undefined)`）で実際に `clearAppShellCache → navigate` 到達経路を踏ませており、mock router に `clearCache` が定義されている（round-2 で問題だった「成功パス未到達 + clearCache mock 欠如」の組み合わせは解消）。`order` 配列方式と `invocationCallOrder` 方式はどちらも順序が逆転すれば fail する有効な検証で、偽陽性は無い。

### Notes

- **[N-001]** B-001 / W-001 の修正コミット `3e46fd4` のコミットメッセージが「W-001 / W-002 を反映」「UserMenu 1 経路 → 3 経路に拡張」と修正意図を明記しており、レビュー指摘との対応が追跡可能。

- **[N-002]** LoginForm 成功テスト（`83-110`）は要件を的確に満たす。`login.mockResolvedValue(undefined)` で成功パスへ到達、`order` push 方式（clearCache 同期 push / navigate は async だが mock 内で同期 push 後 resolve）で `["clearCache","navigate"]` を直接 assert。`HOME_SEARCH` を `../links` から import し `navigate` 引数を `{ to: "/", search: HOME_SEARCH }` まで確認、成功時に `[role="alert"]` が null である negative assert も含む。UserMenu と同形で偽陽性リスクが低い。

- **[N-003]** AccountDeleteForm 成功テスト（`161-183`）は `deleteAccount.mockResolvedValue(undefined)` → `openDialog → typeConfirmation("alice") → submit` で成功パスを正しく踏ませている。`invocationCallOrder` を使った順序 assert は vitest の標準 API で妥当。既存の `useRouter: () => ({ navigate, clearCache })` mock 構造（plan S-003 で無改修 green とされたもの）をそのまま使い、成功テストを 1 本足すだけで正の確証に転換しており追加コストが最小。

- **[N-004]** helper 単体テスト（`routerInvalidate.test.ts`、コミット済み）は `clearCache`（not invalidate）駆動・filter `/_app` 厳密一致のみ true・prefix-extension leaf を false・無関係ルートを false・戻り値 `undefined`（同期 void）を網羅。AC-4 の「`/_app` 厳密一致のみ通す」を偽陽性なく検証。round-2 N-003 から不変で維持。

- **[N-005]** PasswordResetConfirmForm にテストが存在しないことは plan（AC-7 / テスト方針）の「無ければ追加は任意（最小担保 = helper + UserMenu + AccountDeleteForm 既存）」に合致。`__tests__/` ディレクトリ自体が存在しないことを確認。search 付き navigate（`{ to: "/", search: HOME_SEARCH }`）の型回帰は `pnpm typecheck`（per-call 推論）と LoginForm の同型成功テストでカバーされる設計で、テスト無しは妥当。実装は `clearAppShellCache(router)` へ移行済み（`index.tsx:100`）。

- **[N-006]** invalidate-only 4 フォーム（VerifyEmail/EmailChangeConfirm/SignUpForm/AdminSignUpForm）は AC-6 スコープで無改修。`grep` で `router.invalidate()` のまま残ることを確認しており、テスト変更が無いのは正しい（挙動不変のため）。本 Issue の race 修正テストの対象外であることが plan と整合。

---

## サマリ

- **round-2 B-001 / W-001 はいずれもコミット `3e46fd4` で解消済み。** B-001（LoginForm テストのコミット漏れ）は test 差分が PR にコミットされ working tree に未コミット差分が残っていないことを確認。W-001（順序検証 1 経路）は UserMenu / LoginForm / AccountDeleteForm の **3 経路**に拡張され、AccountDeleteForm は負の確証から正の確証へ格上げ。
- コミット済み HEAD 単体で 4 ファイル 23 passed。3 経路とも成功パスを実際に踏ませ偽陽性は無し。
- helper 単体テスト・invalidate-only フォームの扱い・PasswordResetConfirmForm のテスト無し（plan 許容）はいずれも plan のテスト方針・AC-7 と整合。Test 観点で未充足の要件は無い。

- Blockers: 0 / Warnings: 0 / Notes: 6
