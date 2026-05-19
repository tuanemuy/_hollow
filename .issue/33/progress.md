# Progress — Issue #33

## Pre-implementation: old-code regression check

Before applying the implementation, the new bind-limit tests were added
to `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
and run against the unmodified `D1NoteRepository`.

Command:

```
pnpm test:integration --run app/core/adapters/d1/__tests__/noteRepository.integration.test.ts
```

Result: `Test Files 1 failed (1); Tests 4 failed | 15 passed (19)`.

All four T-bind tests failed with `D1_ERROR: too many SQL variables at
offset NNN: SQLITE_ERROR`, exactly the bind-limit path Issue #33 is
closing:

- **T-bind-001** (`visibility=['private']` over 150 owner notes) —
  failed inside `D1NoteRepository.resolveVisibilityCandidates`'s
  trailing `inArray(notes.id, [...])`, which received the post-sweep
  candidate id set.
- **T-bind-002** (`visibility=['private','public']`) — same failure
  path. `notWanted = ['unlisted']` keeps the sweep + intersection
  branch active, so the candidate set still flows through `inArray`.
- **T-bind-003** (150 notes + `limit=150` triggering `loadChildren`) —
  failed inside `D1NoteRepository.loadChildren` on the
  `select … from note_tags where note_id in (?, ?, …)` with 150 host
  variables.
- **T-bind-004** (150 referrers via `findReferrers`) — failed on the
  `select … from notes where id in (?, ?, …) order by updated_at desc,
  id desc` with 150 host variables.

The 15 existing tests still pass on the old implementation, confirming
the new tests are the only regression signal added.

These failures confirm the regression tests gate the exact paths the
implementation must reshape.
