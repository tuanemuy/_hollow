# Issue #52 Manual Test — Seed Data Setup Log

## Environment

- Branch: `issue/52/saved-views-seed-fix`
- Latest commit: `2462cfd fix(seed): align saved_views query_json/sort_json with ViewQuery (Issue #52)`
- Seed file: `.issue/30/manual-test/seed.sql`
- Database: local D1 (`tanstack-start-template-d1`)

## Pre-flight verification

`seed.sql` line 248 (saved_views row) confirmed to be the latest fixed form:

- `query_json` is flat `ViewQuery`:
  `{"directoryId":null,"tagIds":["...a071","...a075"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}`
- `sort_json` is `ViewSort`: `{"by":"updatedAt","direction":"desc"}`

## Commands executed

1. `pnpm db:apply:local` → `✅ No migrations to apply!`
2. Cleared existing rows in FK-safe order (child → parent). Notes:
   - `password_credentials` does not exist in this schema (uses better-auth `accounts` table). Skipped.
   - `directories` has a self-referential parent_id with `ON DELETE` trigger + `UNIQUE(owner_id) WHERE parent_id IS NULL`. Cleared iteratively by deleting leaves: `DELETE FROM directories WHERE id NOT IN (SELECT parent_id FROM directories WHERE parent_id IS NOT NULL);` (3 iterations).
   - Also cleared: `note_internal_links`, `note_media_refs`, `note_tags`, `share_links`, `publication_states`, `search_documents`, `media_assets`, `saved_views`, `notes`, `tags`, `tag_blacklist`, `user_prompt_overrides`, `accounts`, `sessions`, `verifications`, `users`, `instance_settings`, `outbox_events`, `processed_events`, `export_jobs`, `index_jobs`, `ingestion_jobs`.
3. `pnpm db:execute:local .issue/30/manual-test/seed.sql` → all statements succeeded.

## Post-seed row counts

| Table | Count |
| --- | --- |
| users | 1 |
| accounts | 1 |
| directories | 6 |
| tags | 7 |
| notes | 10 |
| saved_views | 1 |
| note_internal_links | 4 |
| instance_settings | 1 |

## saved_views verification

```
SELECT id, name, substr(query_json,1,80), sort_json FROM saved_views;
```

| id | name | query_json (prefix) | sort_json |
| --- | --- | --- | --- |
| `01938f00-0000-7000-8000-00000000d071` | 作業中のタスク | `{"directoryId":null,"tagIds":["01938f00-0000-7000-8000-00000000a071","01938f00-0...` | `{"by":"updatedAt","direction":"desc"}` |

Flat `ViewQuery` shape confirmed (Issue #52 fix applied).

## Test account

- Email: `test-user-001@example.com`
- Password: `TestPassword123!`
- Account row: `provider_id=credential`, password hashed (`pbkdf2-sha256-v1$600000$...`).

## Issues / notes

- No `password_credentials` table — credentials live in `accounts` (better-auth). Removed from the cleanup `DELETE` list.
- `directories` cannot be wiped with a single DELETE due to FK trigger; use iterative leaf-deletion pattern above when re-seeding.
- Re-running `pnpm db:execute:local seed.sql` against an already-seeded DB fails (FK constraint from duplicate `users.id`). Always clear first.
