# PR Review #003 — fix: ヘッダー/フッターのロゴ(BrandLockup)の途切れ解消＋サイズ調整

**PR:** #609
**Date:** 2026-06-09
**Round:** 3回目（review-002 の W-003 修正後の最終確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

---

## General Review

### 前ラウンド指摘の確認

- **W-003（コメント top の出所取り違え）**: 解消済み。コメントは「left edge from the mark's *unstroked* outline; top, bottom and right from the wordmark」となり、再検算（マーク unstroked: 左0.005/上4.345/下80.135/右110.775、ワードマーク: 左150.77/上0/下84.48/右473.84）と一致。

### Blockers

- なし

### Warnings

- なし

### Notes

- **[N-001]** W-003 正しく解消。箱 `0 0 473.84 84.48` の各辺の出所がコメントと検算で一致（left=マーク、top/bottom/right=ワードマーク）。
- **[N-002]** 付随記述も正確: half stroke=4.37、stroked マーク端（左 -4.37/上 -0.025/下 84.505）が `-5 -1 480 86`（左 -5/上 -1/下 85/右 475）に全収。右はマーク右端 115.145 が十分内側で clip 対象外、という記述も妥当。
- **[N-003]** 全呼び出し箇所が props なし `<BrandLockup />` で height 既定値 20→16 を継承。viewBox 拡大に伴う視覚サイズ調整として整合、回帰なし。`BrandMark` 無変更。

---

## Design Decisions

特になし。

---

## レビュー総括

- レビューラウンド: 3回
- 初回: Blocker 0 / Warning 2 → round 2 で W-002 解消・W-003 検出 → round 3 で W-003 解消
- 最終: Blocker 0 / Warning 0、**APPROVED**
