# 実装計画 — Issue #392: ディレクトリ絞り込みの挙動が検索キーワード有無で非対称（サブツリー vs 直下のみ）

**Issue:** #392
**作成日:** 2026-06-01
**複雑度:** 中〜大規模

---

## 目的

ホームのノート一覧で、検索キーワードの有無によりディレクトリ絞り込みの挙動が非対称（キーワードあり=サブツリー一致 / なし=直下equality一致）になっている問題を解消する。フィルタ経路（`listNotesByOwner`）を検索経路（`searchOwnNotes`）に合わせて**サブツリー一致**（選択ディレクトリ + 全子孫ディレクトリ）に揃える。

## 方針（Issue で決定済み・変更不可）

両経路をサブツリー一致に揃える。実装方式は **「子孫ディレクトリ ID 群を解決し `notes.directory_id IN (...)` で絞る」案**。

- 子孫ディレクトリ ID 群の解決は**ドメイン側（`DirectoryService` + `DirectoryRepository`）の責務**とする。
- usecase（`listNotesByOwner`）で解決し、解決済みのサブツリー ID 集合を `NoteOwnerListOpts` 経由で adapter に渡す。adapter は `directories` テーブルへ越境しない。
- 既存の candidate-set / `idScope` / `selectInChunks` インフラに乗せて D1 host-var 上限対策を踏襲する。

## スコープ

### 含まれるもの
- フィルタ経路（`listNotesByOwner` → `NoteRepository.findByOwner` / `listWithCount` / `countByOwner`）をサブツリー一致に変更
- 子孫ディレクトリ ID 解決メソッドをドメイン（`DirectoryService` + `DirectoryRepository`）に追加
- `NoteOwnerListOpts` / `NoteOwnerCountOpts` の `directoryId`（単一 ID equality）を「サブツリー ID 集合」を表す形に変更
- adapter `buildOwnerListWhere` の `directoryId` 直接条件を candidate-set（`idScope`）方式に置換
- 不正/存在しない `directoryId` の扱いの統一（設計判断セクション参照）
- `.issue/387/adr.md` ADR-001 の Status 更新 + 本 Issue 側 ADR の新設（非対称解消の記録）
- 既存の `listNotesByOwner` 結合テスト（直下のみ前提のケース）の更新と、サブツリー一致ケースの追加

### 含まれないもの
- 検索経路（`searchOwnNotes` / `resolveDirectoryPathPrefix`）のロジック変更 — 既にサブツリー一致なので変更不要
- `notes` テーブルへの path カラム非正規化 / closure テーブル導入（Issue で不採用と明記）
- `findByDirectory`（直下のみ）のセマンティクス変更 — これは別用途（直下リスト）で、サブツリー化は対象外
- ディレクトリ階層の depth 制約（`<= 10`）やスキーマの変更（マイグレーション不要）
- フロントエンド（FilterBar チップ / loader の transport boundary）の挙動変更 — 内部セマンティクスのみ変わり、UI の入出力契約は不変

## 実装ステップ

### 1. ドメイン: 子孫ディレクトリ ID 解決メソッドを追加

- **対象ファイル:** `app/core/domain/directory/service.ts` / `app/core/domain/directory/ports/directoryRepository.ts`
- **変更内容:**
  - `DirectoryRepository.findTree(ownerId)` は既に「owner の全ディレクトリのフラットリスト」を 1 クエリで返す。これを使い、`DirectoryService` に純粋関数 `collectSubtreeIds` を追加する:
    - シグネチャ案: `collectSubtreeIds(rootId: DirectoryId, ownerId: UserId, repo: DirectoryRepository): Promise<readonly DirectoryId[]>`
    - `repo.findTree(ownerId)` で全ノードを取得し、`parentId` の隣接リストから `rootId` を起点に BFS/DFS で `rootId` + 全子孫の ID を収集して返す（`rootId` 自身を含む）。
    - `rootId` が owner のツリーに存在しなければ空配列を返す（存在判定もこのメソッド内で完結）。
  - 走査は深さ `<= 10` で有界・サイクルなし（`directories_depth_range` 制約 + ツリー構造）なので無限ループの懸念はないが、念のため visited セットでガードする。
- **理由:** 子孫解決をドメインの責務とし、adapter が `directories` テーブルへ越境しないため。`findTree` を使うことで「ノードごとに `findChildren` を呼ぶ N クエリ」（`deleteSubtree` のパターン）ではなく **1 クエリ + メモリ内走査**で済み、N+1 を回避できる。

### 2. ドメインポート: `NoteOwnerListOpts` / `NoteOwnerCountOpts` の directoryId を集合化

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:**
  - `directoryId?: DirectoryId`（単一・直下equality）を **`directoryIds?: readonly DirectoryId[]`**（サブツリー集合）に変更する。
  - JSDoc を「直下equality」から「supplied directory ids の **いずれか**に属するノート（呼び出し側がサブツリーを解決して渡す）」に書き換える。「Descendant directories are not included...（ADR-001）」の記述を削除し、サブツリー一致である旨と「解決責務は usecase 側」を明記する。
  - `NoteOwnerCountOpts` の `Pick` キーを `directoryId` → `directoryIds` に追従させる。
- **理由:** port をサブツリー集合受け取りに変えることで、adapter は「directories テーブルを知らずに ID 集合で IN フィルタするだけ」になり、レイヤー越境を避けつつ既存の `referencingNoteId` candidate-set と同型になる。

### 3. adapter: `buildOwnerListWhere` を candidate-set 方式に変更

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:**
  - 現状の `if (opts.directoryId !== undefined) { conditions.push(eq(notes.directoryId, opts.directoryId)); }`（直接条件）を削除する。
  - `directoryIds` でのフィルタは `notes.directory_id IN (...)` であり、既存の `candidateSets`（**note-id** 集合の交差 → `idScope`）とは**意味が異なる**点に注意（directory-id を note-id 前提の `intersectIdSets` に混ぜてはいけない）。推奨実装:
    - **共通ガード**: `directoryIds !== undefined && directoryIds.length === 0` → `return null`（match-nothing 短絡）。
    - **小集合（`directoryIds.length <= SAFE_CHUNK_SIZE`、実運用のほぼ全ケース）**: `conditions.push(inArray(notes.directoryId, [...directoryIds]))` の単一述語で済ませる。host-var は `directoryIds.length` + 周辺数語で cap 内。`idScope === null` の高速単一クエリパスをそのまま使える。
    - **大集合（`directoryIds.length > SAFE_CHUNK_SIZE`、稀）**: `directory_id IN (...)` を 1 述語で出すと host-var 超過。この場合のみ `selectInChunks(directoryIds, chunk => select notes.id where directory_id IN chunk)` で **note-id 集合**へ解決し、`candidateSets` に積んで既存 `idScope` フロー（chunk + JS sort）に乗せる。これは既存 `resolveReferrerCandidates` と同型（directory-id ではなく note-id 集合を candidateSet にする）。
  - JSDoc コメントを直下equality前提から「supplied directory id 集合のいずれかに属するノート（サブツリーは usecase 側で解決済み）」に更新する。
  - 空集合（`directoryIds.length === 0`）の扱いは上記「共通ガード」で `return null`（`visibility: []` と同じ「構造的に 0 件」扱い）。
- **理由:** サブツリー一致を実現しつつ、host-var 上限対策の既存インフラを再利用する。

### 4. usecase: `listNotesByOwner` でサブツリー解決して渡す

- **対象ファイル:** `app/core/application/note/listNotesByOwner.ts`
- **変更内容:**
  - `ListNotesByOwnerInput.directoryId?: DirectoryId`（入力契約は単一 ID のまま — loader/URL は単一 directoryId を渡す）は維持する。
  - usecase 内（UoW 内）で `input.directoryId` が指定されている場合、`DirectoryService.collectSubtreeIds(input.directoryId, input.actorUserId, ctx.directoryRepository)` を呼んでサブツリー ID 集合を解決し、`opts.directoryIds` として `listWithCount` に渡す。
  - `directoryRepository` が現状の UoW context に含まれているか確認し、無ければ context へ追加する（後述・依存関係参照）。
  - 不正/存在しない `directoryId` の扱いは設計判断セクションの決定に従う。
- **理由:** 子孫解決はドメインサービスの責務だが、それを起動して port に渡すオーケストレーションは usecase の役割（adapter には directories を触らせない方針）。

### 5. usecase/loader: 不正・非存在 directoryId の扱いを統一

- **対象ファイル:** `app/core/application/note/listNotesByOwner.ts` / 必要なら `app/components/note/loaders.ts`
- **変更内容:** 設計判断セクションの決定（推奨: 現状の list 経路の silent-empty を維持）に従い、`collectSubtreeIds` が空集合を返したケース（存在しない directoryId）を空一覧にフォールバックさせる。`DirectoryId.create` の malformed は loader の既存 try/catch（silent-drop）を維持。
- **理由:** 2 経路の bad-id 挙動は元々非対称（検索=NotFoundError / list=silent-empty）。本 Issue の主目的は「子を持つ親選択時の表示一致」であり、bad-id の統一は副次。既存 list 経路の挙動を変えないのが影響最小。

### 6. テスト更新・追加

- **対象ファイル:** `app/core/application/note/__tests__/listNotesByOwner.integration.test.ts`（および必要なら `app/core/domain/directory/__tests__/service.test.ts`）
- **変更内容:**
  - **更新（破壊的変更の修正）**: Issue #387 で追加された「直下のみ」を前提とするテストを修正する:
    - `"does not return child-directory notes when the parent directoryId is supplied"`（行334付近）→ **子ディレクトリのノートも返る**ことを検証するケースに反転。
    - `"returns count > limit reflecting only the directory's direct children"`（行600付近）/ `"returns only the notes that live directly under the directory"`（行648付近）→ サブツリー（子孫含む）の件数・items を検証するよう更新。
  - **追加**: 親選択でサブツリー全体（親直下 + 子直下 + 孫）が返ること、`directoryIds × tagIds` 併用、`count` がサブツリー総数と一致すること、非存在 directoryId で空一覧になること。
  - **追加（ドメイン）**: `DirectoryService.collectSubtreeIds` のユニットテスト（単一ノード / 親+子+孫 / 兄弟サブツリーは含まない / 非存在 rootId は空）。
- **理由:** #387 のテストは ADR-001（直下のみ）を固定化しているため、サブツリー化に伴い必ず更新が要る。

### 7. ADR 更新・新設

- **対象ファイル:** `.issue/387/adr.md`（更新） + `.issue/392/adr.md`（新設）
- **変更内容:**
  - `.issue/387/adr.md` ADR-001 の Status を「Superseded by #392」等に更新し、非対称が解消された旨を追記。
  - `.issue/392/adr.md` に「両経路をサブツリー一致に揃える」「子孫解決はドメイン責務 + findTree によるメモリ内走査」「bad-id 挙動の統一方針」を記録（adr.md 参照）。
- **理由:** Issue で「ADR-001 のトレードオフ解消を記録する」と明示されている。

## 設計判断

詳細は `.issue/392/adr.md` 参照。要点:

- **子孫解決メソッドの置き場所**: `DirectoryService.collectSubtreeIds`（ドメインサービスの静的純粋関数）。`deleteSubtree` のノードごと `findChildren` ではなく `findTree(ownerId)` 1 クエリ + メモリ内走査を採用し N+1 を回避。
- **port の表現**: `directoryId?: DirectoryId` → `directoryIds?: readonly DirectoryId[]`（解決済みサブツリー集合）。usecase の入力契約は単一 `directoryId` のまま。
- **adapter のフィルタ方式**: `notes.directory_id IN (...)`。`directoryIds.length <= SAFE_CHUNK_SIZE`（実運用ほぼ全ケース）は単一 `inArray(notes.directoryId, ...)` を `conditions` に push。超過時のみ `selectInChunks` で note-id 集合へ解決し candidateSet（`idScope`）へフォールバック。directory-id 集合を note-id 前提の `intersectIdSets` に混ぜないこと。
- **bad-id 挙動**: 現状 list 経路の silent-empty を維持（推奨）。検索経路の `NotFoundError` に揃えるのは UX 変更が大きく本 Issue スコープ外と判断。

## リスクと注意点

- **host-var 上限**: `inArray(notes.directoryId, [...directoryIds])` の host var は `directoryIds.length`。owner のディレクトリ総数が大きいと cap（~100）に迫る。`directoryIds.length > SAFE_CHUNK_SIZE` のフォールバック分岐を必ず実装し、テストで境界を担保する。
- **既存 `idScope` セマンティクスとの混同**: 既存 candidateSet は **note-id** 集合。`directory_id` 集合をそのまま `candidateSets`（note-id 前提の `intersectIdSets`）に混ぜると壊れる。directory_id 集合は別経路（直接 `inArray` 条件 もしくは note-id への解決）として扱うこと。
- **`count` 整合性**: `listWithCount` / `countByOwner` は `buildOwnerListWhere` を共有するので、`directoryIds` 対応を where-builder 1 箇所に入れれば items/count は自動整合。Issue #30 の不変条件（`items.length <= count`）を壊さないこと。
- **UoW context の `directoryRepository`**: `listNotesByOwner` の UoW callback が `directoryRepository` を露出しているか要確認。無ければ UoW context へ追加（読み取り専用）。
- **`findByDirectory`（直下リスト）は変更しない**: 別 API。サブツリー化を波及させないこと。
- **検索経路は無変更**: `searchOwnNotes` は既にサブツリー一致。二重対応・回帰に注意。

## テスト方針

- **ユニット（ドメイン）**: `DirectoryService.collectSubtreeIds` — 単一/親子孫/兄弟非包含/非存在 rootId。
- **結合（usecase + D1）**: `listNotesByOwner.integration.test.ts` を更新し、(1) 親選択でサブツリー全件、(2) `count` がサブツリー総数一致、(3) `directoryIds × tagIds` 併用、(4) 非存在 directoryId で空一覧、(5) host-var 境界（SAFE_CHUNK_SIZE 超のディレクトリ数）を担保。
- **手動/ブラウザ**: ホームでキーワードなし時に子を持つ親ディレクトリを選択 → 子孫ノートも表示されること、キーワードありと件数が一致すること。詳細は `testing.md`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスクの2視点で確認）
**確認した点（コード検証で裏取り）**:
- `ctx.directoryRepository` と `ctx.noteRepository` が同一 UoW context で利用可能（`listNotesInDirectory` が両方を 1 つの `unitOfWorkProvider.run` 内で使用）。→ ステップ4 で UoW context 変更は不要と確定。
- `DirectoryRepository.findTree(ownerId)` は owner スコープの全ディレクトリを 1 クエリで返す（depth/name/id 昇順）。→ `collectSubtreeIds` の N+1 回避方針が成立。
- 検索経路（`searchOwnNotes` / `resolveDirectoryPathPrefix`）は既にサブツリー一致。本 Issue で変更不要。
- transport / loader 契約は単一 `directoryId`（`z.string().min(1)`）。port のみ `directoryIds` 集合化し、入力契約は不変 → 境界変更ゼロで影響最小。

**反映した修正**:
- ステップ3 の adapter 実装を、A案/B案の二択提示から「小集合=単一 `inArray` / 大集合のみ note-id candidate-set フォールバック」の単一推奨に確定。directory-id 集合を note-id 前提の `intersectIdSets` に混ぜない注意を明記。
- 空集合ガード（`return null`）を「共通ガード」として一本化。

**見送った提案**:
- bad-id を検索経路の `NotFoundError` に揃える案 → ADR-002 で silent-empty 維持と決定（UX 変更が大きく主目的外）。
- `findByDirectory` のサブツリー化 → 別用途のためスコープ外。

### 終了
両視点とも要修正の問題点ゼロ（要件カバレッジ・アーキ整合性・host-var/N+1 リスクいずれも plan に反映済み）。1周で終了。
