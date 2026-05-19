# PR Review #002 — feat(spec-sync): remove todo domain not defined in spec

**PR:** #39
**Date:** 2026-05-18
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 4（他リポジトリのJSDoc内 D1TodoRepository 言及、機能影響なし → その場で修正）
- Notes: 複数
- Verdict: **APPROVED**

---

## Infrastructure

### Blockers

なし

### Warnings

4ファイルのJSDocコメントが `D1TodoRepository` を比較例として参照したまま残存（機能影響なし）:
- `shareLinkRepository.ts:29`
- `savedViewRepository.ts:257`
- `publicationStateRepository.ts:29`
- `exportJobRepository.ts:142`

→ **その場で `D1NoteRepository` に修正済み**（コミット `393eca6`）

---

## Test

### Blockers

なし

### Warnings

なし

### Notes
- `occGuard.integration.test.ts` — tags フィクスチャへの移行が正確（users シード・ISO 8601 タイムスタンプ・OCC3パターンカバー）
- `unitOfWork.integration.test.ts` — tag フィクスチャで commit/rollback/OCC/イベント収集をすべてカバー
- `helpers.integration.test.ts` — processedEvents で PK 衝突テストが正しく動作
- `outboxRepository.integration.test.ts` / `eventRelayWorker.integration.test.ts` / `handlers.integration.test.ts` — NoteEvents.trashed フィクスチャで統一

---

## Frontend/Routing

### Blockers

なし

### Warnings

なし

---

## Design Decisions

特になし
