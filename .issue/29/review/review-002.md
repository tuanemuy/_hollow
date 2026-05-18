# PR Review #002 — feat(search): propagate visibility through searchOwnNotes + project real value

**PR:** #47
**Date:** 2026-05-18
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## Round 1 Warning への対応確認

| ID | 内容 | 対応状況 |
|----|------|---------|
| W-001 | `SearchRow` 型と SELECT 句の順序整合 | **対応OK** — `tagNamesJson, visibility, score` の順で SELECT 句と一致 |
| W-002 | ADR-003 フォロー Issue に D1 integration test 整備を明示 | **対応OK** — タイトル A/B の二段構成に再編。タイトル B として動機・スコープ・規模見積もりまで明示 |
| W-003 | visibility デフォルト確認テストを独立ケースに | **対応OK** — `defaults visibilityFilter to all three when visibility is omitted` を独立 it ケースに切り出し |

## 新たな Blockers
なし

## 新たな Warnings
なし

## Notes
- 1336 tests pass / typecheck 通過
- スコープ純度が高い（SearchHit/DTO/loader/adapter/FTS join 修正以外の改変なし）
- `SearchHit.visibility: Visibility` 必須化に対する全 callsite 追従済み
- `searchPublicNotes` 側の visibility=`public` 投影テストも追加されており、ADR-002 (port セマンティクス) と整合
- ADR-013/014 関連の `mode === "search"` ガードは ADR-003 タイトル A に正しく繰り延べ

---

## Design Decisions
特になし（ADR-001..006 で十分カバー）

---

## Verdict
**APPROVED** — 1ラウンドクリーンで完了。
