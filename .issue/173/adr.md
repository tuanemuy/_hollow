# ADR — Issue #173: perf(notes) listNotesByOwner で findByOwner + countByOwner の重複計算を回避

## ADR-001: `NoteRepository` に `listWithCount` を追加し、D1 アダプター内で `buildOwnerListWhere` を 1 回に集約

### Status
Accepted

### Context

PR #170 (Issue #165) のレビュー指摘 **P-W-004** のフォローアップ。`listNotesByOwner` ユースケースは `UnitOfWorkProvider.run` 内で:

1. `noteRepository.findByOwner(ownerId, opts)`
2. `noteRepository.countByOwner(ownerId, opts)`

を続けて呼ぶ。両者とも内部で `buildOwnerListWhere(ownerId, opts)` を実行するため、`intersected` 計算と各候補セット取得の I/O が独立に走る:

- `resolveVisibilityCandidateIds` / `resolveTagAndCandidates` / `resolveReferrerCandidates` が 2 回
- `intersectIdSets` の計算が 2 回
- `Array.from(intersected)` の配列確保が 2 回

選択肢:

- **(A) batch API**: `NoteRepository` ポートに `listWithCount(ownerId, opts)` を追加し、D1 アダプター内で `buildOwnerListWhere` を 1 回だけ走らせる
- **(B) usecase 層 memo**: `buildOwnerListWhere` の結果を usecase 層でキャッシュして両 method に渡す
- **(C) UoW を貫いた memo**: UoW context に memo slot を持たせる

### Decision

**(A) batch API を採用**。具体的には:

1. `NoteRepository` ポートに以下を追加:
   ```ts
   listWithCount(
     ownerId: UserId,
     opts: NoteOwnerListOpts,
   ): Promise<{ items: readonly Note[]; count: number }>;
   ```
   契約:
   - `findByOwner(ownerId, opts) + countByOwner(ownerId, opts)` と意味論的に等価
   - `count` は filter 適用後の総件数。`opts.limit/offset/sort/order` は `items` 側のみに作用し `count` には影響しない
   - 既存 `findByOwner` / `countByOwner` は単体利用後方互換のため**残す**

2. D1 アダプター実装:
   - `buildOwnerListWhere` を 1 回だけ呼ぶ
   - `null` → `{ items: [], count: 0 }` 短絡
   - `idScope === null`: ORDER BY/LIMIT/OFFSET の 1 クエリで items 取得 + `select count()` を並列実行
   - `idScope !== null` (chunk 経路): `selectInChunks` を 1 度だけ走らせて全 chunk 行 materialise → JS sort → `count = sorted.length` / `items = sorted.slice(offset, offset+limit)` → `hydrateMany`

3. `listNotesByOwner` usecase を `listWithCount` に切り替える

### Consequences

- 良い点:
  - candidate set 取得・intersection 計算・`Array.from(intersected)` がいずれも 1 回に減る
  - `buildOwnerListWhere` の `(where, idScope)` 構造（ADR #165-001）は private のまま、アダプター内部に閉じる
  - hexagonal 違反なし。ポート公開面は 1 メソッド追加のみで、`findByOwner` / `countByOwner` の単体利用は完全に後方互換
  - `listWithCount` 化により list と count が**完全に同じ filter 解決結果**から導出されるため、行ドリフトリスクは強化される方向
  - chunk 経路では `countByOwner` の per-chunk `count()` クエリも不要になる（`sorted.length` を流用）

- トレードオフ:
  - ポート公開面が肥大化する（3 メソッドが filter 共有規約を持つ）。JSDoc で「両者の意味論的合成」と明示してカバー
  - chunk 経路の count 取得を `sorted.length` に依存するため、将来 P-W-001/P-W-002（2-pass 化）導入時は count 取得方法を再考する必要がある

### 却下した選択肢

- **(B) usecase 層 memo**: `buildOwnerListWhere` の `(where, idScope)` 構造を usecase に露出させると、adapter 内部の SQL/idScope 表現が domain ポートを汚す。Hexagonal の "Dependencies point inward" 規約に反する
- **(C) UoW を貫いた memo**: UoW context にリポジトリ実装詳細が漏れる。`UnitOfWorkProvider` の責務（トランザクション境界とリポジトリ可視性）を超える。横断的影響が大きく、他リポジトリにも波及しやすい

### 補足: 既存 `findByOwner` / `countByOwner` を残す理由

`findByOwner` 単体 / `countByOwner` 単体で呼ぶ usecase が将来出ても問題ない契約を保つ。`listWithCount` は「ペア利用に特化した最適化 API」という位置付け。

### 補足: chunk 経路で count を `select count()` で取らない理由

chunk 経路では既に全 idScope 分の行を materialise しないと sort/slice ができない。`sorted.length` で count を取る方が `select count()` 1 ラウンドトリップ削減になる。

既存 `countByOwner` の chunk 経路（`noteRepository.ts:676-682`）は `select({ c: count() })` を `where AND inArray` で chunk 毎に発火しており `idScope.size` 分の I/O が走る。`listWithCount` 化で `findByOwner` chunk 経路と同じ全 chunk 行 fetch を**共有**することで、count 専用の chunk I/O が**純減**する。本 Issue の本旨「候補セット I/O・intersection 計算・chunk fetch の二重化解消」と整合。

### 補足: `idScope === null` 経路の `Promise.all` 並列化

D1 アダプターは binding 直叩きの読み取りで in-flight transaction を共有しない（`noteRepository.ts` 冒頭 JSDoc 「Reads execute as a fixed sequence of queries against the binding」参照）。前例として `loadChildren` (`noteRepository.ts:233-252`) が既に `Promise.all` で 3 並列クエリを走らせている。`listWithCount` の `idScope === null` 経路で `select()` + `select count()` を `Promise.all` で並列化する設計は同等パターン内で安全。

### 補足: 横展開について

他リポジトリ（`tag`, `media`, `ingestion`, `export`, `savedView`）も `findBy*` + `countBy*` を持つが、現状 usecase 内でペア呼び出しているのは `listNotesByOwner` のみ（事前 grep 確認）。Follow-up として記録するに留め、本 Issue では横展開しない。

### Follow-up 候補

- 将来 P-W-001/P-W-002（2-pass 化）導入時に `listWithCount` の chunk 経路の count 取得を再評価
- 他リポジトリで類似ペア呼び出しが発生したら、同じパターン（batch API）で対応する
- `ADR-001 Follow-up P-W-004` は本 Issue でクローズ
