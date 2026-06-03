# PR Review #002 — refactor(a11y/ui): disabled opacity 正規化と focus-visible リング統一 (#419)

**PR:** #440
**Date:** 2026-06-03
**Round:** 2回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

review-001 の Warning 2件（W-001 スコープ漏れ、W-002 検証カバレッジ不足）の是正を再レビューで確認。

---

## 再レビュー（round 2）

#### Blockers
- なし

#### Warnings
- なし
  - **W-001 解消確認**: `grep -rn "disabled:opacity-50|55|60 / aria-disabled:opacity-5|60" app/` は完全に空。`app/routes/admin/route.tsx:43` も `disabled:opacity-disabled` に修正済み。`grep -rn "opacity-50|55|60" app/` のヒットは据え置き 2 件（discarded/pending）のみ。
  - **W-002 解消確認**: report.md の追加検証 D/E/F が overflow クリップ・menu item・admin disabled を過不足なくカバー。

#### Notes
- 全 disabled opacity 箇所が `opacity-disabled` utility（3 variant）に統一、任意値フォールバック未使用。ビルド生成 CSS で 3 variant とも `--opacity-disabled:0.55` 解決を実機確認。CLAUDE.md 規約に完全準拠。
- focus リングの方式変更・要素単位 `focus-visible:` 新規付与なし。グローバル `:focus-visible` 無改変（ADR-001 準拠）。
- report.md の「残懸念（実害なし）」2点（admin タブ nav の overflow-x-auto / ツリー実ノード未検証）は本 PR の変更と無関係な既存レイアウト由来で、Issue #419 のブロッカーにならない。将来 #336 umbrella で実ノード持ちユーザーでの再確認が望ましい程度。

#### 総評
前回 Warning 2件はいずれも根本是正済み。ビルド裏取り・スコープ逸脱なし・規約準拠を確認。**APPROVED**。

---

## Design Decisions

新規の設計判断なし。
