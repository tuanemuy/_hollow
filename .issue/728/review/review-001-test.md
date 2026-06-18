# レビュー — Issue #728 / PR #731（観点: Test）

対象: PR #731 / plan: `.issue/728/plan.md`（AC-7・テスト方針）

検証実行:
- `pnpm vitest run`（helper / UserMenu / AccountDeleteForm / LoginForm の 4 ファイル）→ **21 passed**。
- `pnpm typecheck` → **pass**。

## Test

### Blockers

なし。

### Warnings

- **[W-001]** LoginForm のテストが新しい呼び出し方式（`clearCache`）に追従していない（plan AC-7 / テスト方針では「テストが存在すれば mock を追従させる（必須）」と明記） / 場所: `app/components/auth/__tests__/LoginForm.test.tsx:22-34,53` / 理由: plan ステップ 7 と AC-7 は「LoginForm / PasswordResetConfirmForm のテストは**存在すれば** mock を `clearCache` + `navigate` 方式に追従（**必須**）」と書いている。LoginForm テストは実在する（`app/components/auth/__tests__/LoginForm.test.tsx`）が、PR では一切改修されておらず、mock は依然 `useRouter: () => ({ invalidate, navigate })`（`clearCache` 無し・`invalidate` のまま）。テストが green を保てているのは、3 ケースすべてが `login.mockRejectedValue(...)` の**失敗パスのみ**で、成功パス（`clearAppShellCache(router)` → `navigate`）に到達しないため `router.clearCache` が一度も呼ばれず、mock に `clearCache` が無くても落ちないという偶発的事情による。結果として (a) `invalidate` mock が dead code として残存し（LoginForm はもう invalidate を呼ばない）、(b) `clearCache` mock が無いため将来 LoginForm 成功パスのテストを足した瞬間に `TypeError: router.clearCache is not a function` で落ちる地雷が残る。plan が「必須」と書いた追従が未実施。 / 提案: 最低限 `LoginForm.test.tsx` の hoisted mock を `{ clearCache, navigate }` に置換し、dead な `invalidate` を除去する。可能なら `login.mockResolvedValue` の成功ケースを 1 本足し、UserMenu と同形で `clearCache → navigate` の順序を assert すれば、AC-2（ログイン経路の race 不変条件）がテストで直接担保される（現状 AC-2 経路は typecheck と手動確認のみで、ユニットでは未検証）。

- **[W-002]** race の核心（clearCache が navigate に先行する不変条件）を**実際に検証しているのは UserMenu の 1 経路のみ**で、ログイン / リセット確認 / 退会の 3 経路は順序 assert が無い / 場所: `app/components/layout/__tests__/UserMenu.test.tsx:129-153` がカバー、`AccountDeleteForm/__tests__/index.test.tsx`（成功パス未テスト）・LoginForm（失敗パスのみ）・PasswordResetConfirmForm（テスト無し）が未カバー / 理由: AC-4 の順序不変条件「`clearAppShellCache` 呼び出しが直後の `navigate` に先行する」は本 Issue の修正の核心だが、ユニットで「clearCache → navigate の順」を実際に assert しているのは UserMenu test だけ。AccountDeleteForm の既存テストは失敗 / キャンセルパスのみで成功時の `clearCache → navigate` 順を検証していない（`navigate` の `not.toHaveBeenCalled()` を見るだけ）。helper の単体テストは filter 述語のみで「呼び出し順序」は守備範囲外（helper に navigate が含まれないため構造上当然）。したがって順序不変条件の担保は「UserMenu の 1 経路 + レビュー + 各フォームが同一パターンを直書きしているという目視」に依存しており、plan のテスト方針が想定する「順序ミスは helper/UserMenu テストで検知」も UserMenu の 1 経路に閉じている。3 経路は同型コードなので回帰リスクは低位だが、「核心の不変条件を 1 経路でしか機械検証していない」点は plan のテスト方針上の最小担保（helper + UserMenu + AccountDeleteForm 既存）には収まるものの、順序検証の網羅としては薄い。 / 提案: W-001 の LoginForm 成功ケース追加で 2 経路に増やすのが最もコスパが良い。AccountDeleteForm にも成功パス（`deleteAccount.mockResolvedValue` → `expect(order).toEqual(["clearCache","navigate"])`）を 1 本足せば、helper 化で挙動が変わらないことの正の確証（現状は「無改修で green」=負の確証のみ）になる。

### Notes

- **[N-001]** helper の単体テスト（`routerInvalidate.test.ts:155-186`）は要件を的確に満たしている。「`clearCache`（not invalidate）を駆動」「filter が `/_app` 厳密一致のみ true」「prefix-extension leaf（`/_app/notes` 等 5 種）を false」「無関係ルート（`__root__` / `/login` / `/`）を false」「戻り値 `undefined`（同期 void）」を網羅。既存 `appShellInvalidate` テストの `FakeMatch` / `take*Filter` パターンを忠実に流用しており、`makeClearCacheRouter` / `takeClearCacheFilter` を別関数に分けて `clearCache` が同期 void である点（`Promise<void>` を返さない）をコメントと型注釈で明示しているのは良い。AC-4 の「`/_app` 厳密一致のみ通す」要件を偽陽性なく検証できている。

- **[N-002]** UserMenu の順序テスト（`UserMenu.test.tsx:129-153`）は設計が堅実。`order` 配列を `mockImplementation` で push し `expect(order).toEqual(["clearCache","navigate"])` で順序を直接 assert している。clearCache は同期で push、navigate は async だが mock 実装が同期的に push してから resolve するため、`await Promise.resolve()` 2 回で transition が settle した時点で順序が確定する。`routerNavigate` の `toHaveBeenCalledWith({ to: "/login" })`（search 無し = ログアウト経路特有）も併せて確認しており、偽陽性リスクは低い。mock の置き換え（`invalidate` → `clearCache`）も `beforeEach` の `mockClear` 追従含めて漏れなく対応。

- **[N-003]** PasswordResetConfirmForm にテストが存在しないことは plan（AC-7 / テスト方針）の「無ければ追加は任意（最小担保 = helper + UserMenu + AccountDeleteForm 既存）」に合致し、妥当。search 付き navigate（`{ to: "/", search: HOME_SEARCH }`）の型回帰は `pnpm typecheck`（per-call 推論）でカバーされる設計で、実際 typecheck は pass。ただし LoginForm はこれと異なり**テストが実在する**ため「任意」ではなく「追従必須」側に該当する（W-001）。plan が両者を別扱いした根拠（存在有無）は成立しており、PR は PasswordResetConfirmForm 側の判断のみ plan 準拠、LoginForm 側で plan の「必須」から逸脱している。

- **[N-004]** AccountDeleteForm 既存テスト（`index.test.tsx`）は mock 構造（`useRouter: () => ({ navigate, clearCache })`）を一切変えずに green 維持できており、plan S-003（呼ぶ router メソッドが clearCache / navigate のまま不変 → 無改修 green）の通り。ただしこれは成功パスを元々テストしていないことに支えられた「負の確証」であり、helper 経由でも `clearCache` が正しく呼ばれることの正の検証ではない（W-002 で補強提案）。

- **[N-005]** JSDoc / コメントの整合は良好。`routerInvalidate.ts` の 3 箇所 JSDoc（モジュール冒頭・`routerInvalidate` rule 列挙・`appShellInvalidate`）が「navigate を伴う auth 遷移 = `clearAppShellCache` / navigate を伴わない再評価 = 生 invalidate・`appShellInvalidate`」の線引きで一貫更新されており、テスト読者が helper の意図を誤読するリスクが低い。各フォームの置換コメントも `#728 ADR-001` を引いて race 回避理由を明記。

## サマリ

- helper 単体テストと UserMenu 順序テストは要件を的確に満たす（N-001 / N-002）。
- 唯一の plan 逸脱は LoginForm テストの未追従（W-001、plan で「必須」とされた追従が偶発的 green に依存して未実施）。Blocker ではないが将来テスト追加時の地雷と dead mock を残す。
- race 核心の順序不変条件は UserMenu 1 経路のみ機械検証（W-002）。plan の最小担保は満たすが、LoginForm / AccountDeleteForm 成功パス追加で網羅を厚くする余地。
