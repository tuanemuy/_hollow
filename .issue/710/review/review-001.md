# PR Review #001 — feat: ノート一覧のディレクトリ表示をチップからパンくず（現在地ナビ）に変更

**PR:** #713
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 20
- Verdict: **BLOCKED**（Warning を全件修正対象に仕分けたため再レビューへ）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 3）
- Logic / 正しさ: review-001-logic.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧

- [Frontend W-001] ディレクトリ解除 × にモバイルタップターゲット床（44px）が無い — `app/components/note/list/DirectoryBreadcrumb.tsx:65-72`
- [Frontend W-002] フォールバックチップだけ `mb-5` ラッパで囲まれパンくず分岐とレイアウト構造が非対称 — `app/components/note/list/FilterBar.tsx:447-459`
- [Frontend W-003] 先頭フォルダアイコンが区切りと同じ最弱トーンで視認性が弱い — `app/components/note/list/DirectoryBreadcrumb.tsx:39-41`
- [Logic W-001] 循環/親欠落時に root 未到達の「壊れた部分鎖」をそのまま現在地として描画（id不在=[]と非対称、安全縮退でない） — `app/components/note/directoryTree.ts:56-65`
- [Test W-001] パンくず「区切りは要素間のみ」描画契約が未テスト — `app/components/note/list/__tests__/FilterBar.test.tsx:709-770`
- [Test W-002] AC-7（パンくずがチップ群と別行）が未検証 — `FilterBar.test.tsx:709-770`
- [Test W-003] フォールバック× とパンくず× が同一 aria-label でスコープ未分離 — `FilterBar.test.tsx:716-769`

## 仕分け

全 Warning を「このPRで直す」に仕分け（すべて同一機能・低コスト、見送りなし）。
- Frontend群（W-001/W-002/W-003）と Test群（W-001/W-002/W-003）は FilterBar/DirectoryBreadcrumb のDOM契約に密結合 → 1エージェントにまとめて整合的に修正
- Logic W-001 は directoryTree.ts + directoryTree.test.ts に閉じる → 別エージェントで並列
- Frontend W-001（44px）は既存プロジェクト規約（filterChipRemove 等）に合わせる方針で修正可否を判断
