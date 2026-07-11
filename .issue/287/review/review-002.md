# PR Review #002 — fix(editor): inline モードでメディア挿入直後の <img> 単体ラッパを編集可能にする

**PR:** #839
**Date:** 2026-07-11
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 9
- Verdict: **BLOCKED**（修正対象 Warning 1件 — コメント精度のみ）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 0）

## 指摘一覧

- [W-001] ゲートコメントの skip 根拠「redundant」が mixed コンテナ（`<li><img><p>…</p></li>` 残余ギャップ）に対し不正確 — `InlineEditor.tsx:295-298`（Frontend）→ このPRで修正
- [N-003] PR 本文の「フォローアップ Issue 起票予定」が #840 起票済みに未更新 — メインが PR 本文を更新
- [N-004] JSDoc 冒頭のタグ列挙に `pre` 欠落（既存） — 同じコメントブロックのためこのPRでついで修正
