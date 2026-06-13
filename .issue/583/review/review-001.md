# PR Review #001 — feat(publication): P14 公開設定に「未保存の変更があります」警告を追加 (#583)

**PR:** #730
**Date:** 2026-06-14
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 16
- Verdict: **BLOCKED**（修正対象の Warning があるため再レビューへ）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

- [Frontend W-001] autosave 立ち下がりエッジ clear の回帰テストが無い — `app/components/note/editor/__tests__/noteEditorUnsavedFlag.test.tsx`
- [Frontend W-002] `role="status"` の二重描画の意図差が読み取りづらい — `app/components/publication/PublishSettings/index.tsx:268`
- [Test W-001] autosave 立ち下がりエッジ（`>0→0` → clearNoteUnsaved）が NoteEditor レベルで未検証 — `app/components/note/editor/__tests__/noteEditorUnsavedFlag.test.tsx`（実装 NoteEditor.tsx:172）
- [Test W-002] 手動保存 clear テストが「明示 clear」と「立ち下がりエッジ」を弁別できず実装事実に暗黙依存 — `app/components/note/editor/__tests__/noteEditorUnsavedFlag.test.tsx:185-201`

## 仕分け

- Frontend W-001 / Test W-001（同一の穴）: **このPRで直す** — 立ち下がりエッジ clear の NoteEditor レベル回帰テストを追加。
- Test W-002: **このPRで直す** — 手動保存テストを立ち下がりエッジと弁別できる形に補強。
- Frontend W-002: **このPRで直す** — 二重 `role="status"` の意図差を示す WHY コメントを追加（軽微）。
