# PR Review #002 — feat(worker): #783 終端 job 行の保持期間 prune と purge 配線

**PR:** #792
**Date:** 2026-06-27
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2（fix-worthy）+ 見送り済み再掲なし
- Notes: 9
- Verdict: **BLOCKED**（Warning 修正のため）

## レイヤー別ファイル

- Use Case / Worker: review-002-usecase.md（B: 0 / W: 1）
- Adapter / Infrastructure / DI: review-002-adapter.md（B: 0 / W: 0）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧と仕分け

- [W-001/usecase] purge の成功時 expired 件数がログ・返り値に出ず可観測性が非対称 — `handlers.ts:166-173` → **修正済み**: purge 成功時に `[prune] expired N export(s)` を info ログ。返り値契約・purge ロジックは不変。
- [W-001/test] runPruneTick 経由の実 D1 削除 end-to-end テストがない（配線回帰がサイレント化） — `handlers.integration.test.ts` → **修正済み**: 実 D1 で `runPruneTick` を走らせ、古い終端 export/tag_merge が削除され completed・非終端・最近の行が残ることを検証するケースを追加。
- [N-001/test] usecase unit がポート呼び出し「ちょうど1回」未 pin → **修正済み**: `toHaveBeenCalledTimes(1)` を追加。
- Notes（型 union 非結合 / env eager parse / wrangler TEMP_FILES 非対称コメント等）→ **見送り**: 既存パターン整合 or ADR 受容済み。

## 修正内容

- `app/worker/cloudflare/handlers.ts`: purge 成功時の expired 件数を info ログ追加（返り値契約不変）。
- `app/worker/cloudflare/__tests__/handlers.integration.test.ts`: runPruneTick 経由の end-to-end prune 検証ケース追加（実 D1 seed）。
- `pruneExportJobs.test.ts` / `pruneTagMergeJobs.test.ts`: `toHaveBeenCalledTimes(1)` 追加。

検証: unit 19件 PASS / handlers.integration 22件 PASS（従来21 + 新規1）/ typecheck PASS。
