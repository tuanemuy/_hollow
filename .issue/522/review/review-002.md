# PR Review #002 — fix(editor): WYSIWYGエディターのフォーカス枠線・余白・選択表現を整える

**PR:** #606
**Date:** 2026-06-09
**Round:** 2回目（W-001 修正確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 0
- Verdict: **APPROVED**

---

## 対応内容

Round 1 の唯一の指摘 **[W-001]**（ドキュメントの文言が実装とズレ。コードは正しい）を修正した。

- `.issue/522/adr.md` ADR-007 Decision: InlineEditor の打ち消しを「ホスト自身の `focus-visible:shadow-none`」から「ホスト配下の子ブロックを対象とする `[&_:focus-visible]:shadow-none`（= `.note-detail-content :focus-visible`）」へ記述修正。ホスト `<section>` が contenteditable でなく子ブロックがフォーカスを得るという実アーキテクチャに合わせた。
- `.issue/522/adr.md` ADR-008 Context（フォーカス枠の二重化解消の記述）も同様に補正。
- `.issue/522/plan.md` ステップ4 の同記述も補正。

**コードの変更は不要**（実装は Round 1 時点で正しかった）。`WysiwygEditor.tsx` / `InlineEditor.tsx` / `index.css` に変更なし。

## 確認

- Round 1 の Frontend/スタイリング規約・回帰/横断CSS影響の両レビューとも Blocker 0・コードに対する Warning 0。唯一の W-001 はドキュメント精度の問題で、本ラウンドで解消。
- 実装はブラウザ検証（`.issue/522/manual-test/report.md`）で全6ケース PASS 済み。
- これにより Blocker 0件・Warning 0件 → **APPROVED**。

---

## Design Decisions

新規の設計判断なし。
