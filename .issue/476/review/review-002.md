# PR Review #002 — feat(note-list): 絞り込みUIをチップ＋ポップオーバーに統一 (案2)

**PR:** #491
**Date:** 2026-06-05
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 全7修正項目の解消を確認
- Verdict: **APPROVED**

review-001 の指摘（Blocker 2 / 要修正 Warning 6）に対する修正の検証ラウンド。

---

## 解消確認

| # | 指摘 | 結果 |
|---|------|------|
| B-001 | `role=menu` 直下の wrapper div 削除、menuitemradio を直接の子に | 解消 ✓（roving tabindex の `querySelectorAll('[role=menuitemradio]')` も維持） |
| B-002 | clamp を累積→絶対値 `setShiftX(shift)` に簡素化 | 解消 ✓（open で natural 位置測定→絶対値、close で 0、無限ループなし） |
| W-003(Arch) | clearReferencingNoteId / clearDirectory に `page: undefined` | 解消 ✓（全解除・変更で一貫） |
| W-004(FE) | reduceFilters に `default: never` 網羅性ガード | 解消 ✓ |
| W-001(Arch) | styles.ts コメント（ディレクトリ・参照は ghost なし） | 解消 ✓ |
| W-004(Arch) | visibilityLabel の "all" 用途 JSDoc | 解消 ✓ |
| W-001(Logic) | formatDateRangeChipLabel の malformed フォールバックテスト | 解消 ✓ |

## Blockers（新規・未解消）
なし

## Warnings（新規・未解消）
なし

## 総合判定

**APPROVED** — 1回目の全指摘が解消、回帰なし。typecheck / lint / format / test:unit（3139 PASS）グリーン。ブラウザ検証 TC-1〜5 PASS（検証中発見の表示バグ2件も修正済み）。

---

## Design Decisions

新規 ADR を要する判断はなし。
