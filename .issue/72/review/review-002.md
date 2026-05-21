# PR Review #002 — feat(a11y): prefers-reduced-motion を motion-reduce バリアント一括併用で対応

**PR:** #123
**Date:** 2026-05-21
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Verdict: **APPROVED**

review-001 で挙がった 7 件の Warning すべてが解消されたことを確認。新たな Blocker / Warning なし。

---

## Resolved

- **[W-F-001 ✅]** admin/* 7 ファイル全てで `transition-colors motion-reduce:transition-none duration-[...] ease-[...]` の統一パターンに移行済み。`rg "transition-colors duration-\[var\(--duration-fast\)\] ease-\[var\(--ease-standard\)\] motion-reduce:"` で旧パターン 0 hit
- **[W-A-001 ✅]** `.issue/72/adr.md` の Status を `Accepted: 2026-05-21 (PR #123)` に更新
- **[W-A-002 ✅]** `CLAUDE.md` L52 Motion 行を英語化、既存 Styling 項目のトーンと一致
- **[W-A-003 ✅]** ADR-007 Decision item 7 として variant ordering 根拠（grep 容易性、Tailwind 慣用、CSS 等価性）を追記
- **[W-A-004 ✅]** plan.md step 7 を `motion-reduce:after:transition-none` に修正、ADR-007 / CLAUDE.md 参照を追加
- **[W-A-005 / W-F-002 ✅]** ADR-007 / plan.md ともに「約 59 箇所」で統一、stale な「約 48 箇所」は残存なし
- **[W-F-003 ✅]** TC-004 の未生成ルール `.after\:motion-reduce\:transition-none` 行を削除、`hasAfterTransitionNone` の OR ベース判定であることを備考に明記

---

## Notes

- 全 59 箇所の `transition-(colors|all|transform|opacity|shadow|\[)` utility に `motion-reduce:` 併用が同行で対応済み
- ADR-007 と CLAUDE.md の variant ordering 根拠が同じ triad（grep / Tailwind 慣用 / CSS 等価）で一致しており、ドキュメント間の整合性も担保
- TC-004 の備考は方法論の限界を正確に開示しており、ソースレベルでの規約は別途 grep 証跡で文書化されている — 適切な開示レベル
- `pnpm typecheck` パス（本 PR 起因の新規エラーなし）
- `pnpm build` も通過、生成 CSS に `@media (prefers-reduced-motion: reduce)` ブロックが含まれることは TC-004 / review-001 検証で既に確認済み

---

## Design Decisions

このラウンドで新たに見つかった設計判断はなし。
