# PR Review #002 — feat(issue/293): persist AppShell across authenticated route navigations

**PR:** #297
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED**

---

## Round 2 Review

#### Blockers
なし

#### Warnings
なし

#### Notes
- N-001: `_app/route.tsx:33-42` のコメントは「`beforeLoad` は同期 client-side helper」と書きつつ server-only 注入禁止のガードコメントを残している。現状は純関数のみだが、将来の編集ガイドとして残す意図は妥当
- N-002: loader-redirect の循環非発生を机上検証 → REVERIFY-EC-2 の curl 結果（2 redirects → 200）と整合
- N-003: `beforeLoad: ({ location }) => ({ isLandingPath })` の戻り値 → `loader: ({ context })` で受け取れる挙動は TanStack Router 標準 context merging。`__root.tsx:47` の `loadAppContext` 先例あり
- N-004: ADR-007 が `Superseded by ADR-008` でマークされ、ADR-008/009/010 が review-001 の判断を逐条的に対応
- N-005: review-001 で別 Issue 化判断した W-A-001 / W-P-002 / W-P-003 / B-P-001 は本コミットで触れられておらず、判断どおり
- N-006: `pnpm typecheck` / `pnpm test:unit` (2690/2690 PASS) clean
- N-007: `index.loaderDeps.test.ts` の `vi.mock` 削除が `_app/index.tsx` の side-effect import 非保有と整合
- N-008: `AppShellFrame.tsx` と `_app/route.tsx` 双方のコメントが相互参照になり、実装意図が両端から読める

---

## Design Decisions

特になし（review-001 で決定済みの設計判断を正確に反映したのみ）
