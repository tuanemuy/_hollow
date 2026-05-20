# PR Review #002 — feat(issue-55): add bulk progress UI for tag merge/delete

**PR:** #97
**Date:** 2026-05-20
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 18
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- **[F-N-001]** F-W-001 への対応として `isPending: isPending && confirmDeleteOpen` ガード（`TagActions.tsx:152`）が追加され、エラー時の transition 残留による in-flight description 残存リスクが正しく排除されている。
- **[F-N-002]** F-W-004 の `aria-busy` boolean/string 揺れは全箇所が boolean に統一済み（`TagActions.tsx:180`, `MergeTagDialog.tsx:80,126`）。
- **[F-N-003]** A-W-004 の日本語タイポグラフィ問題は句点分離で解消済み。`{" "}` の挿入位置も `noteCount === 0` 時に冗長な二重スペースを生まない配置。
- **[F-N-004]** F-W-002（削除エラー時のフォーカス管理）と F-W-003（`MergeTagDialog` の影差）は ADR / plan で明示的にスコープ外。再確認しても本 PR スコープ意図と整合。
- **[F-N-005]** マイナーな一貫性指摘（in-flight 「更新中…」テキストの `<span>` クラス指定が MergeTagDialog では明示 / TagActions では ConfirmDialog 親継承）。視覚上問題なし、本 PR では修正対象外。
- **[F-N-006]** `renderDeleteDescription` は毎レンダで JSX を新規生成するが軽量。実害なし。
- **[F-N-007]** `runDelete` の `router.invalidate()` 後 `setConfirmDeleteOpen(false)` は unmount 後 setState 警告の可能性があるが、React 19 では撤廃済み。問題なし。

---

## Accessibility & Spec

### Blockers
なし

### Warnings
なし

### Notes
- **[A-N-001]** A-W-001（aria-live マウント時アナウンス）が testing.md エッジケース 5 の追加確認ポイントとして記載済み。コード変更なしの判断と整合。
- **[A-N-002]** A-W-002 / F-W-004 解消。`aria-busy={true}` boolean に統一。
- **[A-N-003]** A-W-003（`aria-valuemax` 二重情報リスク）は ADR-005 で明文化 + testing.md で AT 誤読み上げ確認手順を追加。
- **[A-N-004]** A-W-004（閉じカッコ後スペース）の修正で句点分離設計に変更済み。
- **[A-N-005]** A-W-005（`renderDeleteDescription` の component 昇格）は主観的指摘、現状維持判断と plan.md inline function 設計が整合。
- **[A-N-006]** A-W-006 への対応として ADR-006 Consequences に Biome ルール再評価の運用フックが追記済み。
- **[A-N-007]** A-W-007 への対応として ADR-001 が「ADR 独自の解釈による拡張」と明示する形にトーンダウン済み。
- **[A-N-008]** `description` の gated `isPending` と ConfirmDialog の ungated `isPending` の使い分けは意図的（ボタン disabled 維持目的）。
- **[A-N-009]** `role="alertdialog"` + `aria-describedby` で description ノードに progressbar が含まれる構造は、in-flight 切替時に `aria-live="polite"` がアナウンスを担保。WAI-ARIA 仕様上有効。
- **[A-N-010]** `motion-safe:animate-pulse` + testing.md エッジケース 4 で WCAG 2.3.3 / Tailwind 標準パターン準拠。
- **[A-N-011]** 新たな A11y 退行なし。前ラウンド A-W-001〜007 すべて対応済み。

---

## Design Decisions

新たな設計判断なし。ADR-001〜006 の範囲内で完結。
