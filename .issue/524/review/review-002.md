# PR Review #002 — fix(sanitizer): プロトコル相対 URL (//host) が isSafeUrl を通過する問題を修正

**PR:** #529
**Date:** 2026-06-06
**Round:** 2回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0（スコープ内）
- Notes: 4
- Verdict: **APPROVED**

前ラウンドからの差分は W-003（コメント明確化）の修正のみ。W-001 / W-002 は #531 へ分離済みのため対象外。

---

## General Review（Security）— Round 2

### Blockers

なし

### Warnings

なし（#531 に分離済みの entity バイパスは対象外）

### Notes

- **[N-001]** W-003 修正は妥当。コメント（`htmlSanitizer.ts:174-178`）は実装 `/^[/\\]{2}/.test(value) → return false` を正確に説明し、同関数内の `colonIdx <= 0 → return true` フォールスルー挙動と論理的に一致。否定形の回りくどさも解消。
- **[N-002]** W-001 / W-002 → #531 分離のスコープ判断は合理的。#531 の実在を確認。ADR-003 の3根拠（完全修正が非軽微 / #524 宣言スコープ越え（XSS）/ 独立レビュー望ましく #493 分離経緯を踏襲）は妥当で、ADR-001 が literal 値前提である旨も明記され矛盾なし。
- **[N-003]** テスト（`htmlSanitizer.test.ts:146-183`）に新規問題なし。`removed.toContainEqual` で除去結果を保証、`<img src>`・バックスラッシュ3変種をカバー、リグレッションは既存ケースで担保。
- **[N-004]** Round 1 からの差分は W-003 修正のみで回帰・新規欠陥の混入なし。

---

## Design Decisions

特になし（ADR-003 は review-001 ラウンドで記録済み）。
