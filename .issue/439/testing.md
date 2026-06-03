# 動作確認計画 — Issue #439: MoveNote の CannotMoveTrashed と spec note_trashed の不整合を解消

**Issue:** #439
**作成日:** 2026-06-03

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 自動テスト

```bash
pnpm typecheck          # 定数削除後に未参照参照が残らないことを型で保証
pnpm test:unit          # entity.test.ts（Note.moveTo の trashed 拒否コード）
pnpm test:integration   # moveNote / bulkMoveNotes の既存挙動が壊れないことを確認
```

### 検証環境の起動

```bash
pnpm dev   # vite dev（Cloudflare runtime）。ブラウザで trashed ノートの移動拒否を確認
```

認証必須ルートのブラウザ検証手順はリポジトリ memory「browser-verify authed routes」を参照。

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. trashed ノートの移動がエラーになる（単体 MoveNote）

- **目的:** trashed（削除済み）ノートをディレクトリ移動しようとすると `note_trashed` 由来のエラーで拒否されることを確認する
- **手順:**
  1. 任意のノートを 1 件作成し、ゴミ箱に移動（trash）する
  2. trashed 状態のノートに対して別ディレクトリへの移動操作を試みる
- **期待結果:** 移動が拒否され、エラーが表示される（内部的に `BusinessRuleError('note_trashed')`）
- **確認ポイント:** エラーで処理が中断され、ノートのディレクトリが変わっていないこと

### 2. active ノートの移動は正常に成功する（リグレッション）

- **目的:** 変更によって通常の移動が壊れていないことを確認する
- **手順:**
  1. active なノートを別ディレクトリへ移動する
- **期待結果:** 移動が成功し、ノートが移動先ディレクトリに表示される
- **確認ポイント:** `note.moved` イベントが発火し、検索インデックスが更新されること

## エッジケース・異常系

### 1. BulkMoveNotes に trashed ノートが混在

- **目的:** 一括移動で trashed ノートが含まれる場合、当該ノートのみ failures に積まれ、active ノートは成功することを確認する
- **手順:**
  1. active ノート 1 件と trashed ノート 1 件を選択して一括移動する
- **期待結果:** active ノートは成功（successCount に計上）、trashed ノートは failures に `code: "note_trashed"` で積まれる。1 件の失敗で全体は止まらない

## 既存機能への影響確認

- **DuplicateNote / RenameNote / SaveNote 等の write 系操作:** trashed エラーが従来どおり `note_trashed` で拒否されること（本変更で MoveNote も同系統に揃う）
- **frontend のエラー表示:** `note_cannot_move_trashed` を直接参照する箇所は無いため、move 拒否時のエラー表示が変わらないこと

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm test:unit` が通る（entity.test.ts の trashed move 拒否）
- [ ] `pnpm test:integration` が通る（moveNote / bulkMoveNotes）
- [ ] trashed ノートの単体移動が拒否される
- [ ] active ノートの移動は成功する
- [ ] BulkMoveNotes で trashed ノートのみ failures に積まれる
