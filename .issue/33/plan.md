# 実装計画 — Issue #33: D1 inArray バインド上限対策

**Issue:** #33
**作成日:** 2026-05-18
**複雑度:** 中〜大規模

---

## 目的

`D1NoteRepository` で D1 / SQLite のホスト変数バインド数上限（D1 ≒ 100）を超える `inArray(notes.id, [...])` が発火しうる経路を、bind 数が owner ノート数に依存しない実装に置き換える。

主訴は `findByOwner` の `wantsPrivate=true` 経路（Issue 本文）だが、`hydrateMany` → `loadChildren` 経路も `tag` 系ユースケース（`limit=500` で `findByOwner` を呼ぶ）から実際にバインド上限を踏むため、同時に対応する。

## スコープ

### 含まれるもの

- `D1NoteRepository.resolveVisibilityCandidates` の `wantsPrivate=true` 経路を `notExists` 相関 subquery に置き換え、owner-id sweep と最終 `inArray(notes.id, [...])` を排除する
- `D1NoteRepository.loadChildren` の 3 つの `inArray(...noteId, [...noteIds])` を chunk 分割で実行する小ヘルパを追加
- `D1NoteRepository.findReferrers` の `inArray(notes.id, fromIds)` も同じ chunk ヘルパで実行
- 上記を踏むバインド上限超え統合テストを追加
- `.issue/33/adr.md` に設計判断を記録、`.issue/8/adr.md` ADR-003 のトレードオフ欄に「Issue #33 で解消」cross-link

### 含まれないもの

- `notes.visibility` 冗長列の追加（writes 経路の複雑化が大きい）
- chunk ヘルパを他リポジトリ（`mediaAsset`, `tag`, `publicationState`, `outbox`）に展開
- `resolveTagAndCandidates` (`inArray(noteTags.tagId, [...tagIds])`) の対応（UI 入力 tagId 集合で実運用上 10 件未満）
- `wantsPrivate=false` 経路の SQL 化（戻り値 row 数が owner の publication 行数で律速され、bind 上限到達リスクが薄い）
- `countByOwner` への filter 反映（ADR-009 で別 Issue 化済み）

## 実装ステップ

### 1. `selectInChunks` ヘルパを新規追加

- **対象ファイル:** `app/core/adapters/d1/repositories/_chunks.ts`（新規）
- **変更内容:**
  - `export const D1_BIND_LIMIT_HOST_VARS = 100;`
  - `export const SAFE_CHUNK_SIZE = 90;`
  - `export async function selectInChunks<T>(ids: readonly string[], runner: (chunk: readonly string[]) => Promise<readonly T[]>, chunkSize?: number): Promise<readonly T[]>`
  - JSDoc に「D1 host-var limit ≒ 100 を踏まないため」の WHY を明記
- **理由:** `loadChildren` (3 箇所) と `findReferrers` (1 箇所) で 4 箇所に使うため file scope private では足りない。adapter 局所の関心事なので `app/lib/` ではなく adapter 配下に置く

### 2. `selectInChunks` の単体テスト

- **対象ファイル:** `app/core/adapters/d1/repositories/__tests__/_chunks.test.ts`（新規）
- **変更内容:**
  - 空配列で runner が呼ばれず空配列を返す
  - chunkSize 未満で runner が 1 回だけ呼ばれる
  - chunkSize ちょうどで 1 回
  - chunkSize + 1 で 2 回 + 結果 concat
  - 大量 (250 件, chunkSize=90) で 3 回呼ばれ順序保持
- **理由:** pure function で網羅可能。Integration テストの D1 起動なしで境界条件を担保

### 3. `loadChildren` を `selectInChunks` 化

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts` (l.207–252)
- **変更内容:**
  - **既存の `Promise.all` 3 並列構造は維持**。3 つの並列要素（`noteTags`, `noteInternalLinks`, `noteMediaRefs`）それぞれの **内部だけ** を `selectInChunks(noteIds, async (chunk) => db.select()...where(inArray(col, [...chunk])))` に置き換える
  - 各 chunk の結果を concat してから既存の Map 集計に流す（Map 集計ロジックは現状維持）
- **理由:** `tag` 系ユースケース (`deleteTag`, `mergeTags`, `renameTag`) が `findByOwner` を `limit=500` で呼ぶため、`hydrateMany([500 rows])` → `loadChildren([500 ids])` で実際にバインド上限を踏む。3 並列構造を崩すと典型 listing の I/O レイテンシが悪化する

### 4. `findReferrers` を `selectInChunks` 化

- **対象ファイル:** 同上 (l.505–522)
- **変更内容:**
  - `inArray(notes.id, fromIds)` を `selectInChunks(fromIds, async (chunk) => db.select().from(notes).where(inArray(notes.id, [...chunk])))` 経由に
  - `.orderBy(desc(notes.updatedAt), desc(notes.id))` は chunk 内に閉じるため失効。**chunk 全結合後、`hydrateMany` に渡す前に row 配列を JS で `updatedAt` 文字列降順 + `id` 文字列降順で sort**（ISO-8601 固定幅 + UUIDv7 は文字列比較で SQLite BINARY collation と同値）
  - sort 後の rows を `hydrateMany` に渡し、`Note[]` に変換する
- **理由:** `fromIds` の上限は「target note を参照している note 数」で実質無制限。chunk 化が必要。`Note` ではなく row 段階で sort することで、`hydrateMany` 内部の `loadChildren` も並列構造を維持できる

### 5. `resolveVisibilityCandidates` を 2 つに分割

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts` (l.417–470)
- **変更内容:**
  - `wantsPrivate=false` 経路: `resolveVisibilityCandidateIds(ownerId, visibility): Promise<ReadonlySet<string>>` として残す（現状の `publication_states` 直接 lookup ロジックを移動。bind 数は publication 行数で律速され安全）
  - `wantsPrivate=true` 経路: `buildVisibilityNotExistsPredicate(ownerId, visibility): SQL | null` として再実装
    - `notWanted` が空（visibility に 3 種全て含む）なら `null` を返す
    - そうでなければ `notExists(this.db.select({ _: sql\`1\` }).from(publicationStates).where(and(eq(publicationStates.noteId, notes.id), eq(publicationStates.ownerId, ownerId), inArray(publicationStates.visibility, [...notWanted]))))` を返す
  - `statusFilter` 引数は削除（NOT EXISTS は owner sweep を行わないため、status pre-filter の意味が消える）
- **理由:** visibility だけが「集合ではなく述語」を返す変則になるため、メソッドを分割した方が型と意図が明快

### 6. `findByOwner` 本体の visibility 分岐を組み替え

- **対象ファイル:** 同上 (l.318–385)
- **変更内容:** `opts.visibility !== undefined` ブロックを以下に置き換え:
  - `visibility.length === 0` → 即 `return []`（現状維持）
  - `wantsPrivate === false` → `candidateSets.push(await this.resolveVisibilityCandidateIds(...))`
  - `wantsPrivate === true` → `const pred = this.buildVisibilityNotExistsPredicate(...); if (pred) conditions.push(pred);`
- **理由:** bind 数を `notWanted` 長（最大 2）に圧縮し、owner sweep 1 段の I/O も同時に削減

### 7. `drizzle-orm` の import 追加

- **対象ファイル:** 同上 l.1
- **変更内容:** `notExists`, `sql` を import に追加
- **理由:** 新述語構築に必要

### 8. 統合テスト追加

- **対象ファイル:** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
- **変更内容:** 新 describe block `D1NoteRepository — D1 bind limit regression (integration)` を追加
  - **T-bind-001**: owner に 150 件の active note を seed（うち 50 件のみ `publication_states` に `public` 行）、`visibility=['private']` で `findByOwner` を呼んで例外なく 100 件返ることを assert
  - **T-bind-002**: 同 seed で `visibility=['private','public']` → 150 件全件返る
  - **T-bind-003**: owner に 150 件 + 全件に tag/mediaRef を 1 件付与 + `limit=150` で `findByOwner` → `loadChildren` chunk 経路が動作し children が漏れなく fold される
  - **T-bind-004**: target note を参照する 150 件の `noteInternalLinks` 行を seed → `findReferrers(target)` が 150 件返り、`updatedAt DESC, id DESC` 順序が維持される（chunk 跨ぎでの JS sort 検証）
- **seed ヘルパ:** `seedManyNotes(container, owner, dir, count, opts?)` を追加
  - **insert 方式:** D1 のバインド上限を踏まないよう、**1 ステートメント = 1 行 insert** の builder を 150 件分作り、`db.batch([...statements])` に渡す。`notes` テーブルは 15 列なので、multi-row insert で 1 ステートメントに 50 行詰めると 750 バインドとなり本 Issue が解消しようとしている上限を seed で踏んでしまう。`db.batch` は **ステートメント数**には十分余裕があるため 1 行ずつでよい
  - 関連子テーブル (`noteTags`, `noteInternalLinks`, `noteMediaRefs`) の seed も同様に 1 ステートメント 1 行
- **理由:** バインド上限到達経路を回帰検出装置として固定化

### 9. ADR を記録

- **対象ファイル:**
  - `.issue/33/adr.md`（新規）— NOT EXISTS 採用判断、chunk util 採用判断、loadChildren と findReferrers をスコープに含めた判断、tagId IN とその他 inArray をスコープ外とした判断
  - `.issue/8/adr.md` ADR-003 のトレードオフ欄に「**D1 `inArray` バインド上限 → Issue #33 で解消（`.issue/33/adr.md` 参照）**」を追記
- **理由:** 過去 ADR の「将来 Issue で対応」と明記された部分の決着を記録

### 10. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:integration` の noteRepository スイート全 pass

## 設計判断

詳細は `.issue/33/adr.md` を参照。サマリ:

- **ADR-001:** visibility filter は `notExists` 相関 subquery で表現（chunk 分割や冗長列を却下）
- **ADR-002:** `loadChildren` / `findReferrers` は `selectInChunks` ヘルパで保護（tag 系ユースケースの `limit=500` で実際に踏むため本 Issue スコープに含める）
- **ADR-003:** その他の `inArray` 箇所（`resolveTagAndCandidates`, 他リポジトリ）はスコープ外
- **ADR-004:** `resolveVisibilityCandidates` の `statusFilter` 引数は削除（NOT EXISTS 化で sweep 自体が消失）

## リスクと注意点

- **drizzle 相関 subquery の挙動:** `outboxRepository.claimPending` で「未 await drizzle select を式に埋め込んで単一 SQL 化」する前例あり。`notExists` + 相関 (`notes.id`) は新規パターンなので、integration test で SQL が正しく組まれることを実測検証する
- **`notExists` の index 効率:** `publication_states.noteId` は PK、`idx_pubs_visibility_owner` も併用可能。owner あたり notes ~10k 規模までは問題なし。それ以上の規模になったら EXPLAIN QUERY PLAN で再評価（ADR に記載）
- **`findReferrers` の order:** chunk 後 JS sort で同等性を担保。`updatedAt` は ISO 文字列なので文字列比較で OK（既存 schema 設計と整合）
- **`statusFilter` 引数削除の波及:** `resolveVisibilityCandidates` は private method なので外部呼出なし。テストでも直接呼んでいない
- **seed ヘルパ追加の影響:** 既存テストには影響しない（既存 `seedNote` を残す）

## テスト方針

- **既存 visibility filter テスト（T-W-001〜005, status×visibility 2件, combined）** が全 pass することで挙動同値性を担保
  - 特に `status='trashed' × visibility=['private']` (visibility 系 status 交差テスト) は **ADR-004 の `statusFilter` 引数削除の挙動同値性を担保する canary**。これが pass すれば「旧 sweep の status pre-filter が消えても結果セマンティクス不変」が確認できる
- **新規 bind-limit 回帰テスト (T-bind-001〜004)** で修正前の実装なら overflow する規模を踏み、修正後は通ることを確認
  - **必須**: 実装前に旧コードに対して T-bind-001/002 を走らせ、D1 バインド上限エラーで FAIL することを記録する。これが取れていれば「修正後の bind 数定数化 = 正しく相関化されている」の間接証拠になる
- **selectInChunks unit test** で chunk 境界条件を pure function テスト
- 手動動作確認は不要（既存 UI / loader 経路の戻り値セマンティクス不変）

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | △（NOT EXISTS 採用） | ○（NOT EXISTS + chunk ヘルパ） | △（NOT EXISTS のみ） |
| visibility NOT EXISTS | ○ | ○ | ○ |
| chunk ヘルパ | × loadChildren を意図的に除外 | ○ `_chunks.ts` 提案 | × loadChildren を意図的に除外 |
| 取り込んだ点 | ADR の言語化、`statusFilter` 削除の正当化、index 効率の評価 | chunk util 設計とテスト戦略 | YAGNI 原則、`wantsPrivate=false` 経路温存の判断 |

3エージェント全員が (A) NOT EXISTS で一致。`loadChildren` 対応は 1/3 が必要と判定したが、**`tag` 系ユースケースが `limit=500` で `findByOwner` を呼ぶ実装を確認した結果、`loadChildren` も実際にバインド上限を踏むパスが存在する**ためエージェント2の方針を採用。

## レビュー反映

### 修正した点

- **P-001 (実現可能性)**: seed の `db.batch` は **1 ステートメント = 1 行 insert** で構成する。15 列 × 50 行を multi-row insert すると 750 バインドで Issue が対策しようとしている上限を seed 時点で踏むため。実装ステップ 8 の seed ヘルパ仕様に明記
- **P-002 (実現可能性)**: `findReferrers` の chunk 後 sort は **`hydrateMany` 前に row 配列段階で `updatedAt` ISO 文字列降順 + `id` 文字列降順** で実施する旨を実装ステップ 4 に明記
- **P-003 (実現可能性)**: `loadChildren` の `Promise.all` 3 並列構造は維持し、各並列要素の内部だけを `selectInChunks` で chunk 分割する旨を実装ステップ 3 に明記

### 取り込んだ改善提案

- **S-003 (要件カバレッジ) / S-001 (実現可能性)**: bind-limit テストを「git stash で旧実装の FAIL を記録」する手順を **必須** に格上げ（testing.md と plan.md テスト方針の両方に反映）
- **S-005 (実現可能性)**: `status='trashed' × visibility=['private']` テストが ADR-004 同値性の canary であることをテスト方針に明記
- **S-004 (実現可能性)**: NOT EXISTS subquery 内の `ownerId` 条件は意味上冗長だが `idx_pubs_visibility_owner` を planner に選ばせる選択肢として保持する旨を ADR-001 に追記

### 見送った提案とその理由

- **S-002 (要件カバレッジ)**: PR description で `loadChildren` をスコープに含めた理由を明示 → 実装フェーズの PR 作成時に対応するため計画書には反映しない
- **S-002 (実現可能性)**: 他リポジトリの inArray を別 Issue 化 → Phase 4 (スコープ外 Issue 起票) で対応するため計画書には反映しない
- **S-003 (実現可能性)**: `selectInChunks` の重複排除契約のテスト追加 → JSDoc に「重複排除はしない（呼出側責務）」と明記すれば十分。YAGNI
