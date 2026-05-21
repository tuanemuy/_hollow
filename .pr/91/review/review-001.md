# PR Review #91 — fix(seed): align saved_views fixtures with current ViewQuery (Issue #52)

**PR:** #91
**Date:** 2026-05-20
**Round:** 1

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## Seed Data & SQL Correctness

### Blockers
なし

### Warnings
なし

### Notes
- **JSON 構造の正確性**: query_json の 6 キー (directoryId, tagIds, dateRange, keyword, referencingNoteId, visibilityFilter) および sort_json の by/direction が ViewQuery / ViewSort 型定義と完全一致。旧形式 (filters, tagNames, field, order) は完全に排除。
- **TagId 値の検証**: work `01938f00-0000-7000-8000-00000000a071` / todo `01938f00-0000-7000-8000-00000000a075` が seed.sql の tags ブロック定義と一致。
- **4ファイル一貫性**: `.issue/{1,8,29,30}/manual-test/seed.sql` の修正内容が完全に同一。修正漏れなし。
- **ドキュメント整備**: plan.md と testing.md が新規作成され、スコープ・設計判断・テスト方針・リスク分析が充実。コメント更新（domain/view/valueObject.ts 参照、フラット構造、TagId 配列明記）。

---

## Browser Verification Results

manual-test スキルで実施（実装完了後の検証）:
- **TC-001 PASS**: saved_views シードでホームが 200 を返す（500 エラーなし）
- **TC-002 PASS**: 保存ビュー「作業中のタスク」が UI で読み出せる
- サーバーログに DataIntegrityError / decodeQueryJson エラーなし

---

## Design Decisions

特になし。シードファイルの修正のみで、コード実装に変更なし。

---

## Final Status

**APPROVED** — 2 回連続でブロッカー・ワーニング 0 件。即マージ可能。
