# EC-3: R2 presign 設定が欠けた状態での tick

**結果**: PASS
**実行時間**: 約240秒（pruner 再起動 2回含む）
**セッション**: なし（CLI 検証）

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `.dev.vars` を scratchpad にバックアップ | バックアップ作成 | 作成済み | PASS |
| 2 | purge 対象 orphan 行を seed（UUIDv7 id `019f0000-0000-7000-8000-000000468103`、`status='orphan'`、`updated_at` 2日前） | 行が作成される | 作成済み | PASS |
| 3 | `.dev.vars` の `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` を空にして pruner 再起動 → tick 発火 | tick はクラッシュせず完走、per-row catch でエラーがログに落ちる | `Ran scheduled event`（200 OK）。`ERROR [media] purge failed for asset 019f0000-...-468103 (storage)` / `cause: StorageUnavailableError: object_storage_not_configured`。後続ステップは実行され `[prune] purged 0 orphaned media asset(s) (1 failed)` で tick 完走 | PASS |
| 4 | 行の status を SELECT | `orphan` または `deleting` のまま残る | `status='deleting'`（`updated_at` は tick 時刻に再スタンプ）。行は残存し回収可能な状態 | PASS |
| 5 | `.dev.vars` をバックアップから復元し diff で一致確認 | 完全一致 | `diff` 差分なし（DEV_VARS_IDENTICAL） | PASS |
| 6 | `deleting` 行の `updated_at` を2日前にバックデート（markDeleting の再スタンプで候補窓から外れるため、猶予再経過をシミュレート） | UPDATE 成功 | 成功 | PASS |
| 7 | pruner を復旧設定で再起動 → tick 発火 | 復旧後の tick で該当行が回収される | `[prune] purged 1 orphaned media asset(s) (0 failed)`。SELECT で該当行 0 件（DB から削除） | PASS |

## 手順からの逸脱

- **手順6のバックデート**: testing.md には明記されていないが、`purgeOrphans`（`app/core/application/media/purgeOrphans.ts` JSDoc）どおり failed 行は `markDeleting` で `updatedAt` が再スタンプされ候補窓から外れるため、「後の sweep で猶予再経過後にリトライされる」挙動をバックデートで前倒しして確認した。設計どおりの挙動であり逸脱ではなく時間短縮のためのシミュレーション。

## 確認後の後始末

- `.dev.vars` はバックアップと完全一致を最終確認（tick 実行後にも diff で再確認済み）。
- seed 行 `019f0000-0000-7000-8000-000000468103` は復旧 tick 自体が purge（削除）。EC-1/EC-2 の残存 seed 行も DELETE 済みで `0000004681%` 系は残存 0 件。
- TC-001 の attached 行 `019f4cc4-da25-70ef-8b3a-6df63766c68b` は `status='attached'` のまま無変更を確認。
- pruner worker（:8788）停止済み（LISTEN プロセスなしを確認）。
