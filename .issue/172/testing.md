# 動作確認計画 — Issue #172: perf(d1): selectInChunks の chunk 並列数上限ガード

**Issue:** #172
**作成日:** 2026-05-23

---

## 確認環境

このIssueの変更は `app/core/adapters/d1/repositories/_chunks.ts` という adapter 層内部の helper に閉じる。UI / API への波及はゼロで、chunk 経路の結果集合・順序・件数は不変。

そのため動作確認は **unit test と既存 integration test の green 維持** で完結する。ブラウザでの手動検証は不要。

### 検証コマンド

```bash
# 並列度上限 helper の挙動を unit test で固定
pnpm test:unit

# 既存 chunk 経路の挙動が変わらないことを integration test で確認
pnpm test:integration

# 上記2つを一括実行
pnpm test

# 型・lint・format
pnpm typecheck
pnpm lint:fix
pnpm format
```

### デプロイ方法

本 Issue 単体での staging / production デプロイは不要（adapter 内部の変更で UI 動作に影響なし）。リリース時は他の変更とまとめて `pnpm deploy:staging` 等で反映する。

## 確認項目

### 1. `_chunks.test.ts` の unit test 結果

- **目的:** 並列度上限 helper の contract が固定されていること
- **手順:**
  1. `pnpm test:unit -- _chunks` （または `pnpm test:unit`）を実行
  2. 以下のテストケースがすべて pass することを確認:
     - 既存ケース（options 形式に書き換え後）
     - `respects maxConcurrency by capping in-flight runners` (peak ≤ maxConcurrency)
     - `preserves input chunk order under bounded concurrency`
     - `throws when maxConcurrency <= 0`
     - `defaults to DEFAULT_MAX_CONCURRENCY when not specified`
     - 書き換え後の `rejects with the first runner failure under bounded concurrency`（未開始 chunk の runner 非呼び出しを assert）
- **期待結果:** 全テスト pass
- **確認ポイント:** peak counter が `maxConcurrency` を超えないこと、order が崩れないこと

### 2. `noteRepository.integration.test.ts` の chunk 経路テスト結果

- **目的:** 既存の chunk 経路（`T-bind-008..014`）が並列度上限導入後も同じ結果を返すこと
- **手順:**
  1. `pnpm test:integration` を実行
  2. `T-bind-008..014` を含む全テストが pass することを確認
- **期待結果:** 既存テストはすべて無修正で pass
- **確認ポイント:** 結果集合・順序・件数が並列度ガード導入前後で同一であること

### 3. typecheck / lint / format

- **目的:** プロジェクト規約への準拠
- **手順:**
  ```bash
  pnpm typecheck && pnpm lint:fix && pnpm format
  ```
- **期待結果:** すべてエラーなく完了

## エッジケース・異常系

### 1. `maxConcurrency <= 0` の不正値ガード

- **目的:** 不正な maxConcurrency で呼ばれた際に early throw されること
- **手順:** unit test `throws when maxConcurrency <= 0` で 0 と -1 の両方が rejects.toThrow(/maxConcurrency/) で検証される
- **期待結果:** 即 throw、runner は一度も呼ばれない

### 2. `ids.length === 0` の早期 return

- **目的:** 既存挙動（空入力で `[]` を返す）の維持
- **手順:** unit test `returns [] and never calls the runner for an empty input`（既存ケース、options 形式に書き換え後）で確認
- **期待結果:** `[]` を返し runner は呼ばれない

### 3. first runner failure 後の cursor 停止

- **目的:** bounded 化後の挙動として「未開始 chunk の runner は呼ばれない」ことの確認
- **手順:** 書き換え後の `rejects with the first runner failure under bounded concurrency` で counter による未開始 chunk 数を assert
- **期待結果:** 既開始 worker 分（≤ maxConcurrency）まで runner が呼ばれ、未開始分は 0 回

## 既存機能への影響確認

- **`findByOwner` / `countByOwner` / `listWithCount` の chunk 経路**: 並列度を下げても結果集合・順序・件数は不変。`noteRepository.integration.test.ts` の `T-bind-008..014` で担保
- **`loadChildren` の 3 並列 fan-out**: `Promise.all([selectInChunks×3])` 構造は維持。各 helper コール内部で並列度 8 ガードが効くだけ
- **`mediaAssetRepository.findByIds` / `tagRepository.findByIds` / `publicationStateRepository.findByNoteIds`**: 単純な findByIds パターン、入力サイズは caller 依存。挙動変化なし

## 確認チェックリスト

- [ ] `pnpm test:unit` が pass する
- [ ] `_chunks.test.ts` の新規ケース 4 件すべてが pass する
- [ ] `pnpm test:integration` が pass する（既存 `T-bind-008..014` を含む）
- [ ] `pnpm typecheck` が pass する
- [ ] `pnpm lint:fix` でエラーなし
- [ ] `pnpm format` でエラーなし
