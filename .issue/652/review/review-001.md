# PR Review #001 — fix: 共有 Popover に垂直ビューポートクランプを追加

**PR:** #686
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 1
- Warnings: 6
- Notes: 12
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 1 / W: 4）

## 指摘一覧

- [B-001] DOM スタブテストが軸分離できず `toContain("translate(")` が緩すぎ回帰検知力ゼロ — `Popover.test.tsx:313-346,348-390`（Test）→ 直す
- [W-001/test] 垂直クランプの実数値が DOM 経路で未固定 — `Popover.test.tsx:348-390`（Test）→ 直す（B-001 と一括）
- [W-002/test] 両軸合成 transform の引数順専用テストが無い — `Popover.test.tsx`（Test）→ 直す
- [W-003/test] 狭幅スキップが `toBeFalsy()` でスキップを厳密に保証しない — `Popover.test.tsx:392-437`（Test）→ 直す
- [W-004/test] rect スタブが `Element.prototype` 全体に効く前提が脆い（コメント無し） — `Popover.test.tsx:314-315`（Test）→ 直す
- [W-001/frontend] `clampToViewport` の JSDoc/コメントが垂直対応を反映していない — `Popover.tsx:18-19,35`, `usePopover.ts:117-122`, `FilterBar.tsx:581,584`（Frontend）→ 直す
- [W-002/frontend] `panelStyle` が毎レンダー新規オブジェクト生成 — `usePopover.ts:188-191`（Frontend）→ **見送り**（既存 shiftX 実装からの踏襲パターン・挙動影響なし。memo 化は本 Issue スコープ外の最適化）

## 見送り記録

- [W-002/frontend] `panelStyle` の毎レンダー新規オブジェクト生成は、垂直クランプ追加前から `shiftX` 単独で同じ挙動だった既存パターン。`Popover.tsx` は `panelStyle` を透過するだけで再レンダーの実害はなく、本 Issue（垂直クランプ追加）のスコープ外。メモ化したい場合は別途リファクタとして扱う。
