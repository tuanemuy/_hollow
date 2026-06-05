# PR Review #002 — refactor(ui): WAI-ARIA Menu パターンを共通プリミティブに抽出

**PR:** #505
**Date:** 2026-06-06
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 1（既存・意図的設計の確認）
- Verdict: **APPROVED**

> 注: 2周目レビューは API の一時的な 529 Overloaded によりサブエージェント委譲が連続失敗したため、メインエージェントが直接 diff（コミット effb185）を検証した。

---

## Accessibility

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** Popover.tsx の `onMouseDown preventDefault` は menu 分岐（role=menu, L97-99）のみに付与され、dialog 分岐（role=dialog, L104-113）には付いていないことを確認。コメント（L83-88）で「dialog はフォーム入力 focus を妨げないため意図的に省略」と明記。`<Menu>` は `usePopover` を直接使う独立実装で `<Popover>` を経由しないため二重付与なし。1周目 A11y W-001 は退行なく解消。
- A11y W-002（dialog 非モーダル無トラップ）は ADR の意図的設計のため現状維持（Phase 4 で follow-up 検討）。新規退行ではない。

## Test

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 追加3テストはいずれも実装の不変条件を正しく固定し偽陽性でないことを確認:
  - `Menu.test.tsx`: index 0 で ArrowUp → 末尾（index 2）が tabindex=0・先頭が -1。`(activeIndex-1+count)%count` のラップを固定。
  - `Popover.test.tsx`: 開いた状態でパネル内要素から外部 relatedTarget を持つ `focusout` を発火 → パネル unmount。`onFocusOut` の relatedTarget 外判定を固定（React の focusout→onBlur マップ・happy-dom の relatedTarget 明示の注記あり）。
  - `FilterBar.test.tsx`: from/to 適用済み状態から「期間フィルタを解除」ボタン click → `routerNavigate` 1回。clear 経路を固定。
- 検証: `pnpm typecheck` クリーン、`pnpm test:unit` 187 files / 3179 tests 全パス。

---

## Design Decisions

特になし（1周目で記録済みの A11y W-002 現状維持を踏襲）。
