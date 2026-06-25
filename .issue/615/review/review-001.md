# PR Review #001 — feat(settings): #615 P22 セッション一覧の表示リッチ化

**PR:** #775
**Date:** 2026-06-25
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 20
- Verdict: **BLOCKED**（Warning 仕分け対応のため再レビュー）

## レイヤー別ファイル

- Domain & Application: review-001-domain-app.md（B: 0 / W: 0）
- Adapter / Infrastructure: review-001-adapter.md（B: 0 / W: 2）
- Frontend: review-001-frontend.md（B: 0 / W: 3）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

- [W-001:adapter] uniq index で対象高々1行の旨を JSDoc 明記 — `sessionService.ts`
- [W-002:adapter] just-now しきい値 ≤ ACTIVITY_THROTTLE_MS のトレーサビリティ強化（確認済み）
- [W-001:frontend] session-meta 行構成がモック(2行)/計画と乖離してないか — `SecurityForm/index.tsx`
- [W-002:frontend] スロットル粒度整合の検証（確認済み）
- [W-003:frontend] device.label=null 時の kind が icon-only（a11y）— `SecurityForm/index.tsx`
- [W-001:test] relativeTime 絶対日付の locale 依存（ja-JP）の決定性 — `relativeTime.ts`
- [W-002:test] recordActivity 手動ブラウザ検証（実施済み TC-03/08）
