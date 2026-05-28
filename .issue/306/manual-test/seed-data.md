# Seed Data — Issue #306

検証日: 2026-05-29
ブランチ: `issue/306/ingestion-commit-invalidate`
対象 DB: `hollow-local-d1` (`.wrangler/state/v3/d1`)

## 利用した既存ユーザー

| 項目 | 値 |
| --- | --- |
| user_id | `01938f00-0000-7000-8000-0000000000a1` |
| email | `existing@example.com` |
| password | `Password123!` |
| email_verified | 1 |
| root directory id | `01938f00-0000-7000-8000-0000000000a3` |

`spec/manual-tests/account.md` に記載のシード済みアカウントを再利用。Better Auth の email/password
経路でログイン可能（Google OAuth は実環境必須のため使用せず）。

## 追加挿入したシード

`/tmp/seed-306.sql` を `pnpm wrangler d1 execute hollow-local-d1 --local --file` で投入。

### 1. 既存ディレクトリ（TC-3 用、root 直下の子）

| 項目 | 値 |
| --- | --- |
| id | `019e6fc9-008b-764a-8976-f8879c9d25a6` |
| owner_id | `01938f00-0000-7000-8000-0000000000a1` |
| parent_id | `01938f00-0000-7000-8000-0000000000a3` (root) |
| name / slug | `existing-dir-1779991904395` |
| depth | 1 |

### 2. TC-2 用 ingestion job（新規ディレクトリ作成パス）

| 項目 | 値 |
| --- | --- |
| id | `019e6fc9-008c-7452-863b-1dc20bfcb6db` |
| status | `previewing` |
| original_file_name | `tc2-source.md` |
| preview_json.suggestedDirectoryId | `null` |
| preview_json.suggestedDirectoryName | `tc2-new-1779991904395` |
| preview_json.title | `TC-2 New Directory Preview` |

### 3. TC-3 用 ingestion job（既存ディレクトリ選択パス）

| 項目 | 値 |
| --- | --- |
| id | `019e6fc9-008c-7452-863b-20030af1a169` |
| status | `previewing` |
| original_file_name | `tc3-source.md` |
| preview_json.suggestedDirectoryId | `019e6fc9-008b-764a-8976-f8879c9d25a6` |
| preview_json.suggestedDirectoryName | `null` |
| preview_json.title | `TC-3 Existing Directory Preview` |

## 投入方法

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file /tmp/seed-306.sql
```

実 SQL の本文は `/tmp/seed-306.sql` を参照。preview_json は
`app/core/adapters/d1/repositories/ingestionJobRepository.ts` の `SerializedPreview`
スキーマに合わせて構築。
