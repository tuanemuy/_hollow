# ADR — Issue #439: MoveNote の CannotMoveTrashed と spec note_trashed の不整合を解消

本 Issue は `.issue/132/adr.md` ADR-004 のフォローアップ（MoveNote の trashed エラーコードと spec 文言の乖離解消）。

## ADR-001: 案A（実装を spec へ寄せる）を採用し、`CannotMoveTrashed` を廃止して `note_trashed` に統一する

### Status
Proposed

### Context
`moveNote.ts:42` および `entity.ts:218`（`Note.moveTo`）は専用定数 `NoteErrorCode.CannotMoveTrashed`（`"note_cannot_move_trashed"`）を投げるが、`spec/usecases/note.md` MoveNote は `BusinessRuleError('note_trashed')` を期待しており不整合がある。

Issue 本文は two-way の設計判断を提示している:

- **案A**: 実装を spec に寄せる — `CannotMoveTrashed` を廃止し `NoteErrorCode.Trashed`（`"note_trashed"`）に切り替える（write 系と統一）
- **案B**: spec を実装に寄せる — `spec/usecases/note.md` MoveNote のエラーケースを `note_cannot_move_trashed` に更新し、`CannotMoveTrashed` 定数を維持（より具体的な文言を残す）

### Decision
案A を採用する。

理由:
1. **`#82` ADR-001 が「spec を SSOT として実装を追従させる」を確立済み**。spec/usecases/note.md MoveNote は `note_trashed` を定めており、変更を片方向（実装→spec追従）に閉じられる。案B は spec 文書を実装に合わせて書き換える逆方向で、この原則に反する。
2. **`#132`（PR #437）で write 系 usecase（Save / SaveDraft / Rename / Duplicate）の trashed エラーが全て `note_trashed` に統一済み**。MoveNote も「active ノートへの write 系操作」であり同系統。専用定数を MoveNote だけ残すと family の一貫性が崩れる。`#132` ADR-003（DuplicateNote を `note_trashed` に倒す）の論拠と同型。
3. **案B が主張する「具体的文言を残す価値」の実益が無い**。`note_cannot_move_trashed` を読む consumer（frontend の `error.code` 比較 / i18n メッセージ / `ingestion_jobs.error_code` 等の DB 永続化）は全レイヤー grep で 0 件。区別する側がいない以上、専用文言は冗長。

### Consequences
- 良い点:
  - spec とコードの SSOT 整合性が回復する
  - write 系 usecase 全体（Save / SaveDraft / Rename / Duplicate / **Move**）で trashed エラーが `note_trashed` に統一され一貫性が最大化する
  - 定数定義が 1 つ減る
- トレードオフ:
  - trashed 由来のエラー文言の粒度が下がる（MoveNote 固有の「移動不可」ニュアンスが失われる）が、区別する consumer が存在しないため実害なし
  - `Note.moveTo`（domain）と `moveNote`（usecase）の二重チェックの双方を同時に更新する必要がある（片方だけだと不整合）。本 ADR の決定に従い両方を `Trashed` に揃える

---
