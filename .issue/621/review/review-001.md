# PR Review #001 — fix(public): 公開ページのコンテナ幅を中身依存から親100%へ固定（w-full 追加）

**PR:** #630
**Date:** 2026-06-10
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## General Review

### Blockers

なし

実装は正しく、適切に実行されている:

1. **CSS 修正の正しさ** — `w-full` 追加は、`flex flex-col` 内で `mx-auto`（cross-axis auto マージン）が `align-items: stretch` を打ち消し `max-content` に縮む挙動を正しく解消する。`w-full` で幅を親に固定しつつ `max-width` と `mx-auto` 中央寄せを維持する。CSS Flexbox 仕様に沿う。
2. **スコープの正確さ** — 修正対象は PublicLayout の flex 直下コンテナである `PUBLIC_MAIN` / `NOTE_DETAIL_WRAP` の2つのみ。`PUBLIC_FOOTER_INNER`（入れ子）/ `SHARE_PAGE` / `ERR_PAGE` / `LegalDocument`（`flex-1` 保有）は影響を受けない。
3. **box-sizing 互換性** — プロジェクトは `box-sizing: border-box` がグローバルに効くため、`w-full` ＋ `px-[var(--container-padding)]` で padding が幅制約内に正しく収まる。
4. **ブラウザ検証** — `getBoundingClientRect()` による数値計測で、コンテナ幅 == `min(viewport, max-width)`、中央寄せの左右マージン均等、600px のガタつき解消を確認済み。
5. **計画整合性** — plan.md と完全一致。スコープ逸脱なし。
6. **規約準拠** — コメントは CLAUDE.md 方針（WHY が非自明なときのみ）に沿い、CSS 仕様の隠れた制約と Issue 参照を含む。

### Warnings

なし

### Notes

- **[N-001]** 数値計測（`getBoundingClientRect()`）による客観的検証は模範的。視覚的判断より再現性が高い。
- **[N-002]** 各ビューポートでの left/right マージン・幅の計測を残したレポートは将来のリグレッション検出に有用。
- **[N-003]** `PUBLIC_MAIN` のコメントは症状・CSS 仕様・Issue 参照が明快。`NOTE_DETAIL_WRAP` は簡潔な相互参照で重複を回避。
- **[N-004]** 既存文字列定数への Tailwind ユーティリティ追加のみで構造的破壊リスクはゼロ。`w-full max-w-[...] mx-auto` は確立された中央寄せパターン。
- **[N-005]** `PUBLIC_FOOTER_INNER` をスコープ外とした判断は正しい（block-level 子で flex item ではないため cross-axis stretch 打ち消しが発生しない）。

---

## Design Decisions

特になし（Issue 本文の修正方針を踏襲。新たな設計判断なし）。
