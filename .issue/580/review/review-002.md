# PR Review #002 — feat(tag): #580 タグ統合を非同期ジョブ化し determinate 進捗バナーを供給

**PR:** #782
**Date:** 2026-06-26
**Round:** 2回目

## Summary

- Blockers: 0（実質）
- Warnings: 2（直す1 / 見送り1）
- Verdict: **BLOCKED**（軽微な test 穴を1件直して次ラウンドへ）

## レイヤー別ファイル

- Domain + Application: review-002-domain-application.md（B: 0 / W: 0 — 収束）
- Frontend: review-002-frontend.md（B: 0 / W: 0 — 収束）
- Test + Adapter: review-002-test-adapter.md（B: 3 / W: 2 → **B3 は未 push 起因の偽陽性**）

## 重要: Test+Adapter レビューの Blocker 3件は偽陽性

Test+Adapter レビュアーは `gh pr diff 782`（リモート PR head）を参照したが、Round 1 修正コミット `c4eddb3b` が**レビュー時点で未 push** だったため、修正が diff に現れていなかった。

- ローカルで確認: `idx_tag_merge_jobs_owner_status` 削除済み・`pageSize` 注入シーム実装済み・追加テスト存在・unit 4241 / integration 806 グリーン。
- 対応: コミット `c4eddb3b` を push（`4f5f8d55..c4eddb3b`）。これで PR diff が修正を反映する。
- よって B-001（test 3指摘の未追加）/ B-001（adapter index 残置）/ B-002（pageSize シーム未実装）は**すべて解消済み（push 漏れが原因）**。

Domain+Application・Frontend の2レビュアーはローカルファイルを直接参照し、Round 1 修正が正しく入って収束していることを確認済み（新規 Blocker/Warning なし）。

## 指摘一覧と仕分け（偽陽性を除く実体）

### 直す（このPR）
- [Test+Adapter W-002] `getTagMergeJob` の jobId 不在（NotFound）分岐が未テスト — `getTagMergeJob.ts`（AC-8 周辺の安価な穴）
- [Test+Adapter W-001a] `tagMergeJobRepository` の malformed JSON → DataIntegrity 変換が未カバー — `tagMergeJobRepository.integration.test.ts`（安価な堅牢性テスト）

### 見送り（記録済み）
- [Test+Adapter W-001b] `delete`(OCC) が未カバー — pruner 据え置きで現状未使用（ADR-007 で明文化）。使用箇所が入る将来 Issue でカバー。
