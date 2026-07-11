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
| 24h 以上前の deleting（前回 R2 失敗で stuck） | Purge | markDeleting を skip し 2nd UoW（R2 削除 → DB 削除）から再開 |
| 24h 未満（orphan / deleting とも） | Purge | スキップ |
| R2 削除失敗 | Purge | `status=deleting` のまま failed カウントに計上。猶予期間経過後の次の sweep で `deleting` 行も再試行対象となり、R2 復旧後に purge 完了（再試行回数の上限なし） |

## SweepAbandonedSourceIntakes（Issue #468）

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 24h 以上前の pending/source | Sweep | `pending → orphan`（`media.orphaned` を outbox に記録、`updatedAt` 再スタンプ） |
| 24h 未満の pending/source（境界近傍 24h−1min を含む） | Sweep | スキップ |
| 24h 以上前の pending/image（他 kind） | Sweep | 対象外（ADR-004） |
| 同じ集合に 2 回実行 | Sweep | クエリレベルで冪等（orphan 化済み行は候補に載らない。候補列挙〜per-row UoW 間の遷移は fresh `findById` ガードでスキップ） |
| 候補列挙〜per-row UoW 間に `updatedAt` 再スタンプ（pending/source のまま） | Sweep | スキップ（fresh 再読で cutoff を再検査。再スタンプ = 回収先送り） |
| orphan 化後、orphan 猶予経過 | PurgeOrphans | blob + 行が消える（回収チェーン接続） |
| blob なし pending/source（put 失敗相当） | Sweep → PurgeOrphans | `ObjectStorage.delete` の冪等性（missing key = 成功）により purge 完走、行が消える（commit 実経路の put 失敗からの回収は CommitIngestionPreview の行で検証） |
| 個別行の save 失敗 | Sweep | failed 計上 + ログ、他の行は続行 |

## HandleNotePurgedEvent

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 参照 media あり | Event 受信 | reconcileRefs で refCount-- |
| 重複配信 | Event 受信 | 冪等（既に decremented されたものに対しては再実行しないよう event ID で重複制御） |
