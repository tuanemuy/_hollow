# PR Review #001 — feat(note): #798 WYSIWYG ツールバーの「画像」ボタンを MediaUploader に配線

**PR:** #800
**Date:** 2026-06-28
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 13
- Verdict: **BLOCKED**（Warning を直すため）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧

- [Frontend W-001] AC-6「アップロード中 no-op」の発生機序が plan/ADR/testing の記述とずれ（実態: input が uploading 時にアンマウント→ref null。記述: input が disabled）。実装は正しく安全だがドキュメントが #797 dropzone マージ前の前提のまま — `.issue/798/plan.md` / `adr.md` / `testing.md`
- [Test W-001] NoteEditor の配線（画像ボタン click → media input.click()、AC-2 本体）の統合テストが無い — `app/components/note/editor/NoteEditor.tsx`
- [Test W-002] AC-6 の `disabled` / `editor===null` 分岐（ボタン disabled）が未カバー — `app/components/note/editor/__tests__/wysiwygEditorImageButton.test.tsx`

## 仕分け

すべてこの PR で直す（いずれも対象ファイルに閉じ低コスト）:
- Frontend W-001 → ドキュメント（plan/adr/testing）を現物の dropzone 版 MediaUploader に合わせて修正。no-op の機序を「uploading 中は input がアンマウントされ ref が null になる（加えて runUpload に uploading ガード）」に訂正。
- Test W-001 → NoteEditor 統合テストを追加し、画像ボタン click が media input の `.click()` を呼ぶ配線を spy で固定。
- Test W-002 → 画像ボタンが `disabled` / `editor===null`（未準備）時に disabled になることをテストで固定。
</content>
