# PR Review #001 — fix(ui): #728 認証遷移時のランディング一瞬表示を clearCache で解消

**PR:** #731
**Date:** 2026-06-14
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2（実質1テーマ）
- Notes: 9
- Verdict: **BLOCKED**（Warning を修正してから再レビュー）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

- [W-001] LoginForm.test.tsx の router mock が実装未追従（`invalidate` 提供・`clearCache` 欠落。失敗パスのみで偶発的 green、将来の成功パステストで TypeError 地雷） — `app/components/auth/__tests__/LoginForm.test.tsx:22-34,53`（Frontend/Test 双方）
- [W-002] race 核心の順序不変条件（clearCache→navigate）の機械検証が UserMenu の 1 経路のみ — `app/components/layout/__tests__/UserMenu.test.tsx:129-153`（Test）

## 仕分け

- W-001: **このPRで直す**。本変更と同テーマ（clearCache 化）で、実在テストの未追従は plan AC-7「存在すれば追従必須」に反する。
- W-002: **このPRで直す**。W-001 修正のついでに LoginForm の成功パスで clearCache→navigate の順序を assert すれば、順序検証を 2 経路に広げられる。
