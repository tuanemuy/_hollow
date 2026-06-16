# PR Review #001 — feat(note): #743 ディレクトリパンくずを詳細と揃える

**PR:** #744
**Date:** 2026-06-15
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 11
- Verdict: **BLOCKED**（Warning 2件を修正してから再レビュー）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001/frontend] styles.ts のディレクトリ説明コメントが移設前の配置（"its own nav row" / #710 ADR-002）を指したまま — `app/components/note/list/styles.ts:68-72`（→ このPRで直す）
- [W-001/test] 「累積 id key」テストが console.error を spy しておらず name-based key 退行を検出できない — `app/components/note/list/__tests__/DirectoryBreadcrumb.test.tsx:170-186`（→ このPRで直す）

## 仕分け

両 Warning とも同一機能内で完結する軽微な指摘のため、このPRで修正する。後回し・別Issue化なし。
