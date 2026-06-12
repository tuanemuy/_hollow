# PR Review #002 — feat(public): P30 ユーザー公開ページをデザインモックに一致させる

**PR:** #653
**Date:** 2026-06-12
**Round:** 2回目（フル再レビュー）

## Summary

- Blockers: 0
- Warnings: 11
- Notes: 35
- Verdict: **BLOCKED → 仕分け後 APPROVED 見込み**（Blocker 0。Warning は価値の高い3件のみ修正、残りは見送り記録）

## レイヤー別ファイル

- Use Case / Domain: review-002-usecase-domain.md（B: 0 / W: 0）
- Adapter / Infrastructure: review-002-adapter-infra.md（B: 0 / W: 2）
- Frontend: review-002-frontend.md（B: 0 / W: 5）
- Test: review-002-test.md（B: 0 / W: 4）

## 仕分け

### このPRで直す（3件）
- [Test W-001] `PublicNoteViews.test.tsx` に `publishedAt: null` フォールバックを exercise するテスト追加 — 防御パスの担保
- [Test W-004] integration の noteColumn path 期間フィルターに `visibility === public` の明示 assert 追加 — 公開性の担保強化
- [Test W-003] `publicDateRange.ts` に不正文字列の扱い（正規化で null→無視、検証は transport 境界）を1行 JSDoc 明示

### 見送り（記録のうえ完了を妨げない）
- [Adapter W-001] 型ナローイングコメントの publishedRange 相対位置 — Round 1 で `isNotNull` 参照コメント追加済み。これ以上は冗長。見送り。
- [Adapter W-002] memory sort の O(n log n) コスト説明 — 既存 `listSortedWithinCandidates` の確立済み挙動。本PR非変更点。見送り。
- [Frontend W-001] `formatRelativeDate` の JSDoc — Round 1 で TZ 意味論を明示済み。見送り（対応済み）。
- [Frontend W-002] `display: contents` の Tailwind 互換 — `contents` は Tailwind 標準ユーティリティ（`display:contents`）。非問題。見送り。
- [Frontend W-003] `SortPopover.initialIndex` の defensive fallback — レビュアー自身「許容可」。見送り。
- [Frontend W-004] date input `h-7` のトークン対応 — `h-7` は標準 spacing スケール。非問題。見送り。
- [Frontend W-005] `reduceFilters` action type の冗長性 — 主観。型安全は担保済み。見送り。
- [Test W-002] `PublicNoteItem` の型制約の明示テスト — 型レベルは typecheck が担保。実行時テストは低価値。見送り。

## 指摘一覧（Warning）
- [W] Adapter: 型ナローイング明示 / memory sort 説明
- [W] Frontend: formatRelativeDate JSDoc / display:contents 互換 / initialIndex / h-7 token / reduceFilters 冗長
- [W] Test: publishedAt null fallback test / PublicNoteItem 型制約 / publicDateRange JSDoc / visibility assert
