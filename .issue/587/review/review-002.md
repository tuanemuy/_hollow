# PR Review #002 — feat: モバイルモック(#536)の実装追従 ① 共通基盤

**PR:** #596
**Date:** 2026-06-08
**Round:** 2回目（収束確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- review-001 の3 Warning がすべて解消:
  - W-001 → `BOTTOM_ACTION_BAR` コメントに padding 由来（`py-2.5`=10px / `px-4`=16px）を追記。
  - W-002 → grabber `w-9`=36px はコード上正しく、実測34px は計測ノイズ（コード変更不要）。
  - W-003 → `adr.md` ADR-008 に「Dialog backdrop と drawer の z-[100] 同値は排他表示前提で意図的」を追記。
- styling 規約（utility-first・responsive variant・data-* は動的のみ）完全準拠。
- a11y（grabber `aria-hidden`・`focusables[0]` 不変・focus trap 無影響）仕様通り。
- モック逐語追従（`calc(100%-var(--space-8))` で dvh 排除・SSOT トークン backdrop-filter）。
- 責務分離（frame=#587 / CTA 内容・FilterBar 置換=#588）でスコープ規律を保証。

---

## Design Decisions

ADR-008（z-[100] 同値の意図）を追記済み。新規の設計判断なし。

---

## 完了

2ラウンド目で Blocker 0 かつ Warning 0 に収束。レビュー完了 → PR を Ready for review に切り替える。
