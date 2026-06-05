# 実装計画 — Issue #489: presentation → domain の id 型漏れを全スライスで解消し usecase の id 入力を string に統一する

**Issue:** #489
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

#473（DTO ブランド廃止・id 入力の string 統一）と #482（export スライスの `ExportJobId` 入力 string 化）の延長として、**残る全スライスの presentation → domain の id 型漏れ**を解消する。presentation から domain valueObject の id 型 import と剥がしキャストを除去し、presentation 起点で呼ばれる usecase の id 入力型をプリミティブ `string` に統一する。domain 境界への橋渡し（`input.xxxId as XxxIdBrand`）は usecase 内部に閉じ込める。挙動変更を伴わない型レベルのリファクタ。

## 前提（重要）

- **本作業は `main` から分岐すること。** 現在のブランチ `issue/486/settings-shared-shell` は #482（PR #488）・#491 を含んでいない（`git merge-base --is-ancestor 8bcc5e0 HEAD` が `no`）。`main` には #482 がマージ済みで、export スライスの `jobId` は既に string 化されている。`main` を起点にしないと export スライスが未着手に見え、二重作業・コンフリクトの原因になる。
- 以下の調査・ファイルパス・行番号はすべて `main` の状態を基準にしている。

## スコープ

### 含まれるもの

presentation 起点で呼ばれる usecase の **id 入力型（`UserId` / `NoteId` / `NoteRevisionId` / `DirectoryId` / `MediaAssetId` / `TagId` / `ShareLinkId` / `ExportJobId` 等）を `string` に統一**し、domain 境界への `as XxxIdBrand` 橋渡しを usecase 内部に閉じ込める。あわせて presentation 側の id 型 import と剥がしキャストを除去する。対象スライス:

- **export 残り**（#482 で `jobId` のみ string 化。`actorUserId: UserId` / `targetNoteId: NoteId` / `noteIds: NoteId[]` 等が未着手）
- **note**（actions.ts / loaders.ts）
- **publication**（PublishSettings/action.ts）
- **media**（actions.ts / `routes/media/$mediaId.tsx`）

### 含まれないもの

- **ingestion スライス（usecase 側）は既に完了済み。** `commitIngestionPreview` / `getIngestionJob` / `uploadFile` / `discardIngestionPreview` / `regenerateIngestionPreview` / `ownerRetryIngestionJob` / `getIngestionJobs` / `runIngestionJob` はすべて `actorUserId: string` / `jobId: string` 済みで、`ingestion/actions.ts` も id キャストを行っていない。本 Issue でやることは無い。
- **`app/components/ingestion/schema.ts` / `app/components/note/editor/DirectoryPicker.tsx` の `MAX_DIRECTORY_DEPTH` import は対象外。** これは id 型ではなく**定数**（DoS キャップ算出・表示文言）として正当に使われている。Issue の「影響範囲」リストは `valueObject` import の機械的 grep で挙がったもので、id 型漏れではない。除去すると DoS キャップのソースを失う。スコープ外とする。
- **worker / domain event 起点の usecase は対象外**（#482 ADR-001 踏襲）。`runExportJob`（既に string）・`runIngestionJob`（既に string）・各 `handle*Event`（`handleUserDeletedEvent` / `handleNotePurgedEvent` / `handleNoteTrashedEvent` / `handleLinkTargetResolution` / `handleLinkTargetTrashed` 等）は `app/core/application/workers/dispatchDomainEvent.ts` から `XxxId.create(payload.xxx)` で**検証済みブランド**を渡されており、presentation からの id 漏れではない。検証は worker に残す（ADR-001）。詳細は本計画 ADR-001 を参照。
- **presentation から呼ばれない内部 usecase は対象外**。`listMediaByOwner`（presentation 呼出なし）・`backfillInternalLinkResolution`・`purgeTrashOlderThan`・`getBacklinks`・`listNotesInDirectory`・`searchPublicNotes` / `searchUserPublicNotes`（公開側ルート経由だが本 Issue の 10 ファイルに含まれない）等は、本 Issue の「presentation → domain 漏れ解消」対象 10 ファイルから呼ばれていない限り変更しない。ただし呼出元が対象スライスにある場合は連動して変更する（下記ステップ参照）。
- DTO 層（`app/core/application/dto/`）は #473 で既に出力型が `string` 化済み。残る valueObject import は `InternalLinkRef` / `ViewQuery` / `IngestionPreview` / `SearchHit` 等の**値型**であり id 型漏れではない。対象外。
- テストの `as XxxId` キャストは入力型を `string` に広げると no-op（ブランド→string は構造的代入可）になり**型エラーにはならない**。挙動も変わらない。冗長キャスト除去は各スライス内で余裕があれば行う任意のクリーンアップとし、必須ではない（#473 でも `e27f198` 等で同種クリーンアップを行っているが本 Issue の必須要件ではない）。

## 調査結果サマリー

### presentation 側の id 漏れ実態（10 ファイルの精査結果）

| ファイル | id 型 import | 実態 | 対応 |
|---|---|---|---|
| `app/components/export/ExportForm/action.ts` | `ExportJobId`, `NoteId` | `jobId as ExportJobId`（cancel/download）, `targetNoteId as NoteId`（start）, `noteIds.map(as NoteId)`（enqueue） | import 除去・キャスト除去 |
| `app/components/export/ExportJobDetail/loader.ts` | `UserId` | `actorUserId: UserId`（型注釈） | import 除去・型を string に |
| `app/components/export/ExportJobsList/loader.ts` | `UserId` | `actorUserId: UserId`（型注釈） | import 除去・型を string に |
| `app/components/note/actions.ts` | `DirectoryId`, `NoteId`, `NoteRevisionId` | 多数の `as` キャスト（後述） | import 除去・全キャスト除去 |
| `app/components/note/loaders.ts` | `DirectoryId`, `UserId`, `NoteId`, `NoteRevisionId`, `TagId`（+ 値型 `PublicationVisibility`） | `as` キャスト + `.create()` 検証併用（後述、要注意） | id 漏れキャストを除去。`.create()` 検証は ADR-002 の判断に従う。`PublicationVisibility` は値型なので残す |
| `app/components/publication/PublishSettings/action.ts` | `NoteId`, `ShareLinkId` | `noteId as NoteId`, `shareLinkId as ShareLinkId`, `noteIds.map(as NoteId)` | import 除去・キャスト除去 |
| `app/components/media/actions.ts` | `MediaAssetId` | `mediaId as MediaAssetId`（finalizeUpload） | import 除去・キャスト除去 |
| `app/routes/media/$mediaId.tsx` | `MediaAssetId` | `mediaId as MediaAssetId`（downloadMedia） | import 除去・キャスト除去 |
| `app/components/ingestion/schema.ts` | `MAX_DIRECTORY_DEPTH`（**定数**） | DoS キャップ算出 | **対象外**（id 型ではない） |
| `app/components/note/editor/DirectoryPicker.tsx` | `MAX_DIRECTORY_DEPTH`（**定数**） | 表示文言 | **対象外**（id 型ではない） |

> 注: `app/components/export/ExportJobDetail/Page.tsx` / `app/routes/exports/$jobId.tsx` は #482 で既に string 化済み（`main` 上）。

### usecase 側の id 入力型（presentation 起点・要変更）

`main` 基準で id ブランドを入力型に取り、かつ presentation から呼ばれる usecase:

**export スライス（#482 で `jobId` のみ済み、`actorUserId`/`NoteId` 残り）**
- `getExportJob.ts` — `actorUserId: UserId`（`jobId` は string 済み）
- `cancelExportJob.ts` — `actorUserId: UserId`（`jobId` 済み）
- `downloadExportArtifact.ts` — `actorUserId: UserId`（`jobId` 済み）
- `listExportJobs.ts` — `actorUserId: UserId`
- `startExportJob.ts` — `actorUserId: UserId | null`, `targetNoteId: NoteId`
- `enqueueExportJob.ts` — `actorUserId: UserId`, `noteIds?: readonly NoteId[]`, `ViewQuerySnapshotInput`（`directoryId: DirectoryId | null`, `tagIds: readonly TagId[]`, `referencingNoteId: NoteId | null`）

**note スライス**
- `createNote.ts` — `actorUserId: UserId`, `directoryId: DirectoryId | null`
- `saveNote.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `saveNoteDraft.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `renameNote.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `moveNote.ts` — `actorUserId: UserId`, `noteId: NoteId`, `newDirectoryId: DirectoryId`
- `deleteNote.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `restoreNote.ts` — `actorUserId: UserId`, `noteId: NoteId`, `restoreDirectoryId: DirectoryId | null`
- `purgeNote.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `duplicateNote.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `bulkMoveNotes.ts` — `actorUserId: UserId`, `noteIds: readonly NoteId[]`, `newDirectoryId: DirectoryId`
- `bulkTrashNotes.ts` — `actorUserId: UserId`, `noteIds: readonly NoteId[]`
- `acquireEditLock.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `extendEditLock.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `releaseEditLock.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `searchInternalLinkTargets.ts` — `actorUserId: UserId`
- `restoreNoteRevision.ts` — `actorUserId: UserId`, `noteId: NoteId`, `revisionId: NoteRevisionId`
- `getNoteDetail.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `getNoteRevision.ts` — `actorUserId: UserId`, `noteId: NoteId`, `revisionId: NoteRevisionId`
- `listNoteRevisions.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `listNotesByOwner.ts` — `actorUserId: UserId`, `tagIds?: readonly TagId[]`, `referencingNoteId?: NoteId`, `directoryId?: DirectoryId`（**ADR-002 対象**）

**search スライス（note loaders から呼ばれる）**
- `searchOwnNotes.ts` — `actorUserId: UserId`（`directoryId` は既に string、`tagNames` は string）

**publication スライス**
- `changePublicationVisibility.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `issueShareLink.ts` — `actorUserId: UserId`, `noteId: NoteId`
- `revokeShareLink.ts` — `actorUserId: UserId`, `shareLinkId: ShareLinkId`
- `setShareLinkPassword.ts` — `actorUserId: UserId`, `shareLinkId: ShareLinkId`
- `bulkChangePublicationVisibility.ts` — `actorUserId: UserId`, `noteIds: readonly NoteId[]`
- `listShareLinks.ts` — `actorUserId: UserId`, `noteId: NoteId`

**media スライス**
- `finalizeUpload.ts` — `actorUserId: UserId`, `mediaId: MediaAssetId`
- `uploadMediaPresigned.ts` — `actorUserId: UserId`（mediaId は presentation 入力なし）
- `downloadMedia.ts` — `viewerUserId: UserId | null`, `mediaId: MediaAssetId`, `viaShareLinkId: ShareLinkId | null`, `relatedNoteId: NoteId | null`

> `uploadMedia.ts`（`actorUserId: UserId`）は presentation から直接呼ばれるか要確認（呼出元なしの場合は内部のみ＝対象外）。実装時に `grep uploadMedia` で確認すること。

### 依存関係（呼出元の連鎖）

usecase 入力を `string` に**広げる**方向の変更なので、ブランドを渡す既存呼出元（presentation / worker / 他 usecase / テスト）はすべて構造的に互換（ブランドは string のサブタイプ）。逆方向の破壊は起きない。

**ただし例外: 入力 → 出力フィールドを経由する narrowing。** 入力 `noteIds` から取り出したループ変数を、ブランド型の**出力フィールド**（バルク失敗結果 `*Failure.noteId: NoteId`）へ代入している usecase（`bulkTrashNotes` / `bulkMoveNotes` / `bulkChangePublicationVisibility`）では、入力を `string[]` に広げるとループ変数が `string` になり、ブランド出力フィールドへの代入が narrowing で typecheck エラーになる。これらは出力型も `string` 化する（各スライスのステップ参照）。

確認済みの cross-usecase 呼出:

- `bulkChangePublicationVisibility` → `changePublicationVisibility`（ブランド `noteId`/`actorUserId` を渡す。callee を string に広げても互換）
- `enqueueExportJob` → `startExportJob`（ブランドを渡す。互換）
- `search/index.ts` → `searchOwnNotes` の re-export（型は透過）

### DTO 層の状態

#473 で出力型は `string` 化済み。`dto/*.ts` の残 valueObject import は値型のみ（id 型漏れなし）。対象外。

## 実装ステップ

各スライス独立。1 スライスずつ「usecase 入力型を string に → presentation の import/キャスト除去 → `pnpm typecheck`」のサイクルで進める。**スライス間に依存はない**ので順不同で良いが、export は #482 の続きなので最初に着手し ADR-001/002 の判断を固める。

### ステップ 0: ブランチ準備

- `main` から `issue/489/id-string-input` を作成する（前提セクション参照）。

### ステップ 1: export スライス残り

- **usecase（`as ExportJobIdBrand` パターンに揃える。`actorUserId`/`NoteId`/`DirectoryId`/`TagId` を string 化し、`.findById` / domain 呼出直前で `as Brand` 橋渡し）:**
  - `app/core/application/export/getExportJob.ts` — `actorUserId: UserId` → `string`。`ExportJob.assertOwnedBy(found.entity, input.actorUserId as UserIdBrand)` で橋渡し
  - `app/core/application/export/cancelExportJob.ts` — `actorUserId: UserId` → `string`
  - `app/core/application/export/downloadExportArtifact.ts` — `actorUserId: UserId` → `string`
  - `app/core/application/export/listExportJobs.ts` — `actorUserId: UserId` → `string`
  - `app/core/application/export/startExportJob.ts` — `actorUserId: UserId | null` → `string | null`, `targetNoteId: NoteId` → `string`。domain 呼出直前で `as` 橋渡し
  - `app/core/application/export/enqueueExportJob.ts` — `actorUserId: UserId` → `string`, `noteIds?: readonly NoteId[]` → `readonly string[]`, `ViewQuerySnapshotInput` の `directoryId`/`tagIds`/`referencingNoteId` を string 化。内部の `Map<NoteId,...>` 等は橋渡し後のブランドで型付けしたまま
- **presentation:**
  - `app/components/export/ExportForm/action.ts` — `ExportJobId`/`NoteId` import 除去。`targetNoteId: data.noteId`（start）, `noteIds: data.noteIds`（enqueue, `.map(as NoteId)` 除去）, `jobId: data.jobId`（cancel/download, #482 で済みだが現状残るキャスト除去）
  - `app/components/export/ExportJobDetail/loader.ts` — `UserId` import 除去。`actorUserId: string`
  - `app/components/export/ExportJobsList/loader.ts` — `UserId` import 除去。`actorUserId: string`
- **理由:** #482 が `jobId` のみ string 化し `actorUserId`/`NoteId` を残したため。`retryExportJob` / `getExportJob`（#482 後）のパターンに完全に揃える。

### ステップ 2: note スライス

- **usecase（各ファイルで `actorUserId`/`noteId`/`directoryId`/`revisionId`/`noteIds`/`newDirectoryId`/`restoreDirectoryId` 等を string 化し、domain 境界で `as Brand` 橋渡し）:**
  - `createNote.ts`, `saveNote.ts`, `saveNoteDraft.ts`, `renameNote.ts`, `moveNote.ts`, `deleteNote.ts`, `restoreNote.ts`, `purgeNote.ts`, `duplicateNote.ts`, `bulkMoveNotes.ts`, `bulkTrashNotes.ts`, `acquireEditLock.ts`, `extendEditLock.ts`, `releaseEditLock.ts`, `searchInternalLinkTargets.ts`, `restoreNoteRevision.ts`, `getNoteDetail.ts`, `getNoteRevision.ts`, `listNoteRevisions.ts`（すべて `app/core/application/note/` 配下）
  - `listNotesByOwner.ts` — `actorUserId` を string 化。`tagIds`/`referencingNoteId`/`directoryId` は **ADR-002 の判断に従う**
  - `app/core/application/search/searchOwnNotes.ts` — `actorUserId: UserId` → `string`。`SearchQuery.create({ ownerIdFilter: input.actorUserId as UserIdBrand, ... })` で橋渡し
- **バルク系 usecase の出力型も string 化（重要・typecheck 連動）:**
  - `bulkTrashNotes.ts` — `BulkTrashNoteFailure.noteId: NoteId` → `string`、`describeFailure` の引数型も `string` に。入力 `noteIds` を `readonly string[]` に広げるとループ変数 `noteId` が `string` になり、それを `NoteId` 型の出力フィールドへ代入する箇所が narrowing で typecheck エラーになるため。
  - `bulkMoveNotes.ts` — `BulkMoveNoteFailure.noteId: NoteId` → `string`（同上）
- **presentation:**
  - `app/components/note/actions.ts` — `DirectoryId`/`NoteId`/`NoteRevisionId` import 除去。全 `as` キャストを除去（`createNote`/`saveNote`/`renameNote`/`moveNote`/`deleteNote`/`restoreNote`/`purgeNote`/`duplicateNote`/`bulkMoveNotes`/`bulkTrashNotes`/`enqueueExportJob`/`saveNoteDraft`/`acquireEditLock`/`extendEditLock`/`restoreNoteRevision`/`releaseEditLock` の各 fn）
  - `app/components/note/loaders.ts` — id 漏れキャスト（`as DomainUserId`/`as DomainNoteId`/`as DomainDirectoryId`/`as TagId` および `Parameters<...>` 経由の冗長キャスト）を除去。`PublicationVisibility`（値型）import は残す。`DomainNoteId.create()`/`DomainDirectoryId.create()` の扱いは ADR-002 に従う
- **理由:** presentation → domain の最大の漏れ箇所。usecase 入力を string に統一し橋渡しを内部化。

### ステップ 3: publication スライス

- **usecase:**
  - `changePublicationVisibility.ts`, `issueShareLink.ts`, `revokeShareLink.ts`, `setShareLinkPassword.ts`, `bulkChangePublicationVisibility.ts`, `listShareLinks.ts`（すべて `app/core/application/publication/`）— `actorUserId`/`noteId`/`shareLinkId`/`noteIds` を string 化し domain 境界で橋渡し
  - `bulkChangePublicationVisibility.ts` の出力型も string 化: `BulkChangeFailure.noteId: NoteId` → `string`（入力 `noteIds` 広げに連動した narrowing 回避。あわせて現状 `PublishSettings/action.ts` が `failures[].noteId`（ブランド）を presentation 出力へ通している既存漏れも解消される）
- **presentation:**
  - `app/components/publication/PublishSettings/action.ts` — `NoteId`/`ShareLinkId` import 除去。`noteId: data.noteId`, `shareLinkId: data.shareLinkId`, `noteIds: data.noteIds`（`.map(as NoteId)` 除去）
- **理由:** 同上。`bulkChangePublicationVisibility` → `changePublicationVisibility` の内部呼出は互換維持。

### ステップ 4: media スライス

- **usecase:**
  - `finalizeUpload.ts` — `actorUserId: UserId` → `string`, `mediaId: MediaAssetId` → `string`
  - `uploadMediaPresigned.ts` — `actorUserId: UserId` → `string`
  - `downloadMedia.ts` — `viewerUserId: UserId | null` → `string | null`, `mediaId: MediaAssetId` → `string`, `viaShareLinkId: ShareLinkId | null` → `string | null`, `relatedNoteId: NoteId | null` → `string | null`。domain 境界で橋渡し
- **presentation:**
  - `app/components/media/actions.ts` — `MediaAssetId` import 除去。`mediaId: data.mediaId`（finalizeUpload）
  - `app/routes/media/$mediaId.tsx` — `MediaAssetId` import 除去。`mediaId: data.mediaId`（downloadMedia）
- **理由:** 同上。`viaShareLinkId`/`relatedNoteId` は presentation 側で常に `null` を渡しているが、型を string 化して契約を揃える。

### ステップ 5: 全体検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit && pnpm test:integration`

## 設計判断

- **ADR-001:** worker / domain event 起点の usecase の扱い（#482 ADR-001 踏襲）— 検証は worker に残し、本 Issue の対象外とする。
- **ADR-002:** `listNotesByOwner` / `note loaders.ts` の `directoryId` / `referencingNoteId` の `.create()` 検証（transport-boundary の graceful fallback）の扱い。

詳細は `.issue/489/adr.md` を参照。

## リスクと注意点

- **ブランチ起点ミスが最大リスク。** `main`（#482 済み）から分岐しないと export スライスが二重作業になる。ステップ 0 を厳守。
- **`listNotesByOwner` の `.create()` 検証ロジック（ADR-002）。** ここだけは単純なキャスト除去では済まない。loader が URL 由来の不正 id を「黙って無視（filter なし扱い）」する transport-boundary の挙動を**変えてはならない**。ADR-002 の決定（検証は loader に残す）に従い、loader 側で `string` のまま usecase に渡せるよう usecase の `directoryId`/`referencingNoteId`/`tagIds` を string 化する。挙動が変わらないことを `listNotesByOwner.integration.test.ts` で確認。
- **`as Brand` 橋渡しの配置。** 原則 usecase 内で橋渡しし、内部ヘルパー・domain サービス呼出はブランドのまま使う（#482 `runExportJob` のパターン）。ただし domain 接点が複数ある usecase では「接点ごとにキャスト」になる。確認済みの複数橋渡し箇所:
  - `downloadMedia.ts` — 3 箇所（`mediaAssetRepository.findById(input.mediaId as MediaAssetId)` / `publicationStateRepository.findById(input.relatedNoteId as NoteId)`（null narrow 後）/ `MediaService.assertViewableBy({ viewerOwnerId: input.viewerUserId as UserId })`）
  - `startExportJob.ts` — 2 箇所（`assertCanAccess` の `viewerOwnerId` / `ownerId: (input.actorUserId ?? note.ownerId) as UserId`）
  - これらは「一度だけ」ではないが、各接点で機械的に `as` を付けるだけで feasible。散発的に同じ値を何度もキャストするのを避ける意図であって、別接点ごとのキャストは許容する。
- **`*ErrorCode` / spec 文言・挙動は不変。** 型レベルのみの変更。エラー種別・メッセージ・分岐は一切変えない。
- **テストのブランドキャストは no-op 化するが型エラーにはならない。** 必須対応ではない。各スライスで冗長キャストが目障りなら除去して良いが、スコープを膨らませない。
- **`uploadMedia` の呼出元確認。** presentation 直呼びでなければ内部のみ＝対象外。実装時に確認。
- **`downloadMedia` の `viaShareLinkId` / `relatedNoteId`。** 公開ノートの共有リンク経由ダウンロード（`routes/p/...` 等）から別経路で呼ばれる可能性がある。string 化は呼出元すべてに互換だが、念のため `grep downloadMedia` で全呼出元を確認し、ブランドを渡している箇所が壊れないこと（広げる方向なので壊れない）を確認。

## テスト方針

- 型レベルのリファクタなので `pnpm typecheck` が第一の砦。各スライス変更後に必ず実行。
- `pnpm lint:fix && pnpm format`（Biome）。
- `pnpm test:unit && pnpm test:integration` で既存テストがグリーンのままであることを確認（挙動不変の担保）。特に:
  - `note/__tests__/listNotesByOwner.integration.test.ts`（ADR-002 の graceful fallback 不変確認）
  - `workers/__tests__/dispatchDomainEvent.test.ts`（worker 起点の検証契約が無傷であること）
  - `media/__tests__/media.integration.test.ts` / `publication/__tests__/view.test.ts` / export 系テスト
- 実機確認は `.issue/489/testing.md` を参照（型リファクタのため最小限）。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 両視点で自己検証）

**確認・反映した点**:
- **ブランチ起点の致命的前提を発見・明記**: 現在の作業ブランチは #482（PR #488）を含まず、`main` には含まれる。`main` 起点でないと export スライスが二重作業になるため、ステップ 0 と前提セクションに明記した。
- **Issue の「影響範囲 10 ファイル」を全数精査**: `ingestion/schema.ts` と `note/editor/DirectoryPicker.tsx` の import は id 型ではなく定数 `MAX_DIRECTORY_DEPTH` であり、id 型漏れではないことを確認。スコープ外として明記（除去すると DoS キャップのソースを失う）。`main` 上の presentation valueObject import は正確に 10 ファイルで Issue と一致。
- **ingestion usecase スライスが既に完了済み**であることを確認（`actorUserId: string` / `jobId: string` 化済み、`ingestion/actions.ts` も id キャストなし）。スコープから除外。
- **usecase の全数洗い出し**: `: UserId|NoteId|...` の grep で挙がった全ファイルを精査し、presentation 起点のもの（要変更）と worker/event 起点・内部のみ（対象外）を分類。presentation 起点の対象 usecase を export/note/search/publication/media 各スライスで完全リスト化。
- **`listNotesByOwner` / loaders.ts の `.create()` 検証**は単純なキャストではなく transport-boundary の graceful fallback であることを特定し、ADR-002 として「検証は loader に残す」決定を記録（挙動変更を防ぐ核心）。
- **worker 起点 usecase / handler** を #482 ADR-001 踏襲で対象外とし ADR-001 に記録。
- **呼出元連鎖の互換性確認**: usecase 入力を string に「広げる」方向なので、ブランドを渡す既存呼出元（presentation/worker/他 usecase/テスト）はすべて構造的に互換。`bulkChangePublicationVisibility → changePublicationVisibility`、`enqueueExportJob → startExportJob` の内部呼出も互換確認済み。
- **`uploadMedia` usecase は presentation 直呼びなし**（内部ヘルパー import のみ）＝対象外と判定。
- **`startExportJob` の `actorUserId: UserId | null` → `string | null`** の domain 境界橋渡し（line 105/120）が単純なキャストで済むことを確認。
- **テストのブランドキャストは no-op 化するが型エラーにはならない**ことを確認。冗長キャスト除去は任意クリーンアップとしてスコープを膨らませない方針を明記。
- **DTO 層は #473 で string 化済み**、残 valueObject import は値型のみ（id 漏れなし）＝対象外を確認。

**見送った提案とその理由**:
- テストの冗長キャスト一括除去: 型エラーにならず挙動も不変のため必須ではない。各スライス内の任意クリーンアップに留め、スコープを限定する。
- ingestion `schema.ts` / `DirectoryPicker.tsx` の `MAX_DIRECTORY_DEPTH` import 除去: id 型ではなく正当な定数利用のため。presentation→domain 依存自体の是非は本 Issue（id 型漏れ）のスコープ外。

両視点とも、上記反映後に未解決の問題点は残っていない。

### 2周目（2視点並列レビュー: 要件カバレッジ / アーキ・リスク）

**修正した点（P-001 = アーキ・リスク視点が検出した実バグ）**:
- **バルク系 usecase の `*Failure.noteId` 出力型 string 化を計画に追加。** 入力 `noteIds` を `readonly string[]` に広げると、ループ変数が `string` になり、それをブランド型の出力フィールド（`bulkTrashNotes`/`bulkMoveNotes` の `*Failure.noteId: NoteId`、`bulkChangePublicationVisibility` の `BulkChangeFailure.noteId: NoteId`）へ代入する箇所が narrowing で typecheck エラーになる。「入力を広げる方向だから全互換」という一般化は入力→出力フィールド経由の narrowing には当てはまらない点を依存関係セクションに明記し、ステップ 2/3 に出力型変更を追加した。`bulkChangePublicationVisibility` の string 化は presentation 出力へのブランド漏れ（既存）も同時に解消する。

**取り込んだ改善提案**:
- **[S-001 アーキ視点] 複数橋渡し箇所の明記**: `downloadMedia`（3 箇所）/ `startExportJob`（2 箇所）は domain 接点が複数あり「一度だけ橋渡し」では済まないことをリスク注意点に明記。各接点で機械的に `as` する方針を確認。
- **[S-002 アーキ視点] loader ゲート維持の具体形**: ADR-002 に「`.create()` 成功時のみ key を含める条件付きスプレッドを維持する／無効 id を無条件で流さない」具体形を追記。

**見送った提案とその理由**:
- [S-001 要件視点] Issue の「約28ファイル」と計画リスト件数の差分注記: 計画は分類を文章で正しく行っており、概数 vs 網羅再列挙の差は本質的問題ではない。レビュー履歴で触れるに留め plan 本文は変えない。
- [S-002 要件視点] ingestion の `.create()` パターン vs 本 Issue の `as` パターンの流儀差注記: 既存 ingestion は変更対象外（完了済み）であり、本 Issue 対象は #482 の `as` パターンに揃えるのが正。流儀差は意図的だが、スコープを広げないため軽微注記に留める。

要件カバレッジ視点は「問題点ゼロ」。アーキ・リスク視点の P-001 を反映し、両視点の改善提案のうち実装精度に資するものを取り込んだ。以降の未解決事項はなし。
