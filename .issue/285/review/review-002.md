# PR Review #002 — Support <pre> code block editing in inline mode

**PR:** #494
**Date:** 2026-06-05
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（良好）
- Verdict: **APPROVED**

---

## Frontend

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** W-A（`<pre>ab</pre>` 直接テキスト）は `hasDirectTextChild` ゲートを通過する経路で、`<pre><code>`（`isPre` 迂回が必須の経路）とは別経路。両方 pin したのは設計どおりで正しい切り分け。
- **[N-002]** 実装本体への差分なし（テスト追加のみ）。`isWithinPre` / `insertTextAtCaret` / Enter 分岐 / `isPre` 迂回はそのまま。回帰なし。

---

## Test

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** W-A 解消・検出力あり: bare-`<pre>` テストは contenteditable=true と Enter で `a\nb` 化を pin。`isWithinPre` 常時 false 変異で確実に fail（非トートロジー）。
- **[N-002]** W-B 解消・唯一の検出経路: disabled トグルテストは clear→再付与の往復を `<pre>` で pin。再付与握りつぶし変異で fail するのはこのテストのみ。双方向 pin 済み。
- **[N-003]** `isPre` 迂回削除変異で `<pre><code>` 装飾／Enter／W-B が fail（W-A は直接テキスト経路なので fail せず＝期待どおり）。迂回効果が正しく固定。
- **[N-004]** characterData / 要素強制挿入ロールバック / Tab テストも `classifyRecords` 境界を `<pre>` 文脈で両側固定。偽陽性・誤期待値・スコープ逸脱なし。
- **[N-005]** `code?.isContentEditable === true` ＋属性 null チェックで継承セマンティクスを正しく検証。
- **[N-006]** 軽微（指摘外）: 新規テストの `textNode!` は既存テストと同一パターン。biome warning 扱いで CI を落とさない。本 PR 由来の新規逸脱なし。

---

## 結論

Round 1 の Warning（W-A / W-B）はテスト追加で解消。mutation テストで検出力を実測確認し、新たな問題・回帰なし。両観点とも Blocker / Warning 0 件で **APPROVED**。1 ラウンドクリーンのため完了（issue-implement Phase 3 の完了条件）。

## Design Decisions

特になし。
