# Issue #3 マニュアルテスト用シードデータ

`/admin/jobs`（P46 管理者ジョブ監視画面）の動作確認に必要なジョブを
ローカル D1 に投入する。ベースラインの user / account / directory は
`.manual-test/2026-05-17/` のシードを再利用する。

## 1. 投入元

- ベースライン（user / account / directory）: `.manual-test/2026-05-17/seed.sql`
- 本 Issue 用ジョブ: `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/3/manual-test/seed-jobs.sql`

## 2. 投入手順

ローカル D1 に admin が存在することを確認する:

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT COUNT(*) FROM users WHERE role='admin';"
```

0 件なら先にベースラインを投入:

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file .manual-test/2026-05-17/seed.sql
```

ジョブを投入:

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file .issue/3/manual-test/seed-jobs.sql
```

再投入する場合は `seed-jobs.sql` 冒頭のクリーンアップ DELETE ブロックを
有効化してから再実行する（`id LIKE '01938f03-0000-7000-8000-0000000003%'`）。

カテゴリ間の reseed は `.manual-test/2026-05-17/reseed.sh` を参照
（D4: per-category reseed protocol）。

## 3. 使用するアカウント

`.manual-test/2026-05-17/seed-data.md` のベースラインを変更せずに使う。

| label | email | password | role | user.id |
|---|---|---|---|---|
| admin-user | `admin@example.com` | `Password123!` | `admin` | `01938f00-0000-7000-8000-0000000000c1` |
| existing-user | `existing@example.com` | `Password123!` | `member` | `01938f00-0000-7000-8000-0000000000a1` |

- TC-1 / TC-2 / TC-3 / TC-4 / TC-5 / TC-7、エッジケース 1〜3、
  既存機能への影響確認はすべて **admin-user** でサインインして実施する。
- TC-6（非 admin アクセス拒否）は **existing-user**（member）でサインインする。

## 4. 投入ジョブ一覧

### 4.1 ingestion_jobs（5 件）

| id | owner | status | error_code | temp_storage_key | 用途 |
|---|---|---|---|---|---|
| `01938f03-0000-7000-8000-000000000301` | admin | `failed` | `INGESTION_TEMP_STORAGE_ERROR` | あり | **TC-2 / TC-4**（retry 成功シナリオの主役） |
| `01938f03-0000-7000-8000-000000000302` | member | `failed` | `INGESTION_PARSE_ERROR` | あり | **TC-2**（複数オーナー横断表示） |
| `01938f03-0000-7000-8000-000000000303` | admin | `failed` | `INGESTION_TEMP_STORAGE_ERROR` | **NULL** | **エッジケース 3**（`INGESTION_NO_TEMP_STORAGE_FOR_RETRY` で再実行拒否） |
| `01938f03-0000-7000-8000-000000000304` | member | `pending` | — | あり | テーブル表示 & 並び順確認 |
| `01938f03-0000-7000-8000-000000000305` | admin | `saved` | — | — | 並び順確認（failed 行が先頭に来ることの対照） |

### 4.2 export_jobs（4 件）

| id | owner | status | format | scope | 用途 |
|---|---|---|---|---|---|
| `01938f03-0000-7000-8000-000000000311` | admin | `failed` | markdown | single | **TC-3 / TC-5**（retry 後の progress / completedAt / failedNoteIds リセット確認） |
| `01938f03-0000-7000-8000-000000000312` | member | `failed` | html | multiple | **TC-3**（複数オーナー横断表示） |
| `01938f03-0000-7000-8000-000000000313` | member | `pending` | markdown | single | テーブル表示 & 並び順確認 |
| `01938f03-0000-7000-8000-000000000314` | admin | `completed` | pdf | single | 並び順確認 |

ジョブ id 体系: `01938f03-0000-7000-8000-0000000003{NN}`
（NN = 01〜05 が ingestion、11〜14 が export）。既存テーブルとの id 衝突なし。
すべて `version=1`（completed export のみ `version=2`）。

## 5. テストケース別 jobId マッピング

retry を発火させる対象を明示する。

| TC | 操作対象 jobId | 期待結果 |
|---|---|---|
| **TC-4** ingestion retry 成功 | `01938f03-0000-7000-8000-000000000301`（admin / failed / blob あり） | `pending` に戻り `ingestion.retryRequested` が outbox に乗る |
| **TC-5** export retry 成功 | `01938f03-0000-7000-8000-000000000311`（admin / failed / progress=3/5） | `pending` に戻り、progress / completedAt / failedNoteIds が初期化、`export.job.retryRequested` が outbox に乗る |
| **エッジケース 1** failed 以外への retry | `01938f03-0000-7000-8000-000000000304`（pending） | `INGESTION_INVALID_STATE_FOR_RETRY` を `displayError` で表示 |
| **エッジケース 2** 同時 retry（OCC 衝突） | `01938f03-0000-7000-8000-000000000301` または `01938f03-0000-7000-8000-000000000311` | 2 タブで同時押下 → 片方 `ConflictError` |
| **エッジケース 3** tempStorageKey null retry | `01938f03-0000-7000-8000-000000000303` | `INGESTION_NO_TEMP_STORAGE_FOR_RETRY` を `displayError` で表示 |

> retry を行う TC を実行した後はジョブの状態が変わるので、再現したい場合は
> 冒頭のクリーンアップ DELETE → `seed-jobs.sql` 再投入で初期状態に戻す。

## 6. 投入後の状態（2026-05-18 投入時点）

```text
ingestion_jobs : failed=3, pending=1, saved=1
export_jobs    : failed=2, pending=1, completed=1
```

確認コマンド:

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT status, COUNT(*) FROM ingestion_jobs GROUP BY status;"
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT status, COUNT(*) FROM export_jobs GROUP BY status;"
```

## 7. 既存シードへの依存と整合性

- `owner_id` は `users(id)` への FK（`ON DELETE CASCADE`）。`.manual-test/2026-05-17/seed.sql` の
  admin / existing-user に依存しているため、reseed.sh で user 群が削除されると
  本 Issue のジョブも CASCADE 削除される点に注意。
- ingestion / export ともに `status` enum / `byte_size > 0` / `format` enum / `scope` enum
  の CHECK 制約を満たすことを `app/core/adapters/d1/schema.ts` の定義で確認済み。
- export の `options_json` は `D1ExportJobRepository.serializeOptions` の構造
  （`includeFrontMatter` / `embedMedia` / `pdfPaperSize`）に合わせている。
