# PR Review #001 — fix: 公開プロフィールの publicNoteCount を active 母集合で算出

**PR:** #714
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 17
- Verdict: **BLOCKED**（W-001 を修正のため）

## レイヤー別ファイル

- Use Case & Domain: review-001-usecase-domain.md（B: 0 / W: 0）
- Infrastructure (D1 Adapter): review-001-infrastructure.md（B: 0 / W: 0）
- Test: review-001-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] visibility 除外ケース (d) が published_at NULL と二重ガードで偽陰性リスク — `app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts:474-497`（Test）

## 仕分け

- [W-001] → **このPRで直す**（同一テストファイル内で完結・偽陰性リスクの解消。private/unlisted 行に非NULL published_at を与えて visibility 条件を独立検証する）
