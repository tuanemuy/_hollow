# PR Review #002 — feat(admin): add P46 jobs monitor screen with admin retry

**PR:** #56
**Date:** 2026-05-18
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

---

## Round 2 Findings

### Blockers
なし

### Warnings
なし

### Notes

- **N-001** D-W-001 / D-W-002 修正確認: `IngestionJob.retry` / `ExportJob.retry` JSDoc 追記 + `regenerationCount` 保持 assertion を確認
- **N-002** A-W-001 修正確認: `ingestion.retryRequested` のデコーダテストが独立 `it` ブロック化
- **N-002a** A-W-002 修正確認: deleted-admin actor の `ForbiddenError` ケース両 retry に追加。suspended は `assertAdmin` のタウトロジーのため意図通り未追加
- **N-003** A-W-003 修正確認: ADR-001 参照コメント追加
- **N-004** ADP-W-001/002/003 修正確認: migration コメント + port JSDoc 注記
- **N-005** F-W-001 修正確認: stable-sort コメント付与
- **N-006** F-W-002 修正確認: testing.md が JOB_LIST_LIMIT=100 に整合
- **N-007** F-W-003 修正確認: `toXxxJobIdDTO` ヘルパで二重キャスト解消
- **N-008** F-W-006 修正確認: `StatusTag` literal union で switch 網羅性が型レベルで検出可能に
- **N-009** 後回し記録の妥当性: progress.md に A-W-004 / F-W-004 / F-W-005 + 既存問題 3 件が記録済み
- **N-010** typecheck グリーン / unit 1344 / integration 303 + 4 todo 全パス
- **N-011** 副作用なし: schema 拡張・routeTree.gen.ts 追記・nav 追加すべて意図通り
- **N-012** 設計判断記録: ADR-005/006/007 が Accepted

### Verdict
**APPROVED**
