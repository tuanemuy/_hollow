# PR Review #001 — refactor(note): trashed write 系エラーを note_trashed に揃える (#132)

**PR:** #437
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

---

## Use Case / Domain

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** spec 文言とコードの分離が正確。write 系（`saveNote.ts:85` / `saveNoteDraft.ts:69` / `renameNote.ts:44` / `duplicateNote.ts:41`）が `NoteErrorCode.Trashed`、DeleteNote/RestoreNoteRevision 経路（`entity.ts:294` / `restoreNoteRevision.ts:70`）が `AlreadyTrashed` のままで spec と一致
- **[N-002]** 維持対象 3 ファイル（entity.ts / restoreNoteRevision.ts / moveNote.ts）は変更ファイル一覧に含まれず誤改変なし。`moveNote.ts:42` は `CannotMoveTrashed` のまま（ADR-004 スコープ外）
- **[N-003]** `*ErrorCode` 命名規約遵守。定数の追加・変更ゼロ（既存 `Trashed` 再利用）で `errorCodeNaming.test.ts` 無影響
- **[N-004]** ADR-003（DuplicateNote を note_trashed に倒す）は意味論的に妥当
- **[N-005]** ADR-002 の意味的区別（冪等性違反 vs 操作不可）が的確
- **[N-006]** wire 値変化の影響範囲確認済み。フロント比較は `NoteDetail.tsx:59` の publication 経路定数参照のみで無影響
- **[N-007]** note 全 integration テスト 548 件パス

## Test

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** spec カバレッジ網羅（漏れなし）。testcases が `note_trashed` を要求する 4 ケースすべてに更新済みテストが存在
- **[N-002]** 変更コードのパスが実際に踏まれている（`status: "trashed"` で seed → 操作呼び出し → `expect.fail` で throw 漏れ検出）
- **[N-003]** 回帰担保が確実に維持（restoreNoteRevision / trashLifecycle / entity.test.ts は無変更で `AlreadyTrashed` 期待のまま）
- **[N-004]** it 名・コメントが規約・ADR-003 と整合
- **[N-005]** 更新 4 ファイルで Test Files 4 passed / Tests 21 passed

---

## Design Decisions

このラウンドで新たに見つかった設計判断は特になし（既存の ADR-001〜004 で網羅済み）。
