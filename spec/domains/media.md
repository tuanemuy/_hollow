# Media

R2 に保存されるメディアアセット（画像・動画・アバター）のメタデータと孤児クリーンアップを扱う。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| MediaAsset | メディアアセット | R2 に保存された 1 つのファイル |
| MediaAssetId | メディアID | UUID v7 |
| MediaKind | メディア種別 | `image` / `video` / `avatar` |
| StorageBackend | ストレージバックエンド | 現状 `r2` のみ。将来 `s3` / `github` 拡張余地 |
| MediaStatus | ステータス | `pending` / `attached` / `orphan` / `deleting` |
| RefCount | 参照カウント | 利用箇所の数 |

## エンティティ

### MediaAsset（集約ルート）

- フィールド:
  - `id: MediaAssetId`
  - `ownerId: UserId`
  - `kind: MediaKind`
  - `mimeType: string`
  - `byteSize: number`
  - `backend: StorageBackend`（default `'r2'`）
  - `storageKey: string` — `<userId>/<kind>/<id>` のような構造
  - `originalFileName: string | null`
  - `width: number | null` — 画像時のみ
  - `height: number | null`
  - `durationMs: number | null` — 動画時のみ
  - `refCount: number`（default 0）
  - `status: MediaStatus`（default `pending`）
  - `createdAt: Instant`
  - `updatedAt: Instant`
- 振る舞い:
  - `markAttached(now: Instant): MediaAsset` — `pending` → `attached`（最初の参照確立時）
  - `incrementRef(now: Instant): MediaAsset` — `refCount++`、`pending` の場合は `attached` に遷移
  - `decrementRef(now: Instant, orphanThresholdSec: number): MediaAsset` — `refCount--`、0 になったら `orphan` に遷移し、`updatedAt` を起点に削除候補化。`status === 'pending'` から一度も `attached` を経由せず参照ゼロのままになるケース（取り込み破棄等）も `pending → orphan` に遷移する
  - `markDeleting(now: Instant): MediaAsset` — `orphan` → `deleting`
  - `assertOwnedBy(userId: UserId): void` — 違反は `BusinessRuleError('media_not_owned')`
- 不変条件:
  - `refCount >= 0`
  - `status === 'orphan' || status === 'deleting'` のとき `refCount === 0`
  - `kind === 'video'` のとき `durationMs !== null` を推奨（強制ではない）

## 値オブジェクト

### MediaKind（列挙）
- `'image' | 'video' | 'avatar'`

### StorageBackend（列挙）
- `'r2'`（MVP）

## ドメインサービス

### MediaService
- 責務: 参照カウントの整合維持と孤児サーチ、配信アクセス制御
- メソッド:
  - `reconcileRefs(noteBeforeIds: MediaAssetId[], noteAfterIds: MediaAssetId[], now: Instant, repo: MediaAssetRepository): Promise<void>` — 差分計算して inc/dec
  - `listOrphanCandidates(now: Instant, ageSec: number, repo: MediaAssetRepository): Promise<MediaAsset[]>`
  - `purge(asset: MediaAsset, storage: ObjectStorage, repo: MediaAssetRepository): Promise<void>` — R2 削除 + DB 物理削除
  - `assertViewableBy(args: { asset: MediaAsset; viewerOwnerId: UserId | null; relatedNoteVisibility: Visibility | null }): void` — `viewerOwnerId === asset.ownerId` なら常に可。`viewerOwnerId === null` のとき、`relatedNoteVisibility === 'public'` または limited リンク経由（呼び出し側で別途トークン検証済み）でなければ `BusinessRuleError('media_not_viewable')`

## ポート

### MediaAssetRepository
- `findById(id: MediaAssetId): Promise<MediaAsset | null>`
- `findByIds(ids: MediaAssetId[]): Promise<MediaAsset[]>`
- `findByOwner(ownerId: UserId, opts: ListOpts): Promise<MediaAsset[]>`
- `findOrphansOlderThan(before: Instant, limit: number): Promise<MediaAsset[]>`
- `save(asset: MediaAsset): Promise<void>`
- `delete(id: MediaAssetId): Promise<void>`

### ObjectStorage（ポート）
- メソッド:
  - `put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>`
  - `get(key: string): Promise<ArrayBuffer>`
  - `delete(key: string): Promise<void>`
  - `presignDownload(key: string, ttlSec: number): Promise<URL>`
  - `presignUpload(key: string, contentType: string, ttlSec: number): Promise<URL>`
- エラーケース: `StorageNotFoundError` / `StorageUnavailableError`

## ユースケース（概要）

- UploadMedia（直接 or プリサインド URL）
- AttachMediaToNote（参照確立、Note 集約からのイベントで呼ばれる）
- DetachMediaFromNote
- ListMediaByOwner
- PurgeOrphans（バッチ）
