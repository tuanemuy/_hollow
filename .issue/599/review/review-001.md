# PR Review #001 — fix(public): #599 RSC 内 notFound を ErrorPage 直接返却で 404/410 表示に修正

**PR:** #734
**Date:** 2026-06-14
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 16
- Verdict: **BLOCKED**（Warning 2件を修正対象に仕分け）

## レイヤー別ファイル

- Frontend / RSC・エラーハンドリング: review-001-frontend.md（B: 0 / W: 0 / N: 11）
- Test: review-001-test.md（B: 0 / W: 2 / N: 5）

## 指摘一覧

- [W-001] serverData モックの引数「形」依存分岐が偽陰性リスク。UserPublicTop は loadProfile/loadPublicTags が string 分岐共用で AC-4 論拠を区別検証していない — `app/components/public/__tests__/UserPublicTop.test.tsx`（Test）→ 本PRで修正
- [W-002] UserPublicTop re-throw テストが Promise.all 内のどのローダー由来でも通り、loadNotes（object 分岐）由来の非NotFound re-throw が未カバー — `app/components/public/__tests__/UserPublicTop.test.tsx`（Test）→ 本PRで修正

## 仕分け

両 Warning とも同一テストファイル内で完結する低コストな堅牢性改善のため、本PRで修正する。Frontend は Blocker/Warning なしで実装本体は APPROVED 相当。
