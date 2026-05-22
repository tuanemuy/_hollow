# Issue #94 Manual Test — Seed Data Setup Log

## Environment

- Branch: `issue/86/unify-dto-brand-convention`
- Seed file: `.issue/30/manual-test/seed.sql`
- Database: local D1 (`tanstack-start-template-d1`)
- Date: 2026-05-22

## Commands executed

1. `pnpm db:apply:local` → `✅ No migrations to apply!`
2. FK-safe pre-clear (see below).
3. `pnpm db:execute:local .issue/30/manual-test/seed.sql` → all INSERT statements succeeded.

## Clear procedure (FK-safe order)

Followed `.issue/52/manual-test/seed-data.md`. Executed as wrangler `--command` batches:

```sql
-- Children first
DELETE FROM note_internal_links;
DELETE FROM note_media_refs;
DELETE FROM note_tags;
DELETE FROM share_links;
DELETE FROM publication_states;
DELETE FROM search_documents;
DELETE FROM media_assets;
DELETE FROM saved_views;
DELETE FROM notes;
DELETE FROM tags;
DELETE FROM tag_blacklist;
DELETE FROM user_prompt_overrides;
```

```sql
-- directories has a self-referential FK; iteratively delete leaves (ran 5 iterations)
DELETE FROM directories
WHERE id NOT IN (SELECT parent_id FROM directories WHERE parent_id IS NOT NULL);
```

After verifying `SELECT COUNT(*) FROM directories` returned 0:

```sql
-- Remaining parents / system tables
DELETE FROM accounts;
DELETE FROM sessions;
DELETE FROM verifications;
DELETE FROM users;
DELETE FROM instance_settings;
DELETE FROM outbox_events;
DELETE FROM processed_events;
DELETE FROM export_jobs;
DELETE FROM index_jobs;
DELETE FROM ingestion_jobs;
```

Note: `password_credentials` does not exist in this schema (better-auth `accounts` table holds credentials). Skipped as in #52.

## Post-seed row counts

| Table                | Count |
| -------------------- | ----- |
| users                | 1     |
| accounts             | 1     |
| directories          | 6     |
| tags                 | 7     |
| notes                | 10    |
| note_tags            | 18    |
| saved_views          | 1     |
| note_internal_links  | 4     |
| publication_states   | 10    |
| search_documents     | 10    |

## saved_views verification

| id                                       | name             | query_json (summary)                                                                                                                                                                                                | sort_json                                  |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `01938f00-0000-7000-8000-00000000d071`   | 作業中のタスク   | `{"directoryId":null,"tagIds":["01938f00-...a071","01938f00-...a075"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}` (flat `ViewQuery` — Issue #52 fix applied)                  | `{"by":"updatedAt","direction":"desc"}`    |

## Test account

- Email: `test-user-001@example.com`
- Password: `TestPassword123!`
- Stored in `accounts` (provider_id=credential, password hashed via `pbkdf2-sha256-v1$600000$...`).

## Issues / notes

- No problems encountered. Counts match the reference run from Issue #52.
- Reminder: `pnpm db:execute:local --command "<sql>"` rejects compound SELECT with too many UNION ALL terms (SQLITE_ERROR). Split aggregation queries into batches of ~4 tables when verifying row counts.
- Re-running `seed.sql` against an already-seeded DB will fail on duplicate `users.id`. Always run the clear procedure above first.
