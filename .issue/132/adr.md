# ADR — Issue #132: NoteErrorCode.AlreadyTrashed と spec の note_trashed の重義性を解消

本 Issue は `.issue/82/adr.md` ADR-006 のフォローアップ（`NoteErrorCode.AlreadyTrashed` の重義性解消）。

## ADR-001: 新規 `NoteTrashed` 定数を追加せず、既存 `NoteErrorCode.Trashed` を再利用する

### Status
Proposed

### Context
Issue 本文は「`NoteErrorCode` に `NoteTrashed: "note_trashed"` を新規追加する」を提案している。しかし Issue #131（CLOSED）で同値の `Trashed: "note_trashed"` が既に `errorCode.ts:20` に追加済みで、publication の3 usecase（changePublicationVisibility / issueShareLink / listShareLinks）は既に `NoteErrorCode.Trashed` 経由に切り替わっている。

Issue 本文の提案どおり `NoteTrashed` を新規追加すると、同一ドメイン内に同じ value（`"note_trashed"`）を持つ property が 2 つ並ぶことになる。

### Decision
新規 `NoteTrashed` を追加せず、既存の `NoteErrorCode.Trashed` を再利用する。

理由:
1. 同一ドメイン内の同義 value 重複は意味論的に冗長。`.issue/82/adr.md` ADR-004 が value 重複を容認したのは「異ドメイン間で意味を共有する場合のみ」であり、同一ドメイン内の同義重複はその趣旨に反する。
2. `errorCodeNaming.test.ts`（ADR-005）は value 重複を検出しないため機械的には通るが、規約の精神に照らして避けるべき。
3. 定数の追加・変更が一切無いため、`errorCodeNaming.test.ts` への影響もゼロ。

Issue 本文の提案（新規追加）からの逸脱だが、#131 で前提が変わったことによる合理的な調整である。

### Consequences
- 良い点: 定数定義を増やさず、既存資産を活用。spec 文言（`note_trashed`）一致も達成
- トレードオフ: Issue 本文の文言（`NoteTrashed` 追加）と実装が一致しないため、本 ADR で逸脱理由を明示する必要がある

---

## ADR-002: `AlreadyTrashed`（DeleteNote 経路）と `Trashed`（write 系操作）を 2 文言として維持する

### Status
Proposed

### Context
spec は trashed ノートに対する操作拒否で 2 つの異なる文言を要求している:

- DeleteNote / RestoreNoteRevision: `BusinessRuleError('note_already_trashed')`
- SaveNote / SaveNoteDraft / RenameNote: `BusinessRuleError('note_trashed')`

これらを 1 文言に統合するか、2 文言として維持するかの判断が必要。

### Decision
2 文言として維持し、各 spec 文言に実装を揃えることで重義性を解消する。

各文言が伝える意味の違い:
- `note_already_trashed`: 「削除操作の冪等性違反」— 既に削除済みのノートを再度削除しようとした（DeleteNote）、または削除済みノードへリビジョン復元しようとした（RestoreNoteRevision）
- `note_trashed`: 「削除済みのため当該 write 操作が不可」— アクティブ前提の編集系操作（保存・改名・複製）を削除済みノートに対して試みた

### Consequences
- 良い点: spec を SSOT として尊重し、エラーの意味的区別が呼び出し側に伝わる
- トレードオフ: trashed 由来のエラーコードが 2 系統に分かれるため、フロント側で「trashed 全般」を扱う場合は両方を考慮する必要がある（現状そのような扱いは無い）

---

## ADR-003: DuplicateNote を `note_trashed` に倒す

### Status
Proposed

### Context
`duplicateNote.ts:41` は現状 `NoteErrorCode.AlreadyTrashed` を投げる。spec はこのケースのエラーコードを明示していない:
- spec/usecases/note.md の DuplicateNote 節には `### エラーケース` ブロック自体が無い
- spec/testcases/note/index.md:103 は「trashed | DuplicateNote | 動作対象外（仕様: 拒否）」とのみ記載

`AlreadyTrashed` のまま維持するか、write 系として `note_trashed` に倒すかの判断が必要。

### Decision
`note_trashed`（`NoteErrorCode.Trashed`）に倒す。

理由:
1. DuplicateNote は「active ノートへの write 系操作」であり SaveNote / RenameNote / SaveNoteDraft と同系統。これらが `note_trashed` に揃う以上、同系統で統一するのが意味論的に自然。
2. 現状の `AlreadyTrashed` は test コメント（`duplicateNote.integration.test.ts:151`）が明言する通り「`deleteNote`/`renameNote` との対称性で流用」したもの。その流用先である renameNote 自体が本 Issue で `Trashed` に移るため、対称性の論拠も `Trashed` 側に移る。
3. spec はコード未指定なので spec 更新は不要（spec-sync 対象外）。

### Consequences
- 良い点: write 系 usecase 全体で trashed エラーが `note_trashed` に統一され一貫性が高まる
- トレードオフ: spec にコード明記が無いため設計判断に依存する。レビューで「現状維持」案と衝突しうるが、上記の意味論的根拠で正当化する

---

## ADR-004: MoveNote の `CannotMoveTrashed` はスコープ外（フォローアップ起票）

### Status
Proposed

### Context
`moveNote.ts:42` は専用定数 `NoteErrorCode.CannotMoveTrashed`（`"note_cannot_move_trashed"`）を使うが、spec/usecases/note.md MoveNote は `BusinessRuleError('note_trashed')` を期待しており不整合がある。

### Decision
本 Issue のスコープ外とする。

理由:
- これは「`AlreadyTrashed` の重義性」（同一定数が 2 つの spec 文言に跨る）とは別種の不整合（専用定数 vs spec 文言の乖離）。
- 本 Issue のスコープ（AlreadyTrashed 重義性解消）に含めると、修正の趣旨が混在し PR の意図が不明瞭になる。

Phase 4 で「MoveNote の trashed エラーコードを spec の `note_trashed` に揃える」フォローアップ Issue を起票する。

### Consequences
- 良い点: 本 Issue のスコープと PR の意図が明確に保たれる
- トレードオフ: MoveNote の不整合が一時的に残る（ADR で明示し、フォローアップ Issue で追跡）
