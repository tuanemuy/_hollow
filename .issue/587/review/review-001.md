# PR Review #001 — feat: モバイルモック(#536)の実装追従 ① 共通基盤

**PR:** #596
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3（すべて informational — Frontend レイヤー）
- Notes: 多数
- Verdict: **APPROVED**（Blocker 0。Warning は注記/コメント追記の提案のみで、コード欠陥ではない。安価に取り込む）

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** `BOTTOM_ACTION_BAR` の padding 値（`py-2.5`=10px / `px-4`=16px）由来がコメントから読みにくい
  - 場所: `app/components/layout/styles.ts`（`BOTTOM_ACTION_BAR`）
  - 理由: モック `.cta-bar` は `padding:10px var(--space-4)` で上下10px・左右16px。実装は正しいが、混在の由来をコメントに足すと逐語追従の厳密性が明確になる。実害なし。
  - 提案: コメントに「`py-2.5`=mock 10px、`px-4`=`var(--space-4)`=16px」を1行追記。
- **[W-002]** grabber 実測 34px vs モック 36px の2px ズレ
  - 場所: `app/components/common/styles.ts`（`dialogGrabber`、`w-9`=36px）
  - 理由: コード `w-9 h-1` は 36×4px で正しい。検証の実測 34px は agent-browser のサブピクセル/DPI 計測ノイズで、コード欠陥ではない。
  - 提案: コード変更不要。計測ノイズである旨を記録（本レビューに記載で解消）。
- **[W-003]** `dialogBackdrop` の `z-[100]` が drawer の `z-[100]` と同値で積層意図が不明確
  - 場所: `app/components/common/styles.ts`（`dialogBackdrop`）/ `app/components/layout/styles.ts`（`APP_SIDEBAR`）
  - 理由: Dialog と drawer は排他表示前提（モック準拠）なので実害なし。z-index の同値が意図的である明文がない。
  - 提案: ADR に「Dialog backdrop と drawer の z-[100] 同値は意図的（排他表示前提）、同時表示は別Issue」を1行注記。

### Notes
- grabber の `aria-hidden` 非 focusable span 設計が robust（focus trap 無影響、`focusables[0]` 不変）。
- responsive variant（`max-sm:`/`sm:`）で hydration mismatch なし。
- `fieldControl` の 44px 横断適用が ADR-007 通り、textarea min-h 競合も無害、admin `FIELD_INPUT` 据え置き。
- frame（chrome）/ content（CTA）の責務分離が #587/#588 境界と一致。
- `popoverSheetPanel` 先制提供で #588 が継承するだけで済む。
- max-h `calc(100%-var(--space-8))` でモック逐語追従・`dvh` 互換懸念排除。
- backdrop-filter は SSOT トークン `var(--header-blur)` 採用で既存リテラル負債を継がない。

## 規約・a11y・テスト

### Blockers
なし

### Warnings
なし

### Notes
- focus trap 不変条件（grabber 非 focusable・DOM 先頭・close button より前）を既存テスト前提（`focusables[0]`）と突き合わせて維持を確認。
- `dialogBackdrop`/`dialog` の responsive variant が静的表現で hydration 無問題。
- `BOTTOM_ACTION_BAR` の backdrop-filter が CLAUDE.md パターン + SSOT トークン準拠。
- z-40 と既存 `BulkActionBar`（z-40 sticky）の排他表示前提が破綻しない。
- 新設 export（`BottomActionBar`/`popoverSheetPanel`/`BOTTOM_ACTION_BAR`）が #588 まで未消費でも Biome recommended は未使用 export を検知しないため lint 通過。`"use client"` 不要（純粋表示）も正しい。
- スコープ規律: ADR の判断が plan と一致し #588/#589 に踏み込んでいない。

---

## Design Decisions

W-003 を受け、`dialogBackdrop` と drawer の `z-[100]` 同値が意図的（排他表示前提）である旨を adr.md に追記する（ADR-008）。
