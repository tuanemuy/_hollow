# PR Review #002 — feat(speech): #738 Deepgram Nova-3 を文字起こし registry に対応

**PR:** #765
**Date:** 2026-06-21
**Round:** 2回目

## Summary
- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

## レイヤー別ファイル
- Adapter: review-002-adapter.md（B: 0 / W: 0 / N: 8）
- Test: review-002-test.md（B: 0 / W: 0 / N: 4）

（Frontend / Domain+Docs は Round 1 で Blocker・Warning ゼロのため Round 2 は Adapter・Test に集中）

## 指摘一覧
- すべて Notes（情報・任意）。Blocker・Warning なし。
- [N-008/adapter] `app/core/adapters/speech/registry.ts:31` のコメント「currently only OpenAI」が文言ドリフト（deepgram 登録済み）→ Phase 5 comment-cleanup で対応（registry.ts は変更ファイル）

## 完了判定
- Round 1 で W-001（ping err_code 接頭辞）・test N-001（サイズガード WHY コメント）を修正 → 再レビューで解決確認
- Round 2 は全レイヤー Blocker 0・修正対象 Warning 0 → 完了条件達成。APPROVED。
