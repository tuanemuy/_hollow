# PR Review #002 — feat(ingestion): UI に「破棄済みを表示」トグルを追加

**PR:** #335
**Date:** 2026-05-29
**Round:** 2回目（再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 良好
- Verdict: **APPROVED**

review-001 の Warning 8件（修正6 / 据え置き2）への対応を全観点（Frontend / Presentation・検証境界 / Test）で再確認。修正は妥当、据え置き判断（Presentation W-001 transform の false 出力、Frontend W-001/W-003 の aria/data-primary）も適切。新たな Blocker・Warning の混入なし。

---

## 再レビュー結果

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** review-001 の修正が完全かつ妥当。JSDoc 矛盾の解消、`it.each` による union falsy の型別カバレッジ、present-but-invalid（object/null/array）網羅、破棄済みカードのアクション非表示テストすべて確認。
- **[N-002]** データフロー（`loaderDeps` 再クエリ → `key` 再マウント → effect deps → ポーリングへのフラグ貫通）が一貫。トグル状態がリロード・ポーリングを跨いで維持される（ADR-002）。
- **[N-003]** `uploadSearchSchema` の JSON パーサ対応（`z.number()`／`=1` truthy 化）と手動テスト TC-007 の修正・再検証が、エッジケースを確実に固定化。
- **[N-004]** CLAUDE.md 規約（Input validation 2点検証 / Error handling / data-* + Tailwind Styling）全準拠。完了条件すべて達成。

---

## 完了判定

**Blockers 0 / Warnings 0 → APPROVED。** 1ラウンドクリーン（review-002）で完了。PR を Ready for review に切り替える。

## Design Decisions

新規 ADR なし。
