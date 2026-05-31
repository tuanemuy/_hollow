# PR Review #002 — fix(#365): タグ利用件数を read-time 集計に変更

**PR:** #371
**Date:** 2026-05-31
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1（Spec）
- Notes: 多数（良点）
- Verdict: **BLOCKED**（Spec Warning 1件のため。修正後 round 3 で確認）

---

## Adapter / Infrastructure

### Blockers / Warnings
なし（**APPROVED**）

round 1 の W-A002（groupBy 移植性コメント）反映済み、W-A001 は機能的実害なし（テスト緑で担保）。ADR-004 の owner-scoped JOIN は ON 句配置で LEFT JOIN セマンティクスを保ち、正当結果不変・潜在ギャップ閉鎖を確認（N-001〜N-005）。

---

## Test

### Blockers / Warnings
なし（**APPROVED**）

round 1 の W-T001/W-T002/W-T003 をすべて的確に解消。owner 境界テストは新挙動（=1）を固定し退行検知力あり、0件タグソート・limit/offset 境界も決定的に検証。既存ケース退行なし・フレークなし（N-001〜N-006）。

---

## Architecture / Spec

### Blockers
なし

### Warnings
- **[W-S003]** owner-scope 化（ADR-004）が spec 本文に未反映。実装・テスト・ADR は揃っているが、`spec/domains/tag.md` の集計説明が「`note_tags` × active notes を都度 COUNT」止まりで owner-scope 条件が抜けている。
  - 場所: `spec/domains/tag.md` 二層構造注記
  - 提案: 集計式記述に owner スコープを明記（「当該 owner の active notes を COUNT」）。ADR-004 参照を添える。
  - → **round 2 で対応済み**: 二層構造注記を「`note_tags` × 当該 owner の active（非 trashed）notes を都度 COUNT（集計 JOIN は notes.owner_id で owner-scoped。ADR-004 参照）」に更新。

### Notes
- W-S001/W-S002 の修正は的確。database・usecases・domain の4ファイルで「死蔵だが残置／表示は read-time 集計」が一貫。tag.md の「再集計」→「increment」修正も実装と一致（N-001〜N-003）。

---

## Design Decisions

ADR-004（owner-scoped JOIN）を round 1 修正で追加済み。本ラウンドはその spec 反映漏れ（W-S003）を解消。
