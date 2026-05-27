# Issue #240 Manual Test — Seed Data Setup Log

## Environment

- Branch: `issue/230/front-matter-any-keys` (Issue #240 docs-only PR is on this branch)
- DB: local D1 (`hollow-local-d1`) — already populated from prior Issue work
- Date: 2026-05-27

## Verification

`pnpm db:execute:local --command "SELECT COUNT(*) FROM ..."` confirms:

| Table              | Count |
| ------------------ | ----- |
| users              | 13    |
| notes              | 15    |
| publication_states | 15    |

No re-seed needed — the local D1 has the original Issue #30 seed plus additional Issue #230 notes that fit Issue #240's test cases.

## Test account

- Email: `test-user-001@example.com`
- Password: `TestPassword123!`
- User ID: `01938f00-0000-7000-8000-000000000001`
- Stored in `accounts.provider_id = credential` with hashed password.

## Notes to be used for verification

| Purpose | Note ID | Slug | Title | Visibility |
|---|---|---|---|---|
| TC-F1-03 (publicize via P14, check no FrontMatter write-back) | `01938f00-0000-7000-8000-00000000b073` | `project-a-kickoff` | Project A キックオフ | private |
| TC-D4-05 (write FrontMatter `publish: public` in editor) | `01938f00-0000-7000-8000-00000000b075` | `project-b-review` | Project B レビュー記録 | private |
| Edge case 1 (frontMatter with `publish` key already) | n/a (will write `publish` manually as part of TC-D4-05) | — | — | — |

## Issues / notes

- No issues. Reusing existing seed (no destructive operations).
- Local D1 also contains Issue #230's test notes which exercise FrontMatter custom keys — useful sanity reference.
