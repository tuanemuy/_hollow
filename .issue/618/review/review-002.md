# PR Review #002 — feat(search): 公開検索(P32)に更新日時表示とフィルターUX改善

**PR:** #645
**Date:** 2026-06-11
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（修正不要レベル）
- Verdict: **APPROVED**

---

## Frontend (Round 2)

Blockers / Warnings: なし
- W-FE-001（UTC 統一）: getUTC* + JSDoc + ADR-005 を確認。P30 も共有フォーマッタへ移行済み
- W-FE-002（モック追従）: `.result-date`「M月D日」・メタ行「YYYY年M月D日 更新」・モバイル単カラム＋右列非表示が実装と一致。sort-label 置換も残骸なし
- N-005（Date 二重構築）: 1変数化を確認
- Notes: P30 カレンダーの日別グルーピングは TZ-aware のまま（ADR-005 スコープ外・regression でない）

## Test (Round 2)

Blockers / Warnings: なし
- W-TEST-001: malformed updated_at → SystemError(DataIntegrityError) の integration テスト確認（code/message まで assert）
- W-TEST-002: searchPublicNotes の VO Date → DTO ISO の結線アサーション確認
- formatNoteDate の unit テストは docs/test.md の「必要最小限」方針上、必須としない

## Design Decisions

- ADR-005（公開面の日付表示は UTC 固定）を Round 1 修正時に記録済み
