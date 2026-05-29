# PR Review #002 — feat(issue/300): persist AppShell across session expiry and transient errors

**PR:** #314
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 18
- Verdict: **APPROVED**

review-001 で挙がった全 6 Warning（W-F-001 / W-F-002 / W-T-001〜W-T-004）が修正済。3 レイヤー（Frontend / Test / Performance·RSC·Auth）すべてクリーン。

---

## Frontend / Route Architecture

#### Blockers
なし

#### Warnings
なし

#### Notes
- N-F-001: W-F-001 解消確認: `_app/route.tsx:108` で `aria-busy={isPending}` 追加、`AppErrorFallback.test.tsx` で初期 `false` / pending `true` 両方向 pin
- N-F-002: W-F-002 解消確認: `useAuthGuardEffect.ts` JSDoc に「user identity は id のみ」「router は singleton 安定」を明記
- N-F-003: `AppErrorFallback` を named export 化したことで test 側の `import { AppErrorFallback } from "../route"` が可能になり testability 向上
- N-F-004: `HomeRoute` で hook 呼び出しを `if (!data.authenticated) return ...` の前に置く rules of hooks 準拠
- N-F-005: `appLayoutRoute = getRouteApi("/_app")` module-level const 宣言が既存パターンと整合
- N-F-006: `routeTree.gen.ts` への影響なし
- N-F-007: Tailwind utility-first + module-scoped string constant 規約準拠
- N-F-008: retry button の `data-primary=""` 静的属性が ADR-003 規約準拠

---

## Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- N-T-001: W-T-001 解消確認: hook test に filter shape アサーション追加、helper 委譲が壊れた場合の indirect regression detection 成立
- N-T-002: W-T-002 解消確認: `AppErrorFallback.test.tsx` 3 ケース全て妥当（初期描画 / 1 回 click + filter shape pin / 連打防止）
- N-T-003: W-T-003 解消確認: same-id 再レンダリングテストに router stability コメント追記
- N-T-004: W-T-004 解消確認: `FakeMatch` 採用理由と将来の検出条件を明文化
- N-T-005: `vi.mock("@tanstack/react-router", async (importOriginal) => ...)` で `actual` を spread して `useRouter` のみ差し替える pattern が秀逸（`createFileRoute` 等の module-load 時呼び出しを破壊しない）
- N-T-006: `sanitizeRouteError` を deterministic stub に置換することで pre 要素 assertion を runtime 実装から isolate
- N-T-007: ファイル冒頭 JSDoc がテストの意図と pin する内容を明文化
- N-T-008: `pnpm test:unit` 143 files / 2720 tests PASS（新規 3 件含む）
- N-T-009: テスト網羅性に gap なし（hook 4 ケース + 依存配列 2 軸 + filter shape pin + errorComponent 3 ケース）
- N-T-010: 既存パターン（`happy-dom + createRoot + act`, `importOriginal` 利用）と完全整合

---

## Performance / RSC / Auth

#### Blockers
なし

#### Warnings
なし

#### Notes
review-001 と同じ判定（このラウンドで該当レイヤーの差分なし）。Issue #293 主目的の 1 RPC 初回 / 0 RPC SPA 遷移は構造的に守られ、W-A-001 / W-P-002 の解消フローも論理的に一貫。

---

## Design Decisions

このラウンドで新たな設計判断なし。

---

## 結論

全 3 レイヤーで Blocker / Warning ゼロ。最終 verdict: **APPROVED**。

検証:
- `pnpm typecheck`: clean
- `pnpm lint:fix`: clean（10 件の既存 warning は本変更と無関係）
- `pnpm format`: clean
- `pnpm test:unit`: 143 files / 2720 tests PASS
