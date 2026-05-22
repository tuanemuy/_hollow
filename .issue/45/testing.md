# 動作確認計画 — Issue #45: D1 inArray バインド上限対策（他リポジトリ展開）

**Issue:** #45
**作成日:** 2026-05-23

---

## 確認環境

本 Issue の変更はリポジトリ層の SQL 構築変更のみ。呼出側 (`listNotesByOwner` / `runExportJob` / `buildNoteSnapshot` 等) のセマンティクスは不変で UI 経路に影響しない。動作確認は **integration test で完結する**。手動ブラウザ確認は不要。

### 検証コマンド

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test:integration
```

`pnpm test:integration` は `vitest.config.integration.ts` 経由で `cloudflare:test` プールを起動し、実 D1 (miniflare / better-sqlite3) で実行される。

### デプロイ方法

なし（D1 マイグレーション変更なし、検証環境のみで確認できる）。

---

## 確認項目

### 1. 既存リポジトリテストの同値性

- **目的:** `selectInChunks` 適用後も既存挙動が完全に保たれることを確認する
- **手順:**
  1. `pnpm test:integration --run app/core/adapters/d1/__tests__/noteRepository.integration.test.ts` を実行
  2. `pnpm test:integration --run app/core/adapters/d1/__tests__/tagRepository.integration.test.ts` を実行
  3. `pnpm test:integration --run app/core/adapters/d1/__tests__/searchIndex.integration.test.ts` を実行（`buildNoteSnapshot` 経路で tag / publicationState を間接利用）
- **期待結果:** すべての既存テストが pass
- **確認ポイント:**
  - `findByIds` / `findByNoteIds` の戻り値が chunk 化前と同じ entity 集合（順序契約は元々無し、要素集合一致を見る）
  - `resolveTagAndCandidates` 経由の `findByOwner({ tagIds: ... })` テストが pass

### 2. D1 バインド上限超え経路 (bind-limit regression)

- **目的:** SAFE_CHUNK_SIZE=90 を跨ぐ規模 (150) で各 `findByIds` / `findByNoteIds` / `resolveTagAndCandidates` 経路が破綻しないことを確認する
- **手順:**
  1. `pnpm test:integration --run app/core/adapters/d1/__tests__/tagRepository.integration.test.ts` で新規 `D1TagRepository.findByIds — D1 bind limit regression` describe を実行
  2. `pnpm test:integration --run app/core/adapters/d1/__tests__/mediaAssetRepository.integration.test.ts` を実行（新規ファイル）
  3. `pnpm test:integration --run app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts` を実行（新規ファイル）
  4. `pnpm test:integration --run app/core/adapters/d1/__tests__/noteRepository.integration.test.ts` で新規 **T-bind-007** (`findByOwner({ tagIds: [...150] })`) が pass することを確認
- **期待結果:** 4 ケース全 pass
- **確認ポイント:**
  - 修正を一時退避（`git stash`）した状態で新規 bind-limit テストを走らせ、D1 バインド上限エラー（`SQLITE_TOOBIG` 相当 / D1 `D1_TYPE_ERROR` / `too many SQL variables`）で FAIL することを記録する。仕様回帰テストとして機能していることの間接証拠
  - chunk 跨ぎでも結果が漏れなく / 重複なく返ること

### 3. 呼出側ユースケーステストの動作

- **目的:** `listNotesByOwner` / `runExportJob` / `buildNoteSnapshot` 等で `findByIds` 系を呼ぶ application 層テストが pass することを確認
- **手順:**
  1. `pnpm test:integration --run app/core/application/note/` を実行
  2. `pnpm test:integration --run app/core/application/export/` を実行
  3. `pnpm test:integration --run app/core/application/search/` を実行
  4. `pnpm test:integration --run app/core/application/publication/` を実行
- **期待結果:** 既存テスト全 pass
- **確認ポイント:** chunk 化により I/O 数が増えるが、戻り値セマンティクスは不変

## エッジケース・異常系

### 1. ids = `[]`

- **目的:** 空配列ガードが温存されていること
- **手順:** 各リポジトリの bind-limit regression テスト内で空配列も assert する（または既存テストで担保されているか確認）
- **期待結果:** DB に触れず空配列即返却

### 2. ちょうど chunk 境界 (90 件 / 91 件)

- **目的:** `selectInChunks` の境界挙動が pure unit test で担保されていること
- **手順:** `pnpm test:unit --run app/core/adapters/d1/repositories/__tests__/_chunks.test.ts`
- **期待結果:** 既存 unit テスト全 pass（Issue #33 で完備）

## 既存機能への影響確認

- **`listNotesByOwner` / `listNotesInDirectory` / `listUserPublicNotes`:** tag / publicationState を batch fetch する経路。chunk 化後も戻り値の Map lookup は不変
- **`runExportJob`:** mediaAsset を batch fetch する経路。chunk 化により I/O が増えるが結果は同じ
- **`buildNoteSnapshot`:** tag / publicationState を並列 batch fetch する経路。chunk 化が並列構造を阻害しないことを確認
- **`findByOwner({ tagIds: ... })` の tag AND-filter:** `resolveTagAndCandidates` 経由でテスト

## 確認チェックリスト

- [ ] `pnpm typecheck` がエラーなく完了
- [ ] `pnpm lint:fix` がエラーなく完了
- [ ] `pnpm format` がエラーなく完了
- [ ] `pnpm test:integration` で `noteRepository.integration.test.ts` の既存 + 新規テスト全 pass
- [ ] `pnpm test:integration` で `tagRepository.integration.test.ts` の既存 + 新規テスト全 pass
- [ ] `pnpm test:integration` で新規 `mediaAssetRepository.integration.test.ts` が全 pass
- [ ] `pnpm test:integration` で新規 `publicationStateRepository.integration.test.ts` が全 pass
- [ ] `pnpm test:integration` で `app/core/application/{note,export,search,publication}/__tests__/` 配下が全 pass
- [ ] **推奨**: 実装を一時退避した状態で新規 bind-limit テストが旧実装でバインド上限エラーにより FAIL することを記録する
