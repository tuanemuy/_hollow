# ADR — Issue #392: ディレクトリ絞り込みの挙動が検索キーワード有無で非対称

## ADR-001: フィルタ経路もサブツリー一致に揃える（子孫 ID 解決 + `directory_id IN (...)`）

### Status
Accepted

### Context
#387（PR #391）で、キーワードなしのフィルタ経路（`listNotesByOwner`）に `directoryId` を**直下equality一致**（`eq(notes.directoryId, ...)`）として通した。一方、キーワードありの検索経路（`searchOwnNotes`）は `resolveDirectoryPathPrefix` による `directoryPath` プレフィックス一致＝**サブツリー（子孫含む）**。結果、子を持つ親ディレクトリを選ぶと、キーワード有無で表示集合が食い違う（`.issue/387/adr.md` ADR-001 のトレードオフ）。

実装方式の候補:
1. 子孫ディレクトリ ID 群を解決し `notes.directory_id IN (...)` で絞る
2. `notes` に `directoryPath` を非正規化（マイグレーション + ノート移動時の path 維持）
3. closure テーブル導入（ディレクトリ全書き込みで整合メンテ）

### Decision
**案①（子孫 ID 解決 + IN）** を採用（Issue で決定済み）。

- 子孫解決は **`DirectoryService.collectSubtreeIds`**（ドメインの純粋静的関数）の責務とし、`DirectoryRepository.findTree(ownerId)` で owner の全ディレクトリを 1 クエリ取得 → `parentId` 隣接リストをメモリ内走査して `rootId` + 全子孫を収集する。ノードごとに `findChildren` を呼ぶ `deleteSubtree` 方式は N+1 になるため `findTree` 1 クエリ方式を採る。
- usecase（`listNotesByOwner`）がこれを起動し、解決済み集合を `NoteOwnerListOpts.directoryIds`（`directoryId?: DirectoryId` から変更）として adapter へ渡す。**adapter は `directories` テーブルへ越境しない。**
- adapter `buildOwnerListWhere` は `notes.directory_id IN (...)` を発行。`directoryIds.length <= SAFE_CHUNK_SIZE` は単一 `inArray` 条件、超過時のみ note-id candidate-set へフォールバックして既存 host-var 上限対策に乗る。

### Consequences
- 良い点: 両経路がサブツリー一致で揃い、キーワード有無で表示集合が一致。マイグレーション不要。host-var 対策は既存インフラ（`selectInChunks` / `idScope`）を再利用。
- トレードオフ: フィルタ経路に `findTree` クエリが 1 回増える（depth<=10 / 隣接リスト・owner 規模では軽量）。port の `directoryId` 単一 ID 表現が `directoryIds` 集合表現に変わる（呼び出し側 usecase 入力は単一のまま）。
- `.issue/387/adr.md` ADR-001 は本 ADR により Superseded（非対称解消）。

---

## ADR-002: 不正/非存在 directoryId の扱いは list 経路の silent-empty を維持する

### Status
Accepted

### Context
bad-id の扱いは元々 2 経路で非対称: 検索経路は `DirectoryId.create` → `NotFoundError('directory')` を throw、フィルタ経路は loader の try/catch で malformed を silent-drop し、存在しない id は空一覧フォールバック。本 Issue で「揃えるか」を判断する必要がある。

### Decision
**list 経路の silent-empty を維持**する。`collectSubtreeIds` が空集合を返した（= 非存在 rootId）場合は adapter で match-nothing 短絡（`return null` → 空一覧 / count 0）。malformed id は loader 既存の silent-drop を維持。

### Consequences
- 良い点: 既存 list 経路の挙動・loader 契約を変えず影響最小。サイドバー選択は「一覧が切り替わる」ことが目的で、bad-id を 404 にする UX 価値は低い。
- トレードオフ: bad-id 挙動の 2 経路非対称は残る（検索=404 / list=空一覧）。これは本 Issue の主目的（子を持つ親選択時の表示一致）とは別軸で、許容する。

---

## ADR-003: adapter での `directoryIds` 解決 — 小集合は直接 `inArray`、大集合のみ note-id candidate-set（実装メモ）

### Status
Accepted

### Context
`buildOwnerListWhere` の既存 `candidateSets`/`idScope`/`intersectIdSets` は **note-id** 集合の交差を前提とする。`directoryIds` は `notes.directory_id` への `IN` 述語であり、directory-id 集合をそのまま `candidateSets` へ混ぜると壊れる。一方で `directoryIds.length` が D1 host-var 上限（~100）に迫るとき、単一 `inArray(notes.directoryId, [...])` 述語は cap を超える。

### Decision
- `directoryIds.length === 0` → `return null`（match-nothing）。`undefined` は無条件。
- `directoryIds.length <= SAFE_CHUNK_SIZE`（=90、実運用ほぼ全ケース）→ `conditions.push(inArray(notes.directoryId, [...directoryIds]))`。`idScope === null` の高速単一クエリパスを維持。
- `directoryIds.length > SAFE_CHUNK_SIZE`（稀）→ `resolveDirectoryNoteCandidates` が `selectInChunks` で `notes.id` 集合へ解決し、その **note-id** 集合だけを `candidateSets` へ積む。directory-id 集合を `intersectIdSets` に直接混ぜない。

### Consequences
- 良い点: 共通ケースは追加クエリゼロ・単一 SQL。大集合だけ既存 chunk インフラに乗り host-var 超過を回避。candidate-set の note-id 不変条件を壊さない。
- トレードオフ: 大集合分岐は追加の `notes.id` 解決クエリ（chunked）を 1 回挟む。owner のディレクトリ総数が 90 を超える稀ケースのみ。境界は結合テストで担保。
