# PR Review #002 — feat(a11y): #660 表示モード segmented を APG Radio Group 化

**PR:** #774
**Date:** 2026-06-25
**Round:** 2回目

## Summary
- Blockers: 0
- Warnings: 0
- Notes: 21（A11y 6 / Frontend 11 / Test 4 — いずれも良好確認 or 任意）
- Verdict: **APPROVED**

## レイヤー別ファイル
- A11y: review-002-a11y.md（B: 0 / W: 0 / N: 6）
- Frontend: review-002-frontend.md（B: 0 / W: 0 / N: 11）
- Test: review-002-test.md（B: 0 / W: 0 / N: 4）

## Round 1 指摘の収束確認
- [W-001] roving .focus() 移動 → ArrowRight/Home/End で document.activeElement アサート追加（解消）
- [W-002] ArrowUp/Down 未検証 → ArrowDown/ArrowUp 回帰追加（解消）
- [N-005/Test] public 静的アサート薄い → radiogroup/radio×3/roving tabindex/旧role非存在を追加（解消）
- [N-001/A11y] aria-orientation 未指定 → 両 radiogroup に aria-orientation="horizontal" 追加（解消）

## Round 2 で残った唯一の Note（解消済み）
- [N-001 A11y/Frontend] spec モック P10/P30 が aria-orientation 未追従（「モックは正」規約）
  → メインが P10-home.html:1133 / P30-user-public-top.html:581 に aria-orientation="horizontal" を追記して実装と完全一致（解消）。静的HTMLのみ・挙動/テスト影響ゼロ。

## 完了判定
両ラウンドの Blocker/Warning をすべて解消。Round 2 は全レイヤー Blocker 0 / Warning 0。
残 Note は良好確認・任意改善で、唯一の実質的 Note（モック parity）も解消済み。→ **APPROVED で収束**。
