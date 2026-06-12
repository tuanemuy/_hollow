# PR Review #001 — feat(design): #626 P10 ツールバーの視覚的優先度を再設計

**PR:** #648
**Date:** 2026-06-12
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 9
- Verdict: **BLOCKED**（Warning 残のため）

詳細は review-001-design.md / review-001-plan-a11y.md を参照。

## 指摘の仕分け

- W-001（design）: アイコン 14px が tokens.md `--icon-xs: 13px` と矛盾 → このPRで修正（13px に戻し SSOT 維持）
- W-1（plan-a11y）: フォローアップ Issue 未起票 → Phase 4（スコープ外 Issue 起票）で対応
- W-2（plan-a11y）: ADR-001 の title「必須」とモバイル省略の不整合 → このPRで修正（ADR の適用範囲を明確化）
- W-3（plan-a11y）: モバイルタップターゲット 36×32px 縮小 → このPRで修正（当たり判定拡大の実装注記を追記）

## Design Decisions

特になし。
