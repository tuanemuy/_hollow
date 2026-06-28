# PR Review #002 — feat(note): #798 WYSIWYG ツールバーの「画像」ボタンを MediaUploader に配線

**PR:** #800
**Date:** 2026-06-28
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 13
- Verdict: **BLOCKED**（コミット未反映 + 1件の見送り記録のため、コミット後 round 3 で確認）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧と仕分け

- [Frontend W-001] round-1 のドキュメント整合修正＋新規結線テストが未コミット（working tree のまま）→ **このラウンドでコミットして解消**。内容自体は現物 dropzone 版と一致しており妥当と確認済み。
- [Test W-001] AC-6 の `editor === null`（未準備）分岐が画像ボタンに対し未カバー → **見送り（記録）**。理由: happy-dom harness では `await act(async () => root.render(...))` 完了時点で TipTap editor が既にマウント済みになり、`editor === null` の未準備ウィンドウが act 完了後に存在しないため決定論的に再現不能（追加を試みたが `button.disabled === false` で失敗、revert 済み）。`disabled` prop 起因の disabled 分岐・`onRequestImage` 省略時の disabled は既にカバー済みで、AC-6 の実害ある経路は担保されている。

## 確認

- round-1 の Frontend W-001（no-op 機序のドキュメントズレ）は内容として完全解消（plan/adr/testing が dropzone 版・「uploading 中 input アンマウント→ref null + runUpload ガード」に一致）。
- round-1 の Test W-001（配線統合テスト）/ W-002（disabled 分岐）は両方解消。新規 `noteEditorImageButtonWiring.test.tsx` の spy 設計（dispatchEvent + `HTMLElement.prototype.click` spy + `mock.contexts` で input 特定）は偽陽性/偽陰性に堅い。
- AC-1〜AC-8 充足。Blocker 0。
</content>
