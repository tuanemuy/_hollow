# PR Review #002 — 領域5（P32/P33）のモック実装追従

**PR:** #561
**Date:** 2026-06-07
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 9
- Verdict: **APPROVED**（クリーン1回目）

3観点（Frontend/UX/a11y・スタイリング規約・テスト品質）で再レビュー。1周目の全指摘が正しく反映され、
リグレッション・型エラー・lint 違反・dangling aria 参照・未使用 import なし。

---

## Frontend/UX・a11y

### Blockers / Warnings
なし

### Notes
- **[N-001]** aria 修正は完全に整合。`!isLocked` ガードがロックアウト時に `aria-invalid`/`aria-describedby`/
  インライン `<p id={errorId}>` を三点同時に抑止。dangling 参照なし。4状態（lockout / password-invalid /
  expired-gone / clean）すべてで aria 分岐が正しいことを確認。
- **[N-002]** role の使い分け（lockout=status / password-invalid=alert）が妥当。
- **[N-003]** `Clock` アイコンが正しく import・適用。`AlertTriangle` 未使用 import の残骸なし。

## スタイリング規約・デザイントークン

### Blockers / Warnings
なし

### Notes
- **[N-004]** 案D は共通 `ALERT` + `ALERT_WARNING` に統一、独自 `LOCKOUT` 削除済み・残存参照なし。
- **[N-005]** hero-sub / H1 余白調整 / snippet clamp はトークン・ユーティリティのみ、規約準拠。
- **[N-006]** 既存未使用 export `GATE_ERROR` は main 由来でリグレッションではない（スコープ外）。

## テスト品質

### Blockers / Warnings
なし

### Notes
- **[N-007]** 1周目の偽陽性解消を確認。案Dテストは ALERT 共通クラス列 + warning accent を positive assert し、
  旧 filled banner への退行で確実に fail する。GATE_ICON の `bg-warning-surface` 誤マッチも回避。
- **[N-008]** STATE1 通常ゲート / no-hit 空状態テスト追加、実装と一致（22 tests 全緑）。脆さなし。
- **[N-009]** container/presentational 分離（ADR-008）は過剰モックを避けた良い構成。

---

## Design Decisions
特になし（ADR-009 は review-001 で記録済み）。

---

## 検証
`pnpm vitest run app/components/public` 22/22 pass / `pnpm typecheck` clean / 対象5ファイル lint clean。
