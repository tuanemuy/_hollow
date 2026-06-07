# PR Review #001 — refactor(note): MoveNote の CannotMoveTrashed と spec note_trashed の不整合を解消

**PR:** #447
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## General Review

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** 変更の完全性を確認済み。`CannotMoveTrashed` / `note_cannot_move_trashed` への参照は全レイヤー（`app/` `spec/` `docs/`、`*.ts` `*.tsx` `*.md` `*.json`）から grep で 0 件。残骸なし。定数削除・両 throw 箇所（`entity.ts:218` `moveNote.ts:42`）・テスト追従が漏れなく揃っている。
- **[N-002]** spec と実装が整合。`spec/usecases/note.md:114` の MoveNote は既に `BusinessRuleError('note_trashed')` を期待しており、spec 変更不要という plan/PR 記述は正しい。BulkMoveNotes も MoveNote を内包するオーケストレータで独自の trashed コードを持たないため波及なし。
- **[N-003]** `errorCodeNaming.test.ts` への影響なし。当該テストは key=PascalCase / value=lower_snake_case を検証するのみで value 重複は検出しない設計。定数を 1 つ削除しても無関係。`pnpm typecheck` 通過、`pnpm test:unit` 3087 件 PASS を確認済み。
- **[N-004]** 案A（実装→spec 追従）の設計判断は妥当。「spec を SSOT」原則および `#132`（PR #437）で確立した write 系 trashed エラーの `note_trashed` 統一と一貫する。案B を区別する consumer が 0 件である以上、専用文言を残す実益がない。
- **[N-005]** コミット粒度・PR 説明は変更内容と一致。単一コミットで diff の実体（定数削除＋2 throw＋テスト）を正確に記述。`Co-Authored-By` 末尾も規約準拠。
- **[N-006]** 二重チェック（usecase 事前 `status !== "active"` と `Note.moveTo` 内ガード）は plan/ADR の方針どおり両方を同一コードに揃え、構造自体の整理はスコープ外として正しく扱っている。

---

## Design Decisions

特になし（案A 採用は Phase 1 の adr.md ADR-001 で記録済み、レビューでも妥当と確認）。
