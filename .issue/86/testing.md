# 動作確認計画 — Issue #86: unify branded → string cast responsibility across DTO layer

**Issue:** #86
**作成日:** 2026-05-22

---

## 確認環境

このIssueは DTO 型レベルの整理であり、ランタイム動作には影響しない。型チェックと既存テストの通過が事実上の検証になる。ブラウザ検証は「リグレッション無し」の確認のみ。

### 検証環境の起動

```bash
pnpm dev
```

起動後、ホーム画面（自分のノート一覧）にログインしてアクセスする。

### デプロイ方法

```bash
# Staging
pnpm deploy:staging
# Production
pnpm deploy:production
```

## 確認項目

### 1. 型チェック通過

- **目的:** DTO 型変更（`OwnedSearchHitDTO.directoryId: string → DirectoryId`）により application / presentation 層の参照箇所に型エラーが出ないことを確認
- **手順:**
  1. `pnpm typecheck` を実行
- **期待結果:** エラーゼロで完了
- **確認ポイント:** `app/components/note/loaders.ts` の search 経路で `hit.directoryId` を string に剥がす cast を入れ忘れていないか

### 2. lint / format 通過

- **手順:**
  1. `pnpm lint:fix`
  2. `pnpm format`
- **期待結果:** エラーゼロ

### 3. 既存ユニットテスト通過

- **目的:** 型変更により既存テストが落ちないことを確認
- **手順:**
  1. `pnpm test:unit`
- **期待結果:** 全テスト pass
- **確認ポイント:** `searchOwnNotes.test.ts` の `OwnedSearchHitDTO` を構築する fixture に branded 型対応が必要かどうか（必要なら test 側でも `as unknown as DirectoryId` を追加）

### 4. ブラウザでの検索フローのリグレッション確認

- **目的:** keyword 検索の表示にリグレッションがないことを確認
- **手順:**
  1. ホーム画面（`/`）で自分のノート一覧を開く
  2. 検索ボックスに keyword を入力して検索
  3. 検索結果から 1 件クリックしてノート詳細に遷移
  4. ブラウザ戻るでホームに戻り、別の絞り込み（タグ・ディレクトリ）を併用して検索
- **期待結果:**
  - 検索結果の各ノードがクリック可能でリンク先 URL に `directoryId` / `slug` が正しく埋まる
  - 検索結果のタイトル・スニペット・更新日時が表示される
  - フィルター経路（keyword 空）でも同じ表示挙動が維持される
- **確認ポイント:** 検索結果のリンク URL（ディレクトリパスを含むはず）が壊れていないか

## エッジケース・異常系

### 1. 検索結果0件

- **目的:** 空配列ケースで型エラーや描画破綻が起きないこと
- **手順:** ヒットしない長文 keyword を検索
- **期待結果:** 「結果なし」表示が出る

## 既存機能への影響確認

- **`searchPublicNotes` 経路**: `SearchHitDTO` 単体を返す経路で `OwnedSearchHitDTO` は未使用。影響なしの想定だが、公開検索ページが存在するなら一度開いて表示崩れがないことを確認
- **filter 経路（keyword 空）**: `listNotesByOwner` を使うフィルター表示。本変更とは無関係だが、検索↔フィルター切り替えのリグレッション確認のため一度開く

## 確認チェックリスト

- [ ] `pnpm typecheck` パス
- [ ] `pnpm lint:fix && pnpm format` パス
- [ ] `pnpm test:unit` パス
- [ ] ホーム画面で keyword 検索 → 結果表示 → ノート詳細へ遷移できる
- [ ] フィルター経路のリグレッションなし
- [ ] 公開検索ページ（存在する場合）のリグレッションなし
