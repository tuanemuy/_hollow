# Seed data — Issue #605 manual test

Local D1 only (`hollow-local-d1 --local`). Reference "now" = 2026-06-09.
Seed SQL: `.issue/605/manual-test/seed-605.sql` (all ids use the reserved
`01960000-...` UUIDv7 prefix; re-running the SQL deletes its own rows first).
Admin session seeded via `pnpm seed:dev-admin` (token `dev-admin-session-token`).

## Users (username is lowercase only — domain invariant)

| username | has public note | purpose |
|---|---|---|
| `alice`  | yes (4 valid + 2 excluded) | primary author for sort/total/tag/period |
| `alicia` | yes (1) | prefix `al` second hit |
| `bob`    | yes (1) | must NOT match `al` |
| `a_b`    | yes (1) | LIKE special-char (`_`) edge case |
| `alfred` | no  | prefix `al` but no public note → must be excluded from suggest |
| `axb`    | no  | must NOT match literal `a_` prefix |

## Alice notes — published_at vs updatedAt are INVERTED

| note | published_at | updated_at | tag | notes |
|---|---|---|---|---|
| apple  | 2026-06-08 (newest pub) | 2025-02-01 (oldest upd) | wikilinks | date_for_calendar = 2024-06-09 (2yr ago) |
| banana | 2026-05-01 | 2025-06-01 | — | |
| cherry | 2026-01-15 | 2026-06-08 (newest upd) | wikilinks | |
| date   | 2025-04-01 (>1yr ago) | 2026-06-07 | — | date_for_calendar = 2026-06-01 (recent) |
| trashed-note | 2026-06-05 (public row) | — | — | `notes.status='trashed'`: relay-lag; must be excluded from listing+total |
| null-pub-note | NULL | — | — | `visibility='public'` + `published_at IS NULL`: must be excluded |

Expected `公開日順` (published_at DESC): apple, banana, cherry, date
Expected `更新日順` (updated_at DESC): cherry, date, banana, apple

## Period facets (window on published_at, NOT date_for_calendar)

Keyword `zorptest` matches all 7 public docs. Alice has 4 valid public notes:
- apple published 2026-06-08 → inside 7d (even though date_for_calendar is 2yr ago)
- banana 2026-05-01 → inside 30d? (no, ~39d) → inside 1y
- cherry 2026-01-15 → inside 1y
- date 2025-04-01 → >1y (outside 1y; date_for_calendar 2026-06-01 would have put it inside if calendar-based)

All-author keyword `zorptest` = 7 docs (alice 4 valid + alicia + bob + a_b).

## SQL sanity (verified before browser run)

- published_at DESC order for alice → apple, banana, cherry, date (trashed + null-pub excluded). PASS
- `search_documents_fts MATCH 'zorptest'` → 7 rows (FTS triggers synced). PASS
- `username >= 'al' AND username < 'am'` → alfred, alice, alicia (index range scan). PASS
- Index `idx_pubs_owner_visibility_published_at` present (migration 0015). PASS
