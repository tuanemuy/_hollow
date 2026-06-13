# PR Review #001 — fix: app側メインコンテンツの幅をデザイントークンに統一 (#688)

**PR:** #695
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 0 / N: 5）

## 指摘一覧

- [N-001] app側のトークン乖離解消・public/admin と整合 — 全体
- [N-002] `--content-max` を `@theme inline` 非登録とした判断が正しい（任意値の変数直接参照） — app/styles/index.css:134
- [N-003] `mx-auto` を `max-w` と同時撤去、センタリングは親 APP_MAIN が担保 — app/components/note/detail/NoteDetail.tsx:125
- [N-004] 1100→1280px 拡幅のリグレッション懸念は実測で崩れ無し・想定挙動 — app/components/layout/styles.ts:121
- [N-005] CSS クラス文字列のみの変更で他層への影響なし — 変更全体

## 結論

小規模 Issue（General Review 1本）。Blocker・Warning ともゼロ。`max-w-[1100px]`/`max-w-[760px]` の app 内残存は grep で 0 件、トークン参照は Tailwind JIT で正しく解決、撤廃の副作用なし、スコープも plan.md と一致。受け入れ基準 AC-1〜AC-6 を満たす。1ラウンドでクリーンのため APPROVED で完了。
