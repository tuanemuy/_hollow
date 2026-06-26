# PR Review #001 — fix(a11y): #781 データ駆動 RSC roving radiogroup の連続矢印フォーカスを復元

**PR:** #784
**Date:** 2026-06-27
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 9
- Verdict: **BLOCKED**（Warning を直すため）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 0）
- Test: review-001-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] AC-4 の effect 先頭 opt-in 早期 return が単独ピン留めされていない（二重ガードでマスク） — `app/components/common/useRovingTablist.ts:210`（Test）→ round 2 で修正（ピン留めテスト追加 + ミューテーション検証）
