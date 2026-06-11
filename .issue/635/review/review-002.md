# PR Review #002 (Round 2 / 再レビュー) — feat(ui): 共通ローディングUX資産の整備＋ミューテーションの pending 可視化

**PR:** #641
**Date:** 2026-06-11
**Round:** 2回目（Round 1 の Warning 修正後の再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 確認事項のみ
- Verdict: **APPROVED**

---

## Re-Review (Frontend / Accessibility / Test 統合)

### Blockers
なし

### Warnings
なし

### Notes
- **[W-001 Test 修正確認]** `listSelectors.test.ts` に5ケース追加。既存スタイル準拠で `setPendingBulk` の true/false 反映・同値 no-op の `toBe` pin・各 action の pendingBulk 保持を検証。最重要の `exitSelectMode` が `pendingBulk:true` でも `emptySelection` を返す分岐（`&& !state.pendingBulk` ガード）を正しく pin しており、ガード欠落で確実に失敗する意味のあるテスト。
- **[W-001 A11y 修正確認]** `ListView.tsx` / `TileView.tsx` の行 className を `transition-[color,background-color,opacity] motion-reduce:transition-none` に統一。arbitrary transition 構文は既存コード（WysiwygEditor / InlineEditor）の確立パターンで Tailwind v4 で有効。hover の `hover:bg-surface`・selected の `bg-accent-surface`/outline と `data-[pending]:opacity-60` の dim が両立、border-color を外しても行は border 無し/TileView は静的 hairline のため視覚挙動に影響なし。regression なし。
- **[N-002 Test 修正確認]** `Skeleton.test.tsx` に `motion-safe:animate-pulse` アサート追加。Spinner テストと対称、バーは内側 `aria-hidden` 要素を querySelector で選択して検証する適切な適応。
- **[N-001 受容確認]** ADR-005（rounded-md 踏襲）が adr.md に Accepted で記録済み。
- 検証: 対象3テストファイル 93 tests passed、typecheck green、スコープ逸脱・新規 regression なし。

---

## Design Decisions
特になし（Round 1 で決定済みの ADR-002 統一・ADR-005 受容を実装/記録に反映済み）。

## 完了
1ラウンドクリーン（Round 2 で Blocker 0 / Warning 0）につきレビュー完了。PR を Ready for review に切り替える。
