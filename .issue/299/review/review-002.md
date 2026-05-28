# PR Review #002 — feat(issue/299): introduce routerInvalidate wrapper to preserve AppShell across mutations

**PR:** #303
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED**

---

## Round 2 Review

### Resolution of Round 1 findings

#### Blockers
なし

#### Warnings
なし

#### Notes

- **[N-001] W-001 解消確認**: ADR-002 Consequences に「`match.routeId` が `string` 縮退、`APP_SHELL_ROUTE_ID` の値ドリフトは型レベル検知不可、runtime テストと grep ベースの完全性チェックで担保」が追記済み

- **[N-002] W-002 解消確認（AND 合成）**: `routerInvalidate.ts:30-31` で `match.routeId !== APP_SHELL_ROUTE_ID && (filter?.(match) ?? true)` に変更済み。短絡評価で `_app` 除外が必ず先に効くため不変条件は意味的に強化。44 件の既存 `routerInvalidate(router)` 呼び出しに挙動変化なし（grep で第二引数を渡している箇所 0 件を確認）

- **[N-003] W-002 型安全確認**: `match` パラメータは `MakeRouteMatchUnion<AnyRouter>` として contextually typed、`filter?.(match)` の型も整合。`pnpm typecheck`（tsgo）exit 0 で完走

- **[N-004] W-004 解消確認**: `APP_SHELL_ROUTE_ID` から `export` を外し module-local 化済み。外部参照 0 件を確認、ADR-007 で意思決定を記録

- **[N-005] W-003 解消確認**: `rg "await router\.invalidate\(\);" app/components/` の結果が 13 ファイル 13 件で plan.md / ADR-003 と完全一致。修正不要の判定通り

- **[N-006] JSDoc 更新の正確性**: 「`_app` layout route を常に除外」「AND 合成され `_app` 除外の不変条件はラッパー経由では絶対にすり抜けない」が ADR-006 のセマンティクスと一致

- **[N-007] Regression / 副作用なし**: 修正範囲はラッパー 1 ファイル（3 行差分）と ADR ドキュメントのみ。テスト破壊なし、`biome lint` も「No issues found」

- **[N-008] 軽微な文書不整合（修正対象外）**: ADR-001 Decision に「エクスポート」の旧文言が残るが ADR-007 で明示的に上書き済み（ADR は append-only な意思決定履歴のため当然）

---

## Design Decisions

このラウンドで新たに発生した設計判断はなし（ADR-002 追記、ADR-006/007 は Round 1 対応として既に追加済み）。

---

**Verdict: APPROVED** — Blockers 0、Warnings 0。Round 1 で指摘された 4 件はすべて適切に解消され、新たな regression もなし。1 ラウンドクリーンで完了。
