# PR Review #001 — docs(design): #757 モバイルフィルターのモック(P10-home)を集約シート方式へ同期

**PR:** #758
**Date:** 2026-06-18
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED**

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 0 / N: 8）

## 指摘一覧

Blocker・Warning ともになし。実装忠実性・デザイントークン遵守・デスクトップ不変・HTML 妥当性・コメント正確性・plan 整合性すべて問題なし。

Notes（参考。修正必須ではない）:
- [N-001] AC-1〜AC-5 すべて充足
- [N-002] a11y 契約が実装どおり（trigger=dialog+expanded / aria-pressed なし / 公開状態 fieldset / 内部リンク別動線）
- [N-003] デスクトップ不変（追加 CSS は `.mobile-filter-*` base display:none と `@media (max-width:640px)` 限定）
- [N-004] HTML 妥当性 OK
- [N-005] クラス温存/削除が plan どおり、孤立 CSS/クラスなし
- [N-006] スコープ遵守（spec 2ファイル + `.issue/757/` のみ）
- [N-007] シート「ノートを選択」キャレットの `.filter-chip .chip-caret` スコープ外れは既存パターンの忠実な踏襲（新規回帰ではない）→ 維持
- [N-008] `.filter-sheet-title` の mb と実装 `dialogTitle` mb-4 の僅差 → 実装忠実性のため `var(--space-4)` に揃えて対応済み

## 対応

- N-008: `.filter-sheet-title` の `margin-bottom` を `var(--space-5)` → `var(--space-4)`（実装 `dialogTitle` の mb-4 と一致）に修正。
- 他の Notes は修正不要（N-007 は既存パターンの忠実な踏襲、その他は良い点の記録）。

完了条件（直すべき指摘ゼロ）を1ラウンドで満たしたため APPROVED。
