# PR Review #001 — refactor(ui): styles.ts 外のローカルボタン定義を common へ統一 (#442)

**PR:** #445
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 15
- Verdict: **APPROVED**

2 視点（Frontend / CSS cascade 正当性、Plan整合 / SSOT・アーキ）で並列レビュー。両視点とも Blocker・Warning ゼロ。生成 CSS の byte-offset を**両レビュアーが独立に fresh build で再実測**し、全 data-variant の後勝ちを確認。

---

## Frontend / CSS cascade

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** CSS cascade の後勝ちを実ビルドで全数実証（base < variant の byte-offset 一致、report.md と整合）。
- **[N-002]** ADR-001（押下グレー回帰回避）は必要十分。base active と variant active は同一ガード＋`[data-ghost-danger]` 属性で特異度・生成順とも勝つ。hover/active とも error-surface で同色衝突なし。
- **[N-003]** `data-[sm]:max-sm:min-h-0` の variant スタックが正しく機能（base と同一 `@media (width<640px)` ブロック内で後出し）。
- **[N-004]** `text-xs` line-height ペア問題は発生しない（base/variant とも font-size + line-height を吐き完全上書き）。ADR-003 補正後の機序記述どおり。
- **[N-005]** data 属性は静的オン形式（`data-x=""`）で CLAUDE.md 規約準拠。
- **[N-006]** disabled / aria-disabled は `<button>`・`<Link>` とも正しく機能。
- **[N-007]** 削除定数の参照漏れ・未使用 import なし（typecheck クリーン）。
- **[N-008]** 既存 primitive（pillBtnDanger / pillBtnTall）との設計思想が一貫。

## Plan整合 / SSOT・アーキ

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 計画ステップ 1〜5 が過不足なく実装。スコープ外要素への手入れなし。
- **[N-002]** SSOT 化完遂（target 3 ファイルから削除定数の定義・参照・コメントアウトが完全消滅、残骸ゼロ）。
- **[N-003]** 新 variant の JSDoc が既存水準を満たす。
- **[N-004]** ADR の技術前提を fresh build で実証（small 縮小後勝ち / mobile min-h 打ち消し / ghost-danger active 上書き）。
- **[N-005]** ADR-001/002 が「意図的変化」であることを原本（active 系 utility 不在）で裏取り、記録漏れなし。
- **[N-006]** PromptsForm の 2 定数集約は妥当（バイト完全同一だった）。
- **[N-007]** 他ファイル据え置きは Issue スコープとして正しい。UsersTable / Jobs の `BTN_SM_CLASS`、LLMSettingsForm の `BTN_CLASS`、加えて `admin/route.tsx` の `ADMIN_BTN_CLASS`（`<Link>` 用 surface pill）も named scope 外で本 PR 対象外。→ Phase 4 フォローアップ候補。

---

## Design Decisions

このラウンドで新たな設計判断なし（既存 ADR-001〜005 で網羅済み）。レビューで `admin/route.tsx` の `ADMIN_BTN_CLASS` も同種の SSOT 外残務として検出（Phase 4 の起票候補に追加）。
