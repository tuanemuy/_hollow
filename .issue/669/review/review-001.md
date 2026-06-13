# PR Review #001 — fix: エディター画面（P12）のモック準拠と編集中フォーカス喪失の解消

**PR:** #676
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 13
- Verdict: **BLOCKED**（Warning 全6件をこのPRで修正）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- State/Router: review-001-state.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

- [W-001/frontend] row variant の可視ラベル二重（labelHidden 提案）— `DirectoryPicker.tsx`
- [W-002/frontend] row pill input スタイルを styles.ts に hoist — `DirectoryPicker.tsx:166-169`
- [W-001/state] rebuild が pending debounce timer を clear しない — `InlineEditor.tsx:580`
- [W-002/state] EDITOR_ROUTE_IDS の JSDoc「seed 専用」が過大 — `routerInvalidate.ts`
- [W-001/test] seed-once pin がタイトルのみ（本文アサーション欠落）— `noteEditorSeedOnce.test.tsx`
- [W-002/test] lastEmittedHtmlRef の cleanup null リセットが未テスト — `inlineEditor.test.tsx`

ほか参考: [N-001/state] TC-009 実測と ADR-003 前提の食い違いを ADR に反映推奨（修正に含める）
