# 動作確認計画 — Issue #165: D1 inArray バインド上限対策

**Issue:** #165
**作成日:** 2026-05-23

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。
本 Issue は内部リポジトリ層のリファクタで、UI レベルの挙動変化は無し（bind 上限 fail のシナリオが新たに動くようになる、という形）。`integration` テストで bind 境界を直接踏むのが主たる検証手段。

### マイグレーション（既存スキーマ流用、新規不要）

```bash
pnpm db:apply:local
```

スキーマ変更は無いが、Workers 開発環境の D1 にマイグレーションが当たっていることを念のため確認する。

### 検証用テストの実行

```bash
# 該当 integration テストのみ実行
pnpm test:integration noteRepository.integration

# 該当 application テストの regression 確認
pnpm test:integration app/core/application/note

# プロジェクト全体の post-change チェック
pnpm typecheck && pnpm lint:fix && pnpm format
```

### 検証環境（手動 UI 確認用）の起動

```bash
pnpm dev
```

→ `http://localhost:3000` の dashboard で listing 動作を目視確認可能（後述「手動確認」参照）。

### デプロイ方法

本 Issue の変更は staging への先行デプロイは必須ではない（integration テストで本質的検証が完結する）。staging で確認したい場合のみ:

```bash
pnpm deploy:staging:dry  # まずは dry-run で build 確認
pnpm deploy:staging
```

---

## 確認項目

### 1. T-bind-008: `visibility=['public']` × 150 件 owner で全件返却

- **目的:** `intersected.size = 150` が `D1_BIND_LIMIT_HOST_VARS=100` を超えるシナリオで、chunk 経路が発火し全件返るか
- **手順:**
  1. `seedManyNotes` で 150 件の note を作成し、全件 `visibility='public'` で publicate
  2. `findByOwner({ visibility: ['public'], limit: 200, offset: 0 })` を呼ぶ
  3. 戻り値の件数を確認
- **期待結果:** 150 件全部返却される（bind 失敗無し）
- **確認ポイント:** 旧実装ではここで `inArray(notes.id, [150 ids])` が D1 上限を踏んでいた。chunk 経路が発火した証拠として `selectInChunks` が ceil(150/90) = 2 回呼ばれたことを内部観測（モック不要、I/O が走るだけで OK）

### 2. T-bind-009: chunk 跨ぎ sort/offset/limit 再現性

- **目的:** chunk 化された結果が DB 一発のときと同じ並び・page を返すか
- **手順:**
  1. 150 件 `public` + 30 件 `unlisted` の seed（fixture は ASCII title のみ使用）
  2. `findByOwner({ visibility: ['public'], limit: 50, offset: 50, sort: 'updatedAt', order: 'desc' })` を呼ぶ
  3. 並列で `findByOwner({ visibility: ['public', 'unlisted'], limit: 50, offset: 50, sort: 'updatedAt', order: 'desc' })` を呼ぶ（こちらは `wantsPrivate=false` で違う候補セット）
- **期待結果:** 旧実装が成功するケース（小さい owner）と完全一致する並び・件数を返す
- **確認ポイント:** `updatedAt desc, id desc` tie-break が chunk 跨ぎでも保たれること

### 3. T-bind-010: 複数候補セット交差での chunk 経路

- **目的:** `tagIds` × `visibility` の両方が 150 件返す状況で交差後の chunk 経路が動くか
- **手順:**
  1. 150 件全部 `public` + 全 note に tag `A` を付与
  2. `findByOwner({ tagIds: [tagA], visibility: ['public'], limit: 200 })` を呼ぶ
- **期待結果:** intersection 後 150 件、chunk 経路で全件返却
- **確認ポイント:** `intersectIdSets` の結果が `idScope` に渡り、`inArray(notes.id, ...)` 段階が消えていること

### 4. T-bind-011: `countByOwner` の chunk 化整合性

- **目的:** `findByOwner` と `countByOwner` の filter chain が同期して chunk 化されていること
- **手順:**
  1. 150 件 `public` の owner を seed
  2. `countByOwner({ visibility: ['public'] })` を呼ぶ
- **期待結果:** `150` を返す（chunk 跨ぎで `length` 加算が正しく集計される）
- **確認ポイント:** `findByOwner({ visibility: ['public'], limit: 1000 }).length` と一致すること

## エッジケース・異常系

### 1. `intersected.size === 0` の早期短絡

- **目的:** filter にマッチする note が 0 件のとき、無駄なクエリが走らず空配列を返すか
- **手順:**
  1. 0 件マッチの filter で `findByOwner` / `countByOwner` を呼ぶ
- **期待結果:** `findByOwner` は `[]`、`countByOwner` は `0` を返す（`buildOwnerListWhere` が `null` を返したら早期 return する経路）

### 2. `candidateSets.length === 0` (filter 未使用)

- **目的:** visibility/tagIds/referencingNoteId のいずれも未使用のとき、`idScope === null` で従来通り 1 クエリ経路を通るか
- **手順:**
  1. `findByOwner({ limit: 50 })` を呼ぶ（filter 未指定）
- **期待結果:** 従来挙動と完全一致（DB 側 ORDER BY/LIMIT/OFFSET 一発）

### 3. `idScope.size = 89` (chunk 1 個分以下)

- **目的:** `SAFE_CHUNK_SIZE=90` 直下で chunk が 1 つしか作られない場合の挙動
- **手順:**
  1. 89 件 `public` の owner で `findByOwner({ visibility: ['public'], limit: 200 })`
- **期待結果:** 89 件全部返却、chunk 1 個で完結

### 4. `findByOwner` の `wantsPrivate=true` パスは無影響

- **目的:** ADR-001 で別動線になっている `NOT EXISTS` 経路に regression が無いか
- **手順:**
  1. 既存 `T-bind-001..004` が引き続き PASS することを確認
- **期待結果:** 全 PASS

## 既存機能への影響確認

- **`listNotesByOwner` ユースケース**: `findByOwner` と `countByOwner` の両方を呼ぶ。chunk 化後も list と count が整合する（同じ filter chain）ことを既存テストで確認
- **`rebuildSearchIndex` / `handleUserDeletedEvent`**: filter 未使用 (`idScope === null` 経路) のため behavior 不変
- **`findReferrers`**: inline sort が新 helper に置き換わるが、固定 `updatedAt desc, id desc` の挙動は不変。既存 `T-bind-005, T-bind-006` が PASS することで担保（既存 `T-bind-007` は Issue #45 の tagIds chunk テストで本 Issue とは別動線）

## 手動確認（任意）

UI 上の挙動変化は本来 0（同じ filter で同じ結果が返るのが目標）。staging もしくはローカル `pnpm dev` で:

1. ノート一覧画面 (`/dashboard/notes`) でフィルタを掛けた状態でページネーション
2. 「visibility=public」+「tag=foo」のように複数フィルタを併用
3. 表示件数と件数表示が一致していること

を確認できる。MVP 規模では `intersected.size > 100` を踏むデータ量が稀なので、integration テストの方が本質的な検証手段。

## 確認チェックリスト

- [ ] `pnpm test:integration noteRepository.integration` が PASS（既存 `T-bind-001..007` + 新規 `T-bind-008..011`）
- [ ] `pnpm test:integration app/core/application/note` が PASS（`listNotesByOwner` 等の regression 確認）
- [ ] `pnpm typecheck` がエラー無し
- [ ] `pnpm lint:fix && pnpm format` でフォーマット適用後 diff が空
- [ ] `pnpm test:unit` の `_chunks.test.ts` 等が PASS（影響範囲外だが念のため）
- [ ] （任意）`pnpm dev` でノート一覧画面のページネーション挙動目視
