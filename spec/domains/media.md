# Media

R2 に保存されるメディアアセット（画像・動画・アバター）のメタデータと孤児クリーンアップを扱う。

## 保持ポリシー（source, Issue #468 ADR-001）

`MediaAsset(kind='source')` 全件に時間ベースの TTL は設けない。保持は Note のライフサイクルに連動する:

- 参照元 Note が存在する限り無期限保持（#452 の閲覧/DL 要件を運用都合で破壊しない）。trash 中も復元可能なため保持。
- 参照が外れた時点で orphan 化 → 標準 purge 機構が回収。契機は (a) overwrite commit での差し替え、(b) note purge、(c) commit 不成立で放棄された intake（`SweepAbandonedSourceIntakes` が猶予 24h 後に orphan 化）。
- 猶予: intake 放棄 → orphan が 24h、orphan → purge が 24h（二重の猶予）。
- 再検討トリガー: ストレージコストが顕在化した場合は opt-in の admin instance setting（TTL）を別 Issue で設計する。判断材料は `MediaAssetRepository.aggregateByOwner` で観測可能。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| MediaAsset | メディアアセット | R2 に保存された 1 つのファイル |
| MediaAssetId | メディアID | UUID v7 |
| MediaKind | メディア種別 | `image` / `video` / `avatar` / `source` |
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
- `'image' | 'video' | 'avatar' | 'source'`
- `source` は取り込み（ingestion）確定時に永続保存される元ファイル（Issue #452）。本文 HTML には現れないため `MediaService.reconcileRefs` の対象外。commit 時に `markAttached` で `attached`/refCount=1 に固定し、デタッチ（overwrite 差し替え・note purge）は `decrementRef` で orphan 化して標準 purge worker に回収させる。Note とは `mediaRefs` ではなく `notes.source_file_id` で 1:1 紐付け。storageKey は `<userId>/source/<id>`。所有者のみ閲覧/DL 可（`/media/<id>` を `relatedNoteId: null` で呼ぶため公開ノートでも非所有者には見えない）。

### StorageBackend（列挙）
- `'r2'`（MVP）

## ドメインサービス

### MediaService
- 責務: 参照カウントの整合維持と孤児サーチ、配信アクセス制御
- メソッド:
  - `reconcileRefs(noteBeforeIds: MediaAssetId[], noteAfterIds: MediaAssetId[], now: Instant, repo: MediaAssetRepository): Promise<void>` — 差分計算して inc/dec
  - `listPurgeCandidates(now: Instant, ageSec: number, repo: MediaAssetRepository): Promise<MediaAsset[]>` — orphan に加え、前回 purge が中断した `deleting` 行も返す（再試行対象）
  - `listAbandonedSourceIntakes(now: Instant, graceSec: number, repo: MediaAssetRepository): Promise<MediaAsset[]>` — commit 不成立で放棄された `pending(kind='source')` を返す（猶予 = ドメインルール、Issue #468）。source の pending は commit リクエスト内で attach されるため、猶予超過 = 放棄と断定できる（他 kind の pending は対象外 — ADR-004）
  - `purge(asset: MediaAsset, storage: ObjectStorage, repo: MediaAssetRepository): Promise<void>` — R2 削除 + DB 物理削除
  - `assertViewableBy(args: { asset: MediaAsset; viewerOwnerId: UserId | null; relatedNoteVisibility: Visibility | null }): void` — `viewerOwnerId === asset.ownerId` なら常に可。`viewerOwnerId === null` のとき、`relatedNoteVisibility === 'public'` または limited リンク経由（呼び出し側で別途トークン検証済み）でなければ `BusinessRuleError('media_not_viewable')`

## ポート

### MediaAssetRepository
- `findById(id: MediaAssetId): Promise<MediaAsset | null>`
- `findByIds(ids: MediaAssetId[]): Promise<MediaAsset[]>`
- `findByOwner(ownerId: UserId, opts: ListOpts): Promise<MediaAsset[]>`
- `findPurgeableOlderThan(before: Instant, limit: number): Promise<MediaAsset[]>` — `status IN ('orphan','deleting') AND updatedAt < before`
- `findAbandonedSourceIntakes(before: Instant, limit: number): Promise<MediaAsset[]>` — `status = 'pending' AND kind = 'source' AND updatedAt < before`（Issue #468。source 以外の pending は正当に attach 待ちの可能性があるため対象外）
- `save(asset: MediaAsset): Promise<void>`
- `delete(id: MediaAssetId): Promise<void>`

### ObjectStorage（ポート）
- メソッド:
  - `put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>`
  - `get(key: string): Promise<ArrayBuffer>`
  - `delete(key: string): Promise<void>` — missing key は成功として扱う（冪等）。#468 の回収チェーンは blob なし `pending` 行を定常的に purge に流すため、この冪等性はポート契約
  - `presignDownload(key: string, ttlSec: number): Promise<URL>`
  - `presignUpload(key: string, contentType: string, ttlSec: number): Promise<URL>`
- エラーケース: `StorageNotFoundError`（get / stat のみ）/ `StorageUnavailableError`

## ユースケース（概要）

- UploadMedia（直接 or プリサインド URL）
- AttachMediaToNote（参照確立、Note 集約からのイベントで呼ばれる）
- DetachMediaFromNote
- ListMediaByOwner
- PurgeOrphans（バッチ）
- SweepAbandonedSourceIntakes（バッチ、Issue #468）
