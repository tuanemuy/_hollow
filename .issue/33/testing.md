# 動作確認計画 — Issue #33: D1 inArray バインド上限対策

**Issue:** #33
**作成日:** 2026-05-18

---

## 確認環境

このIssueの変更はリポジトリ層の SQL 構築変更で、UI 経路や戻り値の semantics は不変。動作確認は **integration test で完結する**。手動ブラウザ確認は不要。

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

### 1. visibility フィルタ動作の同値性

- **目的:** NOT EXISTS 切替後も既存 visibility フィルタの結果セマンティクスが完全に保たれることを確認する
- **手順:**
  1. `pnpm test:integration --run app/core/adapters/d1/__tests__/noteRepository.integration.test.ts` を実行
  2. 既存 describe `D1NoteRepository.findByOwner — visibility filter (integration)` 配下の 8 テストが全 pass することを確認
  3. 既存 describe `D1NoteRepository.findByOwner — status × visibility (integration)` 配下の 2 テストが全 pass することを確認
  4. 既存 describe `D1NoteRepository.findByOwner — combined AND filters (integration)` の `intersects visibility, tagIds, and referencingNoteId` が pass することを確認
- **期待結果:** 既存テスト全て pass
- **確認ポイント:**
  - `visibility=['private']` で `publication_states` 行が無い note も含まれること（implicit private）
  - `visibility=['private','unlisted','public']` で owner 全件返ること（notWanted = [], 述語追加なし）
  - `status='trashed' × visibility=['private']` で trashed かつ private の note のみ返ること

### 2. D1 バインド上限超え経路 (bind-limit regression)

- **目的:** owner 配下 100 件超の note が存在する状況で `findByOwner` / `loadChildren` / `findReferrers` が破綻しないことを確認する
- **手順:**
  1. 新規 describe `D1NoteRepository — D1 bind limit regression (integration)` のテストを実行
  2. **T-bind-001**: owner に 150 件 active note を seed、50 件のみ `publication_states.public` 付与 → `visibility=['private']` で例外なく 100 件返る（implicit + explicit private）
  3. **T-bind-002**: 同 seed で `visibility=['private','public']` → 150 件全件返る
  4. **T-bind-003**: 150 件 + 全件に tag/mediaRef 1 件付与 + `limit=150` → `loadChildren` chunk 経路で children が漏れなく fold される
  5. **T-bind-004**: target note を参照する 150 件の `noteInternalLinks` 行を seed → `findReferrers(target)` が 150 件返り `updatedAt DESC, id DESC` 順序が維持される
- **期待結果:** 4 ケース全 pass
- **確認ポイント:**
  - 修正前の実装をローカルで `git stash` した状態でこれらのテストを走らせ、`SQLITE_TOOBIG` または D1 のバインド上限エラーで FAIL することを確認（仕様回帰テストとして機能していることの確認）
  - chunk 跨ぎでも結果が漏れなく / 重複なく返ること

### 3. tag ユースケース経路の動作

- **目的:** `findByOwner(..., { limit: 500, tagIds: [...] })` を呼ぶ tag 系ユースケース（`deleteTag`, `mergeTags`, `renameTag`）が、`hydrateMany` → `loadChildren` 経路で破綻しないことを確認する
- **手順:**
  1. `pnpm test:integration --run app/core/application/tag/__tests__/` 配下のテストが全 pass することを確認
  2. （存在する場合）500 件規模を扱う統合テストが pass することを確認
- **期待結果:** 既存 tag ユースケーステスト全 pass
- **確認ポイント:** chunk 化により tag 系ユースケースの I/O 数が増えるが、結果は不変

## エッジケース・異常系

### 1. visibility に 3 種全て含む（notWanted = []）

- **目的:** `notExists` 述語追加スキップが正しく動くこと
- **手順:** `visibility: ['private', 'unlisted', 'public']` で owner 全 note が返るテストを実行
- **期待結果:** owner の全 note が返る（既存 T-W テストで担保）

### 2. visibility = `[]`

- **目的:** 空配列ガードの即 return が温存されること
- **手順:** `visibility: []` で `findByOwner` 呼出
- **期待結果:** 空配列即返却（DB 触らず）

### 3. owner の note 数がちょうど chunk 境界（90, 91 件）

- **目的:** `selectInChunks` の境界挙動を pure unit test で確認
- **手順:** `pnpm test:unit --run app/core/adapters/d1/repositories/__tests__/_chunks.test.ts`
- **期待結果:** 90 件で 1 chunk、91 件で 2 chunk、空配列で 0 chunk のすべてが想定通り

## 既存機能への影響確認

- **`findByOwner` の他フィルタ経路:** `tagIds`, `referencingNoteId`, `dateRange`, `status` 単独 + 複合 → 既存 combined フィルタテストで担保
- **`findById`, `findByOwnerAndSlug`, `findByDirectory`, `findTrashedOlderThan`:** いずれも `hydrateMany` または `loadChildren([single id])` を経由するため、chunk 化後も結果不変
- **`outboxRepository`, `publicationStateRepository.findByNoteIds` 等の他 inArray 箇所:** スコープ外（ADR-003 参照）。本 Issue では変更なし、既存テストで担保

## 確認チェックリスト

- [ ] `pnpm typecheck` がエラーなく完了
- [ ] `pnpm lint:fix` がエラーなく完了
- [ ] `pnpm format` がエラーなく完了
- [ ] `pnpm test:unit` で `_chunks.test.ts` が全 pass
- [ ] `pnpm test:integration` で `noteRepository.integration.test.ts` の既存テスト全 pass
- [ ] `pnpm test:integration` で新規 `D1NoteRepository — D1 bind limit regression` describe が全 pass
- [ ] `pnpm test:integration` で `app/core/application/tag/__tests__/` 配下が全 pass
- [ ] **必須**: 実装着手前 or git stash で修正を一時退避した状態で、新規 bind-limit テスト (T-bind-001/002) が旧実装で D1 バインド上限エラーにより FAIL することを記録する
