# PR Review #001 — dispatch: complete fan-out routing

**PR:** #180
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 1
- Notes: 15
- Verdict: **BLOCKED** (修正必須)

---

## Routing Logic

### Blockers

**[B-001]** `note.trashed` case で ADR-005「冒頭一括 validation」の comment 参照が不足している

- **場所:** `app/core/application/workers/dispatchDomainEvent.ts:171-189`
- **理由:** ADR-005 では「新規 wired case について VO validation を switch-case 冒頭で先行実施」と明記。本 Issue #159 で `note.trashed` に view handler を追加した拡張 case であり、既存単一ハンドラー case ではない。複数 handler fan-out である `note.purged` には「`// === Issue #159 ADR-005: validation 一括先行 ===`」comment が付いているが、`note.trashed` には付いていない。一貫性の観点から、同じく複数 handler を呼ぶ `note.trashed` case も ADR-005 の comment を明示すべき。
- **提案:** line 172 (現在 `// fan-out: search → publication → view...` ) の comment を以下に変更:
  ```ts
  // === Issue #159 ADR-005: validation 一括先行 ===
  // 複数 handler のある fan-out では、handler が参照する field を
  // 副作用呼出の前に全件 validate する。既存の NoteId.create は
  // plan で「触らず」とされているため、step 1 の comment 更新で対応。
  ```

### Warnings

**[W-001]** `note.trashed` / `note.purged` で view handler に渡す input が raw string であることの一貫性が documentation に未明記

- **場所:** `dispatchDomainEvent.ts:185-187`, `dispatchDomainEvent.ts:211`
- **理由:** 冒頭で `const noteId = NoteId.create(payload.noteId)` で VO を作成している一方で、view handler には `payload.noteId` (raw string) を渡している。plan 2周目レビューで「validate した VO 変数は使わない」という解釈が示されたが、ADR-005 の Consequences に正式化されていない。将来の maintainability のため、dispatcher が VO を作成したが handler に raw string を渡す理由を明記すべき。
- **提案:** `.issue/159/adr.md` の ADR-005 の Consequences セクションに以下を追加:
  ```markdown
  - **実装パターン**: `view.handleNotePurgedEvent` は raw string input を要求するため、dispatcher 側で VO に cast してから渡すのではなく、validate した後も `payload.noteId` をそのまま渡す。handler 内部で `as NoteId` cast して利用する（リスク #5 で documented）。
  ```

### Notes

- **[N-001]** `note.purged` の payload validation が full coverage を達成している
- **[N-002]** `note.purged` の fan-out 順序 (search → publication → media → view) が ADR-001 に準拠
- **[N-003]** `note.purged` の media handler への envelope 渡し方が正しい（`as NotePurgedEvent` cast）
- **[N-004]** `tag.deleted` routing が実装され、dispatcher switch に新規 case として追加
- **[N-005]** `user.deleted` fan-out が publication → export の順序で実装（ADR-004 準拠）
- **[N-006]** `directory.deleted` / `media.uploaded` が intentional skip として明示
- **[N-007]** Error classification が全 case で既存パターンを踏襲
- **[N-008]** 新規 handler import が aliased imports で naming collision を回避

---

## Test Design

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** ADR-005 の「冒頭一括 validation → handler 順次呼出」パターンがすべてのケースで一貫性を持って実装されている
- **[N-002]** `note.purged` の media handler にだけ特殊な入力型（`event: NotePurgedEvent` envelope 全体）があるリスクを認識した上で、テスト側で明示的に envelope 参照を検証
- **[N-003]** partial failure の各テストケースで「後続 handler が呼ばれていないこと」を明示的に検証
- **[N-004]** skipped guard の置き換えコメントが ADR 参照 + 物理 event 非実在理由を簡潔に記載

---

## Spec Sync

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** `handleDirectoryDeletedEvent.ts` の JSDoc が ADR-003 を完全に説明
- **[N-002]** `dispatchDomainEvent.ts` の JSDoc が全新規 routing を網羅
- **[N-003]** `spec/domains/index.md` の購読対応表が完全に同期
- **[N-004]** ADR-005「payload validation 一括先行」が徹底
- **[N-005]** Test case が新規 routing を網羅
- **[N-006]** Regression guard の `as never` cast を正確に区別
- **[N-007]** PR タイトル・説明が Issue #159 を適切に参照

---

## Design Decisions

ADR-005 の comment 統一方針: すべての複数 handler fan-out case（`note.trashed` / `note.purged` 含む）で、dispatcher 内の冒頭 validation の comment に「Issue #159 ADR-005」を明示する。
