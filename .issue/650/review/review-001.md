# PR Review #001 — feat(ui): 表示モードの前回値を localStorage に永続化し P10 初期表示に適用 (#650)

**PR:** #721
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 16
- Verdict: **BLOCKED**（Warning 全件をこの PR で修正するため）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

- [Frontend W-001] selectDisplayRaw の単体テスト未追加 — `app/components/note/list/__tests__/listSelectors.test.ts`（Test で対応）
- [Frontend W-002] useEffect 依存空＝mount スナップショット・別タブ同期非対応の明示が無い — `app/components/note/list/useEffectiveDisplayMode.ts:33`
- [Test W-001] 早期 return パスでの localStorage 書き込みを pin するテストが無い — `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`
- [Test W-002] AC-3「URL 由来表示時に localStorage を改変しない」回帰網が無い — `app/components/note/list/__tests__/useEffectiveDisplayMode.test.tsx`

## 仕分け

全 4 件ともこの PR で修正（同一機能・同一ディレクトリ内で完結、軽微）。
- FE W-001 / Test W-001 / Test W-002: テスト追加
- FE W-002: JSDoc に WHY 追記（mount スナップショット・別タブ同期は意図的に非対応）
