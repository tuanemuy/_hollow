# PR Review #002 — feat(publication): 公開設定画面（P14）のスタイリングと _app レイアウト適用

**PR:** #472
**Date:** 2026-06-04
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## Frontend / Styling

### Blockers
なし

### Warnings
なし

### Notes
- [W-001] 解消確認: `LINK_ROW` JSDoc から存在しない `[&_code]:truncate` を削除し、`LINK_URL` が truncate を担う旨に修正。実装と一致。
- [W-002] 解消確認: `LINK_URL`（accent-ink）/`URL_PREVIEW_URL`（ink）の色使い分けがモック準拠の意図的差異である旨を双方の JSDoc に相互参照付きで明記。
- 修正は JSDoc のみ（コミット 4c9313e）でスタイル文字列・ロジック変更なし、回帰リスクなし。
- `STATUS_DOT` の `data-visibility={v}` は常に3値で value-match variant の前提を満たし、`aria-hidden` も適切。ADR-003 と矛盾なし。
- Round 1 の良好な点（state-style 規約、`has-[input:checked]:` の a11y、トークン実在、SSOT）は維持。

## Architecture / Routing

### Blockers
なし

### Warnings
なし

### Notes
- Round 1 で Blocker 0 / Warning 0（APPROVE 相当）。本ラウンドの変更は Frontend の JSDoc のみでアーキ・ルーティングに影響なし。ルート移動・routeTree 整合・action import 削除・二重 main 回避・head・SSOT 配置すべて整合のまま。

---

## Design Decisions

特になし。
