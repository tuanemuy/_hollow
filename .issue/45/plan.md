# 実装計画 — Issue #45: D1 inArray バインド上限対策（他リポジトリ展開）

**Issue:** #45
**作成日:** 2026-05-23
**複雑度:** 中規模

---

## 目的

Issue #33 (PR #44) で `noteRepository` の `findByOwner` / `loadChildren` / `findReferrers` に投入した `selectInChunks` ヘルパ（`app/core/adapters/d1/repositories/_chunks.ts`）を、同 adapter group 内の他リポジトリに残る unbounded `inArray` にも適用する。入力 id 集合の規模拡大に対する bind 上限超過リスクを根絶する。

## スコープ

### 含まれるもの

Issue 本文の「対象候補」に列挙された 4 箇所:

1. `app/core/adapters/d1/repositories/publicationStateRepository.ts` の `findByNoteIds` (l.190)
2. `app/core/adapters/d1/repositories/mediaAssetRepository.ts` の `findByIds` (l.98)
3. `app/core/adapters/d1/repositories/tagRepository.ts` の `findByIds` (l.189)
4. `app/core/adapters/d1/repositories/noteRepository.ts` の `resolveTagAndCandidates` (l.488) — `inArray(noteTags.tagId, [...tagIds])`

各箇所で `selectInChunks(ids, (chunk) => db.select()...where(inArray(col, [...chunk])))` パターンに書き換える。

加えて bind-limit 回帰テストを以下に追加:

- `tagRepository.integration.test.ts` に `findByIds` の bind-cap regression
- `noteRepository.integration.test.ts` に `findByOwner({ tagIds: ... })` 経由で `resolveTagAndCandidates` の bind-cap regression
- `mediaAssetRepository.integration.test.ts`（**新規ファイル**）に `findByIds` の bind-cap regression
- `publicationStateRepository.integration.test.ts`（**新規ファイル**）に `findByNoteIds` の bind-cap regression

### 含まれないもの

- 新規ヘルパの追加（Issue 本文に「新規ヘルパの追加は不要」と明記）
- `outboxRepository.ts` の `inArray` 監査（Issue で言及されていない & relay worker 内で claim する row 数は worker 内バッチサイズで制約される設計上 bind 上限を踏まない）
- `noteRepository.ts:471` `inArray(notes.id, [...intersected])` — `intersected` は visibility/tag/referrer 候補セットの**交差**で、要素数は最小候補セットで律速される。本 Issue の意図（unbounded `inArray` の防御）の中では Issue 本文が明示的に列挙していない箇所なのでスコープ外
- `noteRepository.ts:516,555` の `inArray(publicationStates.visibility, ...)` — bind は `visibility` 配列（最大 3 要素）で、unbounded ではない
- ADR の追加（Issue #33 の ADR-002 で確立されたパターンを 4 箇所に機械的に適用するだけで、新規設計判断は発生しない）

## 実装ステップ

### 1. `publicationStateRepository.findByNoteIds` を `selectInChunks` 化

- **対象ファイル:** `app/core/adapters/d1/repositories/publicationStateRepository.ts`
- **変更内容:**
  - `import` に `_chunks.ts` の `selectInChunks` を追加（型は `readonly string[]` 経由）
  - l.184–193 の `findByNoteIds` を以下に書き換え:
    ```ts
    findByNoteIds(ids: readonly NoteId[]): Promise<readonly PublicationState[]> {
      return mapDbError("Failed to bulk-read publication_states", async () => {
        if (ids.length === 0) return [];
        const rows = await selectInChunks(ids, (chunk) =>
          this.db
            .select()
            .from(publicationStates)
            .where(inArray(publicationStates.noteId, [...chunk])),
        );
        return rows.map((row) => this.toEntity(row));
      });
    }
    ```
- **理由:** listing 経路 (`listNotesByOwner`) が `limit ≤ 500` で notes を取得 → その note ids を渡して呼ばれる。`limit` 引き上げや bulk export 経路で 100 件超は十分発生しうる。`buildNoteSnapshot` も `notes.map((n) => n.id)` で渡している

### 2. `mediaAssetRepository.findByIds` を `selectInChunks` 化

- **対象ファイル:** `app/core/adapters/d1/repositories/mediaAssetRepository.ts`
- **変更内容:**
  - `import` に `selectInChunks` を追加
  - l.92–101 の `findByIds` を `selectInChunks` 経由に書き換え（`publicationStates` と同パターン）
- **理由:** `runExportJob` で「export 対象 owner の全 note に紐づく media id」を渡して呼ばれる。owner の note 数 × note あたり media 数で 100 件超は容易に発生

### 3. `tagRepository.findByIds` を `selectInChunks` 化

- **対象ファイル:** `app/core/adapters/d1/repositories/tagRepository.ts`
- **変更内容:**
  - `import` に `selectInChunks` を追加
  - l.183–192 の `findByIds` を `selectInChunks` 経由に書き換え
  - 既存の `ids as readonly string[] as string[]` 二重キャストは `selectInChunks` の `runner` 引数で `readonly string[]` を受けるため、`[...chunk]` に統一できる（`_chunks.ts` の他箇所と一貫）
- **理由:** `listNotesByOwner` / `getPublicNote` / `buildNoteSnapshot` で「listing 結果に登場する全 tag id」を集めて呼ばれる。listing の `limit=500` × ノートあたり数 tag → ユニーク tag id 数百件レベル

### 4. `noteRepository.resolveTagAndCandidates` を `selectInChunks` 化

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts` (l.482–500)
- **変更内容:**
  - l.485–488 の `tagRows` 取得を `selectInChunks(tagIds, async (chunk) => db.select({ noteId: noteTags.noteId, tagId: noteTags.tagId }).from(noteTags).where(inArray(noteTags.tagId, [...chunk])))` に置き換え
  - 既存の JS 側集計（`countByNote` Map 構築 → `seen.size === tagIds.length` 判定）はそのまま流用。`selectInChunks` の戻り値は flat な row 配列なので、chunk 境界をまたいで `noteId` ごとの集計が正しく走る（同一 `noteId` の row が複数 chunk に分散しうるが、Map 累積で吸収される）
- **理由:** UI 入力 `tagIds` は実運用で 10 件未満が大半（ADR #33-003）だが、saved view 等で `tagIds` を多数指定するシナリオは将来あり得る。防御コストが低い（1 行の書き換え）ため対応

### 5. bind-limit 回帰テストの追加

#### 5a. `tagRepository.integration.test.ts` に `findByIds` の bind-cap regression

- **対象ファイル:** `app/core/adapters/d1/__tests__/tagRepository.integration.test.ts`
- **変更内容:** 新 describe block 追加
  - **T-bind-001**: owner に 150 件の tag を seed（1 ステートメント = 1 行 insert を `db.batch` に詰める）、`tagRepository.findByIds([...150 ids])` を呼んで 150 件返ることを assert
- **理由:** SAFE_CHUNK_SIZE=90 を跨ぐ規模 (150) で chunk 経路が動作することを実機検証

#### 5b. `noteRepository.integration.test.ts` に `resolveTagAndCandidates` の bind-cap regression

- **対象ファイル:** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
- **変更内容:** 既存の `D1NoteRepository — D1 bind limit regression` describe block に追加
  - **T-bind-007**: owner に 150 件の tag を seed → 1 件の active note を seed → 150 tag すべてを 1 note に紐づける（`noteTags` に 150 行）→ `findByOwner(owner, { tagIds: [...150], status: 'active', ... })` で当該 note 1 件が返ることを assert
- **理由:** `resolveTagAndCandidates` は private なので `findByOwner` 経由でしか触れない。`tagIds.length === 150` の入力で `noteTags` 結合が正しく動くことを担保

#### 5c. `mediaAssetRepository.integration.test.ts`（新規）

- **対象ファイル:** `app/core/adapters/d1/__tests__/mediaAssetRepository.integration.test.ts`（**新規**）
- **変更内容:**
  - `tagRepository.integration.test.ts` と同じヘッダ（seedUser ヘルパ）を採用
  - **T-bind-001**: owner に 150 件の media asset を seed → `mediaAssetRepository.findByIds([...150])` で 150 件返ることを assert
- **理由:** 既存テストファイル無し。bind-cap regression の最小カバレッジを確保

#### 5d. `publicationStateRepository.integration.test.ts`（新規）

- **対象ファイル:** `app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts`（**新規**）
- **変更内容:**
  - **T-bind-001**: owner に 150 件の note + 150 件の publication_states を seed → `publicationStateRepository.findByNoteIds([...150 noteIds])` で 150 件返ることを assert
- **理由:** 既存テストファイル無し。bind-cap regression の最小カバレッジを確保

### 6. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:integration` で `noteRepository`, `tagRepository`, `mediaAssetRepository`, `publicationStateRepository` の全スイート pass

## 設計判断

新規 ADR は不要。Issue #33 の ADR-002（`selectInChunks` ヘルパ）と ADR-003（他リポジトリは別 Issue）で確立された判断を、本 Issue で **「実際に他リポジトリへ展開する」だけ**。

設計の細部:

- `mediaAsset` / `tag` / `publicationState` の `findByIds` 系はいずれも「id 集合 → entity 配列」変換のシンプルな形で、chunk 跨ぎの順序・重複・GROUP BY 集計の論点を持たない（呼出側はいずれも結果を Map に詰めて id ベースで lookup する形）。`selectInChunks` の flat 結合（duplicate なし、入力 chunk 順）でセマンティクスが保たれる
- `resolveTagAndCandidates` は chunk 跨ぎで同一 `noteId` の行が分散しうるが、既存の `Map<noteId, Set<tagId>>` 集計が累積構造なので chunk 化に対して透過

## リスクと注意点

- **`db.batch` の seed 上限:** Issue #33 と同様、150 行 seed を multi-row insert で詰めると bind 上限を超える。**1 ステートメント = 1 行 insert** を 150 件分作って `db.batch([...])` に渡すパターンを徹底
- **`mediaAsset` / `publicationState` の test container:** 既存の `createTestContainer()` (`helpers.ts`) が両リポジトリを wire しているか確認 → `unitOfWorkProvider.run` 経由でアクセス可能。`tagRepository.integration.test.ts` 同じ構造で書ける
- **`tagRepository.findByIds` の型キャスト:** 現状 `ids as readonly string[] as string[]` の二重キャストは drizzle の型推論回避策。`selectInChunks` の runner 引数 `readonly string[]` を `[...chunk]` で `string[]` 化すれば自然に解消する
- **`resolveTagAndCandidates` の戻り値順序:** 結果は `Set<string>` で、内部の matched 判定（`seen.size === tagIds.length`）は順序非依存。chunk 化の影響なし

## テスト方針

- **既存テスト全 pass** が挙動同値性の主な担保
  - `noteRepository.integration.test.ts` の既存 visibility/listing/loadChildren テスト
  - `tagRepository.integration.test.ts` の既存 searchByNamePrefix / LIKE エスケープテスト
  - その他 `searchIndex.integration.test.ts` 等が tag/media を間接利用
- **新規 bind-limit 回帰テスト (T-bind-001 × 各リポジトリ)** で SAFE_CHUNK_SIZE=90 を跨ぐ規模 (150) を踏み、chunk 経路が正しく動作することを実機検証
- **selectInChunks 自体の unit test** は Issue #33 で完備されているため重複しない
- 手動ブラウザ確認は不要（呼出側のセマンティクス不変、UI 表示・loader 経路の戻り値仕様に変更なし）
