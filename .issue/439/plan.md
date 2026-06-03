# 実装計画 — Issue #439: MoveNote の CannotMoveTrashed と spec note_trashed の不整合を解消

**Issue:** #439
**作成日:** 2026-06-03
**複雑度:** 小規模

---

## 目的

`moveNote` の trashed エラーコードを spec（`spec/usecases/note.md` MoveNote の `BusinessRuleError('note_trashed')`）と整合させる。現状は専用定数 `NoteErrorCode.CannotMoveTrashed`（`"note_cannot_move_trashed"`）を投げており、spec 文言と乖離している。

## スコープ

### 含まれるもの

- `NoteErrorCode.CannotMoveTrashed` を廃止し、trashed ノートへの move 拒否を `NoteErrorCode.Trashed`（`"note_trashed"`）に統一する（**案A: 実装を spec へ寄せる**）
- 実装の throw 箇所（usecase 層・domain entity 層の両方）を更新する
- 既存テストの追従修正

### 含まれないもの

- `moveNote.ts` の status 事前チェックと `Note.moveTo` 内チェックの二重チェック構造そのものの整理（既存設計、本Issueのエラーコード整合とは別軸）
- spec/usecases/note.md の更新（MoveNote は既に `note_trashed` を期待しており変更不要）

## 設計判断: 案A（実装を spec へ寄せる）を採用

Issue 本文の two-way 判断（案A vs 案B）について、案A を採用する。詳細は `adr.md` ADR-001 を参照。

要点:
- `#82` ADR-001 が「spec を SSOT として実装を追従させる」を確立済み。spec MoveNote は `note_trashed`。
- `#132`（PR #437）で write 系 usecase（Save / SaveDraft / Rename / Duplicate）の trashed エラーが全て `note_trashed` に統一済み。MoveNote も active ノートへの write 系操作であり同系統。
- `note_cannot_move_trashed` を読む consumer（frontend / i18n / DB 永続化）は grep で 0 件。具体的文言を残す案B の実益が無い。

## 実装ステップ

### 1. `NoteErrorCode.CannotMoveTrashed` 定数を削除

- **対象ファイル:** `app/core/domain/note/errorCode.ts:19`
- **変更内容:** `CannotMoveTrashed: "note_cannot_move_trashed",` の行を削除
- **理由:** 案A では専用定数を廃止し `Trashed` に統一するため不要になる

### 2. domain entity の throw を `Trashed` に変更

- **対象ファイル:** `app/core/domain/note/entity.ts:218`
- **変更内容:** `NoteErrorCode.CannotMoveTrashed` → `NoteErrorCode.Trashed`
- **理由:** `Note.moveTo` は trashed ノートを拒否する。spec 文言 `note_trashed` に揃える。定数削除に伴いコンパイルエラー解消も兼ねる

### 3. usecase の throw を `Trashed` に変更

- **対象ファイル:** `app/core/application/note/moveNote.ts:42`
- **変更内容:** `NoteErrorCode.CannotMoveTrashed` → `NoteErrorCode.Trashed`
- **理由:** usecase の status 事前チェックも spec 文言 `note_trashed` に揃える

### 4. domain entity テストの追従修正

- **対象ファイル:** `app/core/domain/note/__tests__/entity.test.ts:294,303`
- **変更内容:** テスト名 `"throws CannotMoveTrashed for trashed notes"` → `"throws Trashed for trashed notes"`、assertion `NoteErrorCode.CannotMoveTrashed` → `NoteErrorCode.Trashed`
- **理由:** 定数廃止と挙動変更に追従

## リスクと注意点

- **二重チェックの存在:** `moveNote.ts:40-44`（usecase 事前チェック）と `entity.ts:216-221`（`Note.moveTo` 内チェック）の双方が trashed を弾く。usecase 経路では事前チェックが先に発火するため entity 側は実質デッドだが、`Note.moveTo` は独立した domain ガードとして残す必要がある。**両方を同じコードに揃えないと不整合**になるため、ステップ2・3の両方を必ず実施する。
- **errorCodeNaming テスト:** `app/core/domain/__tests__/errorCodeNaming.test.ts` は value 重複を検出しない（`#132` ADR-001 参照）。定数削除のみなので影響なし。`Trashed`（`note_trashed`）は既存定数で命名規約準拠済み。
- **BulkMoveNotes への波及:** `bulkMoveNotes.ts` は `moveNote` を内包し、`isBusinessRuleError` で `error.code` をそのまま failures に積む。コード値が `note_cannot_move_trashed` → `note_trashed` に変わるが、BulkMoveNotes の既存テスト（`moveNote.integration.test.ts`）は trashed ケースを assert していないため追従修正は不要。
- **frontend 波及:** `note_cannot_move_trashed` を直接比較する frontend コードは grep で 0 件。波及なし。

## テスト方針

- `pnpm typecheck` — 定数削除後に未参照箇所が残らないことを型で保証
- `pnpm test:unit`（`entity.test.ts`）— `Note.moveTo` が trashed ノートで `NoteErrorCode.Trashed` を投げることを確認
- `pnpm test:integration`（`moveNote.integration.test.ts`）— MoveNote / BulkMoveNotes の既存挙動が壊れないことを確認
- 実機確認は testing.md を参照（trashed ノートの移動拒否がエラー表示されること）
