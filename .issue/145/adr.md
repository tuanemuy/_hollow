# ADR — Issue #145: search dispatch routing 拡張

## ADR-001: NoteSnapshot の再構築は dispatcher 側で行う

### Status
Proposed

### Context
`handleNoteSavedEvent` / `handlePublicationChangedEvent` は input として `NoteSnapshot` を受け取る設計だが、`note.*` / `publication.*` event の payload には NoteSnapshot は含まれず、`noteId` 等の最小情報のみ。spec/usecases/search.md は「payload に NoteSnapshot を含める」と書いているが、実装の event payload とは不整合。3 つの選択肢があった:

- A1: dispatcher 側で `noteRepository.findById` → `buildNoteSnapshots` で再構築し handler に渡す
- A2: handler が `{ noteId }` を受けて handler 内部で snapshot 構築する
- A3: emit 側（save usecase 等）で event payload に NoteSnapshot を含める

### Decision
**A1（dispatcher 側で再構築）を採用**。

### Consequences

- 良い点:
  - 既存 handler の input シグネチャ（`{ snapshot }`）を維持できる（3 handler + テスト改修不要）
  - event payload を最小に保てる（outbox queue の serialization 負荷が小さい）
  - search domain の「Note の他リポジトリを直接参照しない」原則を守れる（dispatcher は application 層）
  - emit 時点ではなく consume 時点（最新スナップショット）で index に反映される
- トレードオフ:
  - dispatcher の責務が「pure routing」から「routing + aggregate 再構築」に拡大（旧 ADR-001 (#57) の dispatch 純粋性原則からの逸脱）
  - dispatch あたり 1 UoW 開設のオーバーヘッド（4 repository 読み出し）が relay/queue スループットに乗る
  - dispatcher が `ConsumerContainer`（旧 RequestContainer から拡張）に依存

### Boundary（責務拡大の境界）

dispatcher 側 UoW 開設は **note.* / publication.* event の routing にのみ許容される例外**として位置づける。ingestion / export 系の handler は `RequestContainer` を直接受け、`runIngestionJob` / `runExportJob` 内部で UoW を開く設計のままにする（dispatcher → usecase の責務分離を維持）。

理由: search 側 handler は `WorkerContainer` を要求するうえ、handler の input が `NoteSnapshot` で「event payload に snapshot は無いが handler は snapshot 必須」という構造的不整合があるため、dispatcher で aggregate を集約する必要が生じる。ingestion / export には同様の構造的不整合がないため UoW 開設を持ち込まない。将来的に同様の event を追加する場合は、event payload に必要情報を含めるか、handler の入力を `noteId` ベースに変えるかで dispatcher の責務拡大を回避することが望ましい。

---

## ADR-002: 物理 note event ↔ search handler のマッピング

### Status
Proposed

### Context
spec/usecases/search.md は `note.saved` / `note.deleted` / `note.publish_changed` の 3 event 型を前提にしていたが、実装の event 型は `note.created` / `content_updated` / `renamed` / `moved` / `restored` / `trashed` / `purged` / `tags_replaced` / `publish_changed` の 9 種類。`handleNoteSavedEvent` の JSDoc に「note event の論理集約名」と読める表現があり、複数物理 event を 1 handler に routing する設計と推察できる。

### Decision
以下のマッピングを採用:

| 物理 event | search handler | publication handler |
|---|---|---|
| `note.created` | `handleNoteSavedEvent` (upsert) | — |
| `note.content_updated` | `handleNoteSavedEvent` (upsert) | — |
| `note.renamed` | `handleNoteSavedEvent` (upsert) | — |
| `note.moved` | `handleNoteSavedEvent` (upsert) | — |
| `note.restored` | `handleNoteSavedEvent` (upsert) | — |
| `note.tags_replaced` | `handleNoteSavedEvent` (upsert) | — |
| `note.trashed` | `handleNoteTrashedEvent` (delete) | publication.`handleNoteTrashedEvent` |
| `note.purged` | `handleNoteTrashedEvent` (delete) | — (別 handler `handleNotePurgedEvent` あり) |
| `note.publish_changed` | `handlePublicationChangedEvent` (upsert) | — |

### Consequences

- 良い点:
  - 「論理 event = 複数物理 event の集約」を明示化（spec の意図を保ちつつ実装と整合）
  - `note.purged` を search delete に流すことで「trashed イベントを取りこぼした場合」の補完経路にもなる（冪等なので二重 delete も OK）
- トレードオフ:
  - `note.created` 直後に `note.content_updated` がほぼ同時に流れるパターンで IndexJob が 2 件 enqueue される（冪等で問題ないが、稼働率は上がる）

---

## ADR-003: `note.trashed` の fan-out は dispatcher 内で順次 await

### Status
Proposed

### Context
`note.trashed` は search 側 `handleNoteTrashedEvent` (delete) と publication 側 `handleNoteTrashedEvent` (PublicationState 更新 + ShareLink 失効) の両方が consume する必要がある。1 event → 複数 handler の fan-out をどう実現するか:

- (a) dispatcher の switch case 内で 2 つの handler を順次 await
- (b) `handleNoteTrashedComposite` 合成関数を別途用意
- (c) outbox 段階で event を多重化（fan-out）

### Decision
**(a) dispatcher 内で順次 await** を採用。

### Consequences

- 良い点:
  - 抽象化過剰を避ける（YAGNI — handler 数は固定 2）
  - error classification（既存 try/catch）の枠組みをそのまま使える
- トレードオフ:
  - dispatcher 内で 2 handler が直列実行（並列化していない）。各 handler が UoW を開くため、合計 2 UoW 開設のコストがかかる
  - partial commit のリスク（1 つ目成功 → 2 つ目失敗 → 全体 retry → 1 つ目再実行）は at-least-once + idempotent の前提通り。許容

---

## ADR-004: spec/usecases/search.md の event 名修正方針

### Status
Proposed

### Context
spec/usecases/search.md は `note.saved` / `note.deleted` という存在しない event 型を前提に書かれている。実装の event 型に揃える書き換えが必要。

### Decision
**A 案: 実装の物理 event 名を列挙し、論理集約名であることを注記**。

具体的な書き換え方針:
- セクション「HandleNoteSavedEvent / HandleNoteTrashedEvent / HandlePublicationChangedEvent」の「入力DTO」「処理フロー」を物理 event 名で書き直す
- 「論理 `note.saved` ⊃ 物理 `note.created` / `note.content_updated` / ...」と明示
- `spec/domains/index.md` の event 購読対応表にも同じ集約マッピングを注記
- NoteSnapshot は payload に含めず dispatcher が再構築する旨を明文化（ADR-001 と整合）

### Consequences

- 良い点: 実装と spec の用語が一致し、新規参加者が混乱しない
- トレードオフ: 「note.saved」という抽象概念を保ちつつ「物理 event の集約」と注記する二段構造になる（読み手の認知負荷は若干上がる）

---

## ADR-005: dispatchDomainEvent.test.ts の skipped assertion 整理

### Status
Proposed

### Context
既存の `dispatchDomainEvent.test.ts` は「intentionally not dispatched」テストとして `note.trashed` などを skipped に固定している。本 Issue で routing 拡張するため assertion を更新する必要がある。

### Decision
- **削除**: `note.trashed` / `note.purged` / `note.publish_changed` 及び save 系 6 event の skipped assertion
- **追加**: 各 event の handled / fan-out / Note 不在 handled / BusinessRule handled / transient retry / share_link skipped 維持の network テスト
- **継続**: `ingestion.regenerated` / `ingestion.previewAttached` / `share_link.*` の skipped（regression guard）

### Consequences

- 良い点: 新 routing が全て regression テストでカバーされる
- トレードオフ: テスト件数が大幅に増える（既存 ingestion / export 系と同程度のボリューム）

---

## ADR-006: IndexJob drainer 不在問題をスコープに含める

### Status
Proposed

### Context
Issue 本文は「dispatch を拡張すれば worker が走る」と読めるが、調査の結果 production には IndexJob を drain する worker entry が存在しない（`app/worker/cloudflare/` 配下に該当ファイルなし、`wrangler.toml` にも該当 cron 配置なし）。dispatch を繋いでも IndexJob テーブルに行が溜まるだけで search_documents は更新されない。

選択肢:
- (i) drainer 不在のままにして、別 Issue として切り出す
- (ii) 本 Issue で drainer worker entry を新設する

### Decision
**(ii) 本 Issue で drainer worker entry も新設する**。

### Consequences

- 良い点:
  - 本 Issue で「production の search-index 書き込み経路を完成させる」という意図を満たせる（dispatch 単体修正では事実上動かない）
  - relay/pruner と同じパターンで実装できるため追加コストが限定的
- トレードオフ:
  - 実装スコープが拡大（worker entry 1 ファイル + wrangler.toml 設定 + docs）
  - 関連 deploy 設定（CI/CD 等）の更新が必要になる可能性

### DLQ 行の運用方針

`consumeIndexJob` は `attempts >= 3` で outcome `dlq` を返し、`recordAttempt + fail` で `index_jobs` 行に `last_error` を埋めて attempts を進める。queue を持たない drainer 設計では「dlq 行は `index_jobs` テーブルに残留する」だけになる。

- `D1IndexJobRepository.nextBatch` は `attempts < CONSUME_INDEX_JOB_MAX_ATTEMPTS` で除外することを実装で確認したうえで `processIndexJobs` を呼ぶ（無限 retry を防ぐ）
- dlq 行は admin の手動オペレーション（`bulkRebuildFromSnapshots` または `index_jobs` 直接操作）で re-drive する運用
- `docs/runtime_cloudflare.md` の indexer worker 節に dlq 行の確認方法と re-drive 手順を明記
- 将来的に admin UI で `index_jobs WHERE attempts >= 3` を可視化する機能は本 Issue 範囲外（別 Issue 候補）

---

## ADR-007: trashed status guard

### Status
Proposed

### Context
`buildSnapshotByNoteId` helper が `noteRepository.findById` で取得する Note には `status: 'active' | 'trashed'` が含まれるが、search 側の `NoteSnapshot` 型には status フィールドが無く、`buildNoteSnapshots` も status を見ない。

ここで問題になるのが outbox の順序保証無しの仕様。`publication.changeVisibilityAndCascade` は trash 時に `note.publish_changed` を emit するため、search 側で以下のシーケンスが起こり得る:

1. `note.trashed` を dispatch → search delete IndexJob enqueue → drainer が処理して index から削除
2. （順序保証無し）`note.publish_changed` を dispatch → dispatcher が `findById` で trashed note を取得 → buildNoteSnapshots が status を無視して snapshot を作成 → search upsert IndexJob enqueue → drainer が処理して **index に蘇生**

これは bulkRebuild の発動まで持続する不整合で、eventual consistency としても問題（rebuild は admin の意図的操作で日常的に走らない）。

### Decision
`buildSnapshotByNoteId` helper の中で、`note !== null && note.status === 'trashed'` を **null 扱い**として返す。dispatcher は null を受けたら handled + logger.info で skip。

具体的には `findById` の戻り値判定を 3 段階に整理:

1. `note === null`（purge 等で消えた）→ null
2. `note.status === 'trashed'` → null
3. `note.status === 'active'` → `buildNoteSnapshots([note], deps)` の配列要素 0 を返す

### Consequences

- 良い点:
  - 蘇生レースを根本から塞ぐ（dispatcher 単体の責務として扱える）
  - NoteSnapshot 型 / `buildNoteSnapshots` を変更しないので影響範囲が dispatcher に閉じる
  - 「trashed なノートは search index に乗らない」という不変条件を 1 箇所に集約
- トレードオフ:
  - trashed status guard が dispatcher の責務に追加される（ADR-001 の責務拡大とセット）
  - 将来「trashed note も検索結果に表示したい（trash bin search）」要件が出た場合、status guard を緩める必要がある。その時は search domain 側で trashed フィルタを適切な層で実装し直す前提（現状は search index に乗せない方針）

### 関連テスト

`dispatchDomainEvent.test.ts` で以下を追加:
- save 系 6 event のいずれかで `findById` が trashed note を返す → handled + logger.info で skip、`handleNoteSavedEvent` は呼ばれない
- `note.publish_changed` で `findById` が trashed note を返す → 同上、`handlePublicationChangedEvent` は呼ばれない
