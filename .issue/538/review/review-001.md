# PR Review #001 — feat(ingestion): アップロード導線を「投げっぱなし＋キューで編集・保存」に再設計

**PR:** #677
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 9
- Notes: 21
- Verdict: **BLOCKED**（修正対象 Warning あり）

## レイヤー別ファイル

- Backend: review-001-backend.md（B: 0 / W: 1）
- Frontend: review-001-frontend.md（B: 0 / W: 4）
- Test: review-001-test.md（B: 0 / W: 4）

## 指摘一覧（全件このPRで修正）

- [W-001/backend] `countByOwner` の opts を named `Readonly<{...}>` 型に — `app/core/domain/ingestion/ports/ingestionJobRepository.ts:76`
- [W-001/frontend] 単一経路の `routerInvalidate` 失敗誤報告＋notify 欠落、複数経路の未処理 rejection — `UploadDialog.tsx:188`
- [W-002/frontend] ビュー遷移のフォーカス管理復元 — `UploadDialog.tsx`
- [W-003/frontend] `UploadButton` の `data-primary` 復元 — `UploadButton.tsx:30`
- [W-004/frontend] バッジ fetch の世代ガード — `IngestionQueueBadge.tsx:22`
- [W-001/test] visibilitychange 再取得のテスト追加 — `IngestionQueueBadge.test.tsx`
- [W-002/test] 行アクション discard/regenerate/retry の notify テスト追加 — `IngestionJobRow.test.tsx`
- [W-003/test] 実物 `UploadButton` の aria-label/バッジ配線テスト — `UploadButton`
- [W-004/test] 取得失敗時の count リセット挙動の仕様固定テスト — `IngestionQueueBadge.test.tsx`
