# PR Review #001 — feat(issue/300): persist AppShell across session expiry and transient errors

**PR:** #314
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 18
- Verdict: **BLOCKED**（Warning が複数あり修正してから APPROVED 判定）

3 レイヤー並列レビュー: Frontend / Test / Performance · RSC · Auth

---

## Frontend / Route Architecture

#### Blockers
なし

#### Warnings
- **[W-F-001]** `AppErrorFallback` の retry button: `disabled={isPending}` だけだとペンディング中の視覚フィードバックが弱い
  - 場所: `app/routes/_app/route.tsx:91-115`
  - 提案: `aria-busy={isPending}` を追加（最小修正）
- **[W-F-002]** `useAuthGuardEffect` の JSDoc に user identity 判定が `shellUserDto.id` のみであること、`router` が referentially stable であることの記載なし
  - 場所: `app/components/common/useAuthGuardEffect.ts`
  - 提案: JSDoc 末尾に「user identity は id のみで判定」「router は singleton で安定」を 1 段追記

#### Notes
- N-F-001: `HomeRoute` で hook 呼び出しを `if (!data.authenticated) return <LandingPage />;` の前に置いている点が rules of hooks 準拠で、コメントで意図を明示
- N-F-002: `getRouteApi("/_app")` を module-level const で受ける既存パターンと整合
- N-F-003: `appShellInvalidate` を `routerInvalidate.ts` に同居させる ADR-005 を忠実に踏襲。`APP_SHELL_ROUTE_ID` 定数は module-local 維持
- N-F-004: `AppErrorFallback` の `useRouter()` は TanStack Router の `<Match>` 配下で利用可能、ADR-003 に従う
- N-F-005: hook 内 fire-and-forget と errorComponent 内 awaited の使い分けが 2 周目修正で反映されている
- N-F-006: `AppErrorFallback` を named function に切り出し、React DevTools 識別性向上
- N-F-007: Tailwind utility ベース / `data-*` 規約 / `${pillBtn} ${pillBtnPrimary}` 組合せが CLAUDE.md 規約と整合
- N-F-008: routeTree.gen.ts への影響なし（route ツリー構造未変更）
- N-F-009: test 仕様が hook の発火条件マトリクス 4 ケース + 依存配列安定性をカバー

---

## Test

#### Blockers
なし

#### Warnings
- **[W-T-001]** `useAuthGuardEffect.test.tsx` で `appShellInvalidate` の filter shape を検証していない（helper 委譲が壊れた場合の regression を検出できない）
  - 場所: `app/components/common/__tests__/useAuthGuardEffect.test.tsx:84-91`
  - 提案: W-A-001 fires テストで filter 形状アサーション追加
- **[W-T-002]** `AppErrorFallback` の retry 動線に単体テストがない
  - 場所: `app/routes/_app/route.tsx:91-116`（テスト非存在）
  - 提案: `AppErrorFallback.test.tsx` を新規追加し、click → invalidate → disabled の連鎖を pin
- **[W-T-003]** `useAuthGuardEffect` の依存配列 `router` がテストで踏まれていない
  - 場所: `app/components/common/useAuthGuardEffect.ts:48`
  - 提案: router stability コメント追加、または依存配列再検討
- **[W-T-004]** `routerInvalidate.test.ts` の TypeScript cast が緩く、`routeId` 以外を読む実装変更を検出できない
  - 場所: `app/components/common/__tests__/routerInvalidate.test.ts:25,32`
  - 提案: `FakeMatch` 採用理由のコメント追加

#### Notes
- N-T-001: 4 ケース発火マトリクス命名が plan ステップ 5 と 1:1 対応
- N-T-002: 同一 id × 別オブジェクトと異なる id の両方向で依存配列をテスト
- N-T-003: `routerInvalidate` の AND 合成テストが双方向を pin
- N-T-004: `appShellInvalidate` の prefix 拒否テストが優秀
- N-T-005: ファイル冒頭 JSDoc が役割分担を明文化
- N-T-006: `vi.mock` の hoisting 制約を回避する順序が模範的
- N-T-007: 既存パターン（`Dialog.test.tsx` 等）と完全に揃う

---

## Performance / RSC / Auth

#### Blockers
なし

#### Warnings
なし

#### Notes
- N-P-001: Issue #293 主目的（1 RPC 初回・以降 0 RPC）の regression は構造的に防止。fresh 未認証訪問で発火しない不整合検出条件が pin されている
- N-P-002: W-A-001 解消フローが論理的に一貫（leaf 観測 unauth → defensive redirect → 着地 → hook 発火 → `_app.loader` 再評価 → AppShell 剥がれ）
- N-P-003: 1 フレーム stale 期間中の機密 RPC 漏出は leaf defensive redirect で fail-closed
- N-P-004: W-P-002 解消の retry 動線は React 19 `useTransition` を素直に使い、ADR-003 の API 制約を実装が満たしている
- N-P-005: `getRouteApi("/_app").useLoaderData()` の `userDto` 型が hook シグネチャと型整合
- N-P-006: 二重 invalidate のリスクは構造的に発生しない（`LoginForm` の rule 1 と新 hook の競合なし）
- N-P-007: `appShellInvalidate` の filter セマンティクスが厳密一致で pin され、leaf 巻き込み防止
- N-P-008: hook の不整合検出条件 (c2) を選んだ ADR-001 判断が明示的に記録、配布規約も JSDoc に明文化

---

## Design Decisions

このラウンドで新たな設計判断は発生せず（既存 ADR-001〜005 の枠内で完結）。修正方針:

- **W-T-002 対応**: `AppErrorFallback` を named export として、専用テスト `app/routes/_app/__tests__/AppErrorFallback.test.tsx` を新規追加。`vi.mock` で `useRouter` と `sanitizeRouteError` をスタブし、click → invalidate filter → disabled 連鎖を pin
- **W-T-003 対応**: 既存「same id」テストに router 安定性のコメントを追記（同一 routerStub が再レンダリング間で使われる事実が暗黙的に router stability を踏んでいる）

---

## 対応サマリー

| ID | 対応 |
|----|------|
| W-F-001 | `aria-busy={isPending}` を retry button に追加 |
| W-F-002 | hook JSDoc に「user identity は id のみ」「router は singleton 安定」を追記 |
| W-T-001 | hook test の W-A-001 ケースで filter shape を assert（`_app` 通過 / `_app/notes` 拒否） |
| W-T-002 | `AppErrorFallback.test.tsx` 新規追加（3 ケース: 初期描画 / 1回click / 連打防止） |
| W-T-003 | hook test の same-id 再レンダリングテストに router 安定性コメント追記 |
| W-T-004 | `routerInvalidate.test.ts` の `FakeMatch` 型コメント追加 |

全 Warning 解消後の検証:
- `pnpm typecheck`: clean
- `pnpm lint:fix`: clean
- `pnpm format`: clean
- `pnpm test:unit`: 143 files / 2720 tests PASS（新規 3 件 +）
