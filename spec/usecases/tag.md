# Tag ユースケース

## CreateTag

### 入力DTO
- `actorUserId: UserId`, `name: string`

### 出力DTO
- `tag: TagDTO`

### 処理フロー
1. `TagName` 構築
2. `TagService.assertNameUnique`
3. UoW: Tag を作成、save
4. TagBlacklist にあれば自動的に削除（既にブラックリスト解除扱い）

### エラーケース
- `ValidationError` / `BusinessRuleError('tag_name_conflict')`

---

## RenameTag

### 入力DTO
- `actorUserId: UserId`, `tagId: TagId`, `newName: string`

### 出力DTO
- `tag: TagDTO`, `affectedNoteIds: NoteId[]`

### 処理フロー
1. Tag 取得、所有者確認
2. 新名 `TagName` 構築、`TagService.assertNameUnique`
3. UoW: `tag.rename(newName, now)` → save
4. 本文 HTML 中の `#oldName` を `#newName` に置換するため、関連ノートを `NoteRepository.findByOwner({ tagIds: [tagId] })` で取得し、各 Note の contentHtml を `TagService.renameInBody` で置換した結果で `note.updateContent` で保存（Outbox `note.saved` を発火）
5. 結果として影響を受けた NoteId を返却

### エラーケース
- `ValidationError`
- `BusinessRuleError('tag_name_conflict')`

---

## MergeTags（非同期ジョブ化 / Issue #580）

タグ統合は同期処理から **非同期ジョブ**（`TagMergeJob` アグリゲート + outbox → relay → consumer → runner）へ移行した。リクエストはジョブ受付で即時応答し、ノート書き換えと source 削除は worker 側で実行する。進捗（n/total）はジョブ行に逐次永続化され、P18 `MergeTagDialog` が determinate バーで polling 表示する。

### EnqueueTagMergeJob（受付）

#### 入力DTO
- `actorUserId: UserId`, `sourceTagId: TagId`, `targetTagId: TagId`

#### 出力DTO
- `job: TagMergeJobDTO`（`id`, `status`, `sourceTagId`, `targetTagId`, `progress: { processed, total }`, `errorReason` 等）

#### 処理フロー
1. Source / Target Tag 取得、所有者一致確認（不一致は `ForbiddenError`、不存在は `NotFoundError`）
2. `TagService.computeMergePlan` で事前検証（source !== target / owner 一致）。不正なら即エラー応答（ジョブは作らない）
3. `TagMergeJob.create()` で pending ジョブを作成・`insert`、`collectEvents(tag.merge.requested)`
   - 重複統合の抑止ガードは置かない（冪等で再実行安全。固着ジョブの回復導線を塞がないため）

### RunTagMergeJob（worker runner）

`tag.merge.requested` を consumer が `dispatchDomainEvent` 経由で受けて実行する。

#### 処理フロー
1. **ワークセット事前スナップショット**: source タグ保持ノートID集合を read-only で全件読み切り、件数で `startProcessing(total)`（Pending 専用遷移）。offset 加算とミューテーションの交互実行は禁止（データ欠落防止）
2. 固定 ID リストをバッチ（500件）分割し、各バッチを独立 UoW で `findById`→`replaceTags`→save。進捗は **検査したノート数**（no-op 含む）で `recordProgress`。変更分は `affectedNoteIds` として別カウント
3. 全 ID 処理後、Source Tag を delete + `tag.deleted` 発火 → `complete(affectedNoteIds)`（Target Tag 行は変更しないため version も進めない。表示件数は read-time 集計。`tags.note_count` 列は Issue #372 で撤去済み）
4. Outbox `note.saved` / `tag.deleted` を発火
5. **冪等再開**: クラッシュ中断（`processing` 固着）は再 dispatch で再開可能。再入時は total を再 seed せず残件再スキャンで `processed = total − 残件数` から前進のみ（バー逆行防止）
6. **二重ジョブ並走耐性**: 先行 run が source を削除済み（OCC 競合 / NotFound）の場合は `fail` ではなく冪等な `complete` として扱う

### GetTagMergeJob（進捗供給クエリ）

#### 入力DTO
- `actorUserId: UserId`, `jobId: TagMergeJobId`

#### 出力DTO
- `job: TagMergeJobDTO`

#### 処理フロー
1. `findById(jobId)` でジョブ取得（不存在は `NotFoundError`）
2. `TagMergeJob.assertOwnedBy(job, actorUserId)` で所有者検証（IDOR 防止。クライアント state の jobId を直接 polling するため必須）

### エラーケース
- Enqueue: `BusinessRuleError('tag_merge_same' | 'tag_owner_mismatch')` / `NotFoundError` / `ForbiddenError`
- GetTagMergeJob: `NotFoundError('TAG_MERGE_JOB_NOT_FOUND')` / `BusinessRuleError('tag_merge_job_unauthorized')`
- Run 失敗時はジョブが `failed`（`errorCode` / `errorReason`）になり、ダイアログ内にエラー表示

---

## DeleteTag

### 入力DTO
- `actorUserId: UserId`, `tagId: TagId`

### 出力DTO
- `affectedNoteIds: NoteId[]`

### 処理フロー
1. Tag 取得、所有者確認
2. UoW: 関連ノートを取得し、各 Note から tag を `replaceTags(現在の tagIds - 削除対象)` で除去、save
3. TagBlacklistRepository.add(`{ ownerId, name, addedAt }`)
4. TagRepository.delete
5. Outbox `note.saved` 発火

### エラーケース
- `AuthorizationError`

---

## ListTags

### 入力DTO
- `actorUserId: UserId`, `limit/cursor`

### 出力DTO
- `tags: TagDTO[]`, `nextCursor: string | null`

### 処理フロー
- TagRepository.findByOwner

---

## RebuildNoteTagAssociation（内部用、Note の SaveNote / Ingestion から間接呼び出し）

### 概要
Note 保存時に declaredTagNames + 本文抽出名から TagId セットを解決する内部処理。

### 処理フロー
- `TagService.resolveOrCreate` を呼ぶ
- TagBlacklist に含まれる名前は除外
- 戻り値 TagId[] を呼び出し元に返す

### エラーケース
- `ValidationError`
