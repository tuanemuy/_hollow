# Issue #238 manual-test seed data

Browser-verification fixtures for **Issue #238 — "show discarded" toggle on
`/upload`**. Targets local D1 (`hollow-local-d1`).

## Prep work performed

1. Confirmed baseline user `existing@example.com` already exists in local D1
   (user.id `01938f00-0000-7000-8000-0000000000a1`, member, `email_verified=1`,
   `banned=0`). Login works as-is — see `.issue/254/manual-test/seed-data.md`.
2. Confirmed `discarded` allows NULL `error_code` / `error_reason` /
   `preview_json` (`IngestionJob.reconstruct`, `app/core/domain/ingestion/entity.ts`).
3. Inserted via `.issue/238/manual-test/seed.sql`:
   - 1 `discarded` job (hidden by default, revealed by the toggle)
   - 1 `failed` job (always visible — a stable baseline to compare against)

## Login account

| field | value |
|---|---|
| email | `existing@example.com` |
| password | `Password123!` |
| user.id | `01938f00-0000-7000-8000-0000000000a1` |

## Seeded jobs (owner = existing@example.com)

| id | status | display name |
|---|---|---|
| `019e0238-0238-7000-8000-0000000000d1` | `discarded` | `[TEST-238] discarded-draft.md` |
| `019e0238-0238-7000-8000-0000000000f1` | `failed` | `[TEST-238] kept-failed.md` |

Pre-existing owner jobs also present (`[TEST-254] *` failed, `issue253-sample.md`
/ `test-319.md` previewing) act as additional retained rows. None are
`discarded`, so the toggle's filter is observable: OFF hides only
`[TEST-238] discarded-draft.md`; ON reveals it alongside the rest.

## Re-seeding

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/238/manual-test/seed.sql
```

`INSERT OR IGNORE` makes this idempotent.
