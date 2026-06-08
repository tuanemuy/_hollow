# PR Review #002 — feat(brand): 各ページの可視ロゴを Vesica ロックアップへ反映

**PR:** #591
**Date:** 2026-06-08
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: round 1 全指摘の解消を確認
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes（round 1 解消状況）
- **W-001（BrandMark未使用 + ADR乖離 / 二円重複）** 解消 — `MARK_CHILDREN` を1箇所定義し `BrandMark` と `LOCKUP_CHILDREN` の `<g>` 双方で再利用。重複消滅。ADR-001 を実態に更新。`BrandMark` は Issue 要件のマーク単体 API として export 維持（JSDoc/ADR で正当化）。
- **W-002（公開フッター muted）** 解消 — `PublicLayout.tsx:80` に `text-ink` 付与、ランディングフッターと一貫。
- **W-003（width="auto"）** 解消 — `BrandLockup` から width 属性削除、viewBox + height で比率導出。

## Accessibility & Style

### Blockers
なし

### Warnings
なし

### Notes（round 1 解消状況）
- **W-001(a11y)（JSDoc 配置）** 解消 — JSDoc を各 export function 直上へ移動。定数の JSDoc は素材出典/再生成の WHY に棲み分け。
- **N-002（装飾分岐式）** 解消 — `BrandLockup` も `label !== undefined && label !== ""` に統一、Icon.tsx と一致。
- aria コントラクト・currentColor テーマ追従・サイズ規約（size/height が SSOT、className に w-/h- 無し）いずれも維持を確認。

---

## Design Decisions
特になし（ADR-001 は round 1 で更新済み）。

## 完了判定
1ラウンド（round 2）で Blocker 0 / Warning 0。Phase 3 完了条件（1ラウンドクリーン）達成 → APPROVED。
