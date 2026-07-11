# PR Review #006 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 6回目

## Summary

- Blockers: 0
- Warnings: 3（うち Domain/UseCase の2件は同一指摘）
- Notes: 23
- Verdict: **BLOCKED**（修正対象 Warning 2 — いずれも小粒）

## レイヤー別ファイル

- Domain: review-006-domain.md（B: 0 / W: 1）
- Use Case: review-006-usecase.md（B: 0 / W: 1）
- Infrastructure: review-006-infrastructure.md（B: 0 / W: 1）
- Test: review-006-test.md（B: 0 / W: 0）

## 指摘一覧

- [W-001] 放棄判定ルール（cutoff 導出）が MediaService と sweep の fresh ガードの2箇所に分散 — ドメイン述語への単一ソース化（Domain / Use Case 同一指摘）→ このPRで修正
- [W-001] docs/ADR の回収レイテンシ「up to ~2 days」が過小（実最悪 約3〜4日） — `docs/runtime_cloudflare.md`（Infrastructure）→ このPRで修正
- 参考: [N-005] temp 欠損 skip の行が `spec/testcases/ingestion/index.md` に未同期（Test）→ 軽微なので同時に対応
