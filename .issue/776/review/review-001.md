# PR Review #001 — feat(a11y): #776 残りの不完全 role=tablist を APG 準拠化

**PR:** #780
**Date:** 2026-06-26
**Round:** 1回目

## Summary

- Blockers: 3
- Warnings: 6
- Notes: 16
- Verdict: **BLOCKED**（Test レイヤーに Blocker 3 件）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 3）— APPROVED（Warning 3 件は検証済み・実問題なし）
- Accessibility: review-001-a11y.md（B: 0 / W: 0）— APPROVED
- Test: review-001-test.md（B: 3 / W: 3）

## 指摘一覧

### Blockers（全て Test、このPRで直す）
- [B-001] ArrowLeft テストが editorModeSwitch.test に欠ける — `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`（Test）
- [B-002] 複数連続矢印キーテストが両テストで欠ける（AC-6: 矢印走査中の確認ダイアログ非暴発の核）— `editorModeSwitch.test.tsx` / `TagListToolbar.test.tsx`（Test）
- [B-003] aria-selected が矢印後も不変であることの explicit assert が欠ける — `editorModeSwitch.test.tsx`（Test）

### Warnings
- [W-001/Test] ArrowUp/Down テストが欠ける（実装は対応・DisplayModeSwitch は test 済み）→ 直す
- [W-002/Test] count=1 / count=0 エッジケースのロバストネステスト欠ける → 直す
- [W-003/Test] EditorModeSwitch 矢印キー経路での tabpanel aria-labelledby 不変を verify していない → 直す
- [W-001/Frontend] discriminated union onSelect 型 — 検証済み・問題なし → 見送り（記録のみ）
- [W-002/Frontend] tabpanel aria-labelledby dangling idref — 検証済み・常に有効 → 見送り（記録のみ）
- [W-003/Frontend] EditorModeSwitch "use client" — 検証済み・整合 → 見送り（記録のみ）

## 仕分け

- Test の B-001/B-002/B-003 と W-001/W-002/W-003 はすべてテスト追加（2ファイル）で低リスク・スコープ内 → **このPRで直す**
- Frontend の W-001〜003 はレビュアーが「検証済み・実問題なし」と結論済み → 見送り（コード変更不要）
