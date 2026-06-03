# 動作確認計画 — Issue #132: NoteErrorCode.AlreadyTrashed と spec の note_trashed の重義性を解消

**Issue:** #132
**作成日:** 2026-06-03

---

## 確認環境

本 Issue は trashed ノートに対する write 系 usecase（SaveNote / SaveNoteDraft / RenameNote / DuplicateNote）が投げる `BusinessRuleError` の `code` を `note_already_trashed` → `note_trashed`（既存 `NoteErrorCode.Trashed`）に揃える純粋なエラーコード変更。UI の見た目・挙動・DB スキーマは変わらない。確認は自動テスト（integration / unit）が主体。

### 検証環境の起動

エラーコードの妥当性は integration テストで担保するため、サーバー起動は必須ではない。型・lint・テストを以下で確認する。

```bash
pnpm typecheck
pnpm lint
pnpm test:integration   # note ドメインの usecase テスト（saveNote / renameNote / saveNoteDraft / duplicateNote ほか）
pnpm test:unit          # errorCodeNaming / entity（trash 経路）ほか
```

必要に応じて開発サーバーを起動して画面を確認する場合（任意）:

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（初回のみ）
pnpm dev          # Cloudflare ランタイム開発サーバー
```

### デプロイ方法

なし（検証環境＝ローカルテストで確認できる。ステージング・本番へのデプロイは本 Issue の確認に不要）。

## 確認項目

### 1. write 系 usecase が note_trashed を投げる

- **目的:** trashed ノートに対する SaveNote / SaveNoteDraft / RenameNote / DuplicateNote が `BusinessRuleError('note_trashed')` を投げることを確認する
- **手順:**
  1. `pnpm test:integration` を実行
  2. `saveNote.integration.test.ts` / `renameNote.integration.test.ts` / `saveNoteDraft.integration.test.ts` / `duplicateNote.integration.test.ts` の trashed ケースが緑であることを確認
- **期待結果:** 各テストで `error.code === NoteErrorCode.Trashed`（`"note_trashed"`）が成立してパスする
- **確認ポイント:** これらが旧 `AlreadyTrashed`（`"note_already_trashed"`）期待のまま残っていないこと

### 2. DeleteNote / RestoreNoteRevision は note_already_trashed のまま

- **目的:** DeleteNote 経路（`entity.trash`）と RestoreNoteRevision が `note_already_trashed` を維持していることを確認する（回帰防止）
- **手順:**
  1. `pnpm test:integration` / `pnpm test:unit` を実行
  2. `restoreNoteRevision.integration.test.ts` / `trashLifecycle.integration.test.ts` / `entity.test.ts`（trash 経路）が緑であることを確認
- **期待結果:** これらは `error.code === NoteErrorCode.AlreadyTrashed`（`"note_already_trashed"`）のままパスする
- **確認ポイント:** write 系の変更が DeleteNote 経路に波及していないこと

### 3. 命名規約テストが緑

- **目的:** 定数の追加・変更がない（`Trashed` 再利用）ため `errorCodeNaming.test.ts` が無影響であることを確認する
- **手順:** `pnpm test:unit` を実行
- **期待結果:** `app/core/domain/__tests__/errorCodeNaming.test.ts` が緑
- **確認ポイント:** 新規定数を追加していないこと

## エッジケース・異常系

### 1. 型・lint の整合

- **目的:** `NoteErrorCode.Trashed` 参照への切替で型エラー・lint 違反が出ないことを確認
- **手順:** `pnpm typecheck && pnpm lint`
- **期待結果:** エラーなし

## 既存機能への影響確認

- **フロントのエラー表示:** `note_trashed` / `note_already_trashed` を文字列リテラルで直接比較する箇所はフロント/presentation に存在しない（grep 確認済み）。`NoteDetail.tsx:59` の `e.code === NoteErrorCode.Trashed` は定数経由かつ publication（`listShareLinks`）経路で本 Issue の4ファイル変更とは別経路のため無影響
- 開発サーバーで note の保存・改名・複製を trashed ノートに対して試みても、表示されるエラーメッセージ自体は変わらない（`code` 値のみ変化）

## 確認チェックリスト

- [ ] `pnpm typecheck` 緑
- [ ] `pnpm lint` 緑
- [ ] write 系 4 usecase テストが `note_trashed` 期待で緑
- [ ] DeleteNote / RestoreNoteRevision テストが `note_already_trashed` のまま緑
- [ ] `errorCodeNaming.test.ts` 緑
