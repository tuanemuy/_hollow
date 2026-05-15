# Media ユースケース

## UploadMedia（直接アップロード）

### 入力DTO
- `actorUserId: UserId`, `kind: MediaKind`, `mimeType: string`, `byteSize: number`, `bodyStream: ReadableStream`, `originalFileName: string | null`

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
- `actorUserId: UserId`, `kind`, `mimeType`, `byteSize`

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
- なし（Cron 起動）

### 処理フロー
1. `MediaAssetRepository.findOrphansOlderThan(now - 24h, batch=100)`
2. 各々について UoW: `MediaService.purge`
3. ログとメトリクス記録

### エラーケース
- 個別失敗はリトライ、ジョブログに記録

---

## HandleNotePurgedEvent（イベントハンドラ）

### 概要
ノート完全削除で参照していたメディアの refCount を 1 ずつ減らす。

### 処理フロー
- `note.purged` イベントに含まれる `mediaRefs` について `MediaService.reconcileRefs(mediaRefs, [], ...)` を実行
