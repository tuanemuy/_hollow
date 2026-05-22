# Media テストケース

## UploadMedia

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正常画像 | UploadMedia | MediaAsset(pending) + R2 put、DL URL 返却 |
| サイズ超過 | UploadMedia | `BusinessRuleError('media_byte_size_exceeded')` |
| storage 失敗 | UploadMedia | `SystemError(ExternalApiError)`、DB に Asset を残さない |

## UploadMediaPresigned / FinalizeUpload

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常 | UploadMediaPresigned | pending Asset、uploadUrl |
| Finalize で実体存在 | Finalize | size 等を Asset に反映 |
| Finalize で実体無し | Finalize | `StorageNotFoundError` |

## AttachMediaToNote / DetachMediaFromNote

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| Note 保存で参照増 | Attach | Asset.refCount++、pending→attached |
| Note 保存で参照減 | Detach | Asset.refCount--、0 で orphan |

## ListMediaByOwner

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分のメディア | List | 一覧 |

## DownloadMedia

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| owner 自身 | Download | 一時 URL |
| 他人だが note=public | Download | URL |
| 他人で note=private | Download | `BusinessRuleError('media_not_viewable')` |
| 他人で note=unlisted、viaShareLinkId 通過済み | Download | URL |
| 他人で note=unlisted、viaShareLinkId 未指定 | Download | `BusinessRuleError('media_not_viewable')` |

## PurgeOrphans

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 24h 以上前の orphan | Purge | status=deleting → R2 削除 → DB 削除 |
| 24h 未満 | Purge | スキップ |
| R2 削除失敗 | Purge | `status=deleting` で停止、failed カウントに計上（現状は次の sweep で再試行されない。リトライ強化は別 Issue で追跡） |

## HandleNotePurgedEvent

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 参照 media あり | Event 受信 | reconcileRefs で refCount-- |
| 重複配信 | Event 受信 | 冪等（既に decremented されたものに対しては再実行しないよう event ID で重複制御） |
