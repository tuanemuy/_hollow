# PR Review #002 — feat(issue/259): preview-form information design polish

**PR:** #264
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 11（Frontend 7 + Test 6）
- Verdict: **APPROVED**

---

## Frontend

### Blockers

なし

### Warnings

なし

### Notes

- [N-001] review-001 B-001 解消を確認。`spec/design/index.md` が PR 差分から消え、Issue #250 の `max-width` 例外緩和が保たれている
- [N-002] review-001 W-001 解消を確認。ADR-004 で `legendSlot` 拡張の根拠が明文化、plan.md のスコープも整合
- [N-003] review-001 W-002 解消を確認。`data-edited` 4 箇所すべて削除済み
- [N-004] review-001 W-003 解消を確認。本文プレビューのバッジは撤去、ラベルは「LLM 抽出・読み取り専用」に変更
- [N-005] review-001 W-004 解消を確認。`data-ai-badge-for` で title / directory / tags / frontmatter の 4 箇所を個別識別可能
- [N-006] DirectoryPicker JSDoc が用途明示済みで、note editor 側の誤用リスクは低い
- [N-007] P13a モックも新フィールド順＋本文プレビューバッジなしで実装と一貫

---

## Test

### Blockers

なし

### Warnings

なし

### Notes

- [N-T-001] review-001 W-T-001 解消を確認。`aiBadgeFor(field)` ヘルパーで個別識別
- [N-T-002] review-001 W-T-002 解消を確認。`toHaveLength(4)` で厳密件数アサート
- [N-T-003] review-001 W-T-003 解消を確認。タイトル / タグそれぞれで独立性ケース追加、復元再表示ケースも残存
- [N-T-004] review-001 W-T-004 解消を確認。`closest("details")` 起点で取得
- [N-T-005] `tagsInput()` ヘルパーは placeholder 依存だが、`useId()` ベースよりは安定で本 PR では妥当
- [N-T-006] 13 ケース全 PASS 確認

---

## Design Decisions

なし（このラウンドで追加の設計判断なし）。
