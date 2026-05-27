# PR Review #001 — docs(spec/design): relax max-width media query rule to match practice

**PR:** #262
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

### General Review

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** 修正文言は実態とよく整合している。`spec/design/pages/` 配下の `max-width` 使用パターンを実調査したところ、主に2種類に分類できる:
  - `@media (max-width: 639px)` — モバイル時のヘッダー縮小・タップ領域確保（review 001 由来の mobile fix）
  - `@media (max-width: 1023px)` — タブレット以下でサイドバー非表示などのレイアウト切り替え

  修正文言の「グローバルな mobile fix（44px タップ領域の確保等）」「特定のブレークポイント範囲のみに適用したいスタイル」がそれぞれ前者・後者をカバーしており、論理的な矛盾はない。

- **[N-002]** Option A の採用判断は妥当。Issue 本文でも「A が現実的」と提案されており、19ページ・84箇所の書き換えコストと既存モックの完成度（review 001 で既に固められた mobile fix）を踏まえると、規約側を緩めるのが合理的。

- **[N-003]** Markdown 構造は健全。リスト記号・バッククォート・カッコの対応は崩れていない。差分も `-1 +1` の1行差し替えのみで、セクション9 の他項目には影響していない。

- **[N-004]** 文言の精度面で良い点: 「例外として」「グローバル」「特定の…範囲のみ」と用途を限定する言い回しを採用しており、`max-width` の濫用に対する歯止めが文言レベルで効いている。「`min-width` ベース」という基本方針も冒頭で維持されており、ニュアンスのバランスが取れている。

- **[N-005]** `.issue/250/plan.md` と `.issue/250/testing.md` は1行修正に対して必要十分。ADR 不作成の判断理由（トレードオフが小さい）も plan.md に明記されており、判断の痕跡として適切。

---

## Design Decisions

特になし（Phase 1 計画時点の Option A 採択以上の新規判断はなし）。
