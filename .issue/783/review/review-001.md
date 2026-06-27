# PR Review #001 — feat(worker): #783 終端 job 行の保持期間 prune と purge 配線

**PR:** #792
**Date:** 2026-06-27
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 21
- Verdict: **BLOCKED**（Warning 修正のため）

## レイヤー別ファイル

- Use Case / Worker: review-001-usecase.md（B: 0 / W: 1）
- Adapter / Infrastructure / DI: review-001-adapter.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧と仕分け

- [W-001/usecase] purge の limit 100/日でスケール時 AC-9 達成度が制約 — `handlers.ts:168` → **見送り（Phase 4 フォローアップ候補）**: purge の意図的な per-tick 有界設計。個人向けアプリの export 低頻度で steady-state は十分。backlog/throughput は purge 設計に属しスコープ外。
- [W-001/adapter] `returning({id})` の無制限 DELETE — `jobStatePruner.ts:32,47` → **見送り**: 既存 prune 群と完全同一パターン。本変更固有の回帰でない。
- [W-001/test] cutoff ちょうどの境界値未検証 — `jobStatePruner.integration.test.ts` → **修正済み**: `updated_at == cutoff` 終端行が保持される境界テストを tag_merge / export に追加（`lt`→`lte` 回帰を検出）。
- [W-002/test] runPruneTick の retention 配線が未 pin — `runPruneTick.test.ts` → **修正済み**: prune 2本が tuning 由来の retention 値（別値 9日/11日）で呼ばれることをアサート。

## 修正内容

- `jobStatePruner.integration.test.ts`: cutoff 境界テスト2件追加（tag_merge / export）。
- `runPruneTick.test.ts`: retention 配線 pin テスト1件追加（mock を別値化して swap 検出）。

検証: `runPruneTick.test.ts` PASS / `jobStatePruner.integration.test.ts` PASS / typecheck PASS。
