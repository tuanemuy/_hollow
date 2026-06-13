# PR Review #002 — feat(ingestion): アップロード導線を「投げっぱなし＋キューで編集・保存」に再設計

**PR:** #677
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 18
- Verdict: **BLOCKED**（修正対象 Warning あり）

## レイヤー別ファイル

- Backend: review-002-backend.md（B: 0 / W: 1）
- Frontend: review-002-frontend.md（B: 0 / W: 3）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧と仕分け

- [W-001/backend] `count(*)` を未検証の `sql<number>` キャストで断言 → **修正**（`count()` ヘルパーへ） — `app/core/adapters/d1/repositories/ingestionJobRepository.ts:417`
- [W-002/frontend] EditDialog `onCommitted` が第2引数 `title` を握り潰す死にパラメータ → **修正**（不要引数の整理） — `IngestionJobEditDialog.tsx:73`
- [W-003/frontend] UploadForm 成功時の notify が ADR-006 と非対称（invalidate throw 時 notify 未到達）→ **修正**（notify 先行＋invalidate 隔離） — `UploadForm.tsx:184`
- [W-001/test] バッジの seq 世代ガードが未テスト → **修正**（手制御 Promise でレース検証追加） — `IngestionQueueBadge.tsx:27`
- [W-001/frontend] QueuedView の primary フォーカス着地と Tab 順の軽微な不整合 → **見送り**（レビュアーも「許容可」。primary への initial focus は Round 1 で意図的に追加した挙動で、Tab 順は DOM 順どおり。実害なし。本ファイルに記録）
