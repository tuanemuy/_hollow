# PR Review #002 — feat(public-search): P32 公開検索画面をデザインモックに整合

**PR:** #625
**Date:** 2026-06-10
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

Round 1 の唯一の指摘 [W-001]（モック input 右 padding 未追従）を修正し、Design/Spec 視点で再レビュー。Frontend 視点は Round 1 でクリーン＆本ラウンドで未変更のため再レビュー対象外。

---

## Design / Spec 整合性（Round 2）

### Blockers
なし

### Warnings
なし

### Notes
- W-001 解消を確認。PC モック `padding: 0 24px 0 54px` → `0 56px 0 54px`、モバイルモック `padding: 0 20px 0 46px` → `0 56px 0 46px`。旧値の残存ゼロを grep 確認。余計な変更なし。
- PC の `@media`（width≤640px）は `padding-left: 46px` のみ上書きで、base shorthand の右 56px が継承される（二重指定・孤立宣言なし）。
- 56px が実装 `SEARCH_FORM_INPUT` の `pr-14`(=56px) と一致。左側も `pl-[54px] max-sm:pl-[46px]` ↔ mock 54/46px で一致維持。
- `.search-btn`（right:6px, padding 0 16px, 「検索」）が右 padding 56px 内に収まり、入力文字・placeholder がボタン下に潜らない。ADR-003/004 の中央寄せ accent ボタン構造は不変。
- 新たな不整合・波及なし（変更は両モックの `.hero-search input` 1 行のみ。CSS 構文健全）。
- Round 1 の他整合（検索バー視覚・メタ行・タグ accent・ソート chevron 無し・ADR-001〜003 反映）は引き続き保持。
- 残課題なし。

---

## Design Decisions

特になし。

## 完了

Blocker 0 / Warning 0 を達成し、1 ラウンドクリーンの完了条件を満たした（Round 2 がクリーン）。**APPROVED** → PR を Ready for review に切り替える。
