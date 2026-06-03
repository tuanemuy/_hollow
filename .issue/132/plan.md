# 実装計画 — Issue #132: refactor: NoteErrorCode.AlreadyTrashed と spec の note_trashed の重義性を解消

**Issue:** #132
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

`NoteErrorCode.AlreadyTrashed`（`"note_already_trashed"`）が、spec で `note_trashed` を要求する write 系 usecase（SaveNote / SaveNoteDraft / RenameNote）でも流用されている重義性を解消する。各 usecase の投げるエラーコードを spec 文言に一致させ、`note_already_trashed`（DeleteNote / RestoreNoteRevision 経路）と `note_trashed`（write 系操作）を意味的に分離する。

## スコープ

### 含まれるもの

- spec が `note_trashed` を要求する以下の箇所を `NoteErrorCode.AlreadyTrashed` → 既存の `NoteErrorCode.Trashed` に切り替える:
  - `saveNote.ts`
  - `renameNote.ts`
  - `saveNoteDraft.ts`
  - `duplicateNote.ts`（spec はコード未指定だが write 系として `note_trashed` に倒す — ADR-003）
- 上記に対応する integration テストを `note_trashed` 期待に更新する
- DeleteNote / RestoreNoteRevision 経路（spec: `note_already_trashed`）は `AlreadyTrashed` のまま維持する

### 含まれないもの

- 新規 `NoteTrashed` 定数の追加（既存 `Trashed` を再利用するため不要 — ADR-001）
- `moveNote.ts` の `CannotMoveTrashed`（`"note_cannot_move_trashed"`）と spec `note_trashed` の不整合解消（別種の不整合のためスコープ外 — ADR-004。Phase 4 でフォローアップ起票）
- publication の3 usecase（Issue #131 で `Trashed` 化済み・変更不要）
- `BusinessRuleError` リテラル直書きの定数化（Issue #131 で対応済み）

## 実装ステップ

### 1. saveNote.ts のエラーコード切替

- **対象ファイル:** `app/core/application/note/saveNote.ts:85`
- **変更内容:** `NoteErrorCode.AlreadyTrashed` → `NoteErrorCode.Trashed`
- **理由:** spec/usecases/note.md SaveNote / spec/testcases/note/index.md:23 が `note_trashed` を期待

### 2. renameNote.ts のエラーコード切替

- **対象ファイル:** `app/core/application/note/renameNote.ts:44`
- **変更内容:** `NoteErrorCode.AlreadyTrashed` → `NoteErrorCode.Trashed`
- **理由:** spec/usecases/note.md RenameNote / testcases:44 が `note_trashed` を期待

### 3. saveNoteDraft.ts のエラーコード切替

- **対象ファイル:** `app/core/application/note/saveNoteDraft.ts:69`
- **変更内容:** `NoteErrorCode.AlreadyTrashed` → `NoteErrorCode.Trashed`
- **理由:** spec/usecases/note.md SaveNoteDraft / testcases:36 が `note_trashed` を期待

### 4. duplicateNote.ts のエラーコード切替

- **対象ファイル:** `app/core/application/note/duplicateNote.ts:41`
- **変更内容:** `NoteErrorCode.AlreadyTrashed` → `NoteErrorCode.Trashed`
- **理由:** DuplicateNote は active ノートへの write 系操作で SaveNote/RenameNote と同系統。spec はコード未指定（testcases:103「動作対象外（仕様: 拒否）」）だが、同系統 usecase との意味論的一貫性のため `note_trashed` に倒す（ADR-003）

### 5. integration テストの期待値更新

- **対象ファイル:**
  - `app/core/application/note/__tests__/saveNote.integration.test.ts:269,290`
  - `app/core/application/note/__tests__/renameNote.integration.test.ts:150,171`
  - `app/core/application/note/__tests__/saveNoteDraft.integration.test.ts:225,245`
  - `app/core/application/note/__tests__/duplicateNote.integration.test.ts:149-152,174`
- **変更内容:** `expect(error.code).toBe(NoteErrorCode.Trashed)` に変更。`it(...)` のテスト名・コメントも `note_trashed`（Trashed）に合わせる。duplicateNote の「reused for symmetry with deleteNote/renameNote」コメントは write 系整合の趣旨に書き換え
- **理由:** spec 文言一致

### 6. 維持（変更しない）

- `app/core/domain/note/entity.ts:294`（trash() = DeleteNote 経路、spec: `note_already_trashed`）
- `app/core/application/note/restoreNoteRevision.ts:70`（spec: `note_already_trashed`）
- `restoreNoteRevision.integration.test.ts:183`, `trashLifecycle.integration.test.ts:139,155`, `entity.test.ts:352,361`（DeleteNote 経路の回帰担保）
- `moveNote.ts:42`（`CannotMoveTrashed`、スコープ外 — ADR-004）

### 7. ADR 記録

`.issue/132/adr.md` に設計判断（ADR-001〜004）を記録する。

### 8. 検証

```
pnpm typecheck && pnpm lint:fix && pnpm format
pnpm test:integration   # note ドメイン
pnpm test:unit          # errorCodeNaming, entity
```

## 設計判断

詳細は `.issue/132/adr.md` を参照。

- **ADR-001:** 新規 `NoteTrashed` 定数を追加せず、既存 `NoteErrorCode.Trashed` を再利用（同一ドメイン内の同義 value 重複を避ける）
- **ADR-002:** `AlreadyTrashed`（削除の冪等性違反）と `Trashed`（削除済みのため操作不可）を 2 文言として維持する根拠
- **ADR-003:** DuplicateNote を `note_trashed` に倒す
- **ADR-004:** MoveNote の `CannotMoveTrashed` はスコープ外（Phase 4 でフォローアップ起票）

## リスクと注意点

- **wire 値の変化:** save/rename/draft/duplicate で投げられる `code` が `note_already_trashed` → `note_trashed` に変わる。frontend/presentation にこの値の**文字列リテラル**ハードコード比較は存在しない（grep 確認済み）ため表示影響なし。なお `app/components/note/detail/NoteDetail.tsx:59` に唯一の**定数経由**比較 `e.code === NoteErrorCode.Trashed` があるが、(a) 定数参照なので値変化に追従、(b) 対象は `listShareLinks` 経由の publication 側 `Trashed`（#131 で既に `Trashed` 化済み）であり本 Issue の4ファイル変更とは別経路のため無影響。外部ログ/監視に旧値依存があれば同期が必要だが本リポは未本番稼働前提
- **`entity.test.ts` の取り違え注意:** `CannotMoveTrashed`(294,303) と `AlreadyTrashed`(352,361) の両方が存在し、いずれも本 Issue では触らない
- **DuplicateNote の判断:** spec にコード明記が無いため、レビューで「現状維持」案と衝突する可能性。ADR-003 の意味論的根拠で正当化

## テスト方針

- 更新する integration テスト（saveNote/renameNote/saveNoteDraft/duplicateNote）の expect を `NoteErrorCode.Trashed` に変更
- 回帰確認: `restoreNoteRevision` / `trashLifecycle` / `entity`（trash 経路）が `AlreadyTrashed` のまま緑であること
- `errorCodeNaming.test.ts` は定数の追加・変更が無いため変更不要・緑のまま
- 純粋なエラーコード文言変更でありブラウザ実機検証は不要（manual-test はスキップ判断 — testing.md 参照）

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点**: なし（両レビュアーとも問題点ゼロ報告）

**取り込んだ改善提案**:
- アーキ視点 S-001: リスク欄に `NoteDetail.tsx:59` の定数経由比較 `e.code === NoteErrorCode.Trashed`（publication 経路・定数参照のため無影響）を明記し、レビュアーの再確認コストを削減
- アーキ視点 S-002: ADR-004 のフォローアップ起票時に「`CannotMoveTrashed` 廃止 → `Trashed` 寄せ／spec を `note_cannot_move_trashed` 側へ更新」の two-way 判断が残る点を Phase 4 起票時に添える方針を採用

**見送った提案とその理由**:
- 要件視点 S-001（spec/usecases/note.md DuplicateNote 節に `BusinessRuleError('note_trashed')` を追記）: ADR-003 で「spec はコード未指定のため spec 更新不要（spec-sync 対象外）」と判断済み。本 Issue はコード側の重義性解消が主眼であり、spec への新規コード追記は別の SSOT 判断を持ち込むことになるためスコープ外とする。フォローアップが必要なら spec-sync で扱う
