# PR Review #001 — fix(frontend): #821 日付整形の TZ を Asia/Tokyo 固定し共有ヘルパーに集約

**PR:** #823
**Date:** 2026-07-10
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 15
- Verdict: **BLOCKED**（W-001 を修正して再レビュー）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 0 / N: 8）
- Test: review-001-test.md（B: 0 / W: 1 / N: 7）

## 指摘一覧

- [W-001] `timeZone` 上書き順序（呼び出し側の TZ を JST に倒す安全網）の回帰テストが無い — `app/components/common/__tests__/dateFormat.test.ts`（対象 `dateFormat.ts:20`）（Test）

## 仕分け

- **[W-001] → このPRで直す**: ADR-002 / plan が明示した「呼び出し側が誤って `timeZone` を渡しても JST に倒す（`{ ...options, timeZone: "Asia/Tokyo" }` の順序）」挙動が無防備。テスト1本追加は低コストかつ同一ファイル内で完結するためスコープ内。
