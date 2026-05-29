# Issue #254 manual-test seed data

Browser-verification fixtures for **Issue #254 — owner can retry a failed
ingestion job**. Targets local D1 (`hollow-local-d1`), state under
`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`.

## Prep work performed

1. `pnpm db:migrate` → "No migrations to apply" (local D1 already migrated).
2. Inspected auth: login route uses the `credential` provider in
   `accounts.password`. Current hashing is **scrypt**
   (`app/core/adapters/security/scrypt.ts`,
   `$scrypt$ln=16,r=8,p=1$<salt-b64>$<hash-b64>`); legacy
   `pbkdf2-sha256-v1$...` rows still verify and are lazily re-hashed
   (`credentialStore.ts`). The old `.manual-test/2026-05-17/` PBKDF2 seed is
   therefore stale for hashing, though its account-id conventions still hold.
3. Confirmed baseline user `existing@example.com` already exists in local D1
   (user.id `01938f00-0000-7000-8000-0000000000a1`, member,
   `email_verified=1`, `banned=0`) **and** verified its stored scrypt hash
   matches `Password123!` (re-derived with `@noble/hashes` scrypt). No
   re-seed of the user was needed — login works as-is. A root directory for
   this owner is also present (needed for the retry → preview → commit flow).
4. Read `ingestion_jobs` schema (`app/core/adapters/d1/schema.ts`) and the
   domain entity / value objects (`app/core/domain/ingestion/`) to pin the
   real column names and the `failed`-status invariants.
5. Inserted 2 owner-retryable `failed` jobs via
   `.issue/254/manual-test/seed.sql` and verified them.

## Login account

| field | value |
|---|---|
| email | `existing@example.com` |
| password | `Password123!` |
| role | `member` |
| user.id | `01938f00-0000-7000-8000-0000000000a1` |

(Admin baseline `admin@example.com` / `Password123!`, role `admin`, user.id
`01938f00-0000-7000-8000-0000000000c1` is also present for the
admin-Jobs-retry regression check.)

## Seeded failed ingestion jobs (owner = existing@example.com)

| id | status | owner_id | temp_storage_key | display name (original_file_name) | error_code |
|---|---|---|---|---|---|
| `019e7254-0254-7000-8000-0000000000f1` | `failed` | `01938f00-0000-7000-8000-0000000000a1` | set (non-NULL) | `[TEST-254] meeting-notes.md` | `llm_failure` |
| `019e7254-0254-7000-8000-0000000000f2` | `failed` | `01938f00-0000-7000-8000-0000000000a1` | set (non-NULL) | `[TEST-254] invoice-2026Q2.pdf` | `llm_failure` |

`temp_storage_key` uses the pipeline convention
`<owner_id>/ingestion/<job_id>`, so the owner-retry path
(`IngestionJob.retry`) runs rather than the
`ingestion_no_temp_storage_for_retry` branch. Both are owner-scoped, so they
appear in the queue screen (P13, `/upload`) and the upload modal for this
user. `error_reason` carries a plausible LLM-failure sentence; `version=0`,
`regeneration_count=0`, `preview_json=NULL`.

## `ingestion_jobs` key columns

- Table name: **`ingestion_jobs`** (plural).
- status values: `pending | processing | previewing | saved | failed | discarded`
  (CHECK `ij_status_enum`).
- temp-key column: **`temp_storage_key`** (TEXT, nullable) — retry payload ref.
- owner column: **`owner_id`** (TEXT, FK → `users.id`, ON DELETE CASCADE).
- OCC column: **`version`** (INTEGER, default 0).
- failure columns: **`error_code`** + **`error_reason`** (both required when
  `status='failed'`). LLM failure code is `llm_failure`
  (`runIngestionJob.classifyPipelineError`).
- other required: `original_file_name`, `mime_type`, `byte_size` (CHECK > 0),
  `kind` (`html|markdown|office|pdfTextual|pdfScanned|image|audio|plain`),
  `created_at`, `updated_at`.

## Re-seeding

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/254/manual-test/seed.sql
```

`INSERT OR IGNORE` makes this idempotent. After a retry consumes a row
(status → pending → ...), delete the two ids and re-run:

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --command \
  "DELETE FROM ingestion_jobs WHERE id IN ('019e7254-0254-7000-8000-0000000000f1','019e7254-0254-7000-8000-0000000000f2');"
```

## Notes / findings

- An unrelated pre-existing `failed` job `tiny.png`
  (`error_code='ingestion.temp_storage'`) is owned by a different user
  (`019e49ed-dd3e-765b-afa0-21ea3929b433`), so it does not appear in
  `existing@example.com`'s view and does not interfere.
- For edge-case "temp storage lost" (testing.md エッジ #2), create or mutate a
  failed job with `temp_storage_key = NULL` — the seed intentionally keeps
  both keys set so the happy retry path works.
- For the 403 edge case (testing.md エッジ #1), log in as the admin (or another
  user) and attempt to retry one of the `...f1/...f2` jobs owned by
  `existing@example.com`.
