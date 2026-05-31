# PR Review #003 — fix(#365): タグ利用件数を read-time 集計に変更

**PR:** #371
**Date:** 2026-05-31
**Round:** 3回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（良点）
- Verdict: **APPROVED**

---

## Adapter / Infrastructure

Blocker 0 / Warning 0（round 2 で APPROVED、本ラウンドの修正はコード非変更のため維持）。

## Test

Blocker 0 / Warning 0（round 2 で APPROVED、本ラウンドの修正はコード非変更のため維持）。

## Architecture / Spec

Blocker 0 / Warning 0（**APPROVED**）。

W-S003 解消確認: `spec/domains/tag.md` の二層構造注記が「`note_tags` × 当該 owner の active（非 trashed）notes を都度 COUNT（集計 JOIN は notes.owner_id で owner-scoped。ADR-004 参照）」へ更新され、実装の owner-scoped JOIN・active フィルタ・ADR-004 参照の3点すべてと一致。死蔵化の記述も domains/database/usecases の4ファイル横断で一貫。

---

## Design Decisions

新規なし。ADR-001〜004 で本Issueの設計判断はすべてカバー済み。

---

## 完了

3ラウンドで全レイヤー Blocker 0 / Warning 0 に収束。APPROVED。PR を Ready for review に切り替える。
