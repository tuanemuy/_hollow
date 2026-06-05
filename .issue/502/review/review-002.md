# PR Review #002 — fix(ui): /export と /notes/$noteId/export を _app 配下へ取り込み AppShell を付与 (#502)

**PR:** #513
**Date:** 2026-06-06
**Round:** 2回目（W-001 修正後のクリーン確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## 総合レビュー (round 2)

### Blockers
なし

### Warnings
なし（round 1 の W-001 = `requireAuthenticatedRoute` デッドコード化は同 PR 内の削除で解消済み）

### Notes
- **[N-001]** W-001 修正反映を確認。`authGuard.ts` から `requireAuthenticatedRoute` と JSDoc 削除済み、`grep` で参照ゼロ。
- **[N-002]** 残置コード健全。`redirect`/`HOME_SEARCH` import は `redirectAuthenticatedRoute` で使用継続、`checkAuthenticated` も同関数から呼ばれ正当。呼び出し元 login.tsx/signup.tsx 健在。未使用 import なし。
- **[N-003]** 移動2ルートと routeTree 整合。両 leaf が `AppRouteRouteChildren` 配下・`getParentRoute: () => AppRouteRoute`、fullPath 不変（`/export/`・`/notes/$noteId/export`）。action import・inputValidator・head canonical path・staleTime 維持。
- **[N-004]** 残骸整理確認。旧ディレクトリ消失、`notes/` は公開ビュー専用に純化。
- **[N-005]** 再発・新規問題なし。Frontend/Routing・Security/RSC/アーキの両観点でクリーン。

---

## Design Decisions

特になし（ADR-004 は review-001 で記録済み）。

---

## 完了

1ラウンド目で出た Warning を 1 件修正し、2ラウンド目で両観点クリーン（Blocker 0・Warning 0）。**APPROVED** によりレビューループ終了。
