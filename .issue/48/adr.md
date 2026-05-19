# ADR — Issue #48: search 経路 (searchOwnNotes) projection 実値化 + ADR-013/014 解消

## ADR-001: `NoteRepository.findByIds` を port に追加し `hydrateMany` 経由で完全な `Note` を返す

### Status
Proposed

### Context

search 経路の `OwnedNotesResult.notes[]` に `directoryId` / `slug` / `updatedAt` を実値で載せるには、search hit の `noteId` 群を二次クエリで DB に問い合わせる必要がある。port に追加するメソッドの**戻り型**として以下の選択肢がある:

- **案A: 完全な `Note` を返す**（`hydrateMany` で `tagIds`/`internalLinkRefs`/`mediaIds` の child tables も含めて hydrate）
- **案B: 軽量プロジェクション**（`{ id, directoryId, slug, updatedAt }` のみを返す新型を導入）

案B は本 Issue の用途では child fetch を省けるため I/O を最小化できる。一方、port API が一気に増え、`Note` 集約の不変条件（child tables を持つ）から外れる「半端な型」を domain layer に持ち込むことになる。

`SEARCH_LIMIT_MAX = 50` であり、`hydrateMany` の child fetch は 3 並列クエリ × max 50 host-vars に閉じる。コスト差は実測で数 ms オーダーで、UX に影響しない範囲。

### Decision

**案A を採用**。`findByIds(ids: readonly NoteId[]): Promise<readonly Note[]>` を port に追加し、adapter は `selectInChunks` + `hydrateMany` で実装する。順序は保証せず、欠落 id は結果から単に欠落する（404 ではない）旨を JSDoc に明記する。

### Consequences

- 良い点: port の semantics が `Tag.findByIds` / `PublicationState.findByNoteIds` と完全に揃う。`Note` 集約の不変条件を保ち、将来の他用途（例: bulk export, audit）でも再利用可能。
- トレードオフ: child tables の余剰 fetch が乗る。本 Issue の用途では `updatedAt` / `directoryId` / `slug` しか使わないため、3 並列の child クエリは無駄。ただし SEARCH_LIMIT_MAX のオーダーでは数 ms 程度。

### UoW の分離方針

`searchOwnNotes` は既に `resolveDirectoryPathPrefix` のために `directoryId` 指定時 1 回 UoW を開いている。本 Issue で追加する `findByIds` の二次クエリは:

- **採用**: `SearchService.runQuery` の後段で**独立した read-only UoW** を開いて `findByIds` を呼ぶ（既存 UoW#1 とは時系列で分離）。
- **不採用**: `resolveDirectoryPathPrefix` の UoW を本体まで延長し、index query 後の `findByIds` も同じ UoW context で実行する。

採用案の根拠:
- D1 read-only UoW の開始コストは `BEGIN DEFERRED`/`COMMIT` 程度で実質ゼロ（書き込みなし）。
- 既存 `resolveDirectoryPathPrefix` の UoW は `DirectoryService.computePath` の同期処理に限定された短命 scope で、scope を引き伸ばすと「途中で SearchIndex の RPC 待ちを抱える長命 UoW」になり、D1 セッション保持時間が読みづらくなる。
- 中間に走る `SearchService.runQuery` は別ストレージ（SearchIndex）への RPC で、トランザクション境界に含める意味がない。index lag は既に eventual consistency（ADR-002）。

---

## ADR-002: search hit にあるが DB に無い id は throw / log せず結果から drop

### Status
Proposed

### Context

search index は eventually consistent (`.issue/29/adr.md` ADR-001)。purge worker と index relay の間で短時間の窓では、index に hit が残っているのに DB から row が消えているケースが理論上起こりうる。`findByIds` がそういう id をミスした場合の挙動:

- **案A: throw する**（"data integrity error"）
- **案B: ログを出して該当 hit を結果から drop**
- **案C: 黙って drop**（throw も log もしない）

### Decision

**案C を採用**。理由:

- **案A**: 検索ページ全体が 500 になり UX が極端に悪化する。search index lag は仕様内の挙動 (`.issue/29/adr.md` ADR-001) で、ユーザに見えるべきエラーではない。
- **案B**: 毎回 lag ウィンドウで warning ログが噴出し、運用ノイズになる。本質的に異常ではない事象を log すべきでない。
- **案C**: UI に死リンクを出さず、検索結果が静かに 1 件減るだけ。最も保守的な挙動。

### Consequences

- 良い点: eventual consistency と UX を両立。`nextCursor` は index 起点なので drop 後でも次ページ取得は変わらず動く。
- トレードオフ: 内部不整合（hit に対応する note が本当に欠落している）が起きていても気付けない。ただし lag ウィンドウ外で持続的に発生するなら別の障害シグナル（purge worker 失敗等）で検知される想定。本 Issue では監視 hook を追加しない（場所と metric 設計は purge worker 側の責務、別 Issue で扱う）。
- **`count` への影響**: 本ポリシーにより、`searchOwnNotes` 戻り値 `hits` 自体が drop 後の配列となる。`loaders.ts` の `count: result.hits.length` は drop 後の件数を反映する（既存式のまま意味だけが変わる）。UI 表示 `{count} 件のノート` は描画件数と完全一致するため不整合は起きない。

---

## ADR-003: 共有 DTO `SearchHitDTO` は触らず、新 `OwnedSearchHitDTO` を分離する

### Status
Proposed

### Context

`SearchHitDTO` (`app/core/application/dto/search.ts`) は `searchOwnNotes.ts` だけでなく `searchPublicNotes.ts` でも使われている共有 DTO。`searchOwnNotes` の戻り要素に `directoryId` / `slug` / `updatedAt` を載せる方法:

- **案A: `SearchHitDTO` 自体に optional フィールドを追加**
- **案B: `SearchHitDTO` を crossreference で extend した新 DTO を別名で導入**

### Decision

**案B を採用**。`OwnedSearchHitDTO = SearchHitDTO & Readonly<{ directoryId: string; slug: string; updatedAt: string }>` を `dto/search.ts` に追加し、`toOwnedSearchHitView(hit, note)` を `search/view.ts` に追加する。

理由:
- 公開検索 (`searchPublicNotes`) には `directoryId` を載せる権限・必要性が無い（owner-scope 情報）。共有 DTO に optional で混ぜると意図が型から読み取れなくなる。
- `.issue/13` ADR-003 の「sentinel 値を型から消す」と同じ温度感: optional は呼び出し側で `?.` チェックを要求し、まさに本 Issue が解消したい projection 退化形と同じ匂いの型を産む。

### Consequences

- 良い点: 共有 DTO の責務が明確に保たれる。owner-scope 検索固有のフィールドは別 DTO に閉じる。`searchPublicNotes` への影響ゼロ。
- トレードオフ: DTO が 1 つ増える。命名規約を覚える負荷がやや増えるが、`Owned` prefix で意味は明白。

---

## ADR-004: `OwnedNotesResult.kind` discriminant は pagination セマンティクス差異のために存続

### Status
Proposed

### Context

本 Issue の変更後、`OwnedNoteSearchItem` と `OwnedNoteFilterItem` は field-for-field 同形になる。`OwnedNotesResult` の discriminated union `kind: "filter" | "search"` を残すか撤廃するかの判断:

- **案A: `kind` discriminant を撤廃**（フィールドが同形なので不要）
- **案B: `kind` discriminant を存続**（pagination セマンティクスの差異を型レベルで保持）

両者の戻り型差異:
- filter 経路 (`listNotesByOwner`): page/offset pagination、`count` は全件数、`nextCursor` は常に `null`
- search 経路 (`searchOwnNotes`): cursor pagination、`count` は描画件数 (`hits.length`)、`nextCursor` は index 起点の値

### Decision

**案B を採用**。`kind` discriminant を残す。

理由:
- フィールド形は同じでも、`count` / `nextCursor` の**意味**が異なる。`kind` が読み手に「これは search 経路の結果」と教える ground truth として機能する。
- UI 側の `searchActive = kind === "search"` 等の判定が既存コードに散らばっており、`kind` を撤廃するとそれら全てを「`search.q` の有無で再判定」に書き換える必要がある。本 Issue のスコープ膨張を避ける。
- 将来 search 専用フィールド（score, snippet highlight 等）を `OwnedNoteSearchItem` に載せる需要が出たとき、`kind` discriminant があれば自然に拡張できる。

### Consequences

- 良い点: 既存 consumer の最小変更で済む。pagination セマンティクスが型レベルで残る。
- トレードオフ: フィールド形が同じなのに union を残すのは一見冗長。JSDoc で「discriminant が pagination 方式の違いを表す」と明記して意図を残す。
