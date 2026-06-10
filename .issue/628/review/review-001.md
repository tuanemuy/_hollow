# PR Review #001 — feat(layout): ヘッダー（グローバル）UIを再設計

**PR:** #638
**Date:** 2026-06-10
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6（Frontend 3 / Styling 1 / Spec 2）
- Notes: 多数（うち2件は軽微な doc/test 陳腐化として修正）
- Verdict: **BLOCKED**（Warning を全件修正 → round 2 で再確認）

レビューは3観点（Frontend/a11y、Styling/Architecture、Spec/Design整合）を並列実施。

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** モバイルドロワー内で UserMenu を開いた状態の Escape が「メニュー＋ドロワー」を同時に閉じる。
  - 場所: `usePopover.ts`（`stopPropagation`）と `AppShellDrawer.tsx` の document keydown。
  - 対応: ✅ 修正。`AppShellDrawer` の Escape ハンドラで、aside 内に `[aria-expanded="true"]`（開いているポップオーバー）があればドロワーを閉じずスキップ（同一イベント中は React 再描画前なので順序非依存）。
- **[W-002]** `UserMenu.test.tsx` の検証意図が移設後構造とズレ（email がパネルから trigger 行へ移ったが、テストは緑のまま意図が形骸化）。
  - 対応: ✅ 修正。trigger 行に name/email、パネルは role のみで email を重複しないことを検証するアサーションへ更新。2件 PASS 確認。
- **[W-003]** サイドバー user 行のアバターに `shrink-0` が無く、モックの `flex-shrink:0` と非対称（潜在的な squish リスク）。
  - 対応: ✅ 修正。UserMenu の avatar span に `shrink-0` 付与。

### Notes
- N: CTA の a11y は適切（aria-label 保持、ラベル/アイコンの出し分けでアクセシブルネーム常時提供）。
- N: `<Menu>` primitive の再利用（trigger 差し替え + `bottom-full` 上開き）は roving/focus/dismiss を継承する正しい拡張。
- N: 下部固定CTAの連鎖削除に参照漏れなし。RSC/"use client" 境界も整合。
- N: `menuPanel` の JSDoc「User 220px」が陳腐化 → ✅ 修正（full-width 上開きに更新）。

## Styling / Architecture

### Blockers
なし

### Warnings
- **[W-001]** `HEADER_NEW_NOTE_DEMOTE` の desktop hover 背景が意図（`bg-surface`）と異なり `surface-hover` になる。`sm:hover:not-disabled:bg-surface`(0,3,0) が base `pillBtn` の hover(0,4,0) に `not-aria-disabled:` ガード欠落で特異度負け。
  - 対応: ✅ 修正。`sm:hover:not-disabled:not-aria-disabled:bg-surface`（および text）へガード追加し (0,4,0) 以上に。`pillBtnGhost` の確立パターンに一致。

### Notes
- N: 主要な特異度の主張（`max-sm:min-h-9!` で 44px 床を打ち消す、`max-sm:px-0` 縮小が `max-sm:` 変種で後勝ち、`sm:bg-transparent` rest 後勝ち）は実ビルドCSSで裏取り済み・正しい。
- N: dead code/dead constant の取り残しなし。新規定数は全て実使用。
- N: ADR-004（ヘッダー局所撤廃）仕様通り。base 床・他画面床は不変、MENU_BTN のみ床除去。
- N: `APP_SIDEBAR` の `flex flex-col` 追加は drawer/sticky 両文脈で健全。

## Spec / Design Consistency

### Blockers
なし

### Warnings
- **[W-001]** デスクトップ確定モック `P10-home.html` の新規作成 CTA が icon+label のままで、ADR-003/§7.2（テキストのみ）・確定ドラフト・実装と矛盾。
  - 対応: ✅ 修正。新規作成 SVG に `cta-icon` クラスを付け、desktop で非表示・mobile で表示（実装の `sm:hidden` 相当）。desktop=テキストのみ / mobile=アイコンのみに統一。
- **[W-002]** `review/007.md` のモバイル寸法が 38px と誤記（確定値は 36px）。「全面撤廃」表現も残存。
  - 対応: ✅ 修正。36px・ヘッダー局所例外の表現へ更新。

### Notes
- N: index.md §7.1/§7.2 は ADR-004（ヘッダー局所例外）と整合、全面撤廃の痕跡なし。
- N: ADR 内部整合・モック間方針整合とも問題なし。P15/P20 cta-bar 残置は妥当。
- N: 56モックページ乖離 / #620 CLOSED は plan に Phase 4 追跡として記録済み。**フォローアップ Issue は Phase 4 で起票する**（本PRで全モック追従しないことは問題なし）。
- N: layout `ICON_BTN` は merge-base 時点で既に未使用の dead constant（本PRが orphan 化したものではない）。別途整理候補。
- N: drafts のコミットは比較材料として是。

---

## Design Decisions

このラウンドで新規の設計判断なし（ADR-001〜004 の範囲内で実装・修正）。

## 修正サマリー

Blocker 0、Warning 6 を**全件このPRで修正**（後回しゼロ）。typecheck PASS / UserMenu テスト 2件 PASS / lint・format クリーン。round 2 で再確認する。
