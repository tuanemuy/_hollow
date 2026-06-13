# PR Review #001 — feat: #654 公開ページ(P30)の「タグを追加(＋)」UI

**PR:** #691
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 19
- Verdict: **BLOCKED**（Warning を修正してから再レビュー）

## レイヤー別ファイル

- Use Case / Domain: review-001-usecase-domain.md（B: 0 / W: 1）
- Infrastructure / Adapter + Security: review-001-adapter-security.md（B: 0 / W: 0）
- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 0）

## 指摘一覧

### 修正する
- [W-001/usecase] owner-scope 述語を notes JOIN 条件に置く設計の JSDoc 明示不足 — `app/core/adapters/d1/repositories/tagRepository.ts:300-307`（usecase）
- [W-001/frontend] cap=8 抑止時、aria-disabled option がロービングフォーカス対象に残り「焦点は当たるが押せない」死に option になる — `app/components/public/PublicTopControls.tsx:688-697,731-760`
- [W-002/frontend] ＋chip トリガーに可視テキストと同一の `aria-label="タグを追加"` が二重付与で冗長 — `app/components/public/PublicTopControls.tsx:712-725`
- [N-001/adapter] `published_at IS NOT NULL` gate 不在の根拠を JSDoc 注記（将来の gate 変更時の取りこぼし防止。同一ファイルの JSDoc 改善として併修） — `app/core/adapters/d1/repositories/tagRepository.ts:308-314`
- [N-001/test] cap抑止ユニットの境界値（9件ケース・選択済み7以下側）を補強（回帰固定。同一テストファイル内で安価） — `app/components/public/__tests__/PublicTopControls.test.tsx:1743-1756`

### 見送り（記録のみ）
- [N-002/test] `listUserPublicTags` の deleted/suspended guard が自動テスト未担保 → 兄弟 `listUserPublicNotes` も同断で逸脱ではない。plan で optional 化済み。見送り
- その他 Notes（良い点・参考情報）は対応不要
