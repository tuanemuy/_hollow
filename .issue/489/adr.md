# ADR — Issue #489: presentation → domain の id 型漏れ全スライス解消

## ADR-001: worker / domain event 起点の usecase は本 Issue の対象外とし、検証は worker に残す

### Status
Accepted

### Context

本 Issue は「presentation → domain の id 型漏れ」を解消するもの。一方、`runExportJob` / `runIngestionJob` および各 `handle*Event`（`export.handleUserDeletedEvent`, `publication.handleNotePurgedEvent` / `handleNoteTrashedEvent` / `handleUserDeletedEvent`, `search.handleNoteTrashedEvent`, `note.handleLinkTargetResolution` / `handleLinkTargetTrashed`, `view.handle*` 等）は **presentation からは呼ばれず**、`app/core/application/workers/dispatchDomainEvent.ts` から呼ばれる。dispatcher は outbox ペイロードの生 string から `NoteId.create(payload.noteId)` / `UserId.create(payload.ownerId)` / `ExportJobId.create(payload.exportJobId)` / `IngestionJobId.create(payload.jobId)` 等で**検証済みブランド**を構築してから handler / usecase に渡している。この worker レベルの検証契約は `dispatchDomainEvent.test.ts` に pin されている（例: 空 `exportJobId` のとき `runExportJob` を呼ばず warn ログ）。

これは #482 ADR-001 が `runExportJob` について定めた方針と同じ構図である。本 Issue でこれらの handler/usecase の入力まで string 化すると、(1) 検証ロジックを usecase 内へ移すか worker に残すかの判断が新たに必要になり、(2) presentation 漏れ解消という Issue の主旨から外れ、(3) `dispatchDomainEvent.test.ts` の検証契約に手を入れるリスクが生じる。

なお `runExportJob`（#482 で済み）と `runIngestionJob`（既存で `jobId: string`）は既に入力が string で、検証は worker（dispatcher）に残っている。残る handler 群は入力がブランドのままだが、これらも dispatcher が `.create()` で検証して渡している。

### Decision

**worker / domain event 起点の usecase・handler は本 Issue の対象外とし、検証は呼び出し元 worker（`dispatchDomainEvent.ts`）に残す。** #482 ADR-001 を踏襲する。

- presentation から呼ばれない handler の入力ブランドはそのまま維持する（presentation 漏れではないため）。
- 既に string 化されている `runExportJob` / `runIngestionJob` の方針も変えない。
- 本 Issue で string 化するのは「presentation 起点で呼ばれる usecase」に限定する。

### Consequences

- 良い点:
  - `dispatchDomainEvent.test.ts` の worker 検証契約を一切変えずに済み、挙動変更ゼロを保証できる。
  - Issue の主旨（presentation → domain 漏れ解消）にスコープを集中できる。
  - #482 ADR-001 と一貫した方針になる。
- トレードオフ:
  - worker 起点 handler の入力は引き続きブランド型のまま（presentation 起点 usecase との型契約に統一感はないが、それぞれ「検証はどこで行うか」が異なるため別契約で正しい）。

---

## ADR-002: `listNotesByOwner` / note `loaders.ts` の `directoryId` / `referencingNoteId` の検証は loader（transport boundary）に残し、usecase 入力を string 化する

### Status
Accepted

### Context

note の home / list loader（`app/components/note/loaders.ts` の `loadOwnedNotes`）は、URL 由来の `?directoryId=...` / `?referencingNoteId=...` を受け取り、現状以下のように扱っている:

```ts
let directoryId: DomainDirectoryId | undefined;
if (input.directoryId != null) {
  try { directoryId = DomainDirectoryId.create(input.directoryId); }
  catch { directoryId = undefined; }  // 不正 id は「フィルタなし」に黙ってフォールバック
}
```

これは「不正な URL パラメータでローダ全体を 500 にせず、サイドバー選択を素通りさせる」という **transport-boundary の graceful degradation**（コメントに明記）である。`listNotesByOwner` の入力型はこれらを `DirectoryId` / `NoteId` ブランドで受けており、loader が `.create()` で検証してブランドを渡している。

usecase 入力を `string` に統一する際、この `.create()` 検証を (A) usecase 内へ移す か (B) loader に残す（loader は検証後も string を渡せるよう usecase 入力を string 化する）の選択がある。

(A) を選ぶと、不正 id 時の挙動が「黙ってフィルタなし」から「`BusinessRuleError` で 500」へ変わってしまい、**挙動変更**になる（home ページが壊れる）。CLAUDE.md の input validation 方針では「transport boundary（URL params）での検証」と「value-object construction での invariant 検証」を 2 点で行うとされており、URL params 由来の graceful fallback は transport boundary（loader）の責務。

### Decision

**検証（`.create()` + graceful fallback）は loader（transport boundary）に残す。** `listNotesByOwner` / `searchOwnNotes` の `directoryId` / `referencingNoteId` / `tagIds` 入力型を `string`（`tagIds` は `readonly string[]`）に string 化し、loader は検証通過後の string をそのまま渡す。usecase 内部で domain サービス・リポジトリ呼出直前に `as DirectoryIdBrand` 等で橋渡しする。

- loader の `DomainDirectoryId.create()` / `DomainNoteId.create()` の try/catch fallback ロジックは**そのまま維持**する（挙動不変）。ただし検証成功後は `directoryId`（string）として usecase に渡す（ブランドに変換した値の `.toString()` 等は不要 — ブランドは構造的に string なので、検証用に `.create()` した結果を捨てて元の string を渡すか、`.create()` を「検証のみ」に使い元 string を渡す形にする）。
  - 実装簡略化: `.create()` は検証目的で呼び、成功時は元の `input.directoryId`（string）を usecase に渡す。これで検証ロジックも挙動も完全に温存される。
  - **ゲート（条件付きスプレッド）を必ず維持する。** 現 loader は `DomainDirectoryId | undefined` を作り `...(directoryId !== undefined ? { directoryId } : {})` で「無効 id は key 自体を省略＝フィルタなし」を実現している。string 化後も「`.create()` 成功時のみ key を含める／失敗時は省略」というゲートを保つこと（有効性を boolean フラグ or `string | undefined` で保持し、条件付きスプレッドを維持）。「検証成功後に元 string を無条件で渡す」と誤読して無効 id をそのまま usecase へ流すと graceful fallback が崩れるので注意。
- `searchOwnNotes` の `directoryId` は既に `string | null`、`tagNames` は `string[]` なので、`actorUserId` の string 化のみ（`SearchQuery.create({ ownerIdFilter: input.actorUserId as UserId })` の 1 箇所橋渡し）。

### Consequences

- 良い点:
  - 不正 URL パラメータ時の graceful fallback 挙動が完全に温存される（挙動変更ゼロ）。
  - transport boundary の検証責務が loader に残り、CLAUDE.md の input validation 2 点方針と整合する。
  - usecase 入力契約は他スライスと同じく string に統一される。
- トレードオフ:
  - usecase は受け取った `directoryId` / `referencingNoteId` string が「検証済み」であることを型では表現しない。ただし presentation 起点の他 id（`noteId` 等）と同じ前提（zod / `.create()` で検証済みの string を渡す）であり、一貫している。
  - loader で `.create()` を「検証のみ」に使い結果を捨てる形になるため、意図が分かるコメントを残す（why コメント）。
