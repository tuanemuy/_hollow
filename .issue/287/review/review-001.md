# PR Review #001 — fix(editor): inline モードでメディア挿入直後の <img> 単体ラッパを編集可能にする

**PR:** #839
**Date:** 2026-07-11
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 5（実質4 — FE W-003 と Test W-001 は同一指摘）
- Notes: 9
- Verdict: **BLOCKED**（修正対象 Warning あり）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 3）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

- [W-001] 先頭 JSDoc「text-bearing block elements」が旧規則のまま — `InlineEditor.tsx:7`（Frontend）→ このPRで修正
- [W-002] snapshot 巻き戻りのフォローアップ Issue 未起票 — `InlineEditor.tsx:309`（Frontend）→ メインが起票（progress.md 記載の Phase 4 対応を前倒し）
- [W-003] `<p><a><img></a></p>` の pin テストなし — `inlineEditor.test.tsx:956`（Frontend）＝ Test W-001 → このPRで修正
- [W-001/Test] 同上（ADR-001 弁別ケース未 pin）— `inlineEditor.test.tsx:959`（Test）→ このPRで修正
- [W-002/Test] `containsEditableBlock` の任意深さ skip 側 pin なし — `inlineEditor.test.tsx:394`（Test）→ このPRで修正
