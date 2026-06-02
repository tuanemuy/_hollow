# PR Review #001 — fix(#409): 履歴ルートの到達不能な notFoundComponent を削除

**PR:** #411
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4
- Verdict: **APPROVED**

---

## General Review

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** デッドコード削除の根拠は妥当。`NoteHistoryList.tsx:49-63` と `NoteRevisionDetail.tsx:38-52` は `throw notFound()` を持たず、`isNotFoundError(e)` 捕捉時にインライン JSX（`role="alert"` + 該当文言）を直接 return し、非 NotFound は `throw e` で再 throw する。RSC は `renderServerComponent` 経由で描画され、ADR-004（`.issue/12/adr.md`）の既知挙動により route の `notFoundComponent` に到達しない。削除した3つの `notFoundComponent` は確かに到達不能。#385 と完全に同根。
- **[N-002]** `errorComponent` は3ルートすべてで保持（`route.tsx:16`, `index.tsx:78`, `$revisionId.tsx:66`）。削除は `notFoundComponent` のみで副作用なし。
- **[N-003]** 追加テストは #385 の `NoteDetail.test.tsx` と同一構成。notFound JSX 返却と非 NotFoundError の再 throw を両方担保。モックパス `../../loaders` は実装の `../loaders` と同じ `app/components/note/loaders.ts` に解決。`NoteRevisionRestorePanel` モックで RSC 単体を分離。期待文言は実装 JSX と verbatim 一致。新規2ファイル4テスト PASS、`pnpm typecheck` クリーン。
- **[N-004]** 計画 `.issue/409/plan.md` のスコープと差分が完全一致。スコープ外変更なし。`adr.md` も計画どおり未作成。CLAUDE.md のエラー扱い・既存パターン（#385）との一貫性も保たれている。

---

## Design Decisions

特になし（#385 で確立済みのパターンを踏襲）。
