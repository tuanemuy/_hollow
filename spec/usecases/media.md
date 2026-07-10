# Media ユースケース

## UploadMedia（直接アップロード）

### 入力DTO
- `actorUserId: UserId`, `kind: UploadableMediaKind`（= `MediaKind` から `'source'` を除外。source の pending 行は commit フロー内でのみ誕生する — sweep の放棄判定の安全前提。#468 ADR-004）, `mimeType: string`, `byteSize: number`, `bodyStream: ReadableStream`, `originalFileName: string | null`

### 出力DTO
- `mediaId: MediaAssetId`, `downloadUrl: URL`

### 処理フロー
1. AdminSettings から `limits` 取得、`byteSize <= maxNoteBytes`（kind 別に細分）
2. `IdGenerator.next` で MediaAssetId、`storageKey = <userId>/<kind>/<id>` を組み立て
3. UoW: `ObjectStorage.put`、MediaAsset を `status='pending'`、`refCount=0` で save
4. ダウンロード URL（プリサインド）を生成して返却

### エラーケース
- `ValidationError`
- `StorageUnavailableError`

---

## UploadMediaPresigned（事前 URL 取得）

### 入力DTO
- `actorUserId: UserId`, `kind: UploadableMediaKind`（source 除外は UploadMedia と同じ。#468 ADR-004）, `mimeType`, `byteSize`

### 出力DTO
- `mediaId`, `uploadUrl: URL`, `expectedDownloadUrl: URL`

### 処理フロー
- MediaAsset を `status='pending'`、`refCount=0` で先に作成
- `ObjectStorage.presignUpload` で URL を返す
- アップロード完了通知は別 usecase（FinalizeUpload）

---

## FinalizeUpload（プリサインド完了確認）

### 入力DTO
- `actorUserId`, `mediaId`

### 処理フロー
- MediaAsset を取得、`ObjectStorage` でメタ取得（size / contentType）、フィールドを更新

### エラーケース
- `StorageNotFoundError`

---

## AttachMediaToNote（内部イベントハンドラ）

### 概要
Note 保存後に呼ばれ、参照差分をメディア側に反映する。

### 処理フロー
- `MediaService.reconcileRefs(noteBeforeIds, noteAfterIds, now, repo)` を呼ぶ

---

## DetachMediaFromNote
- 上記の特殊化（after が空）

---

## ListMediaByOwner

### 入力DTO
- `actorUserId`, `limit/cursor`

### 出力DTO
- `assets: MediaAssetDTO[]`, `nextCursor`

---

## DownloadMedia（公開・限定公開対応）

### 概要
ノート本文中のメディアにアクセスするための一時 URL を返す。`viaShareLinkId` を指定する場合は、事前に `Publication.ResolveShareLink` 経由で正当性が確認済みであること（呼び出し元 presentation 層が責任を持つ）。

### 入力DTO
- `viewerUserId: UserId | null`, `mediaId: MediaAssetId`, `viaShareLinkId: ShareLinkId | null`, `relatedNoteId: NoteId | null`

### 出力DTO
- `redirectUrl: URL`

### 処理フロー
1. MediaAsset 取得
2. アクセスチェック:
   - viewer === owner: 常に許可
   - 否則: relatedNoteId が指定されていれば PublicationState を取得し、`MediaService.assertViewableBy({asset, viewerOwnerId, relatedNoteVisibility})`
   - `unlisted` のときは viaShareLinkId が有効（resolve 済み）であることを前提とする
3. `ObjectStorage.presignDownload` で TTL 短い URL を返す

### エラーケース
- `BusinessRuleError('media_not_viewable')`
- `ResourceNotFoundError`

---

## PurgeOrphans（バッチ）

### 入力DTO
- なし（Cron 起動 — pruner tick（日次 03:00 UTC）から `SweepAbandonedSourceIntakes` の後に best-effort で実行される。Issue #468）

### 処理フロー
1. `MediaService.listPurgeCandidates(now, 24h, repo, batch=100)`（内部で `findPurgeableOlderThan` を呼び、`status IN ('orphan','deleting') AND updatedAt < now-24h` を取得）
2. 各々について: `orphan` は 1st UoW で `markDeleting`（`orphan → deleting`）→ 2nd UoW で `MediaService.purge`。前回 R2 失敗で `deleting` のまま残った行は markDeleting を skip し 2nd UoW から再開
3. ログとメトリクス記録

### エラーケース
- 個別失敗は `deleting` のまま failed に計上。`markDeleting` が `updatedAt` を再スタンプするため、猶予期間経過後の次の sweep で再試行される（再試行回数の上限なし）

---

## SweepAbandonedSourceIntakes（バッチ、Issue #468）

### 概要
commit の metadata-first ステージで作られたまま attach されなかった `pending(kind='source')` 行（main UoW ロールバック / put 失敗 / クラッシュの残骸）を orphan 化し、回収を標準 purge 機構に一本化する。

### 入力DTO
- なし（Cron 起動 — pruner tick（日次 03:00 UTC）から PurgeOrphans の前に best-effort で実行される）
- オプション: `graceSec`（default 24h）/ `batchSize`（default 100）

### 処理フロー
1. `MediaService.listAbandonedSourceIntakes(now, 24h, repo, batch=100)`（内部で `findAbandonedSourceIntakes` を呼び、`status='pending' AND kind='source' AND updatedAt < now-24h` を取得）
2. 各々について UoW: fresh `findById` → まだ `pending` かつ `kind='source'` なら `decrementRef`（`pending → orphan`、`media.orphaned` を collect）→ save。遷移済み / 消失済みの行はスキップ
3. orphan 化で `updatedAt` が再スタンプされるため、blob の実削除はさらに orphan 猶予（24h）経過後の PurgeOrphans が行う（誤回収への二重の猶予）

### エラーケース
- 個別失敗はログ + failed 計上でバッチ続行（per-row tolerance）。行は `pending` のまま残り、次回 sweep で再試行される

---

## HandleNotePurgedEvent（イベントハンドラ）

### 概要
ノート完全削除で参照していたメディアの refCount を 1 ずつ減らす。

### 処理フロー
- `note.purged` イベントに含まれる `mediaRefs` について `MediaService.reconcileRefs(mediaRefs, [], ...)` を実行
- イベントの `sourceFileId !== null`（Issue #452）のとき、その `MediaAsset` を `findById` し、`status` が `orphan`/`deleting` なら何もしない（冪等ガード）。`attached`/`pending` のときだけ `decrementRef` で orphan 化して save（標準 purge worker が blob 回収）。`decrementRef` は pending/attached のみ扱え、outbox は at-least-once のため `reconcileRefs` と同じスキップガードが必須
