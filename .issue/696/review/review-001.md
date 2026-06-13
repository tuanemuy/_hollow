# PR Review #001 — feat(editor): #696 ノート編集画面に WYSIWYG モードを追加

**PR:** #715
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 14
- Verdict: **BLOCKED**（修正対象 Warning 4件を直すため次ラウンドへ）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 4）

## 指摘一覧と仕分け

### 直す（このPR）
- [Test W-001] AC-4「装飾が破壊されない」をモード非切替のみで確認、コンテンツ保持を直接 assert していない — `noteEditorModeChange.test.tsx:285-297`
- [Test W-004] AC-2/AC-5 の失われる要素 assertion が単一タグ `toContain("<section>")` のみ、複数/順序を未 pin — `noteEditorModeChange.test.tsx:268`
- [Test W-002] AC-6 new 画面の「切替挙動不変」がタブ在庫比較のみ、orchestrator 結合テスト無し — `editorModeSwitch.test.tsx:1060-1063`
- [Test W-003] AC-8 を WYSIWYG 経路 autosave で直接示すテストが無く HTML 経路の green を流用 — `noteEditorModeChange.test.tsx:392-637`

### 見送り（記録のみ）
- [Frontend W-001] 二重同意回避が WysiwygEditor の value 不変性と reducer latch 内部仕様への暗黙結合に依存 — 既知トレードオフで ADR-002/004 に記録済み・コメント＋テストで pin 済みのため対応不要（`NoteEditor.tsx:253-275`）
- [Frontend W-002] ダイアログ description の `<code>` がベア要素で等幅/視認スタイルなし — 既存の WysiwygEditor バナーと同一の描画パターンであり本 PR 単体の逸脱ではない。styling 統一は ConfirmDialog/バナー横断の別スコープのため見送り（`NoteEditor.tsx:537-547`）
