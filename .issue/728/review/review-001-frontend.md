# PR #731 レビュー (Issue #728) — Frontend 観点

対象: ルーター制御・コンポーネント挙動・race 修正の正しさ

検証済みの事実:
- `pnpm typecheck` green / `pnpm test:unit` 全 247 ファイル 3872 テスト green。
- `@tanstack/router-core@1.171.13` の `ClearCacheFn` は `(opts?) => void`（同期 void）。ADR が引いた 1.170.15 とバージョンは違うがシグネチャは不変で、`clearAppShellCache(router): void` / await しない設計は正しい（`router.d.ts:504-506` で確認）。
- 生 `clearCache` 呼び出しは `routerInvalidate.ts:136` の helper 内部のみ。3 フォーム + AccountDeleteForm はすべて `clearAppShellCache(router)` 経由。
- 4 箇所すべてで `clearAppShellCache(router);` が `await router.navigate({...})` に **先行**（破棄 → 遷移の順序不変条件 AC-4 を満たす）。navigate 引数はリテラルのまま呼び出し側に残り per-call 推論が保たれている（typecheck green が裏付け）。
- `_app/route.tsx:101`（errorComponent retry）と `useAuthGuardEffect.ts:53`（session 失効観測）は引き続き `appShellInvalidate`。新 JSDoc の線引き「navigate を伴わない AppShell 再評価 = appShellInvalidate / navigate を伴う auth 遷移 = clearAppShellCache」と実装が完全一致。

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** `LoginForm.test.tsx` の router mock が実装に追従していない / 場所: `app/components/auth/__tests__/LoginForm.test.tsx:22-33,53` / 理由: 実装は `await router.invalidate()` を捨てて `clearAppShellCache(router)`（= `router.clearCache(...)`）を呼ぶようになったのに、テストの mock は依然 `useRouter: () => ({ invalidate, navigate })` で **`invalidate` を提供し `clearCache` を提供していない**。現状この test は成功ログイン経路（`login.mockResolvedValue` を張らない）を一切踏まないため `clearCache` が `undefined` でも例外にならず green だが、mock が「もう呼ばれない `invalidate`」を宣言し「実際に呼ばれる `clearCache`」を欠くため、実装と乖離した misleading な mock になっている。plan AC-7 は「LoginForm はテストが存在すれば mock を追従させる（必須）」と明記しており、テストは存在する（UserMenu / AccountDeleteForm は追従済み）のに LoginForm だけ取り残されている。将来この test に成功経路アサーション（navigate 呼び出し検証等）を足した瞬間に `router.clearCache is not a function` で落ちる地雷。/ 提案: `invalidate` を削り `clearCache: vi.fn()` を hoisted mock と `useRouter` に追加（UserMenu test と同形）。余裕があれば成功ログインで `clearCache → navigate` 順序を assert する 1 ケースを追加すると LoginForm の回帰も担保できる（plan の「最小担保」上は任意）。

### Notes
- **[N-001]** 4 フォームの clearCache→navigate 順序が全て揃っており、UserMenu test に `order: ["clearCache","navigate"]` の順序不変条件 assert（`UserMenu.test.tsx:126-152`）が入っている。helper test も `/_app` 厳密一致のみ通し leaf prefix-extension（`/_app/notes` 等）を弾く検証を持つ。AC-4 / AC-5 / AC-7 の核心が機械的に担保されている良い設計。
- **[N-002]** JSDoc 3 箇所（モジュール冒頭 / `routerInvalidate` rule 列挙 / `appShellInvalidate`）が clearCache 化に合わせて一貫改訂され、`routerInvalidate.ts` 内部に「rule 1 = 生 invalidate」という旧規約と「rule 1 navigate = clearCache」という新実装が併存する自己矛盾が解消されている。errorComponent retry / useAuthGuardEffect が実際に `appShellInvalidate` のまま残っている事実とも矛盾なし。SSOT モジュールの規約一貫性が保たれている。
- **[N-003]** ログアウトは `/login`（`_app` 外）、ログイン/リセット/退会は `/`（`_app` 内）への遷移。前者は clearCache 済みの `_app` match がアンマウントされる経路で race 構造はむしろ単純（安全側）。AccountDeleteForm の `_app` 内遷移実績に加えて経路差を踏まえても破棄先行で問題なし。ただし「ランディング 1 フレーム挟まらない」の最終確証は 1 フレームの瞬間表示ゆえユニットでは取り切れず、plan/testing.md に記載の手動目視（各パスからのログアウト・Slow 3G）に依存する点は留意（実装上の問題ではない）。
- **[N-004]** AccountDeleteForm は旧インライン `{ filter: (match) => match.routeId === "/_app" }`（文字列リテラル）から helper の `APP_SHELL_ROUTE_ID` 定数経由に寄り、routeId リネーム時の追従点が 1 定数に集約された。呼ぶ router メソッド（clearCache / navigate）は不変で挙動完全等価、既存 test（`clearCache` mock 済み）無改修で green。AC-5 を満たす。
